# Tasks: UI/UX Overhaul — Profile, Dashboard Overview, Project Sections and Visual Theme

**Input**: Design documents from `specs/005-ui-ux-overhaul/` ([plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/http-api.md](./contracts/http-api.md), [quickstart.md](./quickstart.md))

**Tests**: Required. Constitution Principle V: every acceptance scenario has an automated test, and business-rule tests are written first and seen failing for the intended reason before the code.

**Organization**: by user story, in spec priority order (US1, US2 are P1; US3, US4 are P2; US5 to US7 are P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to

## Path Conventions

npm workspaces: `api/` (Express, Prisma) and `web/` (React, Vite). Tests in `api/tests/api`, `api/tests/unit` and `web/tests`.

## Safety rules for every task

- Never run `prisma migrate reset`, `db push` or destructive SQL. The migration is applied to the embedded test database by `api/tests/global-setup.ts` only. The development database receives it only after the product owner reviews the SQL and approves (T047).
- Do not commit, push or merge unless the owner asks. Keep line endings as each file already has them.
- A superseded existing test assertion is changed only with a comment citing the spec's Backward Compatibility table, and is listed in the checkpoint note.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Record the baseline: `git status --short`, `git rev-parse HEAD`, then `npm run lint`, `npm run typecheck` and `npm test` from the repository root. Record API and web pass and skip counts in this file under T001. Expected: API 306 passed; web 136 passed, 1 skipped.
- [X] T002 [P] Add `"build": "vite build"` to the `scripts` of `web/package.json` (no dependency change), run `npm run build -w web`, and record the result under this task.
- [X] T003 [P] Add a `HTMLDialogElement.prototype.showModal` and `close` polyfill for jsdom in `web/tests/setup.ts` (sets and removes the `open` attribute and fires `close`), guarded so it only applies when missing (research §14).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user story work begins until this phase is complete.**

- [X] T004 Extend `api/prisma/schema.prisma` per [data-model.md](./data-model.md):
  - model `ProjectSection` (`project_sections`): `name` "1 to 80 characters after trimming", `position` integer "≥ 0", `description` and `notes` nullable "up to 5,000 characters", `removed_at`, `removed_by` (FK to `staff_users`, `onDelete: Restrict`), audit columns; relation to `Project` with `onDelete: Restrict`
  - model `SectionAssignment` (`section_assignments`): `section_id` FK to `project_sections`, `vendor_id` FK to `vendors` (both `onDelete: Restrict`), `role_in_section` nullable "up to 120 characters", `removed_at`, `removed_by`, audit columns; index on `vendor_id`
  - `HistoryAction` values `SECTION_ADDED`, `SECTION_RENAMED`, `SECTION_EDITED`, `SECTIONS_REORDERED`, `SECTION_REMOVED`, `SECTION_RESTORED`, `BLUEPRINT_APPLIED`, `SECTION_ASSIGNED`, `SECTION_ASSIGNMENT_EDITED`, `SECTION_UNASSIGNED`
  - back-relations on `Project`, `Vendor` and `StaffUser`
- [X] T005 Create `api/prisma/migrations/<timestamp>_project_sections/migration.sql` with `npx -w api prisma migrate diff --from-schema-datamodel <schema at HEAD> --to-schema-datamodel prisma/schema.prisma --script`, then append by hand: `project_sections_current_name_key` unique `(project_id, lower(name)) WHERE removed_at IS NULL`; `section_assignments_current_key` unique `(section_id, vendor_id) WHERE removed_at IS NULL`; check constraints `project_sections_removed_ck` and `section_assignments_removed_ck` `(removed_at IS NULL) = (removed_by IS NULL)`; index `(project_id, position)`. Review the full SQL and record under this task that it contains no `DROP`, `UPDATE`, `DELETE` or `INSERT`. Run `npx -w api prisma generate`. In the same task, update `api/tests/helpers.ts` `resetDatabase()` to delete `sectionAssignment` then `projectSection` rows before `vendorProjectLink` (the new foreign keys are `RESTRICT`), and add `projectSection` and `sectionAssignment` to the never-deleted models in `api/tests/unit/append-only.test.ts`, with a case showing `tx.projectSection.delete` is caught.
- [X] T006 Run the full API suite (applies the migration to the test database only) and confirm the T001 count is unchanged.
- [X] T007 [P] Write a failing unit test `api/tests/unit/blueprint.test.ts`: `DEFAULT_SECTIONS` has exactly 15 names in this order: Project Overview, Client Information, Scope of Work, Design & Planning, Drawings / Documentation, Procurement, Materials, Execution, Site Coordination, Budget & Costing, Timeline, Milestones, Deliverables, Snagging, Completion. Then create `api/src/lib/blueprint.ts` exporting the frozen array.
- [X] T008 Extract the creation body of `POST /projects/:projectId/links` in `api/src/modules/links/routes.ts` into an exported `assignVendorToProject(tx, { vendor, project, actorId, role, scope, note })` that performs the current-pair check, creates the link and records `ASSIGNED` on both targets; export `activePair` and `recordOnBoth`, and let `recordOnBoth` accept an optional `section: { id, name }` in its details. The route calls the helper. Confirm `api/tests/api/assignments.test.ts` and `api/tests/api/links.test.ts` pass unchanged before and after (research §7).
- [X] T009 [P] Write failing tests in `web/tests/time.test.ts` for `formatDate('2026-11-09')` → "9 Nov 2026" and `formatDateTime('2026-11-09T08:35:00.000Z')` → "9 Nov 2026, 14:05" (IST, 24-hour), then add both to `web/src/time.ts` using `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', … })` (FR-042).
- [X] T010 [P] Create the house UI components with tests in `web/tests/ui-components.test.tsx` written first:
  - `web/src/ui/confirm-dialog.tsx`: native `<dialog>` opened with `showModal()`, title, message naming the record and consequence, Confirm and Cancel; Escape cancels; focus returns to the opener (FR-043)
  - `web/src/ui/tooltip.tsx`: wraps an icon-only control, shows its label on hover and focus, sets `aria-describedby`; the control keeps an accessible name (FR-040)
  - `web/src/ui/skeleton.tsx`: placeholder rows or blocks; the region carries `aria-busy="true"` (FR-039)
  - `web/src/ui/unsaved-guard.ts`: `useUnsavedGuard(dirty)` that adds a `beforeunload` handler and returns `confirmLeave()` for in-app navigation (FR-007)
- [X] T011 Write a failing unit test `web/tests/contrast.test.ts` that reads the token values from `web/src/styles.css` and checks each text/background pair used by the design (text, muted text, dim text on white and muted surfaces; black on yellow; each status fill) meets 4.5:1, and borders and focus 3:1 (FR-041). It fails against the current dark tokens for the intended reason (missing light tokens).
- [X] T012 Replace the dark tokens on `:root` in `web/src/styles.css` with the research §2 light tokens, and rewrite the shared rules for body, sidebar navigation (black, current item with a yellow left border), buttons (primary yellow `#facc15` with black text; secondary, danger, link), inputs, selects, checkboxes, cards, tables, badges and status fills, menus, dialogs, toasts and tooltips, each with hover, active, focus (visible ring) and disabled states. Keep every existing class name. Yellow is never a page or large-panel background (FR-033 to FR-036). T011 must pass.
- [X] T013 Run `npm run lint`, `npm run typecheck`, `npm test`. Update only the superseded assertions the token change breaks (expected: `web/tests/phone-layout.test.tsx` CSS checks), each with a citation comment. Record counts.

**Checkpoint**: Migration on the test database, blueprint constant, shared assignment helper, UI components and light tokens in place; all Feature 001 to 004 suites green.

**Phase 1–2 checkpoint result (2026-11-09)**:
- **T001 baseline**: branch `005-ui-ux-overhaul` at `ab87bc0`; only `specs/005-ui-ux-overhaul/` untracked. Lint and typecheck pass. API 47 files, 306 passed; web 28 files, 136 passed, 1 skipped.
- **T002**: `"build": "vite build"` added; `npm run build -w web` succeeds. `web/dist/` is already git-ignored.
- **T003**: `showModal`/`close` polyfill in `web/tests/setup.ts`, applied only when jsdom lacks them.
- **T004**: `ProjectSection`, `SectionAssignment` (all FKs `RESTRICT`), ten `HistoryAction` values and back-relations in `api/prisma/schema.prisma`.
- **T005**: `api/prisma/migrations/20261109120000_project_sections/migration.sql`, generated with `prisma migrate diff` from the HEAD schema, plus the hand-written `project_sections_current_name_key` (`lower(name)`), `section_assignments_current_key`, and the two `removed_ck` checks. Reviewed: no `DROP`, `UPDATE`, `DELETE`, `INSERT` or `TRUNCATE`. `resetDatabase()` deletes section assignments and sections first; `append-only.test.ts` forbids deleting either new model.
  - **Incident (test database only)**: the first generated file began with Prisma's deprecation warning, because stderr was redirected into it, so its first run on the embedded test database (port 54329, `vendor_test`) failed at line 1 with nothing applied and was recorded as failed (P3009). The two warning lines were removed, the attempt was marked rolled back on the test database with `prisma migrate resolve --rolled-back` (migration log only, no data), and the corrected migration then applied. The development database was never started or touched.
- **T006**: full API suite after the migration: 306 passed, unchanged.
- **T007**: `blueprint.test.ts` failed (module missing), then passed with the frozen 15-name `DEFAULT_SECTIONS`.
- **T008**: `assignVendorToProject`, `activePair`, `recordOnBoth` (now accepting `section`), `linkExists` and `Named` exported from `links/routes.ts`; the link route calls the helper. `assignments`, `links` and `history` tests: 32 passed before and after.
- **T009**: `time.test.ts` failed (functions missing), then passed: "9 Nov 2026", "9 Nov 2026, 14:05", and the IST day roll-over.
- **T010**: `ui-components.test.tsx` failed (modules missing), then 6 passed: `ConfirmDialog` (native dialog, focus on Cancel, Escape, focus returns), `Tooltip`, `Skeleton`, `useUnsavedGuard`/`canLeave`. Connecting `canLeave` to navigation is part of T018 and to sign-out/switch user part of T036.
- **T011**: `contrast.test.ts` failed against the dark tokens (17 of 21; the 4 that passed were dark pairs that already had enough contrast), then passed after T012.
- **T012**: light tokens on `:root` (old names kept and remapped); hard-coded dark colours mapped to the new success, warning, danger, info, completed and accent tokens; accent no longer used as text on white (links, secondary buttons, labels are black); black focus ring with a yellow halo; inputs with a 4.8:1 border; black navigation with a yellow current-page bar; styles for the dialog, toast, tooltip and skeleton. Class names unchanged.
- **T013**: lint and typecheck pass. API 48 files, 308 passed (+2). Web 31 files, 166 passed, 1 skipped (+30: time 3, components 6, contrast 21). No existing assertion needed changing, so no supersession comments were added.
- **Not verified**: the new look has not been viewed in a browser; that is T048.

---

## Phase 3: User Story 1 - See existing records first (Priority: P1) 🎯 MVP

**Goal**: Vendors and Projects open on their lists with search, sort and Active/Archived views; add forms are closed, below the list, sectioned and protected against unsaved loss; 50 records at a time.

**Independent Test**: Open Vendors and Projects with records: the first record shows without scrolling at 1280 px, the form is closed, Add focuses its first field, leaving with changes asks first, the sort persists and the search does not.

### Tests for User Story 1 ⚠️

- [X] T014 [P] [US1] Write failing API tests in `api/tests/api/lists.test.ts` for `GET /api/vendors` and `GET /api/projects`: `view=active` (default) and `view=archived`; sorts vendors `name`, `category`, `availability`, `project_count` and projects `name`, `status`, `expected_completion`, `progress`; unknown sort → 400 `fields.sort`; `limit` default 50, maximum 200, `offset`; headers `X-Total-Count`, `X-Active-Count`, `X-Archived-Count`; the body stays an array; `include_archived=true` behaves as before; projects `progress=in_progress` returns exactly the FR-020 set (cases: no items, 0%, 100%, Completed with partial items, archived) and any other value → 400 `fields.progress`; signed-out → 401 (FR-004, FR-006, FR-021, FR-026).
- [X] T015 [P] [US1] Write failing web tests in `web/tests/list-first.test.tsx` for both pages: the list (region) precedes the form in document order; the form is closed; **Add vendor** / **Add project** opens it and focuses the first field; the form has the headed fieldsets (vendors: Contact, What they do, Manpower, GST, Rates; projects: Basics, Client, Dates); sort select changes the request; the chosen sort and view are written to `localStorage` keys `vm.list.vendors` / `vm.list.projects` and restored on the next render, while search text is not; an invalid stored value falls back to defaults; **Show more** requests `offset=50`; the count reads from `X-Total-Count`; closing a changed form or navigating asks for confirmation; the Edit project form in `project-detail.tsx` uses the Basics, Client and Dates fieldsets and the same unsaved-change confirmation; the in-progress filter from a dashboard link is shown and can be cleared (US1-1 to US1-7, FR-003, FR-007, FR-021).

### Implementation for User Story 1

- [X] T016 [US1] In `api/src/modules/vendors/routes.ts` and `api/src/modules/projects/routes.ts`, add zod-validated `view`, `sort`, `limit`, `offset`; apply sort (progress and project count in memory after the existing figures); set the three count headers; add `progress=in_progress` on projects using `projectFigures`; keep `include_archived` and the array body. T014 must pass.
- [X] T017 [P] [US1] Create `web/src/list-prefs.ts`: `readListPrefs(key, defaults)` and `writeListPrefs(key, { sort, view })`, each in try/catch, validating values against allowed lists (FR-005).
- [X] T018 [US1] Restructure `web/src/pages/vendors.tsx`: header with count and **Add vendor**; Active/Archived switch with counts (replacing "Include archived"); search, filters, sort; list with skeleton rows while loading; **Show more**; form below, closed by default, in headed fieldsets, using `useUnsavedGuard`. No field, rule or message removed (FR-003).
- [X] T019 [US1] Restructure `web/src/pages/projects.tsx` the same way (Basics, Client, Dates fieldsets; Active/Archived switch; sorts per T014; a clearable in-progress filter read from the link), and give the Edit project form in `web/src/pages/project-detail.tsx` the same fieldsets and `useUnsavedGuard`.
- [X] T020 [US1] Update the superseded existing assertions in `web/tests/projects-list.test.tsx`, `web/tests/vendors-list.test.tsx`, `web/tests/vendor-filters.test.tsx` and `web/tests/vendor-form.test.tsx` (form now opened by **Add …**; "Include archived" replaced by the Archived view), each with a citation comment. T015 must pass. Run all suites and record counts.

**Checkpoint**: US1 works and is testable on its own.

**US1 checkpoint result (2026-11-10)**:
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 49 files, 330 passed (+22, `lists.test.ts`). Web 32 files, 178 passed, 1 skipped (+12, `list-first.test.tsx`). Baseline before US1: API 308; web 166 passed, 1 skipped. No line-ending noise. The development database stayed stopped.
- **T014**: 22 API tests; 16 failed before T016 (the 6 that passed cover unchanged behaviour: default name order, `include_archived=true`, signed-out 401). In-progress cases: no items, 0%, 100%, Completed with partial progress, archived.
- **T015**: 12 web tests; 11 failed before T017–T019. "Falls back to defaults" passed beforehand only because the old page sent no sort or view; it is meaningful now.
- **T016**: `api/src/lib/list-query.ts` (`listViewSchema`, `viewAndPage`, `sortBy`); both routes read both views so the Active and Archived counts match the current search and filters; `isInProgress` exported from `projects/routes.ts`.
  - **Deviation from the contract text "limit default 50"**: paging applies only when `limit` or `offset` is given. Other screens call `GET /api/vendors` without parameters to list every vendor (for example the project page's assign-a-vendor choices), and a default of 50 would silently cut them off. The Vendors and Projects pages always send `limit=50`. `contracts/http-api.md` and `research.md` are updated.
- **T017**: `web/src/list-prefs.ts`, plus `web/src/ui/list-controls.tsx` (`ViewSwitch`, `countHeader`) and `apiWithHeaders` in `web/src/api/client.ts` to read the count headers.
- **T018/T019**: Vendors and Projects: header **Add …** button (opens the form below the list and focuses Name), Active/Archived switch with counts, Sort by, 50 per page with Show more, placeholder rows while loading, sectioned forms (vendors: Contact, What they do, Manpower, GST, Rates; projects: Basics, Client, Dates), Cancel with an unsaved-change confirmation, and the in-progress notice with "Show all projects". The Edit project form in `project-detail.tsx` got the same fieldsets and the unsaved-change guard. `web/src/main.tsx` now checks `canLeave()` on in-app navigation and puts the address back if the person stays, and passes the `progress` link parameter. The empty lists offer "Add a vendor" / "Add a project", which open the form. Layout styles for the switch, sort, fieldsets and Show more were added.
- **T020, superseded assertions** (each with a comment citing the spec's Backward Compatibility table): `projects-list.test.tsx` (4 tests: Archived view instead of Include archived, `limit=50`, form opened by Add project, placeholder rows), `vendors-list.test.tsx` (3: Archived view and `limit=50`, "Add a vendor" in the empty list, placeholder rows), `vendor-form.test.tsx` (1 helper: open the form first), and `dashboard-tiles.test.tsx` (2: the tile lists now request `limit=50`). `dashboard-tiles.test.tsx` was not named in T020; it pinned the exact list URL. `vendor-filters.test.tsx` needed no change.
- **Not verified**: the pages have not been viewed in a browser (T048).

---

## Phase 4: User Story 2 - Organise each project into sections (Priority: P1)

**Goal**: Per-project sections from the 15-section blueprint, editable per project, with vendors assigned per section (auto-assigning to the project when needed), removable and restorable, all recorded in history.

**Independent Test**: Create a project (15 sections), rename, reorder, add, remove and restore sections, assign vendors to two sections, confirm a second project is unchanged, and read both histories.

### Tests for User Story 2 ⚠️

- [X] T021 [P] [US2] Write failing API tests in `api/tests/api/sections.test.ts`:
  - `POST /api/projects` creates 15 sections in FR-012 order; the project's history has one entry, `CREATED`, whose details include `blueprint_applied` with the 15 names in order, and no `BLUEPRINT_APPLIED` entry; projects created before (inserted directly) have none
  - `POST /api/projects/:id/sections/blueprint` adds 15 once and records `BLUEPRINT_APPLIED`, then 409 `HAS_SECTIONS`
  - add, rename, edit description and notes; name "1 to 80 characters after trimming", description and notes "up to 5,000 characters" → 400 `fields`
  - case-insensitive name clash → 409 `SECTION_NAME_TAKEN` naming the existing section
  - `PUT …/sections/order` rewrites positions; wrong id set → 400; stale `sections_version` → 409 `SECTIONS_CHANGED` with the current order
  - `DELETE /api/sections/:id` sets `removed_at`/`removed_by`, ends current section assignments, deletes nothing; repeat → 409 `ALREADY_REMOVED`
  - `POST …/restore` places it last with name, description and notes; its assignments stay past; name clash → 409 `SECTION_NAME_TAKEN` (FR-010a)
  - archived project → 409 `ARCHIVED` for every write
  - each change records the right `HistoryAction` with previous and new values (FR-019)
  - all three roles may do each action; signed-out → 401
- [X] T022 [P] [US2] Write failing API tests in `api/tests/api/section-assignments.test.ts`:
  - assigning a vendor already on the project creates only the section assignment (`project_assignment_created: false`)
  - assigning a vendor not on the project creates the project assignment (role, scope and note empty, `ASSIGNED` on both targets) and the section assignment (`SECTION_ASSIGNED` on both) in one transaction; a forced failure of the second insert leaves neither (FR-015a)
  - archived vendor or project → 409 `ARCHIVED`, nothing saved; removed section → 409 `SECTION_REMOVED`
  - same vendor twice in one section → 409 `SECTION_ASSIGNMENT_EXISTS`; two parallel requests leave one row
  - one vendor in two sections; `role_in_section` "up to 120 characters"
  - `PATCH` edits the role with history; `DELETE` ends it and leaves the project assignment (FR-015b)
  - `DELETE /api/links/:id` ends the vendor's section assignments in that project (`ended_section_assignments`)
  - `GET /api/projects/:id` returns `sections`, `removed_sections`, `sections_version`, and `links[].sections`; `GET /api/vendors/:id` returns `links[].sections` with roles
  - the vendor record is never duplicated (vendor count unchanged)
  - signed-out → 401 on every assignment route
- [X] T023 [P] [US2] Write failing web tests in `web/tests/project-sections.test.tsx`: sections render in order with description (collapsed after 4 lines, **Show more**) and notes; rename inline; Move up/Move down then Save order sends the id list; 409 `SECTIONS_CHANGED` shows the new order with a message; Add section; Remove opens a dialog naming the assigned vendors; Removed sections lists it with Restore; **Use the standard blueprint** shows only when there are no sections; assigning a vendor shows phone, contact person, categories and role; a vendor not on the project shows the toast "Vendor assigned to project and to <section>"; the vendor profile lists each project's sections; leaving a section's name, description or notes, or an assignment role, with unsaved text asks for confirmation (US2-1 to US2-10, FR-007).

### Implementation for User Story 2

- [X] T024 [US2] Create `api/src/modules/sections/routes.ts` with the section routes of [contracts/http-api.md](./contracts/http-api.md) (blueprint, add, patch, order, delete, restore): zod bodies; row locks with `SELECT … FOR UPDATE` for patch, delete and restore; P2002 on the name index → `SECTION_NAME_TAKEN`; history via `recordHistory`. Mount it in `api/src/app.ts`. T021 must pass.
- [X] T025 [US2] Add the section-assignment routes to `api/src/modules/sections/routes.ts` using `activePair` and `assignVendorToProject` (T008) in one transaction; P2002 on the assignment index → `SECTION_ASSIGNMENT_EXISTS`; history via `recordOnBoth` with `section`. Extend `DELETE /api/links/:id` in `api/src/modules/links/routes.ts` to end section assignments (FR-015b).
- [X] T026 [US2] In `api/src/modules/projects/routes.ts`, create the 15 sections from `DEFAULT_SECTIONS` in the project-create transaction and put `blueprint_applied` (the 15 names) into the details of the existing `CREATED` history entry (no separate entry), and add `sections`, `removed_sections`, `sections_version` and `links[].sections` to the detail response; in `api/src/modules/vendors/routes.ts` add `links[].sections`. T021 and T022 must pass.
- [X] T027 [US2] Create `web/src/pages/project-sections.tsx` and mount it in `web/src/pages/project-detail.tsx` below the overview; vendor cards list their sections; read-only on archived projects. Use `ConfirmDialog`, `notify`, `formatDateTime`.
- [X] T028 [US2] In `web/src/pages/vendor-detail.tsx`, list each project's sections with roles; in `web/src/pages/history-panel.tsx`, add labels for the ten new actions and show section names. T023 must pass. Run all suites and record counts.

**Checkpoint**: US1 and US2 both work independently.

**US2 checkpoint result (2026-11-10)**:
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 51 files, 363 passed (+33). Web 33 files, 195 passed, 1 skipped (+17), green on two consecutive runs. Baseline before US2: API 330; web 178 passed, 1 skipped. No line-ending noise. The development database was never started (Docker was not even running). `graphify update .` run.
- **T021** (`sections.test.ts`, 19 tests) and **T022** (`section-assignments.test.ts`, 14 tests): 31 of 33 failed before T024; the 2 that passed are the signed-out checks, which the existing session middleware already enforces. They cover the owner's five points:
  - a project holds many sections (15 from the blueprint, plus custom ones);
  - a section holds several vendors, each with phone, contact person, categories and role;
  - one vendor works in several sections and several projects, with one vendor record (`vendor` count stays 1);
  - ending one section assignment leaves the vendor's other sections and the project assignment (`links`) untouched; removing a vendor from a project ends only that project's section assignments;
  - project-level vendor visibility: an auto-assigned vendor appears in `links` with status `NO_ACTIVITIES` and empty role/scope/note, each link lists its sections, and Feature 004 history tests pass unchanged (the blueprint is recorded inside `CREATED`).
  - A test bug was fixed during T026: two role tests created staff with capitalised emails, which sign-in lowercases; the emails are now lowercase.
- **T023** (`project-sections.test.tsx`, 17 tests): failed before T027 (module missing), then passed; the vendor-profile case failed until T028.
- **T024**: `api/src/modules/sections/routes.ts` (blueprint, add, rename/describe, reorder with `sections_version`, remove, restore, and the assignment routes) and `sections/present.ts`. Structural changes lock the project row; current sections are renumbered 0..n-1 after each change, so a restored section is last.
- **T025**: assignment routes reuse `activePair` and `assignVendorToProject` in one transaction; `endSectionAssignments` lives in `links/routes.ts` (no import cycle) and is used by section removal, assignment removal and `DELETE /links/:id` (`ended_section_assignments`).
- **T026**: `POST /projects` creates the 15 sections and records `blueprint_applied` in the `CREATED` details; project detail adds `sections`, `removed_sections`, `sections_version` and `links[].sections`; vendor detail adds `links[].sections` with roles.
- **T027**: `web/src/pages/project-sections.tsx`, mounted below the Edit project form; read-only on archived projects; unsaved-change protection on rename, description/notes and role edits.
- **T028**: vendor profile lists "Sections: Execution (Lead carpenter), …"; history labels for the ten new actions. Section styles added (existing `.inline-form` reused).
- **Existing test changed**: `vendor-form.test.tsx` "sends every directory field" now has a 15 s timeout. It types about 20 fields one key at a time, ran close to the 5 s default before Feature 005 (Feature 004 T001 note), and after US1 (the form opens from a button and has fieldsets) it timed out in 1 of 3 runs, taking the next test with it. No assertion changed.
- **Deferred as planned**: the confirmation dialog before removing a vendor from a section is T042. Browser checks are T048.

---

## Phase 5: User Story 3 - Know at a glance how the business is doing (Priority: P2)

**Goal**: Dashboard counts, progress with percentages, recently updated projects, recent activity and quick actions, with Feature 003 and 004 sections kept.

**Independent Test**: With seeded data, each count matches the list it opens and each percentage equals done over non-archived items.

### Tests for User Story 3 ⚠️

- [X] T029 [P] [US3] Write failing API tests in `api/tests/api/dashboard-overview.test.ts`:
  - `GET /api/dashboard/summary` adds `vendors.archived`, `vendors.total` (archived included), `projects.total` (not archived), `projects.in_progress`, `projects.archived`; existing keys and money rules unchanged
  - in progress: not archived, status not Completed, `0 < done < total`; cases for 0 items, 0%, 100%, Completed with partial items, archived (FR-020)
  - `GET /api/dashboard/overview`: `progress` up to 10, lowest percent first, `percent = round(done/total×100)`, excludes Completed, archived and item-less projects; `recently_updated` 5 by newest change across project, sections, assignments and items; `recent_activity` 10 newest, client-advance entries only for Administrator and Accountant
  - `recent_activity[].summary` uses the history panel's labels
  - `GET /api/dashboard` response unchanged
  - signed-out → 401 on `summary` and `overview`
- [X] T030 [P] [US3] Write failing web tests in `web/tests/dashboard-overview.test.tsx`: the five FR-020 counts show with their exact labels and link per FR-021 (for example "Vendors, archived" → `#/vendors?view=archived`, "Projects in progress" → `#/projects?progress=in_progress`); no count already on a Feature 003 tile appears twice; progress rows show bar, percentage and health, and a project with no items is not in the progress list; recent lists with who, what and when in `formatDateTime`; **Add vendor** / **Add project** open the page with the form open (`?add=1`); empty states; Feature 003 tiles and Feature 004 sections still present with no count shown twice (US3-1 to US3-7).

### Implementation for User Story 3

- [X] T031 [US3] Extend the summary and add `GET /api/dashboard/overview` in `api/src/modules/dashboard/routes.ts`, reusing `projectFigures` and `ADVANCE_VIEWERS`. T029 must pass.
- [X] T032 [US3] Update `web/src/pages/dashboard.tsx` with the counts row, progress list, recent lists and quick actions above the kept Feature 004 sections; support `view`, `progress` and `add=1` hash parameters in `web/src/main.tsx`, `vendors.tsx` and `projects.tsx`. T030 must pass. Run all suites and record counts.

**US3 checkpoint result (2026-11-10)**:
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 52 files, 371 passed (+8). Web 34 files, 204 passed, 1 skipped (+9). Baseline before US3: API 363; web 195 passed, 1 skipped. No line-ending noise; no existing test changed in US3. The development database was not started.
- **T029** (`dashboard-overview.test.ts`, 8 tests): 6 failed before T031; the 2 that passed check what must not change (the Feature 003 summary keys and the Feature 004 `/dashboard` keys) and the signed-out refusal. One assertion was wrong and was corrected, not the code: it expected Office Team not to see client-advance activity, but Feature 003 FR-017 lets all three roles view advance amounts, and the code follows `ADVANCE_VIEWERS`. The contract line that said "Administrator and Accountant" was corrected too.
- **T030** (`dashboard-overview.test.tsx`, 9 tests): all failed before T032, then passed.
- **T031**: `GET /api/dashboard/overview` in `api/src/modules/dashboard/routes.ts`:
  - `counts` from record counts and `projectFigures`/`isInProgress` (a vendor in several sections is still one vendor row; projects are counted once);
  - `progress`: open, non-Completed projects with items, lowest percentage first, up to 10;
  - `recently_updated`: one SQL query taking the newest change across the project row, its sections, section assignments, vendor assignments, timeline items and progress updates, up to 5;
  - `recent_activity`: the 10 newest vendor and project history entries, plus client-advance entries for `ADVANCE_VIEWERS`.
- **T032**: dashboard header gains **Add vendor** / **Add project** (`?add=1`); a "Business overview" row of five counts linked per FR-021 (links carry `view=active` where the Active view must open, because the lists otherwise reopen the remembered view); "Project progress" (bar, whole-number percentage, health, "All projects"); "Recently updated projects"; "Recent activity" worded with the history panel's `ACTIONS`; placeholders while loading, a plain error, and empty states with the action that fills them. `main.tsx` now matches `#/vendors?…` (it required the exact path before) and passes `add` and `view`; Vendors and Projects accept both. The Feature 003 tiles and Feature 004 sections are unchanged below.
- **Deviations from the contract (recorded there)**: the five counts are in the overview, not added to `/dashboard/summary`, because Feature 003 tests pin that response's exact keys; `recent_activity` has no `summary` field, the web words entries with the shared `ACTIONS` labels instead.
- **Not covered by a test**: hiding advance entries from a role outside `ADVANCE_VIEWERS` — no such role exists today.

---

## Phase 6: User Story 4 - Tell archived records apart and bring them back (Priority: P2)

**Goal**: Clear archived marking everywhere, confirmation before archiving, restore with a confirmation message, nothing lost.

**Independent Test**: Archive a vendor on two projects (dialog says nothing is deleted), see it in the Archived view muted and badged and still in its project sections, restore it.

### Tests for User Story 4 ⚠️

- [X] T033 [P] [US4] Write failing tests: in `web/tests/archived-state.test.tsx`, archiving a vendor or project opens a dialog stating the record is hidden from active lists, nothing is deleted and it can be restored; Cancel sends nothing; archived rows and cards carry `ArchivedBadge` and the `is-archived` class and the sentence "Archived records are kept and can be restored"; Restore sends the request without a dialog and shows a toast. In `api/tests/api/archive-preserves.test.ts`, archiving and restoring a vendor and a project leaves project assignments, section assignments, documents, schedules and history counts unchanged (FR-029).

### Implementation for User Story 4

- [X] T034 [US4] Add `ConfirmDialog` before archive in `web/src/pages/vendor-detail.tsx` and `web/src/pages/project-detail.tsx`; apply `is-archived` and the kept-records sentence in the Archived views of `vendors.tsx` and `projects.tsx` and on archived vendors inside sections and vendor cards; add `.is-archived` muted styles in `web/src/styles.css`. T033 must pass. Run all suites and record counts.

**US4 checkpoint result (2026-11-10)**:
- **Scope**: T033–T034 only. The owner's brief said "US4 (T033–T038)"; in this file T035–T036 are US5 and T037–T038 are US6, so the owner confirmed US4 only.
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 53 files, 373 passed (+2). Web 35 files, 212 passed, 1 skipped (+8). Baseline before US4: API 371; web 204 passed, 1 skipped. No line-ending noise. The development database was not started. `graphify update .` run.
- **T033**:
  - `web/tests/archived-state.test.tsx` (8 tests): 7 failed before T034 for the intended reasons (no dialog, no kept-records sentence, no `is-archived` on the project vendor card). The archived vendor inside a section already passed, because US2 built it.
  - `api/tests/api/archive-preserves.test.ts` (2 tests): passed on the first run. FR-029 protects behaviour that already existed and US4 changes no API code, so it is a regression guard, not a fail-first test. It asserts its setup (2 project assignments, 3 section assignments across 2 projects, a schedule, 2 documents) before archiving, then compares every row afterwards.
  - **Reading of FR-029 "history unchanged"**: archiving and restoring add their own `ARCHIVED`/`RESTORED` entries (Feature 003 FR-027), so the test checks that every earlier entry is still there unchanged and that the only new entries are those four.
- **T034**: `vendor-detail.tsx` and `project-detail.tsx` open a `ConfirmDialog` before archiving ("It will be hidden from active lists. Nothing is deleted … can be restored at any time."); restoring runs at once with the existing confirmation message. Archived vendors and projects show "Archived records are kept and can be restored." on their pages and in the Archived views (the US1 wording "Archived vendors/projects are kept…" was changed to the FR-027 sentence). Archived vendor cards on the project page carry `is-archived`. `.is-archived` muted styles added; the badge keeps the meaning in words, and the muted colours stay within the tested contrast pairs.
- **Existing test changed**: `vendor-detail.test.tsx` "confirms archiving the vendor" now confirms in the dialog before expecting "Vendor archived" (FR-028 supersedes archiving in one click), with a citation comment.
- **Not changed**: no API, schema or seed code; no data changed.

---

## Phase 7: User Story 5 - Switch to another account from the profile menu (Priority: P3)

**Goal**: Initials icon at the top right; menu with details, account information, change password, Switch user and Sign out; switching ends the session and opens sign-in with a notice.

**Independent Test**: As Office Team, Switch user, confirm, sign in as Accountant; the icon and menu show the Accountant and Staff stays hidden.

### Tests for User Story 5 ⚠️

- [X] T035 [P] [US5] Write failing tests: in `web/tests/profile-menu.test.tsx` (extend; update the superseded name-button queries with a citation comment), the icon shows initials (first letters of the first two words), its accessible name and tooltip are "Name, Role"; the menu shows name, role, email, "Account created 9 Nov 2026", change password, Switch user, Sign out; Escape closes and returns focus; Switch user opens a dialog, Confirm calls `POST /api/auth/logout` once, then sign-in shows "Signed out <name>. Sign in as another staff member."; a dirty form (including the change-password form) triggers the unsaved confirmation first; after switching and the next person signing in, nothing the previous person had on screen is shown (the app state is reset and pages reload their data); nothing is written to `localStorage` or `sessionStorage`. In `api/tests/api/auth.test.ts`, `GET /api/auth/me` adds `created_at` and nothing else changes.

### Implementation for User Story 5

- [X] T036 [US5] Add `created_at` to `/me` in `api/src/modules/auth/routes.ts`; create `web/src/ui/profile-menu.tsx` and use it in `web/src/main.tsx`; pass the switched-out notice to `web/src/pages/sign-in.tsx` in memory only. Update `web/tests/app.test.tsx` superseded queries with a citation comment. T035 must pass. Run all suites and record counts.

**US5 checkpoint result (2026-11-10)**:
- **Scope**: T035–T036 (US5). US6 (T037–T038) not started.
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 53 files, 375 passed (+2). Web 35 files, 219 passed, 1 skipped (+7 net: 7 new profile tests). Baseline before US5: API 373; web 212 passed, 1 skipped. No line-ending noise. The development database was not started. `graphify update .` run.
- **T035**:
  - `api/tests/api/auth.test.ts` (+2): `/me` adds `created_at` and keeps exactly `id`, `name`, `email`, `role`; signed-out still 401. The first failed before T036.
  - `web/tests/profile-menu.test.tsx` (12 tests, 7 new): 10 failed before T036. The 3 earlier Feature 004 profile tests failed because their button lookups now use the "Name, Role" label (superseded queries, updated with a citation comment); the 2 Staff-link tests passed (unchanged behaviour). New cases: initials "AA" with accessible name and tooltip "Asha Admin, Office Team"; "Account created 9 Nov 2026"; Switch user asks first and Cancel keeps the person signed in; Confirm calls `POST /api/auth/logout` once and sign-in says "Signed out Asha Admin. Sign in as another staff member."; a half-typed password change triggers the unsaved-change question first; after switching, the next person sees their own icon, role (no Staff link for the Accountant) and freshly loaded pages, with nothing from the previous person; nothing is written to browser storage.
- **T036**: `/me` reads `createdAt` with one query (the session middleware is unchanged). `web/src/ui/profile-menu.tsx` holds the menu (initials icon in a `Tooltip`, account details, change password, Switch user with `ConfirmDialog`, Sign out); Sign out and Switch user call `canLeave()` first. `main.tsx` lost its account code to the component and keeps who was switched out in memory for `sign-in.tsx`, which shows it as a notice. Signing out unmounts every page, so the next person's pages load their own data. `app.test.tsx` queries updated (superseded, cited). Round yellow initials badge styled.
- **Not changed**: sessions, sign-in, password rules and roles. Sign out behaves as before; Switch user reuses it.

---

## Phase 8: User Story 6 - A clean, consistent look (Priority: P3)

**Goal**: Every page uses the visual system, with one marker treatment per meaning and visible focus everywhere.

**Independent Test**: Visit every page at 1280, 768 and 375 px; every primary action is yellow with black text; tab through each page with focus always visible.

### Tests for User Story 6 ⚠️

- [X] T037 [P] [US6] Extend `web/tests/phone-layout.test.tsx` and add `web/tests/visual-system.test.tsx`: no rule sets a yellow token as `background` on `body`, `.content`, `.card`, `.sidebar` or `section`; primary buttons use `--accent` with `--on-accent`; every status, health, assignment and archived class maps to one token pair; a `:focus-visible` rule exists for buttons, links, inputs, selects and summary; each page rendered in tests has no element without text inside a `.status-badge` (FR-033 to FR-036, FR-041).

### Implementation for User Story 6

- [X] T038 [US6] Pass over every page and component in `web/src/pages/` and `web/src/ui/` to remove leftover dark-theme literals and inline colours, apply the shared button, card, table, dialog and badge classes, and align spacing and radii to the token scale in `web/src/styles.css`. T037 must pass. Run all suites and record counts.

**US6 checkpoint result (2026-11-10)**:
- **Scope**: T037–T038 (US6). US7 not started.
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 53 files, 375 passed (unchanged; US6 is web only). Web 36 files, 280 passed, 1 skipped (+61: 57 in `visual-system.test.tsx`, 4 in `phone-layout.test.tsx`). Baseline before US6: web 219 passed, 1 skipped. No line-ending noise. The development database was not started. `graphify update .` run.
- **T037**:
  - `web/tests/visual-system.test.tsx` reads the stylesheet: no yellow background on `body`, `main`, `section`, `.app`, `.workspace`, `.content`, `.sidebar`, `.card`, `.section`, `.dashboard-panel`, `.profile-panel` or `.confirm-dialog`; primary buttons are `--accent` with `--on-accent`; every status, health, assignment, availability, flag, outcome and role marker uses at most one palette family and never the accent; "in progress", "completed" and "delayed" get the same family everywhere; one `:focus-visible` ring using `--focus`, and no rule removes an outline without a replacement; every badge renders text.
  - Before T038, 3 checks failed, all genuine: `.status-badge.status-in-progress`, `.assignment-in-progress` and `.role-badge` mixed blue text with a yellow fill and border. Two test mistakes were corrected before implementing: the badge count is 18, not 19, and whole-row import tints (`outcome-row-…`, a highlight like a selected row) are not status markers.
  - `web/tests/phone-layout.test.tsx` (+4): Feature 005 layouts at phone width. 1 failed before T038, a genuine phone bug: the 2.5rem round profile icon met the phone rule's 2.75rem minimum button height and turned oval, below the 44 px touch target in width. The other 3 (sectioned forms in one column, full-width view switch, wrapping counts/section cards/inline forms, dialog width) passed as regression guards.
- **T038**:
  - "In progress" markers and the role badge now use the information family (blue text on blue fill), matching how the palette is used elsewhere.
  - Phone: the profile icon is 2.75rem round.
  - The US3 dashboard lists used an unstyled class (`dash-list`, default bullets and indent); they now use the shared `dashboard-list`.
  - The dark-theme token aliases kept by T012 (`--bg-deep`, `--accent-2`, `--ocean`, `--ocean-hover`, `--success`, `--warning`, `--danger`, `--info`) were removed; their uses point at the real tokens.
  - No inline colours remain in `web/src/pages/` or `web/src/ui/` (the progress bar's inline width is data, not colour). Corner radii use the radius tokens apart from pills (`999px`) and circles (`50%`).
- **Known limitation**: 58 padding, margin and gap values in `styles.css` are literal rem values, mostly compact control padding inside buttons, badges and pills from Features 001–004. Layout gaps added in Feature 005 use the `--space-*` scale; converting every control padding to the scale was not done, because it would change the look of existing controls without a test to anchor it. To be judged in the browser review (T048).

---

## Phase 9: User Story 7 - Find anything and know where I am (Priority: P3)

**Goal**: Header global search, breadcrumbs, skeletons, tooltips, one date format and confirmation dialogs for important actions.

**Independent Test**: Search "meh", open Mehta Carpentry, see "Vendors / Mehta Carpentry"; dates read "9 Nov 2026".

### Tests for User Story 7 ⚠️

- [X] T039 [P] [US7] Write failing API tests in `api/tests/api/search.test.ts`: `q` under 2 or over 100 characters → 400; up to 5 vendors (name, phone) and 5 projects (name, client name), case-insensitive, name matches first, archived included with `archived: true`; signed-out → 401.
- [X] T040 [P] [US7] Write failing web tests in `web/tests/navigation-aids.test.tsx`: the header search requests after 250 ms with 2+ characters, lists results with archived marked, opens the chosen record, shows "No vendors or projects match"; breadcrumbs on vendor, project and import pages with working earlier links; icon-only controls have tooltips and matching accessible names; every page's dates use `formatDate` / `formatDateTime` (no `YYYY-MM-DD` text outside inputs); removing a vendor from a project and removing a section assignment open a `ConfirmDialog` (FR-037 to FR-044).

### Implementation for User Story 7

- [X] T041 [US7] Create `api/src/modules/search/routes.ts` and mount it in `api/src/app.ts`. T039 must pass.
- [X] T042 [US7] Create `web/src/ui/global-search.tsx` and `web/src/ui/breadcrumbs.tsx`; add both to the header in `web/src/main.tsx` (detail pages report their record name through an `onTitle` prop); replace displayed dates across `web/src/pages/` with `formatDate` / `formatDateTime`; add `ConfirmDialog` to remove-from-project and remove-section-assignment; wrap icon-only controls in `Tooltip`; replace "Loading …" text with `Skeleton`. Update superseded ISO-date assertions in existing web tests with citation comments. T040 must pass. Run all suites and record counts.

**US7 checkpoint result (2026-11-10)**:
- **Scope**: T039–T042 (US7). Phase 10 not started; T042 also closes the remove-section-assignment confirmation deferred from US2.
- **Checks**: lint, typecheck and `npm run build -w web` pass. API 54 files, 385 passed (+10, `search.test.ts`). Web 37 files, 297 passed, 1 skipped (+17, `navigation-aids.test.tsx`). Baseline before US7: API 375; web 280 passed, 1 skipped. No line-ending noise. The development database was not started; no migration.
- **T039 / T041**: before T041, 9 of 10 failed with 404 (no route); the signed-out 401 already passed through the session middleware. `GET /api/search` validates `q` (trimmed, 2 to 100 characters, `fields.q` otherwise), returns up to 5 vendors (name, then phone) and 5 projects (name, then client name), case-insensitive, name matches first and each group by name, archived included and marked.
- **T040**: all 17 failed first for the missing features. Three test mistakes were corrected before implementing or while implementing: the shell tests on `/dashboard` lacked summary and overview fixtures; the date checks read the whole document, which still held an app mounted by an earlier test, so they now read only the rendered page; the dialog check looked for "past" where the message says "Past vendors". The page-wide date check found one display the sweep had missed: the dashboard's "Today · 2026-11-08 IST" pill.
- **T042**:
  - Header: breadcrumbs (vendor, project, import and import-history pages; detail pages report their name through `onTitle`), then the header search, then the profile icon. On phones the breadcrumbs take their own line.
  - Dates: every displayed date goes through `formatDate` / `formatDateTime`, including the history panel's stored calendar dates ("Date received"), pricing history (previously the UTC day via `slice(0, 10)`, now the IST day) and the dashboard "Today" pill (its "IST" suffix dropped, like every other date). `istDate` and `istDateTime` were removed; nothing used them.
  - Confirmation dialogs: removing a vendor from a project (names vendor and project, says section assignments end and the assignment is kept under Past vendors) and removing a vendor from a section (says the vendor stays on the project).
  - Tooltips on the section move arrows, matching their accessible names. These were the only icon-only controls left; the profile icon already had one.
  - Skeletons replace the loading text on the project, vendor, timeline, item history, pricing, dashboard and app start-up; errors still show as text.
  - Superseded assertions updated with citation comments: ISO dates in `advances-section`, `dashboard-tiles`, `dashboard`, `documents-section`, `history-panel`, `ist-times`, `pricing-controls`, `project-overview`, `project-vendors`, `projects-list`, `vendor-detail`, `vendor-imports`; the dashboard loading text in `dashboard`; the two removals that now ask first in `project-vendors` and `project-sections`.
- **Known limitations**: the search results stay open until a result is chosen, the text is cleared or Escape is pressed; clicking elsewhere does not close them. Dates inside server messages (for example validation messages) are not reformatted. A breadcrumb appears once the record has loaded.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T043 Extend `api/prisma/seed.ts` (find-or-create only, never update or delete): when the seed **creates** a project in this run, create its 15 blueprint sections and, for those projects only, section assignments covering one vendor in two sections, one section with two vendors and one removed section. A project the seed finds already existing never receives sections, so pre-existing development projects (for example Lake House and Studio Fit-out) stay section-less (FR-013, owner decision I1). Extend `api/tests/api/seed.test.ts`: on an empty test database the four seeded projects get 15 sections in order; on a database where those projects already exist without sections, the seed adds none; a second run changes no table count.
- [X] T044 Write and run `api/tests/api/performance.test.ts`: generate 200 vendors, 50 projects and 20 sections per project on the test database only, and check that the Vendors and Projects lists, a project detail, the dashboard summary and overview, and search each respond in under 500 ms (leaving room within the 2-second page budget, NFR-001, SC-007). Then run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build -w web` from the repository root; fix every failure. Record counts against T001 and list every superseded assertion changed.
- [X] T045 [P] Run `graphify update .` (CLAUDE.md).
- [X] T046 Review the full diff, including untracked files: no secrets, generated files, unrelated changes, mixed line endings or unsafe database operations. Record the result.
**Code-level checkpoint result (2026-11-10, FR-039 completion and T043–T046)**:
- **Scope**: the FR-039 placeholders left after US7, then T043 to T046. T047 to T050 not started. The development database was not started (Docker was not running); no migration or development seed was run.
- **FR-039 completion** (`web/tests/loading-placeholders.test.tsx`, 11 tests): placeholder rows now show while the client advances page, import history (and an opened import run), the staff page, and the documents and advances sections load. The staff list now starts as "not loaded", so it no longer shows "Accounts 0 · 0 active" before the accounts arrive. Before the change, the 6 placeholder tests failed and the 5 error-message tests passed (they guard that errors still replace the placeholder). Empty states and error messages are unchanged.
- **T043**: a project the seed creates gets the 15 blueprint sections in the same transaction; a project found again never does. On a Lake House created in that run, Mehta Carpentry is in Materials and Execution, Rao Electrical in Execution (two vendors in one section), and Milestones is removed (kept, current sections renumbered 0 to 13); both vendors are already assigned to the project. The seed records no history for these rows, as for its links. `seed.test.ts` +2: on an empty database all four projects get every blueprint section in order and the samples; with Lake House and Studio Fit-out already present they get none while the two created projects get 15; a second run changes no table count. Before the change both failed (no sections); after, 4 of 4 pass. **Consequence for T047**: the development database already holds all four seeded projects, so the seed there will add no sections at all; sections come from **Use the standard blueprint** on each project.
- **T044** (`api/tests/api/performance.test.ts`): 200 vendors (10 archived), 50 projects (5 archived, 10 Completed), 20 sections per project (1,000), 6 vendors per project (300 links), 900 section assignments, 400 timeline items and 200 progress updates, on the embedded test database. Each request is warmed once, then timed 5 times; every run must be under 500 ms. Slowest run per request: Vendors list 23 ms, Projects list 19 ms, project detail 17 ms, dashboard summary 5 ms, dashboard overview 23 ms, dashboard lists 27 ms, search 5 ms. Server-side timings over the in-process app; browser rendering is measured in T048.
- **Checks**: `npm run lint` 0 problems; API and web typechecks pass; `npm test`: API 55 files, 395 passed (+10: 2 seed, 8 performance), web 38 files, 308 passed, 1 skipped (+11); `npm run build -w web` passes. Counts against T001: see the earlier checkpoints; superseded assertions are listed under each story's checkpoint, none were added here.
- **T045**: `graphify update .` run; 2,057 nodes. `graphify-out/` is ignored by git.
- **T046**: 49 modified and 27 new files; no deletions; no mixed line endings (`git diff --shortstat` equals `--ignore-cr-at-eol`); no lockfile change, one `package.json` line (`web` build script); no secrets (test-only passwords only, every email `@example.com`); `deleteMany` only in test helpers on the test database; the migration only adds (two tables, indexes, constraints, ten enum values) and changes or deletes no row; the only route changes are the two new routers, all behind the existing session check, and roles follow FR-046; `/api/auth/me` adds `created_at`. **Pre-existing risk found**: `npm run dev` (`scripts/dev.mjs`) runs `docker compose up -d`, `prisma migrate deploy` and the seed, so starting the app that way applies the Feature 005 migration to the development database. It must not be used before T047 is approved. The embedded test database prints `ECONNRESET` and `Connection terminated unexpectedly` at shutdown after every API run; this predates Feature 005 and does not fail tests.

- [X] T047 **Migration approval gate**: present the full SQL of the T005 migration to the product owner, with the development database's pending migration list and current counts. Apply it with `npm run prisma:deploy -w api` and run the seed only after explicit approval; start the container with `docker start vendor-management-db-1` (never recreate it; its data is in an anonymous volume). Record before and after counts and confirm existing rows are unchanged.
**T047 result (2026-11-10, approved by the product owner)**:
- **Container**: the existing `vendor-management-db-1` (created 2026-10-28) with its original anonymous volume, already running; not recreated. PostgreSQL 17.11; Prisma 6.19.3. The development `.env` was loaded only into each command's own process (`node --env-file`, `tsx --env-file`); no API tests or `npm run dev` were run.
- **Backup**: `C:\Users\ASUS\Documents\Projects\Vendor-Management-backups\vendor-pre-005-20261110.dump`, custom format, 118,139 bytes, SHA-256 `9acfdae5c32495cb7c528fa04c2117e46c3371e9d67181acfab691a367d0de67` (identical inside the container and on Windows). `pg_restore --list` read the Windows copy (249 entries); all 31 live tables have a table and a data entry.
- **Before**: only `20261109120000_project_sections` pending, 4 applied, none failed. Counts: staff 3, categories 7, vendors 10, projects 4 (Lake House `04a95034-…`, Studio Fit-out `08ef501b-…`, Hill Villa `0ddc1faf-…`, Riverside Clinic `bc094372-…`), assignments 10 (9 current, 1 past), timeline items 11, progress updates 7, history entries 4.
- **Migration**: `prisma migrate deploy` applied only `20261109120000_project_sections`; status then "Database schema is up to date", 5 applied, none failed. Verified: both tables with 22 columns, 7 indexes (including the two partial unique indexes), 13 constraints (9 foreign keys with ON DELETE RESTRICT, 2 primary keys, 2 checks), 18 history-action values.
- **Data preserved**: per-table row counts and full-content checksums of all 31 existing tables are identical before and after, except `_prisma_migrations` (+1 row; the 4 earlier rows still match their checksum). The two new tables are empty.
- **Seed**: `tsx prisma/seed.ts` exited 0 and changed nothing: the snapshot after the seed is identical to the one after the migration. No project was created, so no project received sections; both section tables remain empty.

- [ ] T048 Perform every scenario in [quickstart.md](./quickstart.md) in a real browser at 375, 768 and 1280 px; confirm SC-001 (first record visible without scrolling at 1280 px), time SC-002 and SC-003, run the SC-006 keyboard-only check on every page, check page load times against NFR-001, and record results under this task. Do not mark it done from automated tests alone.
**T048 result (2026-11-10, not complete: open defects and two human-timed criteria)**:
- **How**: Chrome 157 (headless, a throwaway profile), driven through the DevTools protocol with Node's built-in WebSocket; nothing installed. App started with `npx tsx --env-file=../.env src/server.ts` (from `api/`) and `npm run dev -w web`; not `npm run dev`. Signed in as `office@example.com`, then switched to `accountant@example.com`. Steps that write data ran once at 1280 px; 768 and 375 px were checked read-only.
- **Scenarios** (quickstart): 1 Lists first PASS (Show more not testable: 10 vendors, 5 projects); 2 Sections PASS (new project "T048 Acceptance Project", blueprint on Lake House only); 3 Section vendors PASS (Iyer Painters, both histories); 4 Dashboard PASS (5 counts and 2 percentages match); 5 Archived PASS (Mehta Carpentry, marked in Lake House Execution, restored); 6 Profile and switching PASS; 7 Visual system PASS apart from D1, D3; 8 Search and orientation PASS.
- **Viewports**: 1280 FAIL (D2: Vendors, Projects scroll sideways); 768 FAIL (D2; D4 on Projects); 375 FAIL (D2). Every other page in scope has no sideways scroll at all three widths. SC-001 PASS at 1280 (first record visible on Vendors and Projects).
- **Keyboard (SC-006)**: PASS on Dashboard, Vendors, Projects, Lake House, import history, import and client advances at 1280 px, and on Dashboard, Vendors, Lake House at 375 px: every stop has a visible focus indicator and is on screen, Tab wraps; menu, add form and view switch work by keyboard.
- **Browser timings (NFR-001)**, full reload, median of 3, Vite dev server: Dashboard 204 ms, Vendors 182 ms, Projects 183 ms, Lake House 357 ms, vendor page 186 ms; in-app navigation 113 to 122 ms. Browser-observed API calls 6 to 27 ms (server-only T044 figures: 4 to 27 ms at 200/50/20 volume). Within the 2-second budget.
- **Not tested**: SC-002 and SC-003 (a staff member's own times; for T049); Show more (fewer than 50 records); archived search marking (no archived records at the time; covered by automated tests).
- **Defects**: D1 sign-in brand text near-invisible (`.brand` uses `--nav-text` on the white card; FR-041; low). D2 hidden view-switch radios (`.view-option input`, absolute, inherit `width: 100%`) make Vendors and Projects scroll sideways at 1280, 768 and 375 px (FR-045; high: fails acceptance). D3 client-advance tiles have a yellow gradient fill, possibly a "large panel" under FR-033 (owner judgement; low). D4 at 768 px the Projects table's visually hidden "Health:" labels escape its scroll frame (+43 px sideways scroll) and columns break words mid-word (FR-045; medium). Observations: O1 focus falls to the page after removing a vendor from a project (its button is gone); O2 recent activity lists each section action twice (vendor and project entries); O3 an Accountant opening `#/staff` directly sees the page frame (unchanged from before Feature 005); O4 the profile tooltip stays visible while the icon has focus and overlaps the menu or page; O5 the CSS comment calling 2.75rem "44 px" is wrong at the 15 px root (41 px; no requirement names 44 px); O6 Lake House has 261 tab stops with 15 sections.
- **Spacing literals**: 48 literal rem values in padding, margin and gap (the earlier 58 used a broader pattern), almost all control padding from Features 001 to 004. No visible inconsistency or layout problem traced to them; the only difference seen is the view switch about 2 px shorter than the Sort select beside it.
- **Development data changed by these scenarios**: one new project (T048 Acceptance Project, 16 sections); Lake House 15 sections (blueprint) and Mehta Carpentry in its Execution section; Iyer Painters' past assignment on Lake House with two ended section assignments; Mehta Carpentry archived and restored; 24 history entries.

**T048 corrections (2026-11-10, approved by the product owner: D1 to D4)**:
- **Changes** (`web/src/styles.css` only): D2 `.view-option` gets `position: relative` and `.view-option input` gets `width: 1px; height: 1px`; D4 `.table-wrap` gets `position: relative`, and `.table-wrap.list-table td { overflow-wrap: break-word }` (two classes, so it outranks the later `.table-wrap td { overflow-wrap: anywhere }`; a first attempt as `.list-table td` lost the cascade and the browser check caught it); D1 `.auth-card .brand { color: var(--text) }` (the sidebar brand keeps `--nav-text`); D3 the client-advance tiles' background is `var(--surface)` and hover `var(--surface-muted)`, the yellow edge and border stay (the owner treats these tiles as large panels under FR-033).
- **Regression tests** (`web/tests/visual-system.test.tsx`, +6): the two tile rules added to the no-yellow large-panel list; the radio size and option position; the table frame position; the list-table cell wrapping (on the two-class selector, and not on `.list-table td`); the sign-in brand colour. All 6 failed before the change.
- **Browser re-check**: headless Chrome 157 against the **embedded test database** (port 54329, seeded with test passwords), because Docker and the development database were not running; the development database was not started, read or changed. Vendors and Projects, Active and Archived views, at 1280, 768 and 375 px: page width equals the window width in all 12 cases (before: up to 2,248 px at 1280, 1,239 at 768, 465 at 375); no word split across lines in any table cell at 1280 or 768 (before: "Sample", "Riverside" on Projects, names and phones on Vendors at 768); at 768 the Projects table scrolls inside its own frame. Sign-in brand rgb(17, 17, 17) on white. Both client-advance tiles: no background image, white fill, yellow border.
- **Commands**: `npm test -w web` 38 files, 314 passed, 1 skipped; `npm run lint` 0 problems; `npm run typecheck` (api and web) pass; `npm run build -w web` pass. API tests were not run (the development settings were never in the shell; nothing in the API changed).
- **Still open for T048**: SC-002 and SC-003 (timed by a staff member, T049). Observations O1 to O6 unchanged.

- [ ] T049 The product owner runs the SC-005 walkthrough (5 tasks, at least 4 completed without help) and records the result under this task.

**T049 procedure (2026-11-10, approved by the product owner)**: run as [quickstart.md, Walkthrough](./quickstart.md#walkthrough-t049-for-sc-005-with-the-sc-002-and-sc-003-timings-for-t048).
- T049 passes solely on SC-005: at least 4 of the 5 tasks completed without help. SC-002 and SC-003 are timed in the same session but recorded under T048 and do not affect T049.
- SC-002: the stopwatch starts when the participant begins opening Lake House, not when the page has loaded; the target stays 20 seconds.
- Order: SC-002, tasks 1 to 4, SC-003, task 5 (SC-003 runs while the participant is still Office Team).
- The 5-minute cap is an observer convenience, not an acceptance rule; each exercise is recorded as completed without help, completed with help, unable to complete, or ended by the observer.
- Before the session: confirm Khan Ceiling Systems exists and is active and that the new project name is unused (read-only query in the quickstart); if the name is taken, use another on every card. Not yet checked against the live database (Docker was not running on 2026-11-10; the last reading at the end of T048 showed Khan Ceiling Systems active and no "Walkthrough" project).
- Not run yet; no results recorded.

- [ ] T050 Run `/speckit-converge` for `specs/005-ui-ux-overhaul` and resolve every appended gap until it reports Converged (Constitution V).

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001 to T003) first; T001 before any code change.
- Foundational (T004 to T013) blocks all stories. T004 → T005 → T006 in order; T008 depends on T006; T011 (failing contrast test) before T012 (tokens), then T013.
- US1 (T014 to T020) and US2 (T021 to T028) can proceed after Phase 2; both are P1.
- US3 (T029 to T032) needs US1's list `view` parameter for its links (T016) and the sections tables for "recently updated".
- US4 (T033, T034) needs US1's Archived views and US2's section vendor rendering.
- US5 (T035, T036) depends only on Phase 2.
- US6 (T037, T038) after US1 to US5 screens exist.
- US7 (T039 to T042) depends on Phase 2; T042 touches pages changed by earlier stories, so run it after them.
- Polish (T043 to T050) after all stories; T043 before T044 (the full run includes the seed test); T047 before T048.

### Shared files (run in this order)

- `web/src/styles.css`: T012, T034, T038.
- `web/src/main.tsx`: T032, T036, T042.
- `web/src/pages/vendors.tsx`, `projects.tsx`: T018/T019, T032, T034, T042.
- `web/src/pages/project-detail.tsx`: T019, T027, T034, T042.
- `web/src/pages/vendor-detail.tsx`: T028, T034, T042.
- `api/src/modules/links/routes.ts`: T008, T025.
- `api/src/modules/projects/routes.ts`: T016, T026.
- `api/src/app.ts`: T024, T041.

### Within Each User Story

Tests first and seen failing for the intended reason → API → web → superseded-test updates → full suites and a checkpoint note.

### Parallel Opportunities

- T002, T003 in parallel; T007, T009, T010 and T011 in parallel within Phase 2 (T012 waits for T011).
- Each story's test tasks marked [P] in parallel (for example T021, T022, T023).
- US1 and US2 can be developed in parallel by different people after Phase 2; US5 and US7's API part (T039, T041) as well.

## Parallel Example: User Story 2

```text
T021 api/tests/api/sections.test.ts
T022 api/tests/api/section-assignments.test.ts
T023 web/tests/project-sections.test.tsx
```

## Implementation Strategy

### MVP First

Phases 1 and 2, then US1 (list-first pages) and US2 (project sections and section vendors), the two P1 stories. Stop and review at each checkpoint.

### Incremental Delivery

US3 and US4 (P2) next, then US5 to US7 (P3), each ending with green suites and a checkpoint note. The visual system starts in Phase 2 so every later story is built in it; US6 is the consistency pass.

### Review stops

Stop for the owner's review after each phase checkpoint, and always before T047 (development database).

## Notes

- [P] = different files, no dependency on an unfinished task.
- A task is checked only when its tests pass and, for user-facing work, its scenario is demonstrated (Constitution V). T048 and T049 need a real browser and the owner.
