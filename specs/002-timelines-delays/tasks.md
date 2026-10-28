---

description: "Task list for timelines and delays"
---

# Tasks: Timelines and Delays

**Input**: Design documents from `/specs/002-timelines-delays/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: Included. Constitution Principle V requires an automated test for every acceptance scenario and business-rule tests written first. Write each listed test so it fails, then implement the task that makes it pass.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as an increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (US1–US5). Setup, Foundational, and Polish have no story label.

## Path Conventions

- API: `api/`. Web: `web/`. Paths match `plan.md`.
- Feature 001 code arrives in T001. Files marked "change" in a task already exist after T001.
- "Product decision N" refers to `plan.md`, section "Product decisions recorded during planning".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Put the Feature 001 code on this branch and prove it is green before any change

- [X] T001 Merge branch `001-core-auth-directory` into `002-timelines-delays` so `api/`, `web/`, `package.json`, `docker-compose.yml`, and `.github/workflows/ci.yml` exist on this branch. Before merging, check that the untracked leftovers in the working tree (`api/.pgdata/`, `api/storage/`, `api/tests/.test-env.json`, `node_modules/`) are ignored by the incoming `.gitignore` and do not block the merge. Keep every file under `specs/002-timelines-delays/`. Do not change application code in this task
- [X] T002 Run `npm install`, `npm run lint`, `npm run typecheck`, and `npm test` from the root `package.json` and confirm all pass on the merged branch with no edits. Record any pre-existing failure in this file under Notes before continuing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, test helpers, and the pure business-rule helpers that every story uses

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Schema and test plumbing

- [X] T003 Add to `api/prisma/schema.prisma` the enums `TimelineItemType` (`MILESTONE`, `ACTIVITY`), `TimelineStatus` (`NOT_STARTED`, `IN_PROGRESS`, `DONE`), `ResponsibleKind` (`NONE`, `VENDOR`, `FIRM_TEAM`), `TimelineDateField` (`PLANNED_DATE`, `DEADLINE`), `ResponsibleChangeCause` (`EDIT`, `LINK_REMOVED`), and the models `TimelineItem` (`timeline_items`), `TimelineDateChange` (`timeline_date_changes`), `TimelineResponsibleChange` (`timeline_responsible_changes`), `TimelineProgressUpdate` (`timeline_progress_updates`), `Delay` (`delays`), `CoordinationIssue` (`coordination_issues`), `CoordinationIssueVendor` (`coordination_issue_vendors`), exactly as in `data-model.md`. Every model has `id` UUID, `created_at`, `created_by`, `updated_at`, `updated_by` with the Feature 001 `@map` style. Field rules to encode: `deadline` "Required `DATE`" (`@db.Date`); `planned_date` "Optional `DATE`"; `responsible_kind` "Required. Default `NONE`"; `responsible_vendor_id` "Optional. References `vendors.id`"; `archived` "Default false"; `old_value`/`new_value` nullable `@db.Date`; `seq` "Database sequence (`autoincrement`), unique"; `timeline_item_id` on delays and issues "Optional"; `coordination_issue_vendors` "Unique on `(coordination_issue_id, vendor_id)`". Add indexes `(project_id, archived, deadline, name)` and `(responsible_vendor_id)` on `timeline_items`. Add the required back-relations on `StaffUser`, `Project`, and `Vendor` without changing any Feature 001 column
- [X] T004 Generate the migration `api/prisma/migrations/20261028120000_timelines_delays/migration.sql` with `prisma migrate dev --create-only`, then append by hand `ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_responsible_ck" CHECK (("responsible_kind" = 'VENDOR') = ("responsible_vendor_id" IS NOT NULL));`. Apply it and confirm `prisma migrate deploy` runs clean on an empty database after the Feature 001 migration
- [X] T005 [P] Change `resetDatabase` in `api/tests/helpers.ts` to delete `coordinationIssueVendor`, `coordinationIssue`, `delay`, `timelineProgressUpdate`, `timelineResponsibleChange`, `timelineDateChange`, `timelineItem` before the Feature 001 tables. Add factories `createProject`, `createVendor`, `linkVendor`, `createTimelineItem`, and `insertProgressUpdate({ itemId, status, createdAt, actorId })`, where `createdAt` lets tests backdate an update, and a `dayOffset(n)` helper that returns today in IST plus `n` days as `YYYY-MM-DD`. `dayOffset` imports `todayInIndia` from `api/src/lib/india-date.ts`, which T010 creates; until then the API suite fails to compile, which is expected while tests are written first

### Business-rule tests first (must fail before T010–T013)

- [X] T006 [P] Write `api/tests/unit/india-date.test.ts`: `todayInIndia(new Date('2026-10-27T18:29:00Z'))` is `2026-10-27` and `todayInIndia(new Date('2026-10-27T18:31:00Z'))` is `2026-10-28` (23:59 and 00:01 IST); `indiaDateOf` applies the same zone to a stored timestamp; `addDays('2026-10-30', 3)` is `2026-11-02`; `daysBetween('2026-10-25', '2026-10-28')` is 3, including across a month end
- [X] T007 [P] Write `api/tests/unit/timeline-flags.test.ts` for `flagsFor({ status, archived, deadline, lastUpdateOn }, today)` with today `2026-10-28`: deadline `2026-10-27` → `[OVERDUE days_overdue 1]`; deadlines `2026-10-28`, `2026-10-31`, `2026-11-04` → `[DUE_SOON]`; `2026-11-05` → `[]`; status `DONE` with a past or near deadline → `[]`; `archived: true` → `[]`; `IN_PROGRESS` last updated `2026-10-20` (8 days) → includes `MISSING_UPDATE last_update_on 2026-10-20`; last updated `2026-10-21` (7 days) → no `MISSING_UPDATE`; `NOT_STARTED` with no update and a far deadline → `[]`; `IN_PROGRESS`, deadline `2026-10-26`, last update `2026-10-20` → both `OVERDUE` and `MISSING_UPDATE`; `IN_PROGRESS`, deadline `2026-10-31`, last update `2026-10-20` → both `DUE_SOON` and `MISSING_UPDATE`; a property loop over deadlines from `2026-10-01` to `2026-11-30` never returns `OVERDUE` and `DUE_SOON` together (Product decision 2)
- [X] T008 [P] Write `api/tests/unit/timeline-rules.test.ts`: `checkPlannedDate` refuses a planned date later than the deadline with message "Planned date cannot be later than the deadline.", allows equal, allows absent; `checkResponsibleShape` refuses `VENDOR` without `vendor_id` and refuses `NONE` or `FIRM_TEAM` with a `vendor_id`; `assertProjectWritable({ archived: true })` throws a 409 `HttpError` with code `PROJECT_ARCHIVED`; `assertItemWritable({ archived: true })` throws 409 `ITEM_ARCHIVED`
- [X] T009 [P] Write `api/tests/unit/dashboard-sort.test.ts`: overdue rows sort by `days_overdue` descending, then project name, then item name; due-soon rows by `deadline` ascending, then project name, then item name; missing-update rows by `last_update_on` ascending, then project name, then item name; `recentDelaysAndIssues` merges delays and issues by `created_at` descending and returns at most 10

### Business-rule helpers

- [X] T010 [P] Implement `todayInIndia(now = new Date())`, `indiaDateOf(timestamp)`, `addDays(date, n)`, and `daysBetween(from, to)` in `api/src/lib/india-date.ts` with `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })` and whole-UTC-day arithmetic on `YYYY-MM-DD` strings. No other file may name the time zone. Makes T006 pass
- [X] T011 [P] Implement `flagsFor(item, today)` in `api/src/lib/timeline-flags.ts` returning every applicable flag from the three independent rules in `plan.md` "Dates and flags": Overdue (not Done, not archived, deadline before today, with `days_overdue`), Due soon (not Done, not archived, today ≤ deadline ≤ today + 7), Missing update (`IN_PROGRESS`, not archived, more than 7 days since `lastUpdateOn`, with `last_update_on`). No Prisma or HTTP imports. Makes T007 pass
- [X] T012 [P] Implement `checkPlannedDate`, `checkResponsibleShape`, `assertProjectWritable`, and `assertItemWritable` in `api/src/lib/timeline-rules.ts`, using `HttpError` from `api/src/lib/http.ts`. `checkPlannedDate` and `checkResponsibleShape` return field-message pairs so routes can merge them into one 400 `fields` object. Makes T008 pass
- [X] T013 [P] Implement `sortOverdue`, `sortDueSoon`, `sortMissingUpdate`, and `recentDelaysAndIssues(delays, issues, limit = 10)` in `api/src/lib/dashboard-sort.ts`. Makes T009 pass
- [X] T014 Create empty `timelineRouter` in `api/src/modules/timeline/routes.ts` and empty `dashboardRouter` in `api/src/modules/dashboard/routes.ts`, and mount both under `/api` after `sessionMiddleware` in `api/src/app.ts`, before the `/api` 404 catch-all. Add no `requireRole`: all three roles have equal access (FR-024)

**Checkpoint**: Migration applied, unit tests green, routers mounted. User story work can begin.

---

## Phase 3: User Story 1 - Build a project timeline (Priority: P1) 🎯 MVP

**Goal**: Staff add, edit, archive, and restore timeline items with a deadline, an optional planned date, and a responsible party, and earlier dates and responsible parties stay readable.

**Independent Test**: On an active project with one linked vendor, add a milestone and an activity with that vendor responsible. Both are listed by deadline. Change the activity's deadline; the old deadline is readable with author and date.

### Tests for User Story 1 ⚠️

- [X] T015 [P] [US1] Write `api/tests/api/timeline-items.test.ts` against `contracts/http-api.md`: US1-1 milestone saved and listed as `NOT_STARTED`; US1-2 activity with linked vendor shows the vendor label, and the vendor row and link row are unchanged; US1-3 `NONE` shows "No responsible party"; US1-10 `FIRM_TEAM` shows "Firm team"; US1-4 unlinked vendor → 409 `VENDOR_NOT_LINKED`, archived linked vendor → 409 `VENDOR_ARCHIVED`; US1-5 one 400 naming `item_type`, `name`, `deadline`, and `planned_date` together, and no row saved; US1-6 deadline change keeps the old value in `date_changes` with author and time, and three changes give three rows (SC-005); a planned date set, changed, and cleared writes rows with null `old_value` then null `new_value`; a responsible change writes a `responsible_changes` row with cause `EDIT`; FR-007 order is deadline ascending then name; US1-7 archive moves the item to `archived_items` and restore brings it back; US1-12 (Product decision 3) `PATCH` on an archived item of an active project → 409 `ITEM_ARCHIVED` with a message saying to restore it first, and restoring that item succeeds (FR-007); US1-8 on an archived project, create, `PATCH`, archive, and restore → 409 `PROJECT_ARCHIVED`, including restore of an item that was archived before the project was (US1-12, FR-025), and after the project is restored that item can be restored; `GET /timeline` and `GET /timeline-items/:id` on the archived project still return all history; keeping an already-named vendor that was archived later is allowed on `PATCH` of another field, and the vendor shows `archived: true` (FR-005); creating, editing, archiving, or restoring an item changes no `work_schedules`, `task_price_entries`, or `costing_sheet_files` row, compared row for row before and after (FR-028, Edge Cases); every route here as the Accountant succeeds, and with no cookie or a revoked user's cookie is 401 (FR-024, SC-007)
- [X] T016 [P] [US1] Change `api/tests/api/links.test.ts` to add: US1-9 removing a link clears `responsible_kind` to `NONE` on that project's items with that vendor, archived or not, writes one `LINK_REMOVED` responsible change by the caller, returns `cleared_timeline_item_ids`, and leaves `FIRM_TEAM` items, other projects' items, progress updates, date changes, delays, and issue vendor rows unchanged; US1-11 (Product decision 1) the same on an archived project, where only `responsible_kind`, `responsible_vendor_id`, `updated_by`, and `updated_at` change on the item and one `LINK_REMOVED` row is added, with type, name, description, deadline, planned date, archived flag, progress updates, date changes, earlier responsible changes, delays, and issues unchanged (FR-005, FR-025), and afterwards `POST /timeline-items/:id/progress-updates` on that project is still 409 `PROJECT_ARCHIVED`; the existing Feature 001 link-removal assertions still pass
- [X] T017 [P] [US1] Write `web/tests/timeline-form.test.tsx`: the item form sends `item_type`, `name`, `deadline`, optional `planned_date`, `description`, and `responsible` `{ kind, vendor_id }` with the vendor choices taken from the project's linked, non-archived vendors plus "Firm team" and "No responsible party"; each 400 `fields` message shows next to its field

### Implementation for User Story 1

- [X] T018 [US1] Implement in `api/src/modules/timeline/present.ts`: `presentItem(item, latestUpdate)` returning the contract item summary (`status` from the latest update by highest `seq` or `NOT_STARTED` when none; `last_update_on` via `indiaDateOf`; `done_on` only when status is `DONE`; `responsible` with `label` "vendor name" / "Firm team" / "No responsible party"; `flags: []` until T028), plus `presentDateChange`, `presentResponsibleChange`, and `presentAuthor` (`{ id, name }`)
- [X] T019 [US1] Implement in `api/src/modules/timeline/routes.ts` with Zod schemas and the check order from `plan.md` "Architecture": `POST /projects/:projectId/timeline-items`; `GET /timeline-items/:id` (summary, `progress_updates`, `date_changes`, `responsible_changes`, empty `delays` and `coordination_issues`, each newest first); `PATCH /timeline-items/:id` (strict schema, unknown fields 400; writes `timeline_date_changes` for a changed `planned_date` or `deadline` and `timeline_responsible_changes` with cause `EDIT` for a changed party, in one transaction with the update; vendor rules apply only when the vendor is newly named or changed); `POST /timeline-items/:id/archive` and `/restore`; `GET /projects/:projectId/timeline` (`items` non-archived and `archived_items`, each ordered by `deadline` then `name`; `delays` and `coordination_issues` empty until T032). Use `stampCreate`/`stampUpdate` from `api/src/lib/audit.ts`. No route updates or deletes a history row. Makes T015 pass
- [X] T020 [US1] Change `DELETE /links/:id` in `api/src/modules/links/routes.ts`: inside the existing transaction, find every `timeline_items` row with that `project_id` and `responsible_vendor_id`, set `responsible_kind = 'NONE'`, `responsible_vendor_id = null`, and `updated_by` = caller, and insert one `timeline_responsible_changes` row per item with cause `LINK_REMOVED`, `old_kind = 'VENDOR'`, the old vendor id, and `new_kind = 'NONE'`. Do this whether or not the project is archived and do not call `assertProjectWritable` (Product decision 1). Add `cleared_timeline_item_ids` to the response. Change nothing else in the handler. Makes T016 pass
- [X] T021 [US1] Create `web/src/pages/project-timeline.tsx` exporting `ProjectTimeline({ projectId })`: loads `GET /api/projects/:projectId/timeline`; lists items with type, name, deadline, planned date, responsible label (vendor marked "archived" when so), and status; an add/edit item form with field-level errors; archive and restore buttons; a collapsible "Archived items" list; an item detail panel showing date changes and responsible changes with author and time; hides every write control when the project is archived and shows "This project is archived. Its timeline is read-only." Makes T017 pass
- [X] T022 [US1] Change `web/src/pages/project-detail.tsx` to render `<ProjectTimeline projectId={id} />` below the existing project sections, with no change to Feature 001 sections

**Checkpoint**: US1 works on its own: items, edits, history, archive, link-removal effect.

---

## Phase 4: User Story 2 - Record progress (Priority: P2)

**Goal**: Staff record dated status updates. The latest one sets the item's status; Done records the date; history stays readable.

**Independent Test**: Record In progress, then Done, on an activity. It shows Done with that date, and both updates are readable with authors and dates.

### Tests for User Story 2 ⚠️

- [X] T023 [P] [US2] Write `api/tests/api/progress.test.ts`: US2-1 In progress with a note shows status, note, date, and author; US2-2 three updates are all returned newest first by save order; US2-3 Done sets `done_on` to the IST date of that update; US2-4 In progress after Done clears `done_on` and the Done update remains in history; US2-5 missing `status` and `status: 'PAUSED'` → 400 naming `status`; two updates posted concurrently with `Promise.all` are both kept and ordered by `seq` (Edge Cases); archived item → 409 `ITEM_ARCHIVED` (US1-12, Product decision 3); archived project → 409 `PROJECT_ARCHIVED`; no `PATCH` or `DELETE` route exists for a progress update (404) (FR-010); Edge Cases revoke the author of an update through `PATCH /api/staff/:id` as an Administrator, then `GET /timeline-items/:id` still shows that update with the revoked author's id and name; the progress route as the Accountant succeeds, and with no cookie or a revoked user's cookie is 401 (FR-024, SC-007)
- [X] T024 [P] [US2] Write `web/tests/progress-form.test.tsx`: the progress form offers exactly Not started, In progress, and Done, sends `{ status, note }`, and shows the refreshed status and history after save

### Implementation for User Story 2

- [X] T025 [US2] Add `POST /timeline-items/:id/progress-updates` to `api/src/modules/timeline/routes.ts`: Zod `status` enum `NOT_STARTED | IN_PROGRESS | DONE` required, `note` optional; `assertProjectWritable` then `assertItemWritable`; insert one `timeline_progress_updates` row; return 201 with the item summary from `presentItem`. Makes T023 pass
- [X] T026 [US2] Change `web/src/pages/project-timeline.tsx` to add a progress form on each non-archived item of a non-archived project, show the current status with "Done on <date>" when Done and "Last update <date>", and list progress history newest first with note, author, and time. Makes T024 pass

**Checkpoint**: US1 and US2 work independently.

---

## Phase 5: User Story 3 - See what is overdue, due soon, or missing updates (Priority: P3)

**Goal**: Each item shows Overdue, Due soon, and Missing update flags worked out from its dates and updates on every read.

**Independent Test**: Items due yesterday, due in 3 days, In progress last updated 8 days ago, and Done last week show Overdue, Due soon, Missing update, and no flag.

### Tests for User Story 3 ⚠️

- [X] T027 [P] [US3] Write `api/tests/api/flags.test.ts` using `dayOffset` and `insertProgressUpdate` from `api/tests/helpers.ts`: quickstart step 9 deadlines D−1, D, D+3, D+7, D+8 and a Done item with deadline D−7 give Overdue (1), Due soon ×3, none, none (US3-1, US3-2, US3-4, SC-003); items with deadline D+30 and In progress updates dated D−8 and D−7 give Missing update with `last_update_on` and none (US3-3); US3-7 (Product decision 2) deadline D−2 with an In progress update at D−8 gives both Overdue (2) and Missing update, and deadline D+3 with an In progress update at D−8 gives both Due soon and Missing update; US3-5 moving an overdue deadline to D+2 turns Overdue into Due soon and keeps the old deadline in `date_changes`; Edge Cases moving a deadline into the past makes it Overdue at once; US3-6 a new update clears Missing update; an archived item carries no flags; US3-8 (Product decision 5) an archived project's `GET /timeline` returns the same flags as before archiving; no request body field can set or clear a flag (`PATCH` with `flags` → 400) (FR-015)

### Implementation for User Story 3

- [X] T028 [US3] Change `presentItem` in `api/src/modules/timeline/present.ts` to set `flags` from `flagsFor({ status, archived, deadline, lastUpdateOn }, todayInIndia())`, computed per request, for every item including items on an archived project (Product decision 5). Makes T027 pass
- [X] T029 [US3] Change `web/src/pages/project-timeline.tsx` and `web/src/styles.css` to show each flag as a text badge: "Overdue by N days", "Due soon", "Missing update since <date>". An item can show more than one badge. Badges use text, not color alone

**Checkpoint**: US1–US3 work independently; flags appear on the project timeline.

---

## Phase 6: User Story 4 - Record delays and coordination issues (Priority: P4)

**Goal**: Staff record delays with a reason and coordination issues with a description and vendors, on an item or the project generally. Records are never edited.

**Independent Test**: On an overdue activity with a responsible vendor, record a delay and a coordination issue naming that vendor. Both appear on the item and the project with date and author, and the vendor record is unchanged.

### Tests for User Story 4 ⚠️

- [X] T030 [P] [US4] Write `api/tests/api/delays-issues.test.ts`: US4-1 a delay on an item appears on `GET /timeline-items/:id` and `GET /projects/:id/timeline` with author and date; US4-2 an issue naming a linked vendor appears with the vendor name, and that vendor's `vendor_notes`, `vendor_ratings`, and vendor fields are unchanged (FR-019); US4-3 blank `reason` and blank `description` → 400 and nothing saved; US4-4 an unlinked vendor → 409 `VENDOR_NOT_LINKED` with `vendor_ids`; US4-5 after a deadline change and a Done update the delay is still on the item; US4-6 a delay and an issue without `timeline_item_id` are saved with `timeline_item: null`; US4-7 an item from another project → 409 `ITEM_NOT_ON_PROJECT`; attaching a delay or issue to an archived item → 409 `ITEM_ARCHIVED` (US1-12, Product decision 3); US4-8 (Product decision 4) an archived but linked vendor is accepted and returned with `archived: true`; an archived project → 409 `PROJECT_ARCHIVED`; duplicate `vendor_ids` are stored once; after the vendor's link is removed the issue still names the vendor (Edge Cases); `PATCH` and `DELETE` on `/delays/:id` and `/coordination-issues/:id` → 404, and no close or resolve route exists (FR-018, FR-029); both routes as the Accountant succeed, and with no cookie or a revoked user's cookie are 401 (FR-024, SC-007)

### Implementation for User Story 4

- [X] T031 [US4] Add `presentDelay` and `presentIssue` (with `timeline_item` `{ id, name }` or `null`, `vendors` `{ id, name, archived }`, `created_at`, `created_by`) to `api/src/modules/timeline/present.ts`, and add to `api/src/modules/timeline/routes.ts`: `POST /projects/:projectId/delays` (Zod `reason` trimmed min 1, optional `timeline_item_id`) and `POST /projects/:projectId/coordination-issues` (Zod `description` trimmed min 1, optional `timeline_item_id`, `vendor_ids` default `[]`, deduplicated), each running `assertProjectWritable`, the item-on-project check, `assertItemWritable`, and for issues the linked-vendor check with no archived-vendor check; the issue and its `coordination_issue_vendors` rows are written in one transaction. Fill `delays` and `coordination_issues` (newest first) in `GET /projects/:projectId/timeline` (whole project, including rows on archived items) and `GET /timeline-items/:id` (that item only). Makes T030 pass
- [X] T032 [US4] Change `web/src/pages/project-timeline.tsx` to add a "Record delay" form (reason, optional item) and a "Record coordination issue" form (description, optional item, checkboxes for linked vendors), and lists of delays and issues on the project and on each item with item name or "Whole project", vendor names (archived marked), author, and date. No edit or delete controls

**Checkpoint**: US1–US4 work independently.

---

## Phase 7: User Story 5 - See deadlines and delays on the dashboard (Priority: P5)

**Goal**: One dashboard for the whole firm with Overdue, Due soon, Missing update, and Recent delays and coordination issues across non-archived projects.

**Independent Test**: Two non-archived projects with an overdue item and a delay each, and an archived project with an overdue item. The dashboard lists both non-archived projects' items and delays, and not the archived project's item.

### Tests for User Story 5 ⚠️

- [X] T033 [P] [US5] Write `api/tests/api/dashboard.test.ts`: US5-1 overdue items on two projects are listed with project, `responsible_label` (vendor name, "Firm team", or "None"), deadline, and `days_overdue`, most overdue first; US5-2 Due soon and Missing update items each appear in their own list; US5-7 (Product decision 2) an item with Overdue and Missing update appears in both `overdue` and `missing_update`; US5-3 with 12 delays and issues, the 10 newest appear newest first with project and item or `null`; US5-4 items on an archived project and archived items appear in no list, and a delay attached to an archived item is left out of the recent list; project statuses Planned, On hold, and Completed are all included (plan.md Unresolved item 6); US5-5 an empty database returns four empty arrays; the response is the same for all three roles; no cookie → 401; the response has no vendor counts or client advance fields (FR-023)
- [X] T034 [P] [US5] Write `web/tests/dashboard.test.tsx`: renders four headed lists; each empty list shows "Nothing overdue.", "Nothing due soon.", "No missing updates.", and "No delays or coordination issues." (US5-5); each entry links to `#/projects/<projectId>?item=<itemId>`, or `#/projects/<projectId>` when there is no item (US5-6). Also write `web/tests/project-timeline-focus.test.tsx`: rendering `ProjectTimeline` with `itemId` marks that item as highlighted and calls `scrollIntoView` on it, and when the item is archived the "Archived items" list opens with that item highlighted (US5-6)

### Implementation for User Story 5

- [X] T035 [US5] Implement `GET /dashboard` in `api/src/modules/dashboard/routes.ts`: load non-archived items on non-archived projects with their latest progress update (highest `seq`) and responsible vendor; compute `flagsFor` with `todayInIndia()`; put each item in every list matching one of its flags; sort with `sortOverdue`, `sortDueSoon`, `sortMissingUpdate`; load delays and issues on non-archived projects that are general or attached to a non-archived item, and take `recentDelaysAndIssues(..., 10)`; use `"None"` as the label for `NONE` and for general delays and issues; return `today`. No query parameters. Makes T033 pass
- [X] T036 [US5] Create `web/src/pages/dashboard.tsx` exporting `Dashboard()`, which loads `GET /api/dashboard` and renders the four lists with the fields and empty messages from T034. Makes T034 pass
- [X] T037 [US5] Change `web/src/main.tsx` to add a "Dashboard" nav link and a `#/dashboard` route rendering `Dashboard`, and parse `?item=<id>` from `#/projects/<id>?item=<itemId>` so `projectId` excludes the query and `ProjectDetail` receives `itemId`. `#/vendors` stays the default route
- [X] T038 [US5] Change `web/src/pages/project-detail.tsx` and `web/src/pages/project-timeline.tsx` to accept `itemId`, scroll that item into view, and highlight it (US5-6), opening it from `archived_items` when it is archived. Makes the focus test from T034 pass

**Checkpoint**: All five stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Seed data, append-only guard, layout, and the delivery gates

- [X] T039 [P] Write `api/tests/unit/append-only.test.ts` that reads the source files under `api/src` and fails if any calls `.update`, `.updateMany`, `.upsert`, `.delete`, or `.deleteMany` on `timelineProgressUpdate`, `timelineDateChange`, `timelineResponsibleChange`, `delay`, `coordinationIssue`, or `coordinationIssueVendor` (plan.md "Data integrity")
- [X] T040 Change `api/prisma/seed.ts` to upsert, on one seeded project with a linked vendor, the rows listed in `data-model.md` "Seed additions" with dates from `todayInIndia()`: an Overdue activity with the linked vendor responsible, a Due soon milestone, an In progress activity whose last update is 8 days old, a Done item past its deadline, a Firm team item, one delay on the overdue item, and one coordination issue naming the linked vendor. Use fixed UUIDs so rerunning `npm run dev` does not duplicate rows
- [X] T041 [P] Change `web/src/styles.css` so the timeline list, forms, badges, and dashboard lists stack in one column with no horizontal scroll at 360 px width and use the Feature 001 layout on desktop (SC-008)
- [X] T042 Run `npm run lint`, `npm run typecheck`, and `npm test` from the root and fix every failure in the files this feature touched
- [ ] T043 Perform every API and web scenario in `specs/002-timelines-delays/quickstart.md` on the running app at phone and desktop widths, timing web scenarios 1, 2, and 5 against SC-001 (under 1 minute), SC-002 (under 30 seconds), and SC-004 (under 1 minute). Record any failed step in this file under Notes and fix it before continuing
- [ ] T044 Run `/speckit-converge` and resolve every gap it appends to this file until it reports Converged (Constitution Principle V, Delivery Gates)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 then T002. No dependencies.
- **Foundational (Phase 2)**: After T002. T003 → T004. T005–T009 in parallel after T004. Each helper T010–T013 after its test T006–T009. T014 after T004. Blocks every story.
- **User stories (Phases 3–7)**: After Phase 2, in priority order. See below.
- **Polish (Phase 8)**: After every story. T039 and T041 in parallel; T040 after T031; T042 → T043 → T044 last.

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No story dependency.
- **US2 (P2)**: After Phase 2 and T018–T019. T025 adds a route to `api/src/modules/timeline/routes.ts`, which T019 creates. T026 edits the file created in T021.
- **US3 (P3)**: After Phase 2 and T018. Tests insert progress updates through Prisma, so US3 does not need US2's route. T029 edits the file from T021.
- **US4 (P4)**: After Phase 2 and T018–T019. Independent of US2 and US3.
- **US5 (P5)**: After Phase 2, T018, T028, and T031. T035 reuses `presentItem` with flags (T018, T028) and `presentDelay`/`presentIssue` (T031) for the recent list. Its API test seeds rows through Prisma. T038 edits files from T021 and T022.

### Within Each User Story

- Tests are written first and fail before implementation.
- `present.ts` before `routes.ts`, routes before web pages.
- `api/src/modules/timeline/routes.ts`, `present.ts`, and `web/src/pages/project-timeline.tsx` are shared across stories, so tasks that edit them run one at a time, in task order.

### Parallel Opportunities

- Phase 2: T005, T006, T007, T008, T009 together; then T010, T011, T012, T013 together.
- Each story's test tasks marked [P] run together.
- Across stories, after T019: the API tests T023, T027, T030, and T033 can be written in parallel.
- Polish: T039 and T041 together.

---

## Parallel Example: User Story 1

```text
Task: "Write api/tests/api/timeline-items.test.ts (T015)"
Task: "Add link-removal cases to api/tests/api/links.test.ts (T016)"
Task: "Write web/tests/timeline-form.test.tsx (T017)"
```

## Parallel Example: Foundational helpers

```text
Task: "Implement api/src/lib/india-date.ts (T010)"
Task: "Implement api/src/lib/timeline-flags.ts (T011)"
Task: "Implement api/src/lib/timeline-rules.ts (T012)"
Task: "Implement api/src/lib/dashboard-sort.ts (T013)"
```

## Parallel Example: Story tests after US1

```text
Task: "Write api/tests/api/progress.test.ts (T023)"
Task: "Write api/tests/api/flags.test.ts (T027)"
Task: "Write api/tests/api/delays-issues.test.ts (T030)"
Task: "Write api/tests/api/dashboard.test.ts (T033)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: bring in Feature 001 and confirm it is green.
2. Phase 2: schema, migration, rule tests, helpers.
3. Phase 3: US1.
4. **Stop and validate**: run T015–T017 and quickstart API steps 1–7 and 15.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → timeline items (MVP).
3. US2 → progress.
4. US3 → flags.
5. US4 → delays and issues.
6. US5 → dashboard.
7. Polish → seed, layout, quickstart, converge.

Each story keeps the earlier stories' tests green.

---

## Notes

- [P] tasks touch different files and depend on no incomplete task.
- A task is done when its tests pass and its acceptance scenario is demonstrated (Constitution Principle V). A passing typecheck alone does not finish a task.
- Do not commit unless asked. One feature, one branch, one pull request.
- Pre-existing failures found in T002: none. Merge commit `41b02ed`. Baseline on 2026-10-28: lint and typecheck clean; API 15 files, 50 tests passed; web 7 files, 13 passed, 1 skipped. An `ECONNRESET` line at the end of the API run is the embedded PostgreSQL shutting down, not a test failure.
- Quickstart failures found in T043: none recorded yet.
- Implementation notes (2026-10-28), where the delivered work differs from the task text:
  - T015: US1-5 is tested with two requests. A missing deadline and a planned date later than the deadline cannot both be reported at once, because the second check needs a deadline. The first request names `item_type`, `name`, and `planned_date`; the second names `deadline`.
  - T016: after the archived-project unlink, the "ordinary writes still refused" check uses item create and `PATCH` (US1 routes) instead of a progress update, so US1's tests do not depend on US2. T023 covers progress updates on an archived project.
  - T040: the seed finds existing rows by project and name, matching the Feature 001 seed's pattern, instead of fixed UUIDs. Two consecutive runs were checked on a throwaway database: 5 items, 3 updates, 1 delay, 1 issue.
  - Feature 001 `web/tests/pricing-controls.test.tsx`: its fetch mock now answers `GET /api/projects/p1/timeline`, because the project page now loads the timeline. No assertion changed.
  - Full run after T042: lint and typecheck clean; API 25 files, 106 tests passed; web 11 files, 21 passed, 1 skipped (pre-existing).
