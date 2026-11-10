# Implementation Plan: UI/UX Overhaul — Profile, Dashboard Overview, Project Sections and Visual Theme

**Branch**: `005-ui-ux-overhaul` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-ui-ux-overhaul/spec.md`

## Summary

Feature 005 adds project sections (a per-project copy of a fixed 15-section blueprint) with vendors assigned per section, a dashboard overview, list-first Vendors and Projects pages with Active and Archived views, a profile icon menu with Switch user, a light white, black, yellow and grey visual system, and shell-level navigation aids (global search, breadcrumbs, toasts, dialogs, skeletons, tooltips, unsaved-change protection, one date format).

Technically: one additive migration (two tables, ten history actions); new section and section-assignment routes that reuse the Feature 004 assignment code path; extended list, summary and project-detail responses that stay backward compatible; a token swap in the existing stylesheet; and a handful of small house UI components. No new runtime dependency.

Owner decisions carried in: In progress = not archived, not Completed, with items and 0 < progress < 100; existing projects receive sections only through **Use the standard blueprint**; exactly 15 default sections in the FR-012 order; removed sections are restorable, with their vendor assignments re-made by hand; only sort and the Active or Archived view persist; 50 records per page, "9 Nov 2026" dates, 768 px tablet width.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node LTS (api), TypeScript and React 19 (web)

**Primary Dependencies**: Express, Prisma 6, zod, bcrypt (api); React 19, Vite 7 (web). No additions.

**Storage**: PostgreSQL 17 through Prisma migrations; browser `localStorage` for list sort and view only

**Testing**: Vitest with Supertest against the embedded test database (api); Vitest, jsdom and React Testing Library (web)

**Target Platform**: Modern desktop and mobile browsers; Node server on the office network

**Project Type**: Web application (npm workspaces `api/` and `web/`)

**Performance Goals**: Every page under 2 seconds and search results within 1 second with 200 vendors, 50 projects and 20 sections per project (NFR-001)

**Constraints**: WCAG 2.1 AA contrast and keyboard operation (FR-041, NFR-003); no sideways scrolling at 375, 768 and 1280 px (FR-045); existing Feature 001 to 004 responses stay compatible (NFR-007); migration additive with no row inserts (FR-047)

**Scale/Scope**: About 15 screens restyled; 2 new tables; about 14 new or extended routes; 3 roles

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Spec before code | spec.md complete, 0 `NEEDS CLARIFICATION`, backlog ids listed; this plan precedes code; one branch | Pass |
| II. Fixed stack | TypeScript, Express, React, PostgreSQL 17, Prisma, Vitest, Supertest only; no new runtime dependency (research §1, §4, §14); `vite build` script uses an installed tool | Pass |
| III. Data rules | New tables carry audit columns; sections and assignments are removed by flag, never deleted; FKs `RESTRICT`; schema change only through a committed migration | Pass |
| IV. Security | Every new route sits behind `sessionMiddleware`; zod validation on every body and query; no role widened (FR-046); Switch user reuses logout, nothing stored (FR-032); advance entries in recent activity follow `ADVANCE_VIEWERS` | Pass |
| V. Tests and done | Every acceptance scenario gets a test, business rules test-first (Testing strategy); tasks done only when tests pass and the scenario is demonstrated; converge before PR | Pass |
| VI. Simplicity | Blueprint is a constant; integer positions; native `<dialog>`; token swap instead of a new styling system; nothing from PRD Phase 2 or 3 (text-only Procurement and Budget & Costing) | Pass |

**Post-design re-check (after Phase 1)**: Pass. The contracts keep list bodies as arrays (counts in headers) and leave `GET /api/dashboard` unchanged, so no Feature 001 to 004 client changes meaning. No complexity exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/005-ui-ux-overhaul/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── http-api.md      # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
api/
├── prisma/
│   ├── schema.prisma                       # + ProjectSection, SectionAssignment, HistoryAction values
│   ├── migrations/<ts>_project_sections/   # new, additive
│   └── seed.ts                             # + sections and section assignments (find-or-create)
├── src/
│   ├── lib/blueprint.ts                    # new: the 15 default names
│   ├── modules/
│   │   ├── links/routes.ts                 # extract assignVendorToProject(); DELETE ends section assignments
│   │   ├── sections/routes.ts              # new: sections, order, remove, restore, blueprint, assignments
│   │   ├── projects/routes.ts              # create copies blueprint; detail adds sections; list view/sort/paging
│   │   ├── vendors/routes.ts               # list view/sort/paging; detail links gain sections
│   │   ├── dashboard/routes.ts             # summary counts; GET /dashboard/overview
│   │   ├── search/routes.ts                # new: GET /search
│   │   └── auth/routes.ts                  # /me adds created_at
│   └── app.ts                              # mount sectionRouter, searchRouter
└── tests/
    ├── api/sections.test.ts                # new
    ├── api/section-assignments.test.ts     # new
    ├── api/lists.test.ts                   # new: view, sort, paging, headers
    ├── api/dashboard-overview.test.ts      # new
    ├── api/search.test.ts                  # new
    └── unit/blueprint.test.ts              # new

web/
├── package.json                            # + "build": "vite build"
├── src/
│   ├── styles.css                          # light tokens; component rules
│   ├── time.ts                             # formatDate, formatDateTime
│   ├── list-prefs.ts                       # new: sort and view in localStorage
│   ├── ui/                                 # new house components
│   │   ├── confirm-dialog.tsx  toast.tsx  tooltip.tsx  skeleton.tsx
│   │   ├── breadcrumbs.tsx  profile-menu.tsx  global-search.tsx  unsaved-guard.ts
│   ├── main.tsx                            # header: search, breadcrumbs, profile menu; switch-user flow
│   └── pages/
│       ├── vendors.tsx  projects.tsx       # list first, collapsible sectioned form, views, sort, Show more
│       ├── project-sections.tsx            # new: sections, notes, section vendors, removed sections
│       ├── project-detail.tsx              # mounts sections; vendor cards list sections
│       ├── vendor-detail.tsx               # projects list sections; archive confirm
│       ├── dashboard.tsx                   # counts, progress, recent lists, quick actions
│       ├── sign-in.tsx                     # switched-out notice
│       └── history-panel.tsx               # labels for new actions
└── tests/                                  # new and extended (Testing strategy)
```

**Structure Decision**: Existing web-application layout. Sections get their own API module (`sections/`) because they have their own routes and rules; the web adds one page component and a small `ui/` folder for components used on many pages.

## Architecture and Design

### Data and migration

See [data-model.md](./data-model.md). Migration steps:

1. Edit `schema.prisma` (models, relations to `Project`, `Vendor`, `StaffUser`, enum values).
2. Generate SQL with `prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma --script` (non-interactive, as Feature 004 did).
3. Append the hand-written partial unique indexes and check constraints (research §6).
4. Review: additive only, no `DROP`, no `UPDATE`, no `INSERT`.
5. Apply to the test database through `tests/global-setup.ts` (`prisma migrate deploy`).
6. Apply to the development database only after the product owner reviews the SQL and approves (quickstart). No reset.

### API

See [contracts/http-api.md](./contracts/http-api.md).

- **Shared assignment path**: `assignVendorToProject(tx, …)` extracted from the link route (research §7) and used by `POST /sections/:id/assignments`. Both run inside one `prisma.$transaction`; the P2002 races map to `LINK_EXISTS` or `SECTION_ASSIGNMENT_EXISTS`.
- **Locks**: remove, restore and edit lock the row with `SELECT … FOR UPDATE`, as `lockLink` does. Reorder compares `sections_version` inside the transaction.
- **History**: `recordHistory` for project-target actions; `recordOnBoth` generalised to accept a section in `details` for assignment actions (research §10).
- **Project creation**: creates the 15 sections in the create transaction and adds `blueprint_applied: [15 names]` to the details of the existing `CREATED` history entry, so a project's history list is unchanged in length (Feature 003 history tests keep passing). `BLUEPRINT_APPLIED` is recorded only by **Use the standard blueprint**.
- **Archived projects**: section and assignment writes refused with 409 `ARCHIVED`, as other project writes are.
- **Lists**: `view`, `sort`, `limit`, `offset` and count headers (research §13), plus `progress=in_progress` on projects (the FR-020 rule) for the dashboard link (FR-021). Existing `include_archived` keeps its meaning.
- **Dashboard**: summary counts added in place; overview is a new route (research §11).
- **Search**: one route, `contains` with `mode: 'insensitive'`, `take: 5` each (research §12).

### Web

- **Visual system** (research §1–2): new token values on `:root`; button, input, card, table, badge, menu, dialog, toast and tooltip rules rewritten once; status classes remapped to the new tinted fills; existing class names kept so markup and tests stand.
- **Shell** (`main.tsx`): black navigation sidebar (top bar under 1024 px); header with global search, breadcrumbs and the profile icon; the Feature 004 notify region restyled as a toast.
- **Profile menu**: initials icon (`aria-label` "Name, Role"), menu with name, role, email, account created date, change password, Switch user, Sign out; Escape closes; focus returns. Switch user → unsaved guard → `ConfirmDialog` → logout → `SignIn` with the notice (research §15).
- **Lists** (`vendors.tsx`, `projects.tsx`): page header with count and **Add …** button; Active and Archived view switch with counts; search, filters, sort select; table or cards; skeleton rows while loading; **Show more** (offset += 50); the form below, closed by default, in headed fieldsets; unsaved guard while open and changed. Sort and view read from and written to `list-prefs.ts`.
- **Project sections** (`project-sections.tsx`): ordered list of section cards (name, description collapsed after 4 lines, notes, vendors with phone, contact, categories and role, archived marker); inline rename; Move up / Move down buttons plus an order save (keyboard friendly, no drag-and-drop dependency); Add section; Remove with a dialog naming assigned vendors; "Removed sections" disclosure with Restore; **Use the standard blueprint** when the project has none; assign-vendor form listing all active vendors (project vendors first), with a note that others will be added to the project.
- **Dashboard**: counts row (vendors total, active, archived; projects total, Active, Completed, In progress, archived; each linked to the matching list and view), progress list with bars and percentages, recently updated projects, recent activity, quick actions; Feature 003 tiles and Feature 004 sections kept below; duplicated counts shown once (FR-025).
- **Archived presentation**: shared `ArchivedBadge`, `.is-archived` muted row and card style, the sentence "Archived records are kept and can be restored", archive confirmation dialogs on vendor and project pages.
- **Dates**: every displayed date through `formatDate` / `formatDateTime`.

### Backward compatibility

| Earlier behaviour | Change | Superseded tests to update |
|---|---|---|
| Feature 001/004 list pages: form above list; "Include archived" checkbox | List first, collapsible form; Active and Archived views | web tests that toggle "Include archived" (`projects-list.test.tsx`, `vendor-filters.test.tsx`) and that expect the form open |
| Feature 004 profile button with the person's name | Initials icon with accessible name "Name, Role" | `profile-menu.test.tsx`, `app.test.tsx` button queries |
| Dates shown as `YYYY-MM-DD` | "9 Nov 2026" | web tests asserting ISO date text |
| Dark theme | Light tokens | `phone-layout.test.tsx` CSS assertions for new rules only |

API responses stay supersets; no API test should change meaning. Each superseded web assertion is updated with a comment citing this spec's Backward Compatibility table.

## Testing Strategy

Test-first for every business rule (Principle V). Each acceptance scenario maps to at least one test:

| Area | Tests |
|---|---|
| Blueprint (FR-012, FR-013) | unit: 15 names, order; API: new project gets 15 and its `CREATED` entry carries `blueprint_applied`, with no extra history entry; existing project gets none; blueprint endpoint adds 15 once, records `BLUEPRINT_APPLIED`, then 409; seed adds sections only to projects it creates in that run |
| Sections (US2-1 to US2-3, US2-7, FR-008 to FR-011, FR-010a) | API: add, rename, case-insensitive uniqueness, reorder with stale version 409, remove ends assignments, restore placed last, restore name clash 409, archived project 409, history entries with previous and new values |
| Section assignments (US2-4 to US2-6, US2-8, FR-015 to FR-019) | API: assign creates project assignment when absent, in one transaction (forced failure leaves neither); duplicate 409; same vendor in two sections; remove leaves project assignment; removing the project assignment ends section assignments; vendor detail lists sections; concurrent double assign yields one row |
| Lists (US1, FR-004 to FR-006, FR-026) | API: view, sort, limit, offset, headers, `include_archived` unchanged; web: list before form, form closed, focus on open, sort and view persisted, search not persisted, Show more, unsaved guard |
| Dashboard (US3, FR-020 to FR-025) | API: counts per definition, in-progress edge cases (0 items, 0%, 100%, Completed, archived), progress list order and cap, recent lists, advance privacy by role; web: counts link to lists, quick actions open forms, empty states |
| Archived (US4, FR-026 to FR-029) | web: confirmation text, badge and muted class, restore toast; API: archive leaves assignments and section assignments intact |
| Profile and switch (US5, FR-030 to FR-032) | web: initials, accessible name, menu contents, keyboard, switch confirm then logout call, notice on sign-in, nothing in storage; API: `/me` `created_at` |
| Visual and access (US6, FR-033 to FR-041) | web: tokens present and yellow not used as page or panel background (CSS read from disk, as T057 did); every dialog traps and returns focus; icon controls have names; automated contrast check of token pairs in a unit test |
| Search, breadcrumbs, dates (US7) | API: search limits, archived flag, 2-character minimum; web: results open records, breadcrumbs, `formatDate` cases |
| Regression (SC-008) | full Feature 001 to 004 suites at every checkpoint; `api/tests/helpers.ts` `resetDatabase()` deletes section assignments and sections before vendor-project links; `api/tests/unit/append-only.test.ts` forbids deleting `projectSection` and `sectionAssignment` rows |
| Access (FR-046) | every new route group has a signed-out → 401 case |
| Performance (SC-007, NFR-001) | `api/tests/api/performance.test.ts` generates 200 vendors, 50 projects and 20 sections per project on the test database and checks each list, detail, dashboard and search response stays under the budget; page render time is checked by hand in the quickstart |

Manual: the quickstart at 375, 768 and 1280 px in a real browser, timing SC-002 and SC-003, and the SC-005 walkthrough. CSS tests do not replace looking at the pages.

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build -w web`.

## Delivery Order and Dependencies

1. **Foundation**: schema, migration (test database only), blueprint constant, `assignVendorToProject` extraction (Feature 004 tests must stay green), house UI components, light tokens, `formatDate`.
2. **US1 (P1)** lists first, views, sort, paging.
3. **US2 (P1)** sections and section assignments.
4. **US3 (P2)** dashboard overview; **US4 (P2)** archived presentation.
5. **US5 to US7 (P3)** profile and switch, visual polish pass, search, breadcrumbs, dates.
6. **Seed and polish**: seed sections, full suites, build, graphify update, quickstart, converge.

US2 depends on the foundation's migration and assignment extraction. US3's in-progress count depends only on Feature 004 figures. The visual system starts in the foundation so later stories are built in it.

## Risks

See the spec's Risks table. Plan-specific:

- **Test reset**: sections reference projects and vendors with `RESTRICT`, so `resetDatabase()` must delete them first, in the same task as the migration, or every API test fails.
- **Extracting `assignVendorToProject`** could change Feature 004 behaviour: do it first, with `assignments.test.ts` and `links.test.ts` green before and after.
- **jsdom lacks `HTMLDialogElement.showModal`**: add a small polyfill in `web/tests/setup.ts`.
- **Count headers through the Vite proxy**: same-origin in development, so no CORS exposure change is needed; tests read them through Supertest.

## Complexity Tracking

No constitution violations to justify.
