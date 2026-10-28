---
description: "Task list for core auth and directory"
---

# Tasks: Core Auth and Directory

**Input**: Design documents from `/specs/001-core-auth-directory/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Revision 2026-10-27**: T001–T064 keep their original IDs. Their checkbox states were revised under the checkbox rule in the Notes section. T065–T092 add the work from the 2026-10-27 clarifications (spec.md `## Clarifications`) and close gaps found in the audit, where previously checked tasks T031, T036, T041, T045, and T057 left their screens incomplete. T093–T094 record decisions that the later plan revision left to the product owner. New tasks sit inside their story phases. T061–T064 still run last.

**Tests**: Included. Constitution Principle V requires an automated test for every acceptance scenario, and business-rule tests written first. The plan repeats that order. Write each listed test so it fails, then implement the task that makes it pass.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as an increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task in the same wave)
- **[Story]**: User story label (US1–US6). Setup, Foundational, and Polish have no story label.

## Path Conventions

- API: `api/`
- Web: `web/`
- Paths match `plan.md` (`api/` and `web/`, not `backend/` and `frontend/`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, tooling, database container, and CI

- [ ] T001 Create npm workspaces, root `package.json` with `engines.node` 24, and scripts `dev`, `lint`, `typecheck`, and `test` in `package.json`. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T002 [P] Add Express, Prisma, Zod, bcrypt, multer, cors, TypeScript, Vitest, and Supertest dependencies in `api/package.json`. Awaiting demonstration (T061): all API-backed scenarios. Verify only; do not re-implement.
- [ ] T003 [P] Add React, Vite, TypeScript, Vitest, and React Testing Library dependencies in `web/package.json`. Awaiting demonstration (T061): all UI scenarios. Verify only; do not re-implement.
- [ ] T004 [P] Configure TypeScript projects in `api/tsconfig.json` and `web/tsconfig.json`
- [ ] T005 [P] Configure ESLint and Prettier for both workspaces in `eslint.config.js` and `.prettierrc`
- [ ] T006 [P] Add local placeholders for `DATABASE_URL`, `SESSION_SECRET`, `FILE_STORAGE_DIR`, `WEB_ORIGIN`, `API_PORT`, `WEB_PORT`, and the three seed passwords in `.env.example`. Implemented as written; no automated test exists for the `.env.example` placeholders. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T007 [P] Ignore `.env` and `FILE_STORAGE_DIR` contents in `.gitignore`
- [ ] T008 [P] Run PostgreSQL 17 only from `docker-compose.yml`. Implemented or partially implemented; verification outstanding: start PostgreSQL 17 with `docker compose up -d` and confirm it accepts connections. Verify first; do not re-implement without evidence of a gap. Then awaiting demonstration (T061): all acceptance scenarios.
- [ ] T009 [P] Run lint, typecheck, Prisma generate, migrate, and tests on pull requests in `.github/workflows/ci.yml`
- [ ] T010 [P] Configure Vitest for the API in `api/vitest.config.ts` and for the web app in `web/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared middleware, and the first administrator. No user story starts before this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Define the Prisma schema in `api/prisma/schema.prisma` with UUID `id`, `created_at`, `created_by`, `updated_at`, and `updated_by` on every table. Money columns are `DECIMAL(15,2)`. `staff_users.email` is unique and stored lowercase. `staff_users.role` is `ADMINISTRATOR`, `OFFICE_TEAM`, or `ACCOUNTANT`. `staff_users.revoked_at` null means active. `vendors.name` and `vendors.phone` are required. `vendors.gstin` is required when `gst_registered` is true, otherwise null, unique among non-null values, and a 15-character GSTIN. `vendors.team_size` is an optional whole number of zero or greater. `vendors.availability` is optional `AVAILABLE`, `LIMITED`, or `UNAVAILABLE`. `projects.status` is `PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED` and is independent of `archived`. `categories.name` is unique case-insensitively and is not rewritten when a matching name is submitted. `vendor_project_links` has unique `(vendor_id, project_id)` and no price or schedule dates. `work_schedules` stores `vendor_id` and `project_id` and has no foreign key to `vendor_project_links`. `task_price_entries.schedule_id` and `costing_sheet_files.schedule_id` use `ON DELETE RESTRICT`. `work_schedules.required_team_size` is a whole number of 1 or greater, `end_time` is later than `start_time`, and `pricing_mode` is `NONE`, `FIXED`, or `FILE`. `task_price_entries.kind` is `CHARGE` or `REVERSAL`. `costing_sheet_files.byte_size` is greater than 0 and at most 10 MB, with at most one `archived = false` row per schedule. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T012 Create the initial Prisma migration from `api/prisma/schema.prisma` under `api/prisma/migrations/`. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T013 [P] Load environment variables in `api/src/config.ts`. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T014 [P] Map Zod failures to HTTP 400 `{ message, fields }`, domain conflicts to HTTP 409, and unknown errors to HTTP 500 without logging passwords or storage keys in `api/src/middleware/error.ts`. Awaiting demonstration (T061): US1-4, US1-5, US2-2, US2-6, US2-7, US2-8, US3-2, US4-2, US4-3, US5-5, US5-6, US6-5, US6-6. Verify only; do not re-implement.
- [ ] T015 Set `created_by` and `updated_by` from the session on every write in `api/src/lib/audit.ts`. Implemented or partially implemented; verification outstanding: show that every write records the signed-in staff member in `created_by` and `updated_by`. Verify first; do not re-implement without evidence of a gap. Then awaiting demonstration (T061): US2-5, US6-7, US6-8.
- [ ] T016 Serve `GET /api/health` as public `200 { "status": "ok" }` and mount the error middleware in `api/src/app.ts`. Awaiting demonstration (T061): US1-4, US1-5, US2-2, US2-6, US2-7, US2-8, US3-2, US4-2, US4-3, US5-5, US5-6, US6-5, US6-6. Verify only; do not re-implement.
- [ ] T017 Reject missing, expired, revoked, and revoked-user sessions with HTTP 401 before any other business route in `api/src/middleware/session.ts`. Awaiting demonstration (T061): US1-2, US1-9, US6-4. Verify only; do not re-implement.
- [ ] T018 Allow any active role, and require `ADMINISTRATOR` only where a route asks, in `api/src/middleware/require-role.ts`. Awaiting demonstration (T061): US1-4, US1-7. Verify only; do not re-implement.
- [ ] T019 Start the HTTP server from `api/src/server.ts`. Verified 2026-10-28: the API started from `api/src/server.ts` against a local PostgreSQL 17 (the bundled embedded-postgres, not Docker) and `GET /api/health` returned 200 directly and through the Vite proxy. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T020 Seed one administrator whose `created_by` is its own id, using the admin password from `.env`, in `api/prisma/seed.ts`. Verified 2026-10-28: the seed ran against that database with the variables set in the shell, and the administrator's `created_by` equals its own id. Awaiting demonstration (T061): US1-1 to US1-5. Verify only; do not re-implement.

**Checkpoint**: Foundation ready. User story implementation can now begin.

---

## Phase 3: User Story 1 - Sign in and manage who has access (Priority: P1) 🎯 MVP

**Goal**: An administrator creates staff, they sign in with email and password, and a revoked account is refused on the next request and on the next sign-in.

**Independent Test**: Create an administrator and one staff account, sign in as the staff member, revoke that account, and confirm the next request and a new sign-in are refused.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T021 [P] [US1] Write a failing unit test that refuses a change leaving zero active administrators in `api/tests/unit/last-admin.test.ts`. Awaiting demonstration (T061): US1-5. Verify only; do not re-implement.
- [ ] T022 [P] [US1] Write a failing unit test that uses the message `Email or password is not valid.` for an unknown email, a wrong password, and a revoked account in `api/tests/unit/sign-in-message.test.ts`. Awaiting demonstration (T061): US1-6. Verify only; do not re-implement.
- [ ] T023 [P] [US1] Write failing Supertest coverage for spec User Story 1 scenarios 1–7 against `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/password`, and `/api/staff` in `api/tests/api/auth.test.ts`
- [ ] T024 [P] [US1] Write a failing sign-in form test in `web/tests/sign-in.test.tsx`. Awaiting demonstration (T061): US1-1. Verify only; do not re-implement.

### Implementation for User Story 1

- [ ] T025 [US1] Hash passwords with bcrypt and reject passwords shorter than 8 characters in `api/src/lib/passwords.ts`. Awaiting demonstration (T061): US1-1, US1-3. Verify only; do not re-implement.
- [ ] T026 [US1] Implement login, logout, `GET /api/auth/me`, and own-password change in `api/src/modules/auth/routes.ts`. The caller cannot change their own role. Awaiting demonstration (T061): US1-1, US1-2, US1-6. Verify only; do not re-implement.
- [ ] T027 [US1] Implement administrator-only create, list, and patch of staff, including revoke, restore, role change, and password set, in `api/src/modules/staff/routes.ts`. Email uniqueness includes revoked accounts. The last active administrator cannot be revoked or moved to another role, returning 409 `The firm must keep one active administrator.`. Awaiting demonstration (T061): US1-1 to US1-5. Verify only; do not re-implement.
- [ ] T028 [US1] Mount auth routes as public only for `POST /api/auth/login`, and staff routes behind `require-role(ADMINISTRATOR)`, in `api/src/app.ts`. Awaiting demonstration (T061): US1-1, US1-4, US1-6. Verify only; do not re-implement.
- [ ] T029 [US1] Send the session cookie from the browser client in `web/src/api/client.ts`. Awaiting demonstration (T061): US1-1 and every signed-in UI scenario. Verify only; do not re-implement.
- [ ] T030 [P] [US1] Build the sign-in screen in `web/src/pages/sign-in.tsx`. Awaiting demonstration (T061): US1-1, US1-6. Verify only; do not re-implement.
- [ ] T031 [P] [US1] Build the staff screen that hides nothing the API must still refuse in `web/src/pages/staff.tsx`

### Revision 2026-10-27 for User Story 1

- [ ] T065 [US1] Add Supertest coverage in `api/tests/api/auth.test.ts` for an administrator changing another person's role, refusing to demote the last active administrator, non-administrators refused on list, revoke, restore, and password set, 401 without a session on `GET`, `POST`, and `PATCH /api/staff`, duplicate email `EMAIL_IN_USE` including a revoked account's email, a second revoke returning 409 `ALREADY_REVOKED` with `The account is already revoked.`, and `''`, `'short'`, and `'1234567'` refused with 400 `fields.password` on `PATCH /api/staff/:id`. Done 2026-10-27: the API suite ran 29 of 29 passing. Awaiting demonstration (T061): US1-4, US1-5. Verify only; do not re-implement.
- [ ] T066 [US1] Validate a supplied empty `password` on `PATCH /api/staff/:id` instead of ignoring it, by testing `body.password !== undefined` before `hashPassword` in `api/src/modules/staff/routes.ts`. Done 2026-10-27: T065's password test failed first with 200 and passed after the fix. Awaiting demonstration (T061): US1-3, US1-9. Verify only; do not re-implement.
- [ ] T067 [P] [US1] Write a failing unit test in `api/tests/unit/own-role.test.ts` for `changesOwnRole({ callerId, targetId, currentRole, nextRole })`: true when `callerId === targetId` and `nextRole` is set and differs from `currentRole`; false when the target is someone else, when `nextRole` is undefined, or when `nextRole` equals `currentRole`. Awaiting demonstration (T061): US1-8. Verify only; do not re-implement.
- [ ] T068 [P] [US1] Write failing Supertest cases for spec User Story 1 scenarios 8–9 in `api/tests/api/auth.test.ts`. (a) Change the existing test `refuses to demote the last active administrator` to expect 403 `{ code: 'OWN_ROLE', message: 'You cannot change your own role.' }` with the role still `ADMINISTRATOR`. (b) With two active administrators A and B, A changing A's own role returns 403 `OWN_ROLE`, and A changing B's role returns 200. (c) Sign in as the office user, then the administrator sets that user's password with `PATCH /api/staff/:id { password }`; the office user's existing cookie gets 401 on `GET /api/auth/me`, and the new password signs in. (d) A caller signed in on two agents changes their own password through `POST /api/auth/password`; the second agent still gets 200 on `GET /api/auth/me`. Awaiting demonstration (T061): US1-5, US1-8, US1-9. Verify only; do not re-implement.
- [ ] T069 [P] [US1] Write Supertest concurrency cases in `api/tests/api/staff-concurrency.test.ts` using `Promise.all`. (a) Two administrators revoke the same office account at once: exactly one 200 and one 409 `ALREADY_REVOKED`. (b) Administrators A and B revoke each other at once: exactly one 200 and one 409 `LAST_ADMINISTRATOR`, and one active administrator remains. Note in the file that these cases can pass by chance without locks, so they guard regressions rather than prove the lock. Awaiting demonstration (T061): US1-5. Verify only; do not re-implement.
- [ ] T070 [US1] Implement `changesOwnRole` in `api/src/lib/own-role.ts` so T067 passes. Awaiting demonstration (T061): US1-8. Verify only; do not re-implement.
- [ ] T071 [US1] Update `PATCH /api/staff/:id` in `api/src/modules/staff/routes.ts` so T068 and T069 pass. (1) First statement inside the `$transaction`: lock with `` tx.$queryRaw`SELECT id FROM staff_users WHERE id = ${req.params.id}::uuid OR (role = 'ADMINISTRATOR' AND revoked_at IS NULL) FOR UPDATE` `` before reading the target or counting administrators. (2) After loading the target and before `leavesNoActiveAdministrator`, if `changesOwnRole({ callerId: req.staff!.id, targetId: target.id, currentRole: target.role, nextRole: body.role })`, throw `HttpError(403, 'You cannot change your own role.', { code: 'OWN_ROLE' })`. (3) Revoke the target's open sessions (`revokedAt: null` → now, `updatedById: actor`) when `body.revoked === true`, or when `body.password !== undefined` and `target.id !== req.staff!.id`. Changing one's own password through this route does not revoke sessions for now; that behavior stays deferred to T092. Keep every other response unchanged. Awaiting demonstration (T061): US1-5, US1-8, US1-9. Verify only; do not re-implement.
- [ ] T072 [P] [US1] Write a failing web test in `web/tests/staff.test.tsx` that renders `StaffPage` with `currentUserId` and a mocked `fetch`. Assert: each row shows `Active` or `Revoked` and the labels `Administrator`, `Office Team`, or `Accountant` instead of the raw codes. A revoked row's `Restore` button sends `PATCH /api/staff/:id { revoked: false }`, plus `password` when the optional new-password field is filled. A role select on other people's rows sends `PATCH { role }`, and the caller's own row has no role select. `Set password` sends `PATCH { password }`. The API's error `message` is shown on failure. Awaiting demonstration (T061): US1-1, US1-2, US1-3, US1-9. Verify only; do not re-implement.
- [ ] T073 [US1] Implement the T072 controls in `web/src/pages/staff.tsx`, adding a `currentUserId: string` prop, and pass `me.id` from `web/src/main.tsx` (`<StaffPage currentUserId={me.id} />`). Reload the list after each successful action. Leave the server as the only enforcement of administrator-only access. Awaiting demonstration (T061): US1-1, US1-2, US1-3, US1-9. Verify only; do not re-implement.

**Checkpoint**: User Story 1 works alone. Office and accountant callers receive 403 on `/api/staff`. An administrator can restore, change roles, and set passwords from the web app, cannot change their own role, and a password reset signs the person out.

---

## Phase 4: User Story 2 - Keep a searchable vendor directory (Priority: P2)

**Goal**: Authorized staff create one vendor with the full directory model, search and filter it, archive it, and keep rating and note history.

**Independent Test**: Sign in, add a vendor with name, phone, and one category, find it by category and location, archive it, and open it again from archived records.

### Tests for User Story 2 ⚠️

- [ ] T032 [P] [US2] Write failing unit tests for GSTIN required when registered, duplicate GSTIN, duplicate-phone warning, rating 1–5, archived vendors omitted unless `include_archived=true`, and case-insensitive category reuse that keeps the stored name in `api/tests/unit/vendor-rules.test.ts`
- [ ] T033 [P] [US2] Write failing Supertest coverage for spec User Story 2 scenarios 1–9, including `POST /api/categories` returning the existing row without renaming it, in `api/tests/api/vendors.test.ts`
- [ ] T037 [P] [US2] Write the failing vendor filter form test in `web/tests/vendor-filters.test.tsx` before the vendor screens exist. Awaiting demonstration (T061): US2-3, US2-9. Verify only; do not re-implement.

### Implementation for User Story 2

- [ ] T034 [US2] Implement vendor create, patch, get, search, archive, restore, notes, ratings, and category reuse in `api/src/modules/vendors/routes.ts`. Require `name`, `phone`, and at least one category. `q` matches name, phone, alternate phone, contact person, services, and materials. Filters for `category_id`, `location`, `availability`, and `project_id` all apply together. A repeated phone returns 409 `PHONE_IN_USE` until `confirm_duplicate_phone` is true. Notes are append-only with `note_type` `PAST_WORK`, `RELIABILITY`, `COORDINATION`, or `GENERAL` and a non-empty `body`. A rating `score` is a whole number 1 through 5. Indicative `rates.amount` is `DECIMAL(15,2)`, zero or greater, with at most two decimal places. Match a category name without regard to letter case, reuse that row, and do not change its stored name. Awaiting demonstration (T061): US1-7, US2-1 to US2-9. Verify only; do not re-implement.
- [ ] T035 [US2] Mount vendor and category routes for any active role in `api/src/app.ts`. Awaiting demonstration (T061): US2-1 to US2-9. Verify only; do not re-implement.
- [ ] T036 [P] [US2] Build the vendor list and vendor detail screens in `web/src/pages/vendors.tsx` and `web/src/pages/vendor-detail.tsx`

### Revision 2026-10-27 for User Story 2

- [ ] T074 [P] [US2] Extend `api/tests/api/vendors.test.ts` with separate cases. Missing `name` gives 400 `fields.name`, and an empty `category_ids` gives 400 `fields.category_ids`. `q` matches by name, phone, alternate phone, contact person, and service, not only material. `project_id` returns only vendors linked to that project. After restore the vendor is back in the default `GET /api/vendors`. `rating_history` entries carry `author.name` and `created_at`. An empty note `body` gives 400. Ratings `0`, `6`, and `2.5` give 400. `gst_registered: false` with a `gstin` gives 400 `fields.gstin`. `team_size: -1` gives 400. Awaiting demonstration (T061): US2-2, US2-3, US2-4, US2-5. Verify only; do not re-implement.
- [ ] T075 [P] [US2] Write a failing web test in `web/tests/vendor-form.test.tsx`. (a) The create form in `Vendors` sends `contact_person`, `alternate_phone`, `email`, `address`, `locations`, `services`, `materials`, `gst_registered`, `gstin`, `gst_legal_name`, `team_size`, `availability`, `manpower_note`, and `rates` (`label`, `amount` as a string, `unit`). (b) A 409 `PHONE_IN_USE` shows the `matches` names and a `Save anyway` button that resends with `confirm_duplicate_phone: true`. (c) The filter form has a `Linked project` select that sends `project_id`. (d) `VendorDetail` sends the chosen `note_type` (`PAST_WORK`, `RELIABILITY`, `COORDINATION`, or `GENERAL`) and lists every `rating_history` entry and note with `author.name` and date. Implemented or partially implemented; verification outstanding: parts (a)–(c) pass; part (d) is written in `web/tests/vendor-form.test.tsx` but skipped until T077, which waits on T093, and must then be enabled and pass. Verify first; do not re-implement without evidence of a gap. Then awaiting demonstration (T061): US2-1, US2-3, US2-5, US2-8.
- [ ] T076 [P] [US2] Implement the T075 create-form fields, the duplicate-phone confirmation, and the `Linked project` filter (options from `GET /api/projects?include_archived=true`) in `web/src/pages/vendors.tsx`. Awaiting demonstration (T061): US2-1, US2-3, US2-8. Verify only; do not re-implement.
- [ ] T077 [P] [US2] Implement in `web/src/pages/vendor-detail.tsx`: an edit form that sends `PATCH /api/vendors/:id` with `category_ids` and the `locations`, `services`, `materials`, and `rates` arrays replaced as sent; the `note_type` select; rating history and notes with author and date; and the vendor's `links` with project name, role, scope, and note, shown also when the vendor is archived (FR-015)

**Checkpoint**: User Stories 1 and 2 work. Vendor GET does not include task prices.

---

## Phase 5: User Story 3 - Keep a project list (Priority: P3)

**Goal**: Staff create, update, archive, and restore projects. Completed stays on the default list until archived.

**Independent Test**: Create a project, set status to Completed, archive it, confirm it leaves the default list, and open it by id.

### Tests for User Story 3 ⚠️

- [ ] T038 [P] [US3] Write failing Supertest coverage for spec User Story 3 scenarios 1–4 in `api/tests/api/projects.test.ts`. Awaiting demonstration (T061): US3-1 to US3-4. Verify only; do not re-implement.

### Implementation for User Story 3

- [ ] T039 [US3] Implement project create, patch, list, get, archive, and restore in `api/src/modules/projects/routes.ts`. `name` is required. Default `GET /api/projects` includes every status and excludes `archived = true`. Awaiting demonstration (T061): US1-7, US3-1 to US3-4. Verify only; do not re-implement.
- [ ] T040 [US3] Mount project routes for any active role in `api/src/app.ts`. Awaiting demonstration (T061): US3-1 to US3-4. Verify only; do not re-implement.
- [ ] T041 [P] [US3] Build the project list screen in `web/src/pages/projects.tsx`. Implemented as written; no automated test exists for the project list screen. Awaiting demonstration (T061): US3-1, US3-4. Verify only; do not re-implement.

### Revision 2026-10-27 for User Story 3

- [ ] T078 [US3] Add `client_name`, `site_location`, and `description` to the create form in `web/src/pages/projects.tsx`, and an edit form for `name` (required), `client_name`, `site_location`, `description`, and `status` (`PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED`) that sends `PATCH /api/projects/:id` in `web/src/pages/project-detail.tsx`

**Checkpoint**: Projects can be managed without vendor links.

---

## Phase 6: User Story 4 - Link a vendor to projects without copying the vendor (Priority: P4)

**Goal**: One vendor links to many projects. The link stores only role, scope, and note.

**Independent Test**: Create one vendor and two projects, link the vendor to both, and confirm the directory still has one vendor record.

### Tests for User Story 4 ⚠️

- [ ] T042 [P] [US4] Write failing Supertest coverage for spec User Story 4 scenarios 1–5 in `api/tests/api/links.test.ts`. Include link removal that archives the pair’s schedules and still returns their price history and costing-sheet files to an authorized caller, with those rows still present.

### Implementation for User Story 4

- [ ] T043 [US4] Implement create, patch, and delete of links in `api/src/modules/links/routes.ts`. Accept only `vendor_id`, `role_on_project`, `scope_of_work`, and `note`. Return 409 when the pair exists or either side is archived. On delete, archive working schedules for that vendor and project in the same transaction, then delete only the link row. Do not delete the vendor, the schedules, `task_price_entries`, or `costing_sheet_files`, and do not copy contact details, rates, or manpower onto the link. Rely on the schema from T011 so the database cannot cascade the link delete onto those rows. Awaiting demonstration (T061): US1-7, US4-1 to US4-5. Verify only; do not re-implement.
- [ ] T044 [US4] Mount link routes for any active role in `api/src/app.ts`. Awaiting demonstration (T061): US4-1 to US4-5. Verify only; do not re-implement.
- [ ] T045 [US4] Show and edit links on the project screen in `web/src/pages/project-detail.tsx`

### Revision 2026-10-27 for User Story 4

- [ ] T079 [P] [US4] Extend `api/tests/api/links.test.ts`:
  - linking to an archived project gives 409 `ARCHIVED`
  - after archiving a linked vendor, `GET /api/projects/:id` still lists the link with `vendor_archived: true`, and `GET /api/vendors/:id` still lists its `links`
  - `role_on_project`, `scope_of_work`, and `note` are read back from the project view
  - the vendor's `phone` and `rates` are unchanged after linking
  - after `DELETE /api/links/:id` the project view no longer lists the link
  - closing the T042 gap: before deleting the link, attach a PDF to a file-priced schedule on that same vendor and project; after the delete that schedule is `archived: true`, its `file_history` still lists the file, and `GET /api/schedules/:scheduleId/costing-sheets/:fileId` returns 200 with a session
  - Awaiting demonstration (T061): US4-3, US4-4, US4-5. Verify only; do not re-implement.
- [ ] T080 [US4] In `web/src/pages/project-detail.tsx`, edit each link's role, scope, and note through `PATCH /api/links/:id`, and mark a link whose `vendor_archived` is true as archived

**Checkpoint**: Linking does not duplicate vendors. Schedules are not required yet.

---

## Phase 7: User Story 5 - Schedule vendor work on a project (Priority: P5)

**Goal**: Staff schedule a linked vendor with task, date, start, end, and required team size. Overlaps are flagged and still saved.

**Independent Test**: Link one vendor, schedule 09:00–12:00, schedule 11:00–13:00 on any project, and confirm both rows exist and the second response names the first conflict.

### Tests for User Story 5 ⚠️

- [ ] T046 [P] [US5] Write failing unit tests for half-open overlap `[start, end)`, cross-project overlap, different vendors in the same window, and availability ignored in `api/tests/unit/overlap.test.ts`. Awaiting demonstration (T061): US5-2, US5-3, US5-4. Verify only; do not re-implement.
- [ ] T047 [P] [US5] Write failing Supertest coverage for spec User Story 5 scenarios 1–6 in `api/tests/api/schedules.test.ts`

### Implementation for User Story 5

- [ ] T048 [US5] Implement half-open overlap for the same `vendor_id` and `work_date` among `archived = false` rows in `api/src/lib/overlap.ts`. Awaiting demonstration (T061): US5-2, US5-3, US5-4. Verify only; do not re-implement.
- [ ] T049 [US5] Implement schedule create, get, patch, and archive in `api/src/modules/schedules/routes.ts`. Require an existing link and both records `archived = false`. Require `task`, `work_date`, `start_time`, `end_time` later than `start_time`, and `required_team_size` as a whole number of 1 or greater. Return `conflicts` on 201 without turning overlap into 409. Do not copy vendor fields onto the schedule. Exclude archived schedules from the working project view. Awaiting demonstration (T061): US5-1 to US5-6. Verify only; do not re-implement.
- [ ] T050 [US5] Mount schedule routes for any active role in `api/src/app.ts`. Awaiting demonstration (T061): US5-1 to US5-6. Verify only; do not re-implement.
- [ ] T051 [P] [US5] Add the schedule form to `web/src/pages/project-detail.tsx` and cover it in `web/tests/schedule-form.test.tsx`. Awaiting demonstration (T061): US5-1, US5-2. Verify only; do not re-implement.

### Revision 2026-10-27 for User Story 5

- [ ] T081 [P] [US5] Extend `api/tests/api/schedules.test.ts`:
  - back-to-back schedules for one vendor on one date, `09:00`–`12:00` and `12:00`–`14:00`, both return `conflicts: []`
  - each invalid case is its own request returning 400: missing `task`, missing `work_date`, `end_time` equal to `start_time`, `end_time` before `start_time`, and `required_team_size` missing, `0`, `-1`, or `1.5`
  - a schedule for an archived vendor or an archived project returns 409 `ARCHIVED`
  - `GET /api/projects/:id` lists the saved schedule
  - after `POST /api/schedules/:id/archive` the project view omits it
  - Awaiting demonstration (T061): US5-1, US5-5, US5-6. Verify only; do not re-implement.
- [ ] T082 [US5] In `web/src/pages/project-detail.tsx`, edit a schedule's task, date, times, and team size through `PATCH /api/schedules/:id`, show the returned `conflicts`, and archive it through `POST /api/schedules/:id/archive`

**Checkpoint**: Schedules save with conflicts visible. Pricing mode stays `NONE`.

---

## Phase 8: User Story 6 - Price a job without changing the vendor (Priority: P5)

**Goal**: Each scheduled task has its own fixed price or one spreadsheet/PDF costing sheet. The vendor profile is unchanged.

**Independent Test**: Put two different fixed prices on two schedules for one vendor, attach a PDF to a third unpriced schedule, and confirm vendor GET still shows only indicative rates. Download the file with a session, and receive 401 without one.

### Tests for User Story 6 ⚠️

- [ ] T052 [P] [US6] Write failing unit tests for price-or-file exclusivity, a reversal plus a new charge, and rejection of a negative amount or a third decimal place in `api/tests/unit/price.test.ts`. Awaiting demonstration (T061): US6-5, US6-6, US6-7. Verify only; do not re-implement.
- [ ] T053 [P] [US6] Write failing Supertest coverage for spec User Story 6 scenarios 1–7, including unauthenticated download 401, in `api/tests/api/pricing.test.ts`

### Implementation for User Story 6

- [ ] T054 [US6] Insert a `REVERSAL` of the current charge and a new `CHARGE` when a fixed price changes, and refuse a charge while `pricing_mode` is `FILE`, in `api/src/lib/price.ts`. Amounts are `DECIMAL(15,2)`, zero or greater, with at most two decimal places. Awaiting demonstration (T061): US6-2, US6-5, US6-6, US6-7. Verify only; do not re-implement.
- [ ] T055 [US6] Store costing sheets under `FILE_STORAGE_DIR` and stream them only from `GET /api/schedules/:scheduleId/costing-sheets/:fileId` in `api/src/modules/files/routes.ts`. Accept `.xls`, `.xlsx`, `.csv`, and `.pdf` up to 10 MB. Refuse a file while `pricing_mode` is `FIXED`. Replacing a file sets the previous row `archived = true` and keeps the bytes. There is no static file URL. Awaiting demonstration (T061): US6-3 to US6-7. Verify only; do not re-implement.
- [ ] T056 [US6] Mount `PUT /api/schedules/:id/price` and the costing-sheet routes for any active role in `api/src/app.ts`. Awaiting demonstration (T061): US6-1 to US6-7. Verify only; do not re-implement.
- [ ] T057 [US6] Add per-task price and file controls on `web/src/pages/project-detail.tsx` without writing the task price onto the vendor screen in `web/src/pages/vendor-detail.tsx`

### Revision 2026-10-27 for User Story 6

- [ ] T083 [P] [US6] Add failing unit tests to `api/tests/unit/price.test.ts` for `planClearPrice(mode, entries)`. With mode `FIXED` and an open charge, it returns `{ amount: <negated open charge>, reversesEntryId: <open charge id> }`. With mode `NONE` or `FILE`, it throws `HttpError` 409 `NOT_FIXED`. Awaiting demonstration (T061): US6-8. Verify only; do not re-implement.
- [ ] T084 [P] [US6] Extend `api/tests/api/pricing.test.ts` to cover spec User Story 6 scenario 8:
  - `POST /api/schedules/:id/price/clear` on a fixed-priced schedule returns 200 with `pricing_mode: 'NONE'` and `current_price: null`, and `price_history` ends with a `REVERSAL` carrying `author` and `created_at`
  - then attaching a PDF returns 201
  - `POST /api/schedules/:id/costing-sheet/clear` returns 200 with `current_file: null`, and the cleared entry in `file_history` has `archived: true`, `archived_at`, and `archived_by.name`; the cleared file still downloads with a session
  - then `PUT …/price` returns 200
  - clearing a price on a schedule without one gives 409 `NOT_FIXED`; clearing a sheet on a schedule without one gives 409 `NOT_FILE`
  - a file over 10 MB gives 400 `fields.file`
  - amount `'1.001'` gives 400 at the API
  - firing `PUT …/price` and `POST …/costing-sheet` at once on an unpriced schedule with `Promise.all` gives exactly one success, and the schedule ends with one current method
  - Awaiting demonstration (T061): US6-6, US6-7, US6-8. Verify only; do not re-implement.
- [ ] T085 [US6] Implement `planClearPrice(mode: PricingModeName, entries: StoredPrice[])` in `api/src/lib/price.ts` using `openCharge`. It throws `HttpError(409, 'This task has no fixed price to clear.', { code: 'NOT_FIXED' })` unless mode is `FIXED` and an open charge exists. Awaiting demonstration (T061): US6-8. Verify only; do not re-implement.
- [ ] T086 [US6] In `api/src/modules/schedules/routes.ts`:
  - add `POST /schedules/:id/price/clear`: in a `$transaction`, lock first with `` tx.$queryRaw`SELECT id FROM work_schedules WHERE id = ${req.params.id}::uuid FOR UPDATE` ``, call `planClearPrice`, insert the `REVERSAL` with `stampCreate(actor)`, set `pricing_mode` to `NONE` with `stampUpdate(actor)`, and return `presentSchedule`
  - add the same row lock as the first statement of the `PUT /schedules/:id/price` transaction
  - in `presentSchedule`, include `files.updatedBy` and add `archived_at` (`updatedAt` when `archived`, else `null`) and `archived_by` (`{ id, name }` from `updatedBy` when `archived`, else `null`) to each `file_history` entry
  - Awaiting demonstration (T061): US6-7, US6-8. Verify only; do not re-implement.
- [ ] T087 [US6] In `api/src/modules/files/routes.ts`:
  - add `POST /schedules/:id/costing-sheet/clear`: in a `$transaction`, lock the schedule row as in T086; if `pricing_mode` is not `FILE`, throw `HttpError(409, 'This task has no costing sheet to clear.', { code: 'NOT_FILE' })`; set the current file `archived = true` with `stampUpdate(actor)` and keep the bytes; set `pricing_mode` to `NONE`; return `presentSchedule`
  - in the upload route, move the `pricing_mode === 'FIXED'` check inside the transaction after the same row lock
  - keep the existing rule that `byte_size` is "Greater than 0, at most 10 MB"
  - Awaiting demonstration (T061): US6-5, US6-7, US6-8. Verify only; do not re-implement.
- [ ] T088 [P] [US6] Write a failing web test in `web/tests/pricing-controls.test.tsx` that renders `ProjectDetail` with a mocked `fetch`. Each schedule shows its current fixed amount, or `Costing sheet` with an open link, or `Unpriced`. Its price history and file history show amounts or file names with author and date. `Clear price` sends `POST /api/schedules/:id/price/clear` and `Clear costing sheet` sends `POST /api/schedules/:id/costing-sheet/clear`. Awaiting demonstration (T061): US6-1, US6-2, US6-3, US6-7, US6-8. Verify only; do not re-implement.
- [ ] T089 [US6] Implement the T088 pricing display, history lists, and clear buttons in `web/src/pages/project-detail.tsx`, loading each schedule's detail from `GET /api/schedules/:id`. Do not show task prices on `web/src/pages/vendor-detail.tsx`. Awaiting demonstration (T061): US6-1, US6-2, US6-3, US6-7, US6-8. Verify only; do not re-implement.

**Checkpoint**: Two tasks for one vendor can show two prices. A signed-out download is refused. A task can switch pricing method by clearing first, and every cleared price or file stays readable with date and author.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Seed data, one-command startup, and the quickstart demonstration

- [ ] T058 Extend `api/prisma/seed.ts` so it is idempotent and also loads categories, vendors, two projects, one vendor linked to both, two schedules with different fixed prices, and one schedule with a sample PDF. Verified 2026-10-28: the seed ran a second and third time with identical record counts and no duplicates. Awaiting demonstration (T061): all acceptance scenarios. Verify only; do not re-implement.
- [ ] T059 Start compose, migrate, seed, and both dev servers from the root `dev` script in `package.json` using concurrently. Implemented or partially implemented; verification outstanding: run `npm run dev` and confirm it starts PostgreSQL, migrates, seeds, and serves the API and the web app (2026-10-28: the migrate, seed, API, and web steps ran individually and work; the script's `docker compose up -d` step is unverified because Docker is not installed). Verify first; do not re-implement without evidence of a gap. Then awaiting demonstration (T061): all acceptance scenarios.
- [ ] T060 Make sign-in, vendor search, project open, and schedule entry usable at 375px and 1280px in `web/src/styles.css`
- [ ] T090 Run `npm run lint`, `npm run typecheck`, and `npm test` from the root `package.json`. The web suite must include `web/tests/app.test.tsx`, the regression test for the hooks-order fix in `web/src/main.tsx`, which has not run yet. All three must exit 0. Record the outputs for the pull request. Ran 2026-10-28: `npm run lint` and `npm run typecheck` passed; `npm test` passed with API 50 of 50 and web 13 passed, 1 skipped (T075 part (d), waiting on T077).
- [ ] T091 The product owner adds requirement ids for work scheduling and per-task pricing as Phase 1 items in `docs/prd.md` section 7, and this spec's **Backlog coverage** line in `specs/001-core-auth-directory/spec.md` cites them (Constitution Principles I and VI). An agent does not choose the ids. Verification 2026-10-27: `docs/prd.md` section 7 defines FR-17 (Work Scheduling) and FR-18 (Task Pricing) with the product owner's wording, and section 5.1 lists both in Phase 1; `spec.md` cites them on the Backlog coverage line and in Assumptions; the `plan.md` PRD gate reads Pass. Awaiting product-owner review and approval of the applied change, recorded here or in the pull request.
- [ ] T092 Ask the product owner through `/speckit-clarify` whether an administrator may set their own password through `PATCH /api/staff/:id` without the current password, and record the answer in `specs/001-core-auth-directory/spec.md`. Until it is answered, the route's behavior stays unchanged.
- [ ] T093 Ask the product owner through `/speckit-clarify` whether `PATCH /api/vendors/:id` in `api/src/modules/vendors/routes.ts` is a full replacement or a partial update, and record the answer in `specs/001-core-auth-directory/spec.md`. Today the route reuses the create schema: it requires `name`, `phone`, and `category_ids`, empties omitted `locations`, `services`, `materials`, and `rates`, resets omitted `team_size`, `availability`, and GST fields, and leaves omitted text fields unchanged (plan.md, Unresolved items). Until it is answered, the route's behavior stays unchanged. A behavior change from the answer is a new implementation task. An agent does not choose the answer.
- [ ] T094 The product owner decides how a task with no mapped acceptance scenario that changes configuration or tests, or runs checks, can be completed under Principle V. This covers T004, T005, T007, T009, T063, T090, and T064 (plan.md, Unresolved items). Record the decision in `.specify/memory/constitution.md` through its Governance amendment process, then align the Notes in `specs/001-core-auth-directory/tasks.md`. An agent does not choose the rule. Until it is decided, those tasks stay unchecked.
- [ ] T061 Demonstrate each acceptance scenario against the running system using the "Scenario coverage" table and the "Done for a scenario" rules in `specs/001-core-auth-directory/quickstart.md`, record every attempt in its "Demonstration log (T061)", and fix only defects those scenarios expose
- [ ] T062 [P] Verify SC-003 in `api/tests/api/vendor-lookup-timing.test.ts`. Conditions: PostgreSQL 17 from `docker-compose.yml`, one API process, 200 vendors each with one category and one location, then `GET /api/vendors` filtered by that category and location. The call must return the matching vendor in under 30 seconds. Do not change the 30-second limit in `specs/001-core-auth-directory/spec.md`. Implemented or partially implemented; verification outstanding: run this test against PostgreSQL 17 from `docker-compose.yml`, as the task states; it has passed only on the bundled PostgreSQL 17. Verify first; do not re-implement without evidence of a gap. Then awaiting demonstration (T061): US2-3.
- [ ] T063 [P] Add a Supertest check in `api/tests/api/excluded-routes.test.ts` that Feature 001 does not expose quotation, purchase-order, invoice, or payment routes. Assert those paths are absent. Do not implement that functionality.
- [ ] T064 Run `/speckit-converge` for `specs/001-core-auth-directory`. The feature is not ready for a pull request unless the command reports the converged outcome and the status text Converged. Any other outcome, including appended tasks, blocks the pull request. Do not invent a different command.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational. Story order below is the delivery order
- **Polish (Phase 9)**: Depends on the user stories that the seed and quickstart demonstrate

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational. No dependency on later stories
- **User Story 2 (P2)**: Starts after User Story 1, because vendor routes require a session
- **User Story 3 (P3)**: Starts after User Story 1. Independent of the vendor directory
- **User Story 4 (P4)**: Starts after User Stories 2 and 3, because a link needs a vendor and a project
- **User Story 5 (P5)**: Starts after User Story 4, because a schedule requires a link
- **User Story 6 (P5)**: Starts after User Story 5, because the priced job is a schedule

### Within Each User Story

- Tests are written and fail before implementation
- Shared helpers before route modules
- Route modules before `api/src/app.ts` mounting
- API behavior before the screen that calls it

### Parallel Opportunities

- T002–T010 can run together after T001
- T013 and T014 can run together after T012
- Tests inside one story that touch different files can run together
- T030 and T031 can run together after T029
- T032, T033, and T037 can run together before T034
- T036 starts after T037
- User Story 3 can proceed beside User Story 2 once User Story 1 is done
- T062 and T063 can run together after the routes they call exist. T064 runs last and depends on the implementation and tests that `/speckit-converge` checks

### Revision 2026-10-27 order

- Within each story, the revision tests come first and must fail before their implementation: T067–T069 before T070–T071; T072 before T073; T075 before T076–T077; T083–T084 before T085–T087; T088 before T089
- T070 before T071. T085 before T086. T086 before T087, because T087 returns `presentSchedule`, which T086 changes
- T078, T080, T082, and T089 all edit `web/src/pages/project-detail.tsx`, so they run one after another in that order
- T067, T068, T069, T072, T074, T075, T079, T081, T083, T084, and T088 touch different files and can be written together
- T076 and T077 can run together after T075
- T077 runs after T093, because its edit form sends `PATCH /api/vendors/:id` and depends on the update semantics T093 decides
- T090 runs after T065–T089. T091, T092, T093, and T094 are product-owner actions and can happen at any time, except that T093 comes before T077. T061 then T064 run after T090–T094

---

## Parallel Example: User Story 1

```text
T021 Write api/tests/unit/last-admin.test.ts
T022 Write api/tests/unit/sign-in-message.test.ts
T023 Write api/tests/api/auth.test.ts
T024 Write web/tests/sign-in.test.tsx
```

Those four files can be written together. Implementation T025–T029 stays sequential. T030 and T031 can then run together.

## Parallel Example: User Story 5

```text
T046 Write api/tests/unit/overlap.test.ts
T047 Write api/tests/api/schedules.test.ts
```

Implement `api/src/lib/overlap.ts` before `api/src/modules/schedules/routes.ts`.

## Parallel Example: Revision 2026-10-27 tests

```text
T067 Write api/tests/unit/own-role.test.ts
T068 Extend api/tests/api/auth.test.ts
T069 Write api/tests/api/staff-concurrency.test.ts
T072 Write web/tests/staff.test.tsx
T083 Extend api/tests/unit/price.test.ts
T084 Extend api/tests/api/pricing.test.ts
```

Those files are independent. Confirm each fails, then implement T070–T071, T073, and T085–T087.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and run `api/tests/api/auth.test.ts` plus the sign-in screen
5. Demo staff sign-in and revoke before building the directory

### Incremental Delivery

1. Setup and Foundational
2. User Story 1: access control
3. User Story 2: vendor directory
4. User Story 3: projects
5. User Story 4: links
6. User Story 5: schedules and overlap
7. User Story 6: per-task price and costing sheet
8. Polish: full seed, `npm run dev`, and quickstart

### Parallel Team Strategy

After User Story 1, one person can take vendors (User Story 2) and another can take projects (User Story 3). Links wait for both. Schedules wait for links. Pricing waits for schedules.

---

## Notes

- [P] tasks use different files and do not edit `api/src/app.ts` in the same wave
- Every acceptance scenario in spec.md is named on a Supertest task
- Do not add quotation, purchase-order, invoice, payment, or client-advance routes
- Checkbox rule (Constitution Principle V): a task is checked only when its applicable tests pass and every acceptance scenario mapped to it has a passing demonstration recorded in the quickstart.md "Demonstration log (T061)" under that file's "Done for a scenario" rules. A documentation-only task, as Principle V defines it, is checked when its documentation criteria are met, verified, reviewed, and approved, with that record kept on the task or in the pull request. Unchecked tasks that already have work behind them carry one of three endings. "Awaiting demonstration (T061): <scenario IDs>. Verify only; do not re-implement." marks a task that is implemented and tested. "Implemented or partially implemented; verification outstanding: <check>. Verify first; do not re-implement without evidence of a gap." marks a task whose own check has not been run. "Implemented as written; no automated test exists for <item>." marks a task that no test covers. A task is checked when its outstanding check, if any, is done and every listed scenario has a Pass row. T031, T036, T045, and T057 did not meet their own criteria; T073, T076–T077, T080, and T089 complete them. Unresolved: T004, T005, T007, T009, and T063 have no mapped acceptance scenario. T004, T005, T007, and T009 change configuration; T063 adds excluded-route assertions. They are not documentation-only tasks, so the documentation-only completion rule does not apply. They remain unchecked, and their completion under Principle V remains unresolved until a rule for tasks without mapped acceptance scenarios is approved. T063 must still meet its own criteria: the excluded-route assertions pass and the specified routes are absent. T090 and T064 run checks and have no mapped acceptance scenario. They stay open until their own completion criteria are verified, and checking them then raises the same unresolved question.
- Commit after each task or logical group
- Stop at any checkpoint and test that story alone
