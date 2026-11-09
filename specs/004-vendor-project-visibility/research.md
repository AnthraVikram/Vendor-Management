# Research: Vendor–Project Visibility, Project Tracking and Dashboard Views

No item in the Technical Context of [plan.md](./plan.md) was left as `NEEDS CLARIFICATION`. Every product question was answered in `/speckit-clarify` on 2026-11-08 (spec, Clarifications). The decisions below are technical choices made inside those answers, each checked against the code on `main` (Features 001 to 003 merged).

## 1. Past assignments live on the existing link row

- **Decision**: Add `removed_at` and `removed_by` (nullable, set together) to `vendor_project_links`. Removing an assignment sets them instead of deleting the row. Replace the unique index on `(vendor_id, project_id)` with a partial unique index `WHERE removed_at IS NULL`, so one current assignment per pair is still guaranteed by the database (Feature 001 FR-026) while any number of past ones may exist (spec FR-013b).
- **Rationale**: The row already holds the role, scope of work and note that FR-013 must keep, so nothing is copied. Every reader filters `removedAt: null`, which is one condition in six places (see 4). The audit columns already exist.
- **Alternatives considered**:
  - A separate `past_assignments` table copying role, scope and note: rejected, it duplicates data and needs a copy step inside the removal transaction.
  - An `archived` boolean like vendors and projects: rejected, the spec needs who removed it and when, and an archived record can be restored, which FR-013 forbids.
- **Prisma note**: Prisma cannot express a partial unique index, so `@@unique([vendorId, projectId])` is removed from `schema.prisma`, `@@index([vendorId, projectId])` is added, and the partial index is written by hand in the migration SQL. This follows the Feature 001 precedent `categories_name_lower_key`. Lookups that used the compound key `vendorId_projectId` become `findFirst` with `removedAt: null`.

## 2. Assignment events in history: three new actions, two entries each

- **Decision**: Add `ASSIGNED`, `ASSIGNMENT_EDITED` and `UNASSIGNED` to the `HistoryAction` enum. Each assignment event writes two history entries in the same transaction as the change: one with `vendor_id`, one with `project_id`. Both carry the same `details` (`assignment_id`, vendor id and name, project id and name, and on `ASSIGNED` and `UNASSIGNED` the role, scope and note). `ASSIGNMENT_EDITED` carries `changes` from `diffFields` over role, scope and note.
- **Rationale**: FR-013d requires the events in the history of both the vendor and the project. The Feature 003 check constraint `history_entries_target_ck` requires exactly one target per entry, so two entries is the way to meet both without weakening the constraint. Distinct actions let the history panel say "Assigned to project" instead of "Created".
- **Alternatives considered**:
  - Relax the constraint to allow two targets: rejected, it changes a Feature 003 integrity rule for a display need.
  - Reuse `CREATED` or `EDITED` with a `details.kind`: rejected, the existing panel and its tests read `CREATED` on a vendor as "the vendor was created".
- **Note**: `ALTER TYPE ... ADD VALUE` runs in its own statements in the migration. PostgreSQL 17 allows it inside the migration transaction because the new values are not used in the same transaction.

## 3. Derived values are pure functions over data already loaded

- **Decision**: Three new rule libraries in `api/src/lib`, with no HTTP or Prisma, tested first:
  - `assignment-status.ts`: `assignmentStatus(items)` applies FR-010's five rules in order.
  - `deadline-groups.ts`: `deadlineGroup(deadline, today)` returns `OVERDUE`, `DUE_TODAY`, `COMING_SOON` (1 to 7 days), `UPCOMING` (8 to 30 days) or `null` (later), for open items only.
  - `project-health.ts`: `projectHealth`, `projectProgress`, `isAfterCompletion` and `attentionReasons`.

  Routes load rows with the existing `itemInclude` (latest progress update) and call these functions on every request. Nothing derived is stored.
- **Rationale**: This is the pattern Feature 002 uses for flags (`timeline-flags.ts`, `flagsOf`). Values always reflect saved data (NFR-002), and the rules are unit-tested at their boundaries without a database.
- **Alternatives considered**: Stored status or health columns updated by triggers or by every write route: rejected, they can go stale and they contradict FR-012 and FR-017a, "worked out each time".
- **Overdue reuse**: "Overdue" in every new rule is the existing `flagsOf(...)` result, so the dashboard group, the assignment status and the attention reasons can never disagree with the Feature 002 flag.

## 4. Every reader of links filters out past assignments

These places read `vendor_project_links` today and must see only current assignments, except where noted:

| Place | Today | Change |
| --- | --- | --- |
| `links/routes.ts` POST | `findUnique(vendorId_projectId)` | `findFirst({ removedAt: null })`. A unique violation from a race is caught and returned as 409 `LINK_EXISTS` |
| `links/routes.ts` PATCH, DELETE | any link | 409 `ASSIGNMENT_REMOVED` for a past assignment. DELETE sets `removed_at` and `removed_by` instead of deleting |
| `schedules/routes.ts` `requireLinked` | `findUnique(vendorId_projectId)` | current only, so a removed vendor cannot be scheduled (Feature 001 FR-029 unchanged) |
| `timeline/routes.ts` `assertVendorCanBeResponsible`, `assertVendorsLinked` | `findUnique`, `findMany` | current only (Feature 002 FR-004, FR-017 unchanged) |
| `vendors/routes.ts` include and `project_id` filter | all links | `links` = current, new `past_links` = removed. The "linked project" filter matches current assignments only (Feature 001 FR-014) |
| `projects/routes.ts` GET `:id` | all links | `links` = current, new `past_links` = removed |
| `prisma/seed.ts` `link()` | `findUnique` | `findFirst` current |

Keeping the response key `links` for current assignments keeps every Feature 001 link test valid. Past assignments arrive in a new key, so no existing client reads them by mistake.

## 5. Dashboard filters and sorting run in the browser on one response

- **Decision**: `GET /api/dashboard` keeps every Feature 002 key unchanged and adds `items`, every open item on an active project with its `group` (or `null` beyond 30 days), status, last update date, responsible party and flags, and `attention_projects`. The web page filters by project, responsible party and status, and sorts by deadline, project or latest update, in memory.
- **Rationale**: The spec's volume is tens of projects with tens of items, a few hundred rows at most. Every staff member sees the same data (FR-023a), so there is nothing to scope on the server. Filters are not saved between visits (spec Assumptions). Keeping the old keys keeps the Feature 002 API tests green (SC-006).
- **Alternatives considered**: Query parameters for group, filters and sort: rejected, it adds validation and test surface on the server for no gain at this volume. It can be added later without changing the response shape.

## 6. Project list facts are computed in the list route

- **Decision**: `GET /api/projects` gains `q` (name, client or site contains, ignoring letter case, applied in the Prisma query), `has_overdue=true` and `due_within_7=true` (applied after the per-project figures are worked out). Each project is returned with its dates, `vendor_count`, `progress`, `overdue_count`, `next_deadline` and `health`. One `findMany` loads projects with `_count` of current links and non-archived items with `itemInclude`. `GET /api/projects/:id` and the dashboard share the same summary function, `projectFigures`, in `api/src/modules/projects/figures.ts`.
- **Rationale**: One function means the list, the overview and the dashboard attention section always agree.
- **Alternatives considered**: SQL views or raw aggregate queries: rejected as unnecessary at this volume, and they would bypass the tested pure rules.

## 7. "Completed on" is read from history

- **Decision**: When a project's status is `COMPLETED`, `GET /api/projects/:id` returns `completed_on`, the India date of the newest `EDITED` history entry for that project whose `changes.status.to` is `COMPLETED`, found with a Prisma JSON path filter (`changes: { path: ['status', 'to'], equals: 'COMPLETED' }`). If none exists, it returns `null` and the overview shows "Completed" with no date (FR-014a).
- **Rationale**: The Feature 003 project `EDITED` entry already records `status` with `from` and `to`. No new column is needed, as the product owner chose.
- **Known limit**: a project created directly with status Completed has only a `CREATED` entry without changes, so it shows "Completed" with no date. This is the same fallback the spec defines for projects completed before history began.

## 8. Project dates on create and edit

- **Decision**: `start_date` and `expected_completion_date` are `YYYY-MM-DD` strings, optional and nullable on `POST /api/projects` and `PATCH /api/projects/:id`. On PATCH, absent means unchanged and `null` means clear, the same convention as `PATCH /api/links/:id`. A Zod refinement refuses an expected completion date earlier than the start date with 400 and `fields` naming both. The check uses the effective values, so changing only one date still checks against the stored other. A database check constraint repeats the rule. Both fields join `EDITED_FIELDS` for history (FR-015a).
- **Rationale**: This reuses the date parsing in `india-date.ts` (`toDateColumn`, `fromDateColumn`) and the history diff that projects already use.
- **Feature 001 T078**: The same form gains client name, site location and description, which the API already accepts. The task is completed under Feature 001's task list, as the spec states.

## 9. "After project completion date" marker

- **Decision**: `GET /api/projects/:projectId/timeline` adds `after_project_completion` to each item, computed with `isAfterCompletion(item, project.expected_completion_date)`: true only for open items whose deadline is later than the date. The project overview returns `after_completion_count`. It is not a Feature 002 flag and is not in `flags` (FR-015b).
- **Rationale**: The timeline route already loads the project, so no extra query is needed.

## 10. Confirmations and plain error messages, in one place each

- **Decision**:
  - `web/src/notify.ts` exports `notify(message)`, which dispatches a window event. `main.tsx` shows the latest message in one `role="status"` region for a few seconds. Pages call `notify('Vendor archived')` after a successful action (FR-026).
  - `web/src/api/client.ts` turns any 500 into "The action did not complete. Please try again." and any 403 into "You are not allowed to do this.", keeping `fields` and `code` for 400 and 409 (FR-027).
- **Rationale**: One live region and one mapping change behaviour on every page without a toast library or a context provider. No technical detail reaches staff, whatever the server sends.
- **Alternatives considered**: A notification library: rejected, Constitution Principle II and no need. Per-page message state: rejected, it repeats the same code on every page.

## 11. Profile menu

- **Decision**: Move the existing account block from the sidebar into a header at the top right of `main.tsx`. A button showing the person's name opens a panel with name, role, email (already returned by `GET /api/auth/me`), the existing change-password form and Sign out. The button uses `aria-expanded` and `aria-controls`, and Escape closes the panel, following the existing Account toggle.
- **Rationale**: This moves existing code. Sign-in, sign-out and password behaviour are untouched (FR-024).

## 12. Seed data stays find-or-create

- **Decision**: Extend `api/prisma/seed.ts` with the existing helpers, each of which returns an existing row when found (vendor by phone, project by name, link by current pair, item by project and name). The seed then holds 10 vendors in 7 categories and 4 projects. Dates are relative to `todayInIndia()` on the day the seed runs. The Missing update item gets a progress update whose `createdAt` is set 10 days back. The past assignment is created directly with `removed_at` set, only when no assignment for that pair exists. Nothing is updated or deleted (FR-035).
- **Rationale**: This matches the current seed's idempotent style. Running it twice changes nothing (SC-007).
- **Known limit**: because dates are relative to the first run, an item that was "Due today" on the seed day is Overdue a day later. The quickstart therefore runs on a freshly reset database.

## 13. No new dependencies

Everything above uses the stack already in `api/package.json` and `web/package.json`. Constitution Principle II needs no research entry for a new runtime dependency.

## 14. Branch

The work is on branch `004-dashboard`, created by the product owner from `main` before this plan, with no commits of its own. The spec header and Assumptions were updated to `004-dashboard` on 2026-11-08 (analysis finding I1). The feature folder keeps the name `specs/004-vendor-project-visibility`, and Spec Kit locates it through `.specify/feature.json`.
