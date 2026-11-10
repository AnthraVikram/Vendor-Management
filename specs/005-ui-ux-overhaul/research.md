# Research: Feature 005 UI/UX Overhaul

Each decision resolves a planning unknown. No new runtime dependency is added (Constitution Principle II).

## 1. Styling approach for the visual system

- **Decision**: Replace the dark navy tokens on `:root` in `web/src/styles.css` with a light token set (white, near-black, grey scale, one yellow accent), and keep every existing class name. Components keep their markup; only token values and component rules change.
- **Rationale**: Every page already reads colours from `--bg`, `--surface`, `--text`, `--accent` and related tokens, so a token swap reaches every page at once with no markup churn. Tests query roles, names and text, which are unchanged.
- **Alternatives considered**: a CSS framework or component library (new dependency, rewrite, rejected by Principle II); a second theme behind a switch (not requested; doubles the testing).

## 2. Colour values and contrast

- **Decision**: Tokens: `--bg #ffffff`, `--surface #ffffff`, `--surface-muted #f4f4f5`, `--surface-sunken #e4e4e7`, `--border #d4d4d8`, `--border-strong #a1a1aa`, `--text #111111`, `--text-muted #52525b` (7.7:1 on white), `--text-dim #71717a` (4.8:1, secondary text only), `--nav-bg #111111`, `--nav-text #f4f4f5`, `--accent #facc15` (yellow), `--accent-strong #eab308`, `--on-accent #111111`, `--focus #111111` with a 2 px yellow outer ring. Status colours become tinted fills with dark text: success `#166534` on `#dcfce7`, danger `#991b1b` on `#fee2e2`, warning `#854d0e` on `#fef9c3`, info `#1e3a8a` on `#dbeafe`, completed `#5b21b6` on `#ede9fe`.
- **Rationale**: Yellow fails contrast as text on white, so yellow is used only as a fill behind black text (13.9:1), for borders, the current navigation item and focus rings. All text pairs meet 4.5:1 (FR-041).
- **Alternatives considered**: yellow text links (fail contrast); a yellow page header (FR-033 forbids large yellow areas).

## 3. Breakpoints

- **Decision**: Keep the existing 1023 px (sidebar becomes a top bar) and 700 px (cards stack) breakpoints, and verify layouts at the confirmed widths 375 px, 768 px and 1280 px. No new breakpoint is needed: 768 px already falls in the top-bar layout.
- **Rationale**: The owner confirmed 768 px as the tablet width to verify (FR-045), not as a new rule.

## 4. Date formatting

- **Decision**: Add `formatDate(isoDate)` ("9 Nov 2026") and `formatDateTime(iso)` ("9 Nov 2026, 14:05", 24-hour, IST) to `web/src/time.ts`, built on `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })`, and use them for every displayed date. Date inputs and API values stay `YYYY-MM-DD`.
- **Rationale**: `time.ts` already owns IST conversion (`istDate`, `istDateTime`); `Intl` is built in. One formatter gives FR-042 consistency.
- **Alternatives considered**: a date library (new dependency, not needed).

## 5. Section ordering

- **Decision**: An integer `position` per section. Reorder is one request carrying the full ordered list of current section ids and the version the client last read (`sections_version`, the project's latest section `updated_at`). The server rewrites positions in one transaction; if the version is stale it returns 409 `SECTIONS_CHANGED` with the current order (edge case "two staff reorder").
- **Rationale**: Sections per project are few (about 15 to 20), so rewriting positions is cheap and avoids fractional-order complexity. One request keeps history to one "reordered" entry.
- **Alternatives considered**: fractional positions (needless at this scale); per-item move up/down calls (one history entry per click).

## 6. Section uniqueness and assignment uniqueness

- **Decision**: Partial unique indexes written by hand in the migration, as Feature 004 did: `project_sections_current_name_key` on `(project_id, lower(name)) WHERE removed_at IS NULL`, and `section_assignments_current_key` on `(section_id, vendor_id) WHERE removed_at IS NULL`. Check constraints keep `removed_at` and `removed_by` both null or both set.
- **Rationale**: Prisma cannot express partial or expression indexes; the database must enforce FR-011 and FR-016 under concurrent requests.

## 7. Auto-assignment to the project (FR-015a)

- **Decision**: Extract the body of `POST /projects/:projectId/links` (`api/src/modules/links/routes.ts`) into `assignVendorToProject(tx, { vendor, project, actorId, role, scope, note })`, reused by the link route and by the section-assignment route in the same transaction. The section route first runs `activePair` (archived refusal, Feature 001 FR-025/026), then creates the project assignment only when no current one exists, then the section assignment. Any error rolls back both.
- **Rationale**: One code path keeps Feature 004 refusals, history (`ASSIGNED` on both targets) and the race handling (P2002 → `LINK_EXISTS`) identical.

## 8. Ending section assignments when a vendor leaves the project (FR-015b)

- **Decision**: In the existing `DELETE /links/:id` transaction, after setting `removed_at` on the link, set `removed_at`/`removed_by` on every current section assignment of that vendor in that project's sections, and record `SECTION_UNASSIGNED` on both targets for each.
- **Rationale**: Same transaction as the removal; nothing is deleted (FR-017).

## 9. Default blueprint storage

- **Decision**: A constant ordered array of the 15 names in `api/src/lib/blueprint.ts`. `POST /projects` creates the 15 sections in the same transaction as the project and records them in the `CREATED` history entry's details (`blueprint_applied`), so no extra history entry appears at creation (owner decision R2). `POST /projects/:id/sections/blueprint` adds the 15 to a project with no current sections (409 `HAS_SECTIONS` otherwise). The migration inserts no rows.
- **Rationale**: FR-014 says the blueprint is fixed; a table would invite editing and needs seeding. The owner decided existing projects get sections only on request.

## 10. History for sections

- **Decision**: New `HistoryAction` values: `SECTION_ADDED`, `SECTION_RENAMED`, `SECTION_EDITED` (description or notes), `SECTIONS_REORDERED`, `SECTION_REMOVED`, `SECTION_RESTORED`, `BLUEPRINT_APPLIED` (project target, for **Use the standard blueprint** only), and `SECTION_ASSIGNED`, `SECTION_ASSIGNMENT_EDITED`, `SECTION_UNASSIGNED` (vendor and project targets, as `recordOnBoth` does). Details carry `section: { id, name }`; changes carry previous and new values via `diffFields`.
- **Rationale**: `HistoryEntry` already targets vendors and projects; no new target column is needed. `history-panel.tsx` gains labels for the new actions.

## 11. Dashboard overview data

- **Decision**: Extend `GET /api/dashboard/summary` with `vendors: { active, archived, total }` and `projects: { …existing status counts, total, in_progress, archived }`, and add `GET /api/dashboard/overview` returning `progress` (up to 10 lowest-percentage non-archived, non-Completed projects with items), `recently_updated` (5) and `recent_activity` (10). Progress reuses `projectFigures` (`api/src/modules/projects/figures.ts`); "in progress" counts projects whose figures give `0 < done < total` and status not Completed.
- **Rationale**: The summary endpoint already owns counts and role-based money rules (Feature 003 FR-025); `GET /dashboard` stays byte-compatible for Feature 002/004 tests. "Recently updated" uses the newest of project `updated_at`, its sections', its assignments' and its timeline items' `updated_at`, computed with one grouped query per table.
- **Recent activity wording**: `summary` reuses the history panel's action labels and field names, moved to a shared map the API and web both read, so the two never disagree.
- **Recent activity privacy**: entries targeting client advances are included only for `ADVANCE_VIEWERS` (Feature 003 FR-017, FR-025), using the existing permissions list.

## 12. Global search

- **Decision**: `GET /api/search?q=` (2 to 100 characters) returns up to 5 vendors (name, phone, contains, case-insensitive) and 5 projects (name, client name), archived included and marked. The header search waits 250 ms after typing before requesting.
- **Rationale**: Existing vendor and project list queries already search these fields; a single endpoint keeps the header to one request (NFR-001: results within 1 second).

## 13. Lists: Active/Archived views, sorting and 50-per-page

- **Decision**: `GET /api/vendors` and `GET /api/projects` gain `view=active|archived` (default `active`; `include_archived=true` keeps working for existing callers), `sort` (`name`, `category`, `availability`, `project_count`; `name`, `status`, `expected_completion`, `progress`), `limit` (1 to 200, applied only when given; the pages send 50) and `offset`, and return the total in an `X-Total-Count` header so the JSON body stays an array for Feature 001 to 004 callers. Counts for both views come from `X-Active-Count` and `X-Archived-Count`. Projects also take `progress=in_progress` (the FR-020 rule, computed with `projectFigures`) so the dashboard count opens a matching list (FR-021).
- **Rationale**: Keeping the body an array avoids breaking every existing client and test. Progress and project-count sorts are computed in memory after the existing figures, which is fine at 50 projects and 200 vendors.
- **Persistence**: the web stores `{ sort, view }` per list in `localStorage` under `vm.list.vendors` and `vm.list.projects`, wrapped in try/catch; search and filters are not stored (FR-005).

## 14. Dialogs, toasts, tooltips and skeletons

- **Decision**: Small house components in `web/src/ui/`: `ConfirmDialog` (native `<dialog>` with `showModal()`, which traps focus and closes on Escape; focus returns to the opener), `Toast` (restyled Feature 004 `notify` region), `Tooltip` (CSS on `:hover`/`:focus-visible` with `aria-describedby`), `Skeleton` (blocks with `aria-busy` on the region), `Breadcrumbs`, `ProfileMenu`, `GlobalSearch`, `UnsavedChangesGuard` (a `beforeunload` handler plus a confirm on in-app navigation via `hashchange`).
- **Rationale**: Native `<dialog>` gives focus trapping and Escape for free in current browsers. jsdom lacks `showModal`, so tests use a small polyfill in `web/tests/setup.ts`.
- **Alternatives considered**: a headless UI library (new dependency).

## 15. Switch user

- **Decision**: The profile menu's Switch user opens `ConfirmDialog`; on confirm it runs the same `POST /api/auth/logout` as Sign out, then shows `SignIn` with a notice "Signed out <name>. Sign in as another staff member." held in memory only (not stored). The unsaved-changes guard runs first.
- **Rationale**: FR-032 and the owner's decision: no impersonation, nothing stored.

## 16. Routing and breadcrumbs

- **Decision**: Keep the hash routing in `web/src/main.tsx`. Breadcrumbs are derived from the current path plus the record name the page already loads (passed up through a `onTitle` prop on detail pages).
- **Rationale**: No router dependency; the shell already parses paths.
