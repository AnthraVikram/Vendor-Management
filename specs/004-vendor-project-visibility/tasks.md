---

description: "Task list for vendor–project visibility, project tracking and dashboard views"
---

# Tasks: Vendor–Project Visibility, Project Tracking and Dashboard Views

**Input**: Design documents from `/specs/004-vendor-project-visibility/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: Included. Constitution Principle V requires an automated test for every acceptance scenario and business-rule tests written first. Write each listed test so it fails, then implement the task that makes it pass.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as an increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (US1–US8). Setup, Foundational and Polish have no story label.

## Path Conventions

- API: `api/`. Web: `web/`. Paths match `plan.md`.
- "Assignment" is the Feature 001 vendor-project link (`vendor_project_links`, routes under `/api/links` and `/api/projects/:projectId/links`).
- `research.md §N` and `data-model.md` sections are cited where a task depends on a design decision.
- After every task that changes code, run `graphify update .` (CLAUDE.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prove the starting point is green before anything changes.

- [X] T001 On branch `004-dashboard`, before running anything else, record the output of `git status --short` and `git rev-parse HEAD` under this task as the Git baseline. Treat all files and changes present in this baseline as pre-existing work. Do not overwrite, revert, delete or clean them up as part of this implementation without explicit approval. Then run `npm install`, `npm run lint`, `npm run typecheck` and `npm test` from the repository root. Record the result (pass, or each failing test name) under this task before starting T002. No code change. `npm install` must not change dependencies: if it modifies `package-lock.json` or any `package.json`, stop, restore the file with `git checkout -- <file>`, and report it to the product owner before continuing.

  **T001 result (2026-11-09)**:
  - Git baseline: HEAD `24ead763c02b0c4f81f0912b4c75771a7e487e16` on `004-dashboard`. `git status --short`: ` M .gitignore`, `?? .claude/settings.json`, `?? CLAUDE.md`, `?? specs/004-vendor-project-visibility/`. All four are pre-existing work.
  - `npm install`: no change to `package-lock.json` or any `package.json`. npm 11.19.0 skipped install scripts for `bcrypt`, `esbuild` and `prisma`, which had no effect: `bcrypt` ships a `win32-x64` prebuild, and lint, typecheck and tests all ran.
  - `npm run lint`: pass. `npm run typecheck`: pass (api and web).
  - `npm test`: API 42 files and 240 tests passed. Web: 20 of 21 files passed, 73 tests passed and 1 skipped. 2 failed in `web/tests/vendor-form.test.tsx` ("sends every directory field the API accepts" and "warns about a duplicate phone and saves only after confirmation"), both `Test timed out in 5000ms`.
  - The two web failures are pre-existing and timing-dependent. Run alone, the file passes twice in a row (3 passed, 1 skipped), with the first test taking about 4.3 s against the 5 s default timeout. They are not caused by this feature and are not changed by it. Later checkpoints treat them as the baseline.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, the three tested rule libraries, and current-only link readers that every story uses.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema

- [X] T002 Change `api/prisma/schema.prisma`, following data-model.md:
  - **`Project`**: add `startDate DateTime? @map("start_date") @db.Date` and `expectedCompletionDate DateTime? @map("expected_completion_date") @db.Date`.
  - **`VendorProjectLink`**:
    - add `removedAt DateTime? @map("removed_at")` and `removedById String? @map("removed_by") @db.Uuid`
    - add relation `removedBy StaffUser? @relation("LinkRemovedBy", fields: [removedById], references: [id], onDelete: Restrict)`. `onDelete: Restrict` is required: Prisma's default for an optional relation is `SetNull`, which would conflict with `vendor_project_links_removed_ck`. Feature 003 sets `onDelete: Restrict` on its optional references the same way.
    - remove `@@unique([vendorId, projectId])` and add `@@index([vendorId, projectId])`
  - **`StaffUser`**: add `linksRemoved VendorProjectLink[] @relation("LinkRemovedBy")`.
  - **`HistoryAction` enum**: add `ASSIGNED`, `ASSIGNMENT_EDITED` and `UNASSIGNED`.
- [X] T003 Create the migration `api/prisma/migrations/20261108120000_vendor_project_visibility/migration.sql` with `npx -w api prisma migrate dev --create-only --name vendor_project_visibility`, and rename the folder to that timestamp.
  - **Keep what Prisma generates from T002** (do not write these again by hand, or the migration fails on duplicate statements):
    - the three `ALTER TYPE "HistoryAction" ADD VALUE` statements
    - `DROP INDEX "vendor_project_links_vendor_id_project_id_key"`
    - the two new `projects` columns, the two new `vendor_project_links` columns, the `removed_by` foreign key, and `CREATE INDEX "vendor_project_links_vendor_id_project_id_idx"`
  - **Review the generated SQL before applying anything**: read the entire generated `migration.sql`. Check that it contains no `DROP` or `ALTER` of any other existing table, column, index or constraint, and no data `UPDATE` or `DELETE`. Record the review outcome under this task: every generated schema operation, whether either permitted index exception below occurred, and confirmation that no unexpected operation was found. Do not apply the migration until this review is complete.
    - **Permitted exceptions**: two Feature 001 indexes were written by hand in `api/prisma/migrations/20261026120000_init/migration.sql` and are not in the Prisma schema, `categories_name_lower_key` and `costing_sheet_one_current`. If Prisma generates `DROP INDEX` for either, delete that line from the migration, keep both indexes, and report it.
    - **Anything else** unexpected, any other `DROP` or `ALTER` or any data change, means stop, change nothing, and ask the product owner to review.
  - **Append by hand** only:
    - `CREATE UNIQUE INDEX "vendor_project_links_current_key" ON "vendor_project_links" ("vendor_id", "project_id") WHERE "removed_at" IS NULL;`
    - `ALTER TABLE "projects" ADD CONSTRAINT "projects_dates_ck" CHECK ("start_date" IS NULL OR "expected_completion_date" IS NULL OR "expected_completion_date" >= "start_date");`
    - `ALTER TABLE "vendor_project_links" ADD CONSTRAINT "vendor_project_links_removed_ck" CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL));`
  - **Apply** with `npx -w api prisma migrate dev`, then `npm run -w api prisma:generate`. If Prisma reports drift or asks to reset the database, answer no, stop, and ask the product owner. A reset deletes local data.
  - **Expect breakage until T011**: the regenerated client no longer has the compound key `vendorId_projectId`, so four call sites stop typechecking and fail at run time (`api/src/modules/links/routes.ts`, `api/src/modules/schedules/routes.ts`, `api/src/modules/timeline/routes.ts`, `api/prisma/seed.ts`). Do not compare against T001 here. T003 is done when the migration applies cleanly. The full comparison is the Phase 2 checkpoint, after T011.

  **T003 result (2026-11-09)**:
  - **Generation**: the local development database was not running (no listener on port 5432, no Docker container), and `prisma migrate dev` does not run in a non-interactive shell. The SQL was therefore generated without touching any database: `prisma migrate diff --from-schema-datamodel <schema.prisma at HEAD> --to-schema-datamodel prisma/schema.prisma --script`. This gives the statements `migrate dev --create-only` produces for the T002 change.
  - **Review, completed before anything was applied**. The generated SQL was read in full. Its statements:
    - 3 × `ALTER TYPE "HistoryAction" ADD VALUE` (`ASSIGNED`, `ASSIGNMENT_EDITED`, `UNASSIGNED`)
    - `DROP INDEX "vendor_project_links_vendor_id_project_id_key"`
    - `projects` gains `expected_completion_date DATE` and `start_date DATE`, both nullable
    - `vendor_project_links` gains `removed_at TIMESTAMP(3)` and `removed_by UUID`, both nullable
    - `CREATE INDEX "vendor_project_links_vendor_id_project_id_idx"`
    - foreign key `vendor_project_links_removed_by_fkey` → `staff_users(id)` `ON DELETE RESTRICT ON UPDATE CASCADE`

    Permitted exceptions: neither occurred (no `DROP INDEX` for `categories_name_lower_key` or `costing_sheet_one_current`). Unexpected operations: none (no other `DROP` or `ALTER`, no `UPDATE` or `DELETE`).
  - **Hand-added**: `vendor_project_links_current_key` (partial unique index), `projects_dates_ck` and `vendor_project_links_removed_ck`, appended to `api/prisma/migrations/20261108120000_vendor_project_visibility/migration.sql`.
  - **Applied**: to the embedded test database only, by the test runner's `prisma migrate deploy` ("All migrations have been successfully applied"). `prisma migrate deploy` never resets. The local development database was not started or touched, and will receive this migration through `prisma migrate deploy` the next time `npm run dev` runs. `prisma generate` succeeded.
  - **Expected breakage confirmed**: `tsc --noEmit` in `api/` reports errors only at the four call sites, `prisma/seed.ts:110`, `src/modules/links/routes.ts:41`, `src/modules/schedules/routes.ts:134` (plus two follow-on errors at line 138) and `src/modules/timeline/routes.ts:155`.

### Business-rule tests first (must fail before T007–T009)

- [X] T004 [P] Write failing unit tests in `api/tests/unit/assignment-status.test.ts` for `assignmentStatus(items: { status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE'; overdue: boolean }[])`. The rules apply in order, first match wins: no items → `NO_ACTIVITIES`; any `overdue` → `DELAYED`; every item `DONE` → `COMPLETED`; any `IN_PROGRESS` or `DONE` → `IN_PROGRESS`; otherwise `NOT_STARTED`. Cases:
  - `[]` gives `NO_ACTIVITIES`
  - all `NOT_STARTED` gives `NOT_STARTED`
  - one `IN_PROGRESS` gives `IN_PROGRESS`
  - `DONE` with `NOT_STARTED` gives `IN_PROGRESS`
  - `DONE`, `IN_PROGRESS` and an overdue `NOT_STARTED` gives `DELAYED`
  - all `DONE` gives `COMPLETED`
- [X] T005 [P] Write failing unit tests in `api/tests/unit/deadline-groups.test.ts` for `deadlineGroup(deadline: string, today: string)`. With today `2026-11-08`:
  - `2026-11-07` gives `OVERDUE`
  - `2026-11-08` gives `DUE_TODAY`
  - `2026-11-09` and `2026-11-15` give `COMING_SOON`
  - `2026-11-16` and `2026-12-08` give `UPCOMING`
  - `2026-12-09` gives `null`
  - month and year boundaries work (today `2026-12-28`, deadline `2027-01-04` gives `COMING_SOON`)
- [X] T006 [P] Write failing unit tests in `api/tests/unit/project-health.test.ts`:
  - **`projectHealth({ status, expectedCompletionDate, today })`**: `COMPLETED` when status is `COMPLETED`, even with a past date; `DELAYED` when the date is before today; `ONGOING` when the date is today, in the future or null.
  - **`projectProgress(items)`**: `{ done, total }` over non-archived items only, milestones and activities alike, and `{0, 0}` for none.
  - **`isAfterCompletion({ status, archived, deadline }, expectedCompletionDate)`**: false when the deadline equals the date, true one day later, false for `DONE`, archived, or no date.
  - **`attentionReasons({ health, overdueCount, archived })`**:
    - `DELAYED` with 2 overdue gives `[PAST_EXPECTED_COMPLETION, OVERDUE_ITEMS(2)]`
    - `ONGOING` with 1 overdue gives `[OVERDUE_ITEMS(1)]`
    - `ONGOING` with 0 overdue gives `[]`
    - `COMPLETED` with overdue items gives `[]`
    - an archived project gives `[]`

### Business-rule helpers

- [X] T007 [P] Implement `assignmentStatus` in `api/src/lib/assignment-status.ts` so T004 passes. Pure function, no Prisma.
- [X] T008 [P] Implement `deadlineGroup` in `api/src/lib/deadline-groups.ts`, using `addDays` from `api/src/lib/india-date.ts`, so T005 passes.
- [X] T009 [P] Implement `projectHealth`, `projectProgress`, `isAfterCompletion` and `attentionReasons` in `api/src/lib/project-health.ts` so T006 passes.

### Current-only link readers (research.md §4)

- [X] T010 [P] Write failing Supertest cases in `api/tests/api/timeline-items.test.ts` and `api/tests/api/schedules.test.ts`. Set up a vendor whose only assignment on the project has `removed_at` and `removed_by` set directly through Prisma. Then:
  - naming the vendor as responsible party gives 409 `VENDOR_NOT_LINKED`
  - naming it on a coordination issue gives 409 `VENDOR_NOT_LINKED`
  - scheduling it gives the existing not-linked refusal from `requireLinked`
- [X] T011 Make every link reader ignore past assignments (`removedAt: null`) so T010 passes and the Feature 001 and 002 suites stay green:
  - `requireLinked` in `api/src/modules/schedules/routes.ts`
  - `assertVendorCanBeResponsible` and `assertVendorsLinked` in `api/src/modules/timeline/routes.ts`
  - the `links` include and the `project_id` filter (`links: { some: { projectId, removedAt: null } }`) in `api/src/modules/vendors/routes.ts`
  - the `links` include in `GET /:id` of `api/src/modules/projects/routes.ts`
  - the duplicate check in `POST /projects/:projectId/links` in `api/src/modules/links/routes.ts`: use `findFirst` with `removedAt: null`, and turn a Prisma `P2002` from `vendor_project_links_current_key` into 409 `LINK_EXISTS`, "That vendor is already linked to this project."
  - `link()` in `api/prisma/seed.ts`

  Replace each `findUnique({ where: { vendorId_projectId } })` with `findFirst`.

  **Confirm all four old lookups are gone**: run `git grep -n vendorId_projectId -- api/`. The expected result is no output and exit code `1`, which is how `git grep` reports no matches. Any output means a lookup was missed. Record under this task the four updated locations separately:
  1. `api/src/modules/links/routes.ts`, the duplicate check in `POST /projects/:projectId/links`
  2. `api/src/modules/schedules/routes.ts`, `requireLinked`
  3. `api/src/modules/timeline/routes.ts`, `assertVendorCanBeResponsible`
  4. `api/prisma/seed.ts`, `link()`

  **T011 result (2026-11-09)**: all four lookups now use `findFirst` with `removedAt: null`: `api/src/modules/links/routes.ts` (POST duplicate check, plus `P2002` on `vendor_project_links_current_key` mapped to 409 `LINK_EXISTS`), `api/src/modules/schedules/routes.ts` (`requireLinked`), `api/src/modules/timeline/routes.ts` (`assertVendorCanBeResponsible`, and `assertVendorsLinked` also filters `removedAt: null`), and `api/prisma/seed.ts` (`link()`). The vendor `links` include and `project_id` filter (`api/src/modules/vendors/routes.ts`) and the project `links` include (`api/src/modules/projects/routes.ts`) also filter `removedAt: null`. `git grep -n vendorId_projectId -- api/` gave no output and exit code `1`.

**Checkpoint**: Schema migrated, rules tested, past assignments invisible to every existing check. Run `npm run typecheck` and `npm test`. The results must match T001, plus the new passing tests from T004–T006 and T010. This is the first point after T003 where the suite is expected to be green.

**Phase 2 checkpoint result (2026-11-09)**: `npm run lint` pass. `npm run typecheck` pass. API: 45 files and 266 tests passed (240 at T001, plus 24 rule tests from T004–T006 and 2 from T010). Web: 74 passed, 1 skipped and 1 failed. The failure is `web/tests/vendor-form.test.tsx` "sends every directory field the API accepts", `Test timed out in 5000ms`, one of the two pre-existing timing failures recorded at T001. No web code has changed. The result matches T001 plus the new passing tests.

---

## Phase 3: User Story 1 - See a vendor's projects and a project's vendors (Priority: P1) 🎯 MVP

**Goal**: The vendor profile lists its projects with role, scope, note and project status, and a count. The project page lists its vendors with phone, contact person and categories, linking both ways. This also delivers the Feature 001 correction for FR-015 and US4-3.

**Independent Test**: Assign one vendor to three projects with different roles. The profile lists all three with "3 projects". A project shows the vendor's phone, contact person and categories, and each name opens the other record.

### Tests for User Story 1 ⚠️

- [X] T012 [P] [US1] Write failing Supertest cases for US1-1, US1-3, US1-5, US1-6, US1-7 and US1-8 in the new file `api/tests/api/assignments.test.ts`:
  - **`GET /api/vendors/:id`**: `links[]` has `project_id`, `project_name`, `project_status`, `project_archived`, `role_on_project`, `scope_of_work` and `note`, and the response has `project_count` (current assignments on projects that are not archived).
  - **`GET /api/projects/:id`**: `links[]` has `vendor_phone`, `vendor_contact_person` (null when empty) and `vendor_categories: [{ id, name }]`.
  - **Archived records**: an archived vendor still lists its links. An assignment on an archived project is listed but not counted.
  - **No copies**: after `PATCH /api/vendors/:id` changes the phone, `GET /api/projects/:id` shows the new phone.
  - **Signed out**: both routes give 401.
- [X] T013 [P] [US1] Write a failing web test in `web/tests/vendor-detail.test.tsx`. Render `VendorDetail` with a mocked `fetch`:
  - FR-003 headed sections: Contact details, What the vendor does, Manpower, GST details, Indicative rates, Rating, Notes, Documents, History.
  - A **Projects** section shows "3 projects" and one row per link with project name (a link to `#/projects/<id>`), project status text, role, scope and note, and "Archived" on an archived project.
  - With no links, it says "This vendor is not assigned to any project yet" and "0 projects".
- [X] T014 [P] [US1] Write a failing web test in `web/tests/project-vendors.test.tsx`. Render `ProjectDetail` with a mocked `fetch`:
  - Each vendor card shows the name (a link to `#/vendors/<id>`), phone, contact person or "No contact person", categories, and the role, scope and note.
  - An archived vendor shows "Archived".
  - With no links, it says "No vendors are assigned to this project yet".
  - Plain wording (NFR-005, FR-031): the remove button reads "Remove from project", the add form is headed "Assign a vendor", and the words "link" and "linked" appear nowhere on the page.

### Implementation for User Story 1

- [X] T015 [US1] In `api/src/modules/vendors/routes.ts`:
  - Include `project: { select: { id, name, status, archived } }` on current links.
  - Add `project_status` and `project_archived` to each entry of `links`.
  - Add `project_count` to `presentVendor`, counting links whose project is not archived.

  T012's vendor cases must pass.
- [X] T016 [US1] In `GET /:id` of `api/src/modules/projects/routes.ts`, select the vendor's `phone`, `contactPerson` and `categories { category }` on current links, and add `vendor_phone`, `vendor_contact_person` and `vendor_categories` to each link. T012 must pass.
- [X] T017 [P] [US1] In `web/src/pages/vendor-detail.tsx`, group the existing fields into the FR-003 sections (removing no field or action) and add the **Projects** section with the count and the empty message, so T013 passes.
- [X] T018 [P] [US1] In `web/src/pages/project-detail.tsx`, render each current link as a vendor card with the T014 content and a link to the vendor profile, and the empty message, so T014 passes. Keep the existing remove and edit behaviour, but rename the labels: "Remove link" becomes "Remove from project", the "Link a vendor" form becomes "Assign a vendor", and "No vendors linked yet." becomes "No vendors are assigned to this project yet" (NFR-005, FR-031).

**Checkpoint**: US1 works on its own. Vendor and project pages show each other with contact details.

**US1 checkpoint result (2026-11-09)**: lint pass, typecheck pass. API: 46 files and 272 tests passed (6 new in `api/tests/api/assignments.test.ts`). Web: 23 files, 81 passed and 1 skipped (6 new in `vendor-detail.test.tsx` and `project-vendors.test.tsx`). The timing-sensitive `vendor-form.test.tsx` passed this run. Note: `project-vendors.test.tsx` mocks `/api/auth/me`, `/client-advances` and `/timeline` with their real response shapes. Earlier empty-list mocks made the page's other sections crash intermittently.

---

## Phase 4: User Story 2 - Find and recognise vendors quickly in the directory (Priority: P2)

**Goal**: Each directory row shows name, contact person, phone, categories, locations, availability and project count. Search and filters are unchanged.

**Independent Test**: Open the directory with seeded vendors, check each row's details, search by contact person and material, filter by category and linked project, and get the same vendors as before.

### Tests for User Story 2 ⚠️

- [X] T019 [P] [US2] Extend `api/tests/api/vendors.test.ts` with failing cases:
  - `GET /api/vendors` returns `project_count` per vendor (US2-1).
  - `project_id=<project>` returns vendors with a current assignment there and not vendors whose only assignment was removed (Feature 001 FR-014 unchanged).
  - Every existing search and filter case still passes (US2-2, US2-3).
- [X] T020 [P] [US2] Write a failing web test in `web/tests/vendors-list.test.tsx`. Render `Vendors` with a mocked `fetch`:
  - Each row shows name (a link), contact person (blank when none), phone, category names, locations, availability text, "N projects", and "Archived" when archived (US2-1, US2-4).
  - The search and filter request keeps the Feature 001 query parameters.
  - An empty result with search text shows "No vendors match your search and filters" and keeps the inputs (US2-5).
  - An empty directory with no search shows "No vendors have been added yet" with **Add vendor** and **Import spreadsheet** (a link to `#/vendors/import`, the existing import page) (US2-6).

### Implementation for User Story 2

- [X] T021 [US2] In `web/src/pages/vendors.tsx`, widen the `Vendor` interface to the fields `GET /api/vendors` already returns (`contact_person`, `categories`, `project_count`). Add the row content and the two empty states from T020, keeping every existing search, filter and form behaviour. T019 and T020 must pass.

**Checkpoint**: The directory identifies vendors without opening them.

**US2 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API typecheck pass, web typecheck pass. API: 46 files and 274 tests passed (+2 in `vendors.test.ts`). Web: 24 files, 87 passed and 1 skipped (+6 in `vendors-list.test.tsx`). No failures. The timing-sensitive `vendor-form.test.tsx` from T001 passed this run.
- **T019**: passed as soon as it was written, because `project_count` (T015) and the current-only `project_id` filter (T011) were already in place. The tests now pin both behaviours.
- **T021**: adds a "Loading vendors" state, so an empty-result message no longer shows before the first load finishes.
- **Deviation**: the vendor name stays the existing button that calls `openVendor` (Feature 001 navigation), rather than becoming an `<a>` link, so the navigation is unchanged. The test checks that selecting the name opens the vendor.
- **Diff review**: tracked changes are limited to the schema, seed, five API route files, three API test files and three web pages. New files are the migration, three rule libraries, four API test files, three web test files and the spec folder. `.gitignore`, `CLAUDE.md` and `.claude/settings.json` are unchanged pre-existing work from the T001 baseline. No `.env`, test database, `graphify-out` or secret was added. No file mixes line-ending styles (corrected at the US3 checkpoint, see there).

---

## Phase 5: User Story 3 - Know the status of each assignment (Priority: P2)

**Goal**: Each current assignment shows one status, worked out from the vendor's non-archived items on the project, the same on both pages, and never settable.

**Independent Test**: Seed one assignment per row of the spec's assignment-status situations table. Each shows the listed status on the vendor profile and the project page.

### Tests for User Story 3 ⚠️

- [X] T022 [P] [US3] Add failing cases to `api/tests/api/assignments.test.ts` for US3-1 to US3-6. Build one assignment per row of the spec's assignment-status situations table and check that `links[].assignment_status` from `GET /api/vendors/:id` and `GET /api/projects/:id` equals the table's value on both. Also check:
  - **Firm team items**: items with `FIRM_TEAM` or `NONE` responsible count for no vendor.
  - **Overdue to Delayed**: an In progress item whose deadline is set to yesterday through Prisma makes the assignment `DELAYED`.
  - **Overdue item done**: setting that item Done makes it `COMPLETED`, or `IN_PROGRESS` with other open items.
  - **Status can't be set**: `PATCH /api/links/:id` with `{ "assignment_status": "COMPLETED" }` gives 400 and changes nothing.
- [X] T023 [P] [US3] Extend `web/tests/vendor-detail.test.tsx` and `web/tests/project-vendors.test.tsx`: each link shows its status as text through `AssignmentStatusBadge`, with labels No activities, Not started, In progress, Delayed and Completed.

### Implementation for User Story 3

- [X] T024 [US3] Add `assignmentStatuses(where: { vendorId } | { projectId })` in the new file `api/src/modules/links/statuses.ts`. It loads non-archived timeline items with `responsibleKind: 'VENDOR'` matching the filter (with `itemInclude` from `api/src/modules/timeline/present.ts`) and groups them by `(vendorId, projectId)`. It maps each item to `{ status: currentState(item).status, overdue: flagsOf(item).some((f) => f.type === 'OVERDUE') }` and returns a map from pair to `assignmentStatus(...)`.
- [X] T025 [US3] Use `assignmentStatuses` in `GET /api/vendors/:id` (`api/src/modules/vendors/routes.ts`) and `GET /api/projects/:id` (`api/src/modules/projects/routes.ts`) to add `assignment_status` to every current link. Pairs with no items give `NO_ACTIVITIES`. T022 must pass.
- [X] T026 [P] [US3] Add `AssignmentStatusBadge` to `web/src/badges.tsx`. It always shows the text label, with one class per status, and is used by `web/src/pages/vendor-detail.tsx` and `web/src/pages/project-detail.tsx`. T023 must pass.

**Checkpoint**: Both sides show the same status for every assignment.

**US3 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API typecheck pass, web typecheck pass. API: 46 files and 278 tests passed (+4 in `assignments.test.ts`). Web: 24 files, 89 passed and 1 skipped (+2). No failures. Baseline before US3: API 274, web 87 passed and 1 skipped.
- **T022**: one assignment per row of the spec's assignment-status table, each checked on `GET /api/projects/:id` and `GET /api/vendors/:id` together, so both sides must agree. It also covers Firm team and no-responsible items, overdue to Delayed and back, and a 400 refusal of `assignment_status` in `PATCH /api/links/:id`. An extra case checks that a removed assignment never appears in either current list, even when timeline items still name the vendor. That case passed before T024 because T011 already excludes removed assignments, and it remains as a guard.
- **T024**: `api/src/modules/links/statuses.ts` loads the items once per page and groups them by vendor and project.
- **T025**: the status is added only to the two detail routes. The vendor list does not need it.
- **T026**: `AssignmentStatusBadge` shows a visible label with a visually hidden "Assignment status:" prefix, so it is not confused with the project's own status badge (both can read "Completed"). `.visually-hidden` and `.assignment-*` styles were added to `web/src/styles.css`.
- **Line endings (correction)**: the repository stores LF. With `core.autocrlf=true`, checked-out and edited files are CRLF in the working copy, and files created new in this feature are LF. Git stores both as LF on commit. (Corrected at the US4 checkpoint: the claim that each file used one style only was wrong. See there.) The US2 note that called the files "consistent with the repository" is corrected by this entry.
- **Diff review**: US3 adds `api/src/modules/links/statuses.ts` and changes `vendors/routes.ts`, `projects/routes.ts`, `badges.tsx`, `styles.css`, both detail pages and their tests. No `.env`, test database, `graphify-out` or secret was added. `.gitignore`, `CLAUDE.md` and `.claude/settings.json` remain pre-existing work.

---

## Phase 6: User Story 4 - Keep a record of past assignments (Priority: P3)

**Goal**: Removing an assignment keeps it as a read-only past assignment with who removed it and when, shown under Past vendors and Past projects and recorded in both histories. Re-assigning creates a new current assignment.

**Independent Test**: Assign a vendor with role, scope and note, remove it, and see it under Past vendors and Past projects with the remover and time. Assign it again and see one current and one past.

### Tests for User Story 4 ⚠️

- [X] T027 [P] [US4] In `api/tests/unit/append-only.test.ts`, add `'vendorProjectLink'` to `neverDeletedModels`. It fails until T031 removes `vendorProjectLink.delete` from `api/src/modules/links/routes.ts`.
- [X] T028 [P] [US4] Add failing cases to `api/tests/api/assignments.test.ts` for US4-1 to US4-9:
  - **Removal**: `DELETE /api/links/:id` returns `removed_at` and `removed_by` and keeps the row. Schedules are archived and items cleared as before.
  - **Past lists**: `past_links` on `GET /api/projects/:id` and `GET /api/vendors/:id` carry role, scope, note, `removed_at` and `removed_by`, newest first. The vendor is absent from `links`, and counts drop.
  - **Past is read-only**: `PATCH` on a past assignment gives 409 `ASSIGNMENT_REMOVED`, "This vendor was removed from the project. A past assignment cannot be changed." `DELETE` on it gives 409 `ALREADY_REMOVED`, "This vendor has already been removed from the project."
  - **Re-assigning**: assigning the pair again gives 201 and leaves the past row unchanged. Two removals and re-assignments show two past rows and one current.
  - **Archived records**: removal works on an archived project and on an archived vendor.
  - **Concurrency**: two parallel `DELETE` calls give one 200 and one 409, and two parallel `POST` calls for the same pair give one 201 and one 409 `LINK_EXISTS`.
  - **Concurrent edits** (spec edge case): two parallel `PATCH` calls on the same current assignment changing different fields both succeed. The final row reflects the later save, and the vendor's and project's history each hold both `ASSIGNMENT_EDITED` entries in save order.
  - **Roles** (FR-036, FR-037): an Administrator, an Office Team member and an Accountant can each assign, edit and remove an assignment.
  - **Signed out** (SC-008): `POST /api/projects/:projectId/links`, `PATCH /api/links/:id` and `DELETE /api/links/:id` each give 401 and change nothing.
- [X] T029 [P] [US4] Extend `api/tests/api/history.test.ts` with failing cases. Assigning, editing role, scope or note, and removing each write exactly one entry with `vendor_id` and one with `project_id`, with actions `ASSIGNED`, `ASSIGNMENT_EDITED` and `UNASSIGNED`. `details` holds `assignment_id`, `vendor {id, name}` and `project {id, name}`, plus role, scope and note on `ASSIGNED` and `UNASSIGNED`. An edit that changes nothing writes no entry.
- [X] T030 [P] [US4] Write failing web tests:
  - In `web/tests/vendor-detail.test.tsx`, a **Past projects** section lists each past assignment with the project link, role, scope, note, remover name and removal date, and offers no edit or remove control.
  - In `web/tests/project-vendors.test.tsx`, the same for **Past vendors**.
  - In `web/tests/history-panel.test.tsx`, the three actions read "Assigned to project", "Assignment changed" and "Removed from project".

### Implementation for User Story 4

- [X] T031 [US4] Rewrite `POST`, `PATCH` and `DELETE` in `api/src/modules/links/routes.ts` per data-model.md (Lifecycle) and research.md §2. Each runs in one `prisma.$transaction`:
  - **POST**: current-pair check, create, two `recordHistory(tx, …)` `ASSIGNED` entries.
  - **PATCH**: `SELECT … FOR UPDATE` on the link. 409 `ASSIGNMENT_REMOVED` if `removedAt` is set. Update, then two `ASSIGNMENT_EDITED` entries only when `diffFields` over `role_on_project`, `scope_of_work` and `note` is non-empty.
  - **DELETE**: lock. 409 `ALREADY_REMOVED` if removed. Keep the existing schedule archiving and responsible-vendor clearing. Set `removedAt: new Date()`, `removedById: actor` and the update stamps instead of `delete`. Two `UNASSIGNED` entries. Response adds `removed_at` and `removed_by: { id, name }`.

  T027, T028 and T029 must pass.
- [X] T032 [US4] Add `past_links`, newest removal first, to `GET /api/vendors/:id` in `api/src/modules/vendors/routes.ts` and `GET /api/projects/:id` in `api/src/modules/projects/routes.ts`, with the fields in contracts/http-api.md, including `removed_by: { id, name }`. T028 must pass.
- [X] T033 [P] [US4] Add the **Past projects** section to `web/src/pages/vendor-detail.tsx` and the **Past vendors** section to `web/src/pages/project-detail.tsx`. Each is read-only, separate from current assignments, and dated with `istDateTime` from `web/src/time.ts`.
- [X] T034 [P] [US4] Add labels for `ASSIGNED`, `ASSIGNMENT_EDITED` and `UNASSIGNED` and their `details` to `web/src/pages/history-panel.tsx`. T030 must pass.

**Checkpoint**: No assignment is ever deleted, and past ones are visible on both sides.

**US4 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API and web typecheck pass. API: 46 files and 288 tests passed (+10). Web: 24 files, 94 passed and 1 skipped (+5). No failures. Baseline before US4: API 278, web 89 passed and 1 skipped. `git grep -n "vendorProjectLink.delete" -- api/src` gave no output (exit `1`).
- **T027**: `vendorProjectLink` added to the never-deleted guard. Two extra pattern checks prove the guard can fail.
- **T028**: covers removal keeping the row (`removed_at`, `removed_by`, role, scope and note intact), `past_links` on both detail routes, 409 `ASSIGNMENT_REMOVED` and `ALREADY_REMOVED` with the row unchanged, re-assignment creating a new current assignment while past ones stay, removal on archived projects and archived vendors, parallel removals (200 and 409), parallel assignments (201 and 409 `LINK_EXISTS`), parallel edits (both kept, two `ASSIGNMENT_EDITED` entries per target), all three roles, and signed-out 401s. The role and signed-out cases passed before T031, because those rules come from Feature 001.
- **T029**: added to `api/tests/api/history.test.ts` as the task specifies. It was first written into `assignments.test.ts` by mistake and moved before T031.
- **T031**: assign, edit and remove each run in one transaction. Edit and remove lock the row with `SELECT … FOR UPDATE`. Each event writes one history entry with `vendor_id` and one with `project_id`.
- **T032**: past assignments are loaded by a second query on each detail route, newest removal first, because Prisma cannot include the same relation twice with different filters.
- **T033**: Past projects and Past vendors are separate read-only sections, with no buttons and no assignment status, showing "Removed by <name> on <IST date-time>". Empty lists read "No past projects" and "No past vendors". These two messages are not in FR-031 but follow its pattern.
- **T034**: the history panel labels the three actions, shows vendor and project by name, and hides `assignment_id`.
- **Scope**: no restore route or control was added (FR-013 forbids restore). Re-assignment uses the existing assign action, as US4-7 and US4-8 specify.
- **Line endings (correction)**: blocks appended with shell commands had put LF lines into CRLF test files, so five files mixed both styles. Two of them (`schedules.test.ts`, `timeline-items.test.ts`) had been mixed since T010, so the US3 note claiming each file used one style was wrong. A Python edit had also rewritten `append-only.test.ts` with CRLF, which made its diff appear as 133 changed lines instead of 9. Every changed and new source and test file is now LF, matching how the repository stores them, and each file's `git diff --numstat` equals its `--ignore-cr-at-eol` count, so diffs show content only. The whole diff went from 745/148 to 683/86 lines. The full checkpoint was rerun after normalising, with the same results.

---

## Phase 7: User Story 5 - See project dates, progress and what needs attention (Priority: P3)

**Goal**: Projects have optional staff-entered dates. The list and overview show progress, health, overdue count, next deadline and the after-completion marker. The list has search and attention filters. The project form is complete (Feature 001 T078).

**Independent Test**: With four seeded projects, the list shows each fact, search by client works, "Has overdue items" filters, and a project's overview matches its row.

### Tests for User Story 5 ⚠️

- [X] T035 [P] [US5] Extend `api/tests/api/projects.test.ts` with failing cases:
  - **Dates on create and edit**: `POST` and `PATCH` accept `start_date` and `expected_completion_date` as `YYYY-MM-DD`, or null to clear on PATCH, and an absent key leaves the date unchanged.
  - **Date format**: a bad date gives 400 `fields.<name>` "Enter a date as YYYY-MM-DD.".
  - **Date order**: completion before start gives 400 with `fields.start_date` and `fields.expected_completion_date` both "The expected completion date cannot be before the start date.", including when only one date is sent and the other is stored. Equal dates are allowed.
  - **History**: a date change writes an `EDITED` entry with `start_date` or `expected_completion_date` from and to.
  - **List figures**: `GET /api/projects` returns `start_date`, `expected_completion_date`, `vendor_count`, `progress {done,total}`, `overdue_count`, `next_deadline` and `health`.
  - **List filters**: `q` matches name, client or site ignoring case. `has_overdue=true` and `due_within_7=true` filter as defined, combining with `status` and `include_archived`.
  - **Detail figures**: `GET /api/projects/:id` returns `health`, `progress`, `overdue_count`, `after_completion_count` and `upcoming` (up to 5 open items, earliest deadline first).
  - **Completed on**: `completed_on` is the date of the PATCH that set status `COMPLETED`. It is `null` after the status changes away, and `null` for a project created as `COMPLETED`.
  - **Health**: the edge cases from the spec (date today is `ONGOING`, yesterday is `DELAYED`, `COMPLETED` beats the date, On hold past the date is `DELAYED`).
  - **Progress**: archived items are excluded, and zero items gives `{0,0}`.
  - **Roles** (FR-036, FR-037): an Administrator, an Office Team member and an Accountant can each set, change and clear both project dates.
  - **Signed out**: 401 on each route.
- [X] T036 [P] [US5] Extend `api/tests/api/timeline-items.test.ts`: `GET /api/projects/:projectId/timeline` gives `after_project_completion` true only for open items whose deadline is after the project's `expected_completion_date`. It is false at an equal date, for Done items, and when the project has no date. `flags` is unchanged (US5-14, US5-15). A signed-out call gives 401 (SC-008).
- [X] T037 [P] [US5] Write a failing web test in `web/tests/projects-list.test.tsx`. Render `Projects` with a mocked `fetch`:
  - Each row shows status text, start and completion dates or "Not set", "N vendors", "N of M items done" with a bar, a `HealthBadge` (Completed, Delayed, Ongoing), overdue count and next deadline (US5-1).
  - The search box and the two filter checkboxes send `q`, `has_overdue` and `due_within_7` (US5-2 to US5-4).
  - The form has name (required), client name, site location, description, status, start date and expected completion date, and shows a 400's field messages under both dates (US5-9, US5-10).
  - Empty states: "No projects have been created yet" with **Add project**, and "No projects match your search and filters".
  - Accessibility (NFR-004): the search box and both filters are found by their accessible labels, the progress bar has a text label ("N of M items done") readable without the bar, and the health badge exposes its text.
- [X] T038 [P] [US5] Write a failing web test in `web/tests/project-overview.test.tsx`. Render `ProjectDetail` with a mocked `fetch`:
  - The overview shows name, status, client, site, dates, health, "N of M items done", overdue count and up to 5 upcoming items, each a link to the item on the timeline.
  - It shows "N items are due after the expected completion date" when the count is above zero.
  - It shows "No activities yet" with no bar when `progress.total` is 0.
  - It shows "Completed on <date>", or "Completed" when `completed_on` is null.
  - An **Edit project** form sends `PATCH /api/projects/:id` with every field.
  - A timeline item with `after_project_completion: true` shows "After project completion date".
  - Date labels (FR-015): the overview labels the project date "Project expected completion" and each upcoming item's date "Deadline".
  - Empty timeline (FR-031): a project with no timeline items shows "No activities yet" in the timeline section, with an **Add an item** action for staff allowed to edit.

### Implementation for User Story 5

- [X] T039 [US5] In `api/src/modules/projects/routes.ts`:
  - **Schema**: extend `projectSchema` with `start_date` and `expected_completion_date` (`YYYY-MM-DD` string or null, optional), using `toDateColumn` and `fromDateColumn` from `api/src/lib/india-date.ts`.
  - **Date order**: check it against the effective values (the stored value for an absent key) and throw `HttpError(400, …)` with both `fields` set to "The expected completion date cannot be before the start date.".
  - **Write and present**: write both columns on POST and PATCH (absent = unchanged, null = clear) and present both in `presentProject`.
  - **History**: add both to `EDITED_FIELDS` and `projectSnapshot`.
- [X] T040 [US5] Create `api/src/modules/projects/figures.ts` with `projectFigures(project, items, today)`. It takes items loaded with `itemInclude` and returns `{ progress, overdue_count, next_deadline, health, after_completion_count, reasons }`, using `api/src/lib/project-health.ts` and `flagsOf`.
- [X] T041 [US5] Use `projectFigures` in `GET /api/projects`:
  - Load non-archived items with `itemInclude` and `_count` of current links.
  - Add `q` (`OR` of `name`, `clientName` and `siteLocation`, `contains`, `mode: 'insensitive'`) to the Prisma `where`.
  - Apply `has_overdue` and `due_within_7` on the figures, after Zod-parsing them as `'true'` or absent.

  The list tests in T035 must pass.
- [X] T042 [US5] In `GET /api/projects/:id`, add the dates, `health`, `progress`, `overdue_count`, `after_completion_count`, `upcoming` (5 earliest open items with `id, name, item_type, deadline, status, flags`) and `completed_on`. `completed_on` is the India date of the newest `historyEntry` with `projectId`, `action: 'EDITED'` and `changes: { path: ['status', 'to'], equals: 'COMPLETED' }`, only when the status is `COMPLETED` (research.md §7). T035 must pass.
- [X] T043 [US5] In the project timeline `GET` route in `api/src/modules/timeline/routes.ts`, add `after_project_completion: isAfterCompletion(...)` to each presented item, using the project row already loaded. T036 must pass.
- [X] T044 [P] [US5] Add `HealthBadge` (text Completed, Delayed or Ongoing) to `web/src/badges.tsx`, and a progress bar style with a text label to `web/src/styles.css`.
- [X] T045 [US5] In `web/src/pages/projects.tsx`, add the T037 columns, search box, two filters, empty states, and the full create form with the two dates, which also completes Feature 001 T078 for creation. T037 must pass.
- [X] T046 [US5] In `web/src/pages/project-detail.tsx`, add the overview at the top and an **Edit project** form (Feature 001 T078 for editing). In `web/src/pages/project-timeline.tsx`, show "After project completion date" on marked items, and replace the empty message "No timeline items yet." with "No activities yet" and an **Add an item** action that opens the existing item form. Label the project date "Project expected completion" and item dates "Deadline" (FR-015). T038 must pass.

**Checkpoint**: Projects show dates, progress and health. The list finds projects needing attention.

**US5 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API and web typecheck pass. API: 46 files and 300 tests passed (+12). Web: 26 files, 106 passed and 1 skipped (+12). No failures. Baseline before US5: API 288, web 94 passed and 1 skipped. No file mixes line endings, and every diff equals its `--ignore-cr-at-eol` count.
- **Data model**: unchanged in US5. The two date columns came from T002 and T003. No completion-date column was added: `completed_on` is read from history, as decided (OQ-3, FR-014a).
- **T035/T036**: written first. Each failed for the intended reason (missing fields or figures), apart from the signed-out cases, which already passed. Extra coverage beyond the task text:
  - `has_overdue=yes` gives 400.
  - Health on an archived project with a past date is `DELAYED`.
  - A project with only an overdue item and no dates stays `ONGOING`, with `overdue_count` 1.
- **T040**: `api/src/modules/projects/figures.ts` also exports `hasItemDueWithinWeek` (for the `due_within_7` filter) and `upcomingItems` (overview items, earliest deadline then name). Both are used by the list and detail routes.
- **T041/T042**: the list and detail routes load non-archived items with `itemInclude` in the same Prisma query as the project. `completed_on` uses a JSON-path history lookup and is null for a project created directly as Completed (research.md §7).
- **T044**: `HealthBadge` uses the same visually hidden prefix pattern as `AssignmentStatusBadge` ("Health: Delayed"), because a project's status and health can both read "Completed". A `ProgressMeter` component was added to `web/src/badges.tsx` next to it. It shows "N of M items done" as text with a decorative bar, or "No activities yet".
- **T045**:
  - **Deviation, to preserve Feature 001 behaviour**: "Include archived" still reloads the list as soon as it is ticked, as before Feature 004. Search and the two attention filters apply with **Apply filters**. A test pins the immediate reload.
  - The list also gained a "Loading projects" state. Overdue and next deadline read "None" when empty.
- **T046**: the overview is a separate section above an **Edit project** form, which is keyed to reload with the saved values. Upcoming items link to `#/projects/<id>?item=<item id>`, the same focus link the dashboard uses. **Add an item** moves focus to the existing "Add timeline item" form, which is always shown below the list, rather than opening a new form.
- **Feature 001 T078**: create and edit now offer every Feature 001 FR-023 field. The record in Feature 001's `tasks.md` is left to T062, as planned.
- **Test fix**: one `project-overview.test.tsx` case used an upcoming deadline equal to the start date, which made a text lookup ambiguous. The test dates were shifted. No code change was needed.

---

## Phase 8: User Story 6 - See what needs attention across the firm (Priority: P4)

**Goal**: Five non-overlapping deadline groups with filters and sorting, an attention section for projects, and every entry linked. The Feature 002 Missing update and recent lists and the Feature 003 tiles stay.

**Independent Test**: With items due yesterday, today, in 3, 20 and 90 days, each lands in exactly one dated group and All has all five. Filtering to one project narrows the list, and each entry opens the right item, project and vendor.

### Tests for User Story 6 ⚠️

- [X] T047 [P] [US6] Extend `api/tests/api/dashboard.test.ts` with failing cases:
  - **`items`**: lists every open item on active projects with `group` per data-model.md (null beyond 30 days), `days_overdue`, `status`, `last_update_on`, `flags`, `project` and `responsible`. Done, archived and archived-project items are excluded (US6-1 to US6-6).
  - **Groups**: no item has two dated groups.
  - **`attention_projects`**: lists Delayed projects with `PAST_EXPECTED_COMPLETION`, and Ongoing projects with overdue items with `OVERDUE_ITEMS(count)`, once each, Delayed first, then by count, then name. Completed and archived projects are excluded (US6-17 to US6-19).
  - **Feature 002 keys**: `overdue`, `due_soon`, `missing_update` and `recent_delays_and_issues` are unchanged in content and order (US6-12, US6-13).
  - **Roles**: all three roles get the same `items` and `attention_projects` (US6-16).
  - **Signed out** (SC-008): `GET /api/dashboard` gives 401 and sends no items.
- [X] T048 [P] [US6] Rewrite `web/tests/dashboard.test.tsx` for the five groups. Mark the replaced Feature 002 list cases with a comment citing the supersession of Feature 002 FR-020 and FR-021 (spec, Backward Compatibility). Keep the Missing update, recent records and tiles cases. Cover:
  - group selection and counts
  - filters by project, responsible party (vendor, "Firm team", "None") and status (US6-7 to US6-9)
  - sorting by deadline (default), project and latest update with nulls last (US6-10, US6-11)
  - links to the item, project and vendor (US6-14)
  - the empty messages "No overdue items", "Nothing due today", "Nothing due in the next 7 days", "No upcoming items", "No open items" and "No items match these filters" (US6-15)
  - the attention section showing health, progress and reasons
  - accessibility (NFR-004): the group control is a labelled tab list or radio group that can be moved through with the keyboard, each filter and the sort control has an accessible label, and status and health are exposed as text
  - filters reset (decision D4): unmounting and remounting the dashboard restores the default group, no filters and deadline sort

### Implementation for User Story 6

- [X] T049 [US6] In `GET /dashboard` of `api/src/modules/dashboard/routes.ts`, keep the Feature 002 keys exactly as built today and add `items`, using the existing item query and `deadlineGroup`. Add `attention_projects`, using `projectFigures` over projects that are not archived with at least one reason. T047 must pass.
- [X] T050 [US6] Rebuild `web/src/pages/dashboard.tsx`:
  - attention section above the groups
  - one control choosing Overdue, Due today, Coming soon, Upcoming or All, with counts
  - project, responsible-party and status filters, and a sort choice, all applied in memory to `items`
  - item, project and vendor links
  - the empty messages
  - the Missing update list, recent delays and issues, and Feature 003 tiles unchanged

  T048 must pass.

**Checkpoint**: The dashboard answers "what needs attention right now?" at item and project level.

**US6 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API and web typecheck pass. API: 46 files and 304 tests passed (+4). Web: 26 files, 117 passed and 1 skipped (+11). No failures. Baseline before US6: API 300, web 106 passed and 1 skipped. No mixed line endings and no line-ending noise in any diff.
- **Deadlines**: the deadline groups use only timeline items' own deadlines, through `deadlineGroup` (`api/src/lib/deadline-groups.ts`). A project's expected completion date never places anything in a group. It only feeds project health, which drives the separate "Projects needing attention" section.
- **T047**: the role case passed before T049 only because both sides were empty. After T049 it compares real `items` and `attention_projects`.
- **T049**: `items` covers open items on active projects, sorted by deadline then name. `attention_projects` takes every active project, including ones with no items, through `projectFigures`, sorted Delayed first, then most overdue items, then name. The Feature 002 keys are built exactly as before.
- **T050**:
  - The page order is tiles, then Projects needing attention, then the deadline groups (a native radio group named "Deadline group" with counts, moved through with arrow keys), then the Feature 002 Missing update and recent lists, unchanged.
  - Filters and sort sit in a fieldset named "Filter and sort" and live only in the component, so they reset on every visit (D4).
  - Group counts reflect the filters in force.
  - Minimal CSS for the group switch and filters was added. It is layout only, not a redesign.
- **Superseded test changes beyond T048 (deviation from plan.md "Superseded tests")**: the plan said only `web/tests/dashboard.test.tsx` would change meaning. Three more assertions pinned the superseded behaviour and were updated, each with a comment citing the supersession of Feature 002 FR-020, FR-021 and FR-023 (spec, Backward Compatibility):
  - `api/tests/api/dashboard.test.ts`, "returns four empty lists and no other figures": the key list now includes `items` and `attention_projects`.
  - `api/tests/api/dashboard-summary.test.ts`, "leaves the Feature 002 GET /dashboard response unchanged": same change.
  - `web/tests/dashboard-tiles.test.tsx`, "keeps the Feature 002 lists, below the tiles": no longer expects the removed "Nothing due soon." text, and still checks that the deadline lists sit below the tiles.

  Each still proves that nothing else was added.
- **Not in FR-031**: the empty message "No projects need attention" follows the same pattern.

---

## Phase 9: User Story 7 - Move around the application easily (Priority: P5)

**Goal**: A top-right profile menu, confirmation messages, plain error messages, consistent text-bearing markers, and FR-031 empty states everywhere.

**Independent Test**: As each role, open the profile menu, change password and sign out. Archive a vendor and see a confirmation. Save without a name and see the field named. A server failure shows plain wording.

### Tests for User Story 7 ⚠️

- [X] T051 [P] [US7] Write a failing web test in `web/tests/profile-menu.test.tsx` that renders the app shell from `web/src/main.tsx` with `/api/auth/me` mocked:
  - A top-right button with the person's name opens a panel showing name, role and email, the change-password form and **Sign out**.
  - Escape closes it, and `aria-expanded` follows it.
  - **Sign out** calls `POST /api/auth/logout`.
  - The Staff link appears only for `ADMINISTRATOR` (US7-1 to US7-4).
- [X] T052 [P] [US7] Write a failing web test in `web/tests/client-errors.test.tsx`:
  - `api()` turns a 500 body into the message "The action did not complete. Please try again." and a 403 into "You are not allowed to do this.".
  - It keeps `fields` and `code` for 400 and 409.
  - After `notify('Vendor archived')`, the `role="status"` region shows that text (US7-5 to US7-8).

### Implementation for User Story 7

- [X] T053 [P] [US7] Create `web/src/notify.ts`, exporting `notify(message: string)` that dispatches a `window` `CustomEvent('notify', { detail: message })`.
- [X] T054 [US7] In `web/src/main.tsx`:
  - Move the account block from the sidebar into a top-right header menu (name button, panel with name, role, email, change password and Sign out; `aria-expanded`, `aria-controls`, Escape closes).
  - Add one `role="status"` region that shows the latest `notify` message for 5 seconds.
  - Keep the Feature 001 navigation sections and the admin-only Staff link.

  T051 must pass.
- [X] T055 [US7] In `web/src/api/client.ts`, replace the message of any 500 with "The action did not complete. Please try again." and of any 403 with "You are not allowed to do this.", keeping status, `code` and `fields`. T052 must pass.
- [X] T056 [US7] Call `notify` after each successful action, naming the record and action (for example "Vendor archived", "Vendor removed from project", "Project updated"):
  - create, update, archive and restore in `web/src/pages/vendors.tsx`, `web/src/pages/vendor-detail.tsx`, `web/src/pages/projects.tsx` and `web/src/pages/project-detail.tsx`
  - assign and remove in `web/src/pages/project-detail.tsx`
  - upload, archive and restore in `web/src/pages/documents-section.tsx`
  - create and archive in `web/src/pages/project-timeline.tsx`

  Extend each page's existing test with one confirmation assertion.
- [X] T057 [P] [US7] In `web/src/styles.css` and `web/src/badges.tsx`:
  - one archived marker, one set of project status markers, assignment-status markers and health markers, each always with text (FR-028, FR-029)
  - the header menu, group control, vendor cards and progress bar usable at 375 px and 1280 px without sideways page scrolling (FR-030)

  Extend `web/tests/phone-layout.test.tsx` for the new header and dashboard group control.

**Checkpoint**: Every page has the profile menu, confirmations and plain errors.

**US7 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API and web typecheck pass. API: 46 files and 304 tests passed (unchanged; US7 is web only). Web: 28 files, 132 passed and 1 skipped (+15). No failures. Baseline before US7: API 304, web 117 passed and 1 skipped. No line-ending noise in any diff.
- **Test-first evidence**: T051 and T052 failed for the intended reasons (no top-bar button; raw server text kept for 500 and 403; no status region). The seven T056 confirmation assertions were added after the `notify` calls, then shown to fail with `notify` made a no-op and to pass with it restored. The two T057 layout checks were shown to fail against the pre-feature stylesheet.
- **T054**: the profile menu is a button with the person's name in a top bar (`header.topbar`) above the page. Its panel shows name, role, email, the unchanged change-password form and Sign out. Escape closes it and returns focus to the button. The sidebar keeps the Feature 001 navigation and the admin-only Staff link. No role or permission changed.
- **T055**: any status of 500 or above reads "The action did not complete. Please try again." and any 403 reads "You are not allowed to do this.". `status`, `code` and `fields` are kept.
- **T056**: confirmations for vendor add, archive and restore; project create, update, archive and restore; vendor assigned to and removed from a project; document upload, archive and restore; timeline item add, update, archive and restore. There is no vendor edit form in the web app, so there is no "Vendor updated" confirmation. Pages that already showed their own success text (staff, schedule form, password) keep it.
- **T057**: documents and timeline items now use the shared `ArchivedBadge`. An assignment's "Completed" now uses the same violet as project and health "Completed" (it was green). New CSS covers only the top bar, profile panel, confirmation region and phone touch targets for the group options. The unused sidebar `.account` and `.account-actions` rules were removed.
- **Existing test changed (deviation)**: `web/tests/app.test.tsx` looked for the removed sidebar "Account" button. It now opens the profile button, which US7-1 supersedes. The sign-in, change-password and sign-out checks are unchanged.
- **Other test-file notes**: `web/tests/notices.ts` is a small shared helper that collects `notify` messages. `phone-layout.test.tsx` reads `styles.css` from disk, because Vitest does not load CSS.
- **Not changed (noted)**: the document type label uses the "Planned" project-status colours (Feature 003). Changing it would be a visual change outside these tasks.

---

## Phase 10: User Story 8 - Demonstrate the system with realistic fictional data (Priority: P5)

**Goal**: About 10 vendors and 4 projects showing every new state, safe to run repeatedly.

**Independent Test**: Seed an empty database, count the records, seed again. The counts are unchanged and every deadline group is non-empty.

### Tests for User Story 8 ⚠️

- [X] T058 [P] [US8] Write a failing test in `api/tests/api/seed.test.ts`.
  - **Setup**: before calling the seed, set `process.env.SEED_ADMIN_PASSWORD`, `SEED_OFFICE_PASSWORD` and `SEED_ACCOUNTANT_PASSWORD` to test-only values of at least 8 characters, because the seed refuses to run without them (`api/prisma/seed.ts`). The test environment (`api/tests/setup-env.ts`, `api/tests/global-setup.ts`) does not set them.
  - **Import safety**: before importing the seed module, record the counts of staff users, vendors, projects and vendor-project links with the test's Prisma client. Import `seed` from `api/prisma/seed.ts` with a dynamic `await import(...)` inside the test, so the import happens after the counts are taken. Assert the four counts are unchanged, proving that importing the file runs nothing (T059). Do not assume the database starts empty.
  - **Supplied client**: call `seed(prisma)` with the test's own Prisma client. Assert that the same client can read the records the seed created (for example, a seeded vendor by its `98000000NN` phone and a seeded project by name), proving the seed wrote through the client it was given.
  - On the reset test database, call `seed(prisma)` twice:
  - After the first run: 9 to 12 vendors in at least 6 categories, 3 or 4 projects in at least 3 statuses, at least two vendors on more than one project and three on exactly one, and one past assignment.
  - Dashboard `items` have every group `OVERDUE`, `DUE_TODAY`, `COMING_SOON` and `UPCOMING`, `missing_update` is non-empty, and at least one item is Done and one has `after_project_completion`.
  - Assignment statuses include all five values.
  - Every email ends in `@example.com` and every vendor phone matches `^98000000\d\d$`.
  - After the second run, every table's count is unchanged, and a vendor name edited between runs keeps the edit (US8-1 to US8-5).

### Implementation for User Story 8

- [X] T059 [US8] In `api/prisma/seed.ts`:
  - **Separate the seed function from command-line execution**:
    - Move the body of `main()` into `export async function seed(prisma: PrismaClient): Promise<void>`. It uses only the client passed in, never a module-level client, and never calls `$disconnect` or `process.exit`.
    - Keep a command-line entry that creates its own `PrismaClient`, calls `seed(client)`, disconnects, and exits with code 1 on error. It runs only when the file is executed directly (by `prisma db seed`, which runs `tsx prisma/seed.ts`), checked with `require.main === module` or the ESM equivalent `import.meta.url === pathToFileURL(process.argv[1]).href`, whichever matches the module format of `api/`.
    - Importing `api/prisma/seed.ts` from a test must therefore execute nothing until `seed(prisma)` is called.
  - Add 8 vendors (7 categories: Carpentry, Electrical, Plumbing, Tiling, Painting, False ceiling, Glass and aluminium; phones `98000000NN`; fictional names) and 2 projects, so all four statuses are covered, with dates (one expected completion date in the past).
  - Add assignments with varied roles and scopes, and one past assignment created with `removedAt` and `removedById` only when no assignment for that pair exists.
  - Add timeline items with deadlines relative to `todayInIndia()` covering every group, a Done item, an item after its project's completion date, and an In progress item whose progress update `createdAt` is 10 days back.
  - Use only find-or-create helpers, never update or delete.
  - Create progress updates (including the backdated Missing update and Done updates) only when their timeline item is newly created, as the existing `timelineItem()` helper does. A re-run then adds no progress update.

  T058 must pass.

**Checkpoint**: A fresh `npm run dev` shows every state this feature adds.

**US8 checkpoint result (2026-11-09)**:
- **Checks**: lint pass, API and web typecheck pass. API: 47 files and 306 tests passed (+2, `api/tests/api/seed.test.ts`). Web: 28 files, 132 passed and 1 skipped (unchanged). Baseline before US8: API 304, web 132 passed and 1 skipped. The `ECONNRESET` lines printed after API runs also appear on unrelated files; they come from the embedded test database shutting down.
- **Test-first evidence**: before T059 both tests failed. The import check saw 3 staff and 2 vendors written just by importing the old seed, and `seed is not a function`. The import check waits 1.5 s before recounting, because a seed that runs on import would write asynchronously.
- **Counts (test database only, port 54329)**:
  - Non-empty database, before import, after import and after `seed(prisma)`: unchanged. Every record already matched by find-or-create.
  - Emptied with the test helper `resetDatabase()`: first run 3 staff, 7 categories, 10 vendors, 4 projects, 10 assignments (1 past), 10 timeline items, 7 progress updates. Second run and the command-line run: every table count unchanged. A vendor renamed between runs kept its new name.
  - Command-line entry (`tsx prisma/seed.ts` with the test `DATABASE_URL`) on an emptied database: 0 to 10 vendors and 0 to 4 projects.
- **T059**: `seed(prisma)` is exported and uses only the client given. The command-line entry runs under `require.main === module` (the API is CommonJS). It adds 8 vendors and 5 categories, 2 projects (Hill Villa, Completed; Riverside Clinic, On hold, past expected completion), 7 more assignments, 1 past assignment and 5 timeline items. Studio Fit-out is now created as Planned so all four statuses appear.
- **Deviations and notes**:
  - Projects keep the dates and status they were created with. On a database seeded before Feature 004, Lake House stays undated and Studio Fit-out stays Active, so the item after the project's completion date and the Planned status appear only on a fresh database. The new projects, vendors and items are still added there.
  - The past assignment is inserted directly, with no history entries. The seed records no history for assignments, as before.
  - Three of the new vendors carry `@example.com` emails.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T060 Run `npm run lint`, `npm run typecheck` and `npm test` from the repository root. Fix every failure. All Feature 001 to 003 suites must pass, apart from the cases T048 rewrote with their supersession comment (SC-006).
- [X] T061 [P] Run `graphify update .` to refresh `graphify-out/graph.json` (CLAUDE.md).
- [X] T062 [P] In `specs/001-core-auth-directory/tasks.md`, append notes recording the Feature 001 corrections delivered here:
  - FR-015 and US4-3 (vendor profile links) by T015 and T017
  - T078 (project create and edit fields) by T045 and T046

  Change no requirement text in specs 001 to 003.
- [ ] T063 Perform every scenario in `specs/004-vendor-project-visibility/quickstart.md` at 375 px and 1280 px on the **existing local database by default**. Run `npx -w api prisma migrate reset --force` only after the product owner explicitly approves a reset for this demonstration, because it deletes all data in the local development database. Do not silently accept a seeded item whose dashboard group differs from the quickstart: record each difference under this task, and investigate whether it comes from stale demonstration instructions (for example, dates relative to an earlier seed run) or from a genuine defect, before treating the scenario as passed. Time SC-001, SC-002 and SC-004, and check NFR-001 (each page under 2 seconds). Record the results under this task.
  - **Preparation, 2026-11-09 (T063 still open; no scenario has been demonstrated in a browser yet)**:
    - **Database**: the product owner approved preparing the existing development database. The existing container `vendor-management-db-1` was started with `docker start`, so its anonymous data volume was kept. `npm run prisma:deploy -w api` applied only `20261108120000_vendor_project_visibility`; the SQL is additive. `npm run prisma:seed -w api` ran twice. No reset.
    - **Counts before → after**: staff 3→3, categories 2→7, vendors 2→10, projects 2→4, assignments 2→10 (1 past), timeline items 0→11, progress updates 0→7, history 0→4. The second seed run left every count unchanged. All 11 existing staff, category, vendor, project and assignment rows are byte-identical to the snapshot taken before (password hashes and `updated_at` included).
    - **API check, signed in as `office@example.com`, today 2026-11-09**: every dashboard group is non-empty. Overdue: Kitchen joinery. Due today: Site measurement sign-off. Coming soon: Client walkthrough, Bathroom plumbing. Upcoming: Clinic false ceiling, Material selection, Ceiling wiring, Lighting layout. Missing update: Bathroom plumbing, Ceiling wiring. Attention: Riverside Clinic (Delayed), then Lake House (Ongoing, 1 overdue item). All five assignment statuses appear. API responses took 7–33 ms; page render time still needs a browser.
    - **Differences from a fresh database (pre-existing records kept as they were)**: Lake House and Studio Fit-out were created before Feature 004, so they keep Active and no dates. The Planned status is therefore not shown, and Lake House items are not marked after a completion date. Riverside Clinic covers quickstart 3.3 (Delayed, 1 upcoming item, 1 item after completion), and Studio Fit-out covers 3.6 (no timeline items).
- [ ] T064 The product owner runs the SC-005 walkthrough (5 tasks with a staff member new to the system, at least 4 completed without help) and records the result under this task.
- [X] T065 Run `/speckit-converge` for `specs/004-vendor-project-visibility` and resolve every gap it appends until it reports Converged (Constitution Principle V, Delivery Gates).

**Polish result (2026-11-09)**:
- **T060**: from the repository root, `npm run lint` and `npm run typecheck` exit 0. `npm test`: API 47 files, 306 passed; web 28 files, 136 passed, 1 skipped (the skip predates Feature 004, T001 baseline). No Feature 001–003 failures; the only rewritten cases are the T048 supersessions recorded at the US6 checkpoint.
- **T061**: `graphify update .` rebuilt the graph (1675 nodes, 3712 edges). `graphify-out/` is git-ignored, so no tracked file changed.
- **T062**: five lines appended to `specs/001-core-auth-directory/tasks.md` (FR-015 and US4-3 by T015 and T017; T078 by T045 and T046). No requirement text changed.
- **T063 (open, blocked)**: needs the local development database with migration `20261108120000_vendor_project_visibility` applied. `npm run dev` applies pending migrations and runs the seed, which needs the product owner's approval. The development database (Docker, port 5432) is not running and was not touched. No browser automation is installed, so the 375 px and 1280 px checks and the SC-001, SC-002, SC-004 and NFR-001 timings have not been done. Reviewing the quickstart against the seed found that scenario 3.3 expected the seeded Delayed project to have upcoming items and items after its completion date, which it lacked. The seed now adds "Clinic false ceiling" to Riverside Clinic, and `seed.test.ts` asserts it.
- **T064 (open)**: the product owner's SC-005 walkthrough.
- **T065**: converge found one gap (FR-025, responsible vendor not linked on timeline items), appended as T066 and fixed. A re-assessment found no further gaps.
- **Review points resolved**:
  - **403 messages**: only a 403 with no code or `ROLE_NOT_ALLOWED` becomes "You are not allowed to do this.". `OWN_ROLE` and `PREVIEW_NOT_YOURS` keep the server's message. Tests cover all three cases.
  - **Confirmation timer**: a fake-timer test shows the confirmation still visible at 4999 ms and cleared at 5000 ms.
  - **Seed past assignment**: matches data-model.md ("seeded with `removed_at` set", plus `removedById`). No history is required, so none is invented.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: first.
- **Foundational (Phase 2)**: after Setup. Blocks every story.
- **User stories (Phases 3–10)**: after Foundational, in the order below.
- **Polish (Phase 11)**: after every story.

### User Story Dependencies

| Story | Needs | Why |
| --- | --- | --- |
| US1 (P1) | Foundational | Reads current links |
| US2 (P2) | US1 T015 | Uses `project_count` |
| US3 (P2) | US1 | Adds a field to the US1 link lists |
| US4 (P3) | US1 | Adds Past lists beside US1 lists. T027 needs T031 |
| US5 (P3) | Foundational | Independent of US1 to US4, apart from sharing `project-detail.tsx` (sequence T046 after T018 and T033) |
| US6 (P4) | US5 T040 | Uses `projectFigures` |
| US7 (P5) | Any | Touches pages from earlier stories. Best after US1 to US6 |
| US8 (P5) | US3, US4, US5, US6 | The seed test checks statuses, past assignments, dates and groups |

### Within Each User Story

- Tests first, failing.
- API before web.
- Shared files are sequential:
  - `vendors/routes.ts`: T015, then T025, then T032.
  - `projects/routes.ts`: T016, then T025, then T032, then T039, then T041 and T042.
  - `project-detail.tsx`: T018, then T026, then T033, then T046, then T056.
  - `vendor-detail.tsx`: T017, then T026, then T033, then T056.
  - `vendors.tsx`: T021, then T056.
  - `projects.tsx`: T045, then T056.
  - `project-timeline.tsx`: T046, then T056.

### Parallel Opportunities

- T004, T005 and T006, then T007, T008 and T009.
- T010 alongside T007–T009.
- Within a story, every `[P]` test task.
- US5 API work (T039–T043) alongside US2 and US3 once Foundational is done.
- T061 and T062 in Polish.

---

## Parallel Example: Foundational rules

```text
Task: "T004 Write failing unit tests in api/tests/unit/assignment-status.test.ts"
Task: "T005 Write failing unit tests in api/tests/unit/deadline-groups.test.ts"
Task: "T006 Write failing unit tests in api/tests/unit/project-health.test.ts"
# then
Task: "T007 Implement api/src/lib/assignment-status.ts"
Task: "T008 Implement api/src/lib/deadline-groups.ts"
Task: "T009 Implement api/src/lib/project-health.ts"
```

## Parallel Example: User Story 1

```text
Task: "T012 Supertest cases in api/tests/api/assignments.test.ts"
Task: "T013 Web test web/tests/vendor-detail.test.tsx"
Task: "T014 Web test web/tests/project-vendors.test.tsx"
# after T015 and T016
Task: "T017 Projects section in web/src/pages/vendor-detail.tsx"
Task: "T018 Vendor cards in web/src/pages/project-detail.tsx"
```

## Parallel Example: User Story 5 tests

```text
Task: "T035 api/tests/api/projects.test.ts"
Task: "T036 api/tests/api/timeline-items.test.ts"
Task: "T037 web/tests/projects-list.test.tsx"
Task: "T038 web/tests/project-overview.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 and Phase 2.
2. Phase 3 (US1).
3. **Stop and validate**: vendor and project pages show each other with contact details. This alone closes the Feature 001 FR-015 gap.

### Incremental Delivery

1. Foundation, then US1: assignments visible both ways (MVP).
2. US2 and US3: a fuller directory, then assignment statuses.
3. US4: past assignments, so no assignment is ever lost.
4. US5: project dates, progress and health.
5. US6: dashboard groups and the attention section.
6. US7: profile menu, messages and consistency.
7. US8: demonstration seed.
8. Polish: full suite, quickstart, Feature 001 records, converge.

Each increment passes `npm test` before the next starts.

---

## Notes

- `[P]` tasks touch different files and depend on no incomplete task.
- Every test is written to fail first and pass after its implementation task.
- Feature 001 to 003 specifications are not edited. Only Feature 001's `tasks.md` gains correction notes (T062).
- Commit only when the product owner asks.

## Phase 12: Convergence

- [X] T066 In `web/src/pages/project-timeline.tsx`, link an item's responsible vendor name to the vendor profile (`#/vendors/<id>`), keeping the "(archived)" text, and extend `web/tests/project-timeline-focus.test.tsx` or the nearest timeline test with one assertion, per FR-025 (partial)
