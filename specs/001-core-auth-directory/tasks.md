---
description: "Task list for core auth and directory"
---

# Tasks: Core Auth and Directory

**Input**: Design documents from `/specs/001-core-auth-directory/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

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

- [X] T001 Create npm workspaces, root `package.json` with `engines.node` 24, and scripts `dev`, `lint`, `typecheck`, and `test` in `package.json`
- [X] T002 [P] Add Express, Prisma, Zod, bcrypt, multer, cors, TypeScript, Vitest, and Supertest dependencies in `api/package.json`
- [X] T003 [P] Add React, Vite, TypeScript, Vitest, and React Testing Library dependencies in `web/package.json`
- [X] T004 [P] Configure TypeScript projects in `api/tsconfig.json` and `web/tsconfig.json`
- [X] T005 [P] Configure ESLint and Prettier for both workspaces in `eslint.config.js` and `.prettierrc`
- [X] T006 [P] Add local placeholders for `DATABASE_URL`, `SESSION_SECRET`, `FILE_STORAGE_DIR`, `WEB_ORIGIN`, `API_PORT`, `WEB_PORT`, and the three seed passwords in `.env.example`
- [X] T007 [P] Ignore `.env` and `FILE_STORAGE_DIR` contents in `.gitignore`
- [X] T008 [P] Run PostgreSQL 17 only from `docker-compose.yml`
- [X] T009 [P] Run lint, typecheck, Prisma generate, migrate, and tests on pull requests in `.github/workflows/ci.yml`
- [X] T010 [P] Configure Vitest for the API in `api/vitest.config.ts` and for the web app in `web/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared middleware, and the first administrator. No user story starts before this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T011 Define the Prisma schema in `api/prisma/schema.prisma` with UUID `id`, `created_at`, `created_by`, `updated_at`, and `updated_by` on every table. Money columns are `DECIMAL(15,2)`. `staff_users.email` is unique and stored lowercase. `staff_users.role` is `ADMINISTRATOR`, `OFFICE_TEAM`, or `ACCOUNTANT`. `staff_users.revoked_at` null means active. `vendors.name` and `vendors.phone` are required. `vendors.gstin` is required when `gst_registered` is true, otherwise null, unique among non-null values, and a 15-character GSTIN. `vendors.team_size` is an optional whole number of zero or greater. `vendors.availability` is optional `AVAILABLE`, `LIMITED`, or `UNAVAILABLE`. `projects.status` is `PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED` and is independent of `archived`. `categories.name` is unique case-insensitively and is not rewritten when a matching name is submitted. `vendor_project_links` has unique `(vendor_id, project_id)` and no price or schedule dates. `work_schedules` stores `vendor_id` and `project_id` and has no foreign key to `vendor_project_links`. `task_price_entries.schedule_id` and `costing_sheet_files.schedule_id` use `ON DELETE RESTRICT`. `work_schedules.required_team_size` is a whole number of 1 or greater, `end_time` is later than `start_time`, and `pricing_mode` is `NONE`, `FIXED`, or `FILE`. `task_price_entries.kind` is `CHARGE` or `REVERSAL`. `costing_sheet_files.byte_size` is greater than 0 and at most 10 MB, with at most one `archived = false` row per schedule.
- [X] T012 Create the initial Prisma migration from `api/prisma/schema.prisma` under `api/prisma/migrations/`
- [X] T013 [P] Load environment variables in `api/src/config.ts`
- [X] T014 [P] Map Zod failures to HTTP 400 `{ message, fields }`, domain conflicts to HTTP 409, and unknown errors to HTTP 500 without logging passwords or storage keys in `api/src/middleware/error.ts`
- [X] T015 Set `created_by` and `updated_by` from the session on every write in `api/src/lib/audit.ts`
- [X] T016 Serve `GET /api/health` as public `200 { "status": "ok" }` and mount the error middleware in `api/src/app.ts`
- [X] T017 Reject missing, expired, revoked, and revoked-user sessions with HTTP 401 before any other business route in `api/src/middleware/session.ts`
- [X] T018 Allow any active role, and require `ADMINISTRATOR` only where a route asks, in `api/src/middleware/require-role.ts`
- [X] T019 Start the HTTP server from `api/src/server.ts`
- [X] T020 Seed one administrator whose `created_by` is its own id, using the admin password from `.env`, in `api/prisma/seed.ts`

**Checkpoint**: Foundation ready. User story implementation can now begin.

---

## Phase 3: User Story 1 - Sign in and manage who has access (Priority: P1) 🎯 MVP

**Goal**: An administrator creates staff, they sign in with email and password, and a revoked account is refused on the next request and on the next sign-in.

**Independent Test**: Create an administrator and one staff account, sign in as the staff member, revoke that account, and confirm the next request and a new sign-in are refused.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T021 [P] [US1] Write a failing unit test that refuses a change leaving zero active administrators in `api/tests/unit/last-admin.test.ts`
- [X] T022 [P] [US1] Write a failing unit test that uses the message `Email or password is not valid.` for an unknown email, a wrong password, and a revoked account in `api/tests/unit/sign-in-message.test.ts`
- [X] T023 [P] [US1] Write failing Supertest coverage for spec User Story 1 scenarios 1–7 against `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/password`, and `/api/staff` in `api/tests/api/auth.test.ts`
- [X] T024 [P] [US1] Write a failing sign-in form test in `web/tests/sign-in.test.tsx`

### Implementation for User Story 1

- [X] T025 [US1] Hash passwords with bcrypt and reject passwords shorter than 8 characters in `api/src/lib/passwords.ts`
- [X] T026 [US1] Implement login, logout, `GET /api/auth/me`, and own-password change in `api/src/modules/auth/routes.ts`. The caller cannot change their own role.
- [X] T027 [US1] Implement administrator-only create, list, and patch of staff, including revoke, restore, role change, and password set, in `api/src/modules/staff/routes.ts`. Email uniqueness includes revoked accounts. The last active administrator cannot be revoked or moved to another role, returning 409 `The firm must keep one active administrator.`
- [X] T028 [US1] Mount auth routes as public only for `POST /api/auth/login`, and staff routes behind `require-role(ADMINISTRATOR)`, in `api/src/app.ts`
- [X] T029 [US1] Send the session cookie from the browser client in `web/src/api/client.ts`
- [X] T030 [P] [US1] Build the sign-in screen in `web/src/pages/sign-in.tsx`
- [X] T031 [P] [US1] Build the staff screen that hides nothing the API must still refuse in `web/src/pages/staff.tsx`

**Checkpoint**: User Story 1 works alone. Office and accountant callers receive 403 on `/api/staff`.

---

## Phase 4: User Story 2 - Keep a searchable vendor directory (Priority: P2)

**Goal**: Authorized staff create one vendor with the full directory model, search and filter it, archive it, and keep rating and note history.

**Independent Test**: Sign in, add a vendor with name, phone, and one category, find it by category and location, archive it, and open it again from archived records.

### Tests for User Story 2 ⚠️

- [X] T032 [P] [US2] Write failing unit tests for GSTIN required when registered, duplicate GSTIN, duplicate-phone warning, rating 1–5, archived vendors omitted unless `include_archived=true`, and case-insensitive category reuse that keeps the stored name in `api/tests/unit/vendor-rules.test.ts`
- [X] T033 [P] [US2] Write failing Supertest coverage for spec User Story 2 scenarios 1–9, including `POST /api/categories` returning the existing row without renaming it, in `api/tests/api/vendors.test.ts`
- [X] T037 [P] [US2] Write the failing vendor filter form test in `web/tests/vendor-filters.test.tsx` before the vendor screens exist

### Implementation for User Story 2

- [X] T034 [US2] Implement vendor create, patch, get, search, archive, restore, notes, ratings, and category reuse in `api/src/modules/vendors/routes.ts`. Require `name`, `phone`, and at least one category. `q` matches name, phone, alternate phone, contact person, services, and materials. Filters for `category_id`, `location`, `availability`, and `project_id` all apply together. A repeated phone returns 409 `PHONE_IN_USE` until `confirm_duplicate_phone` is true. Notes are append-only with `note_type` `PAST_WORK`, `RELIABILITY`, `COORDINATION`, or `GENERAL` and a non-empty `body`. A rating `score` is a whole number 1 through 5. Indicative `rates.amount` is `DECIMAL(15,2)`, zero or greater, with at most two decimal places. Match a category name without regard to letter case, reuse that row, and do not change its stored name.
- [X] T035 [US2] Mount vendor and category routes for any active role in `api/src/app.ts`
- [X] T036 [P] [US2] Build the vendor list and vendor detail screens in `web/src/pages/vendors.tsx` and `web/src/pages/vendor-detail.tsx`

**Checkpoint**: User Stories 1 and 2 work. Vendor GET does not include task prices.

---

## Phase 5: User Story 3 - Keep a project list (Priority: P3)

**Goal**: Staff create, update, archive, and restore projects. Completed stays on the default list until archived.

**Independent Test**: Create a project, set status to Completed, archive it, confirm it leaves the default list, and open it by id.

### Tests for User Story 3 ⚠️

- [X] T038 [P] [US3] Write failing Supertest coverage for spec User Story 3 scenarios 1–4 in `api/tests/api/projects.test.ts`

### Implementation for User Story 3

- [X] T039 [US3] Implement project create, patch, list, get, archive, and restore in `api/src/modules/projects/routes.ts`. `name` is required. Default `GET /api/projects` includes every status and excludes `archived = true`.
- [X] T040 [US3] Mount project routes for any active role in `api/src/app.ts`
- [X] T041 [P] [US3] Build the project list screen in `web/src/pages/projects.tsx`

**Checkpoint**: Projects can be managed without vendor links.

---

## Phase 6: User Story 4 - Link a vendor to projects without copying the vendor (Priority: P4)

**Goal**: One vendor links to many projects. The link stores only role, scope, and note.

**Independent Test**: Create one vendor and two projects, link the vendor to both, and confirm the directory still has one vendor record.

### Tests for User Story 4 ⚠️

- [X] T042 [P] [US4] Write failing Supertest coverage for spec User Story 4 scenarios 1–5 in `api/tests/api/links.test.ts`. Include link removal that archives the pair’s schedules and still returns their price history and costing-sheet files to an authorized caller, with those rows still present.

### Implementation for User Story 4

- [X] T043 [US4] Implement create, patch, and delete of links in `api/src/modules/links/routes.ts`. Accept only `vendor_id`, `role_on_project`, `scope_of_work`, and `note`. Return 409 when the pair exists or either side is archived. On delete, archive working schedules for that vendor and project in the same transaction, then delete only the link row. Do not delete the vendor, the schedules, `task_price_entries`, or `costing_sheet_files`, and do not copy contact details, rates, or manpower onto the link. Rely on the schema from T011 so the database cannot cascade the link delete onto those rows.
- [X] T044 [US4] Mount link routes for any active role in `api/src/app.ts`
- [X] T045 [US4] Show and edit links on the project screen in `web/src/pages/project-detail.tsx`

**Checkpoint**: Linking does not duplicate vendors. Schedules are not required yet.

---

## Phase 7: User Story 5 - Schedule vendor work on a project (Priority: P5)

**Goal**: Staff schedule a linked vendor with task, date, start, end, and required team size. Overlaps are flagged and still saved.

**Independent Test**: Link one vendor, schedule 09:00–12:00, schedule 11:00–13:00 on any project, and confirm both rows exist and the second response names the first conflict.

### Tests for User Story 5 ⚠️

- [X] T046 [P] [US5] Write failing unit tests for half-open overlap `[start, end)`, cross-project overlap, different vendors in the same window, and availability ignored in `api/tests/unit/overlap.test.ts`
- [X] T047 [P] [US5] Write failing Supertest coverage for spec User Story 5 scenarios 1–6 in `api/tests/api/schedules.test.ts`

### Implementation for User Story 5

- [X] T048 [US5] Implement half-open overlap for the same `vendor_id` and `work_date` among `archived = false` rows in `api/src/lib/overlap.ts`
- [X] T049 [US5] Implement schedule create, get, patch, and archive in `api/src/modules/schedules/routes.ts`. Require an existing link and both records `archived = false`. Require `task`, `work_date`, `start_time`, `end_time` later than `start_time`, and `required_team_size` as a whole number of 1 or greater. Return `conflicts` on 201 without turning overlap into 409. Do not copy vendor fields onto the schedule. Exclude archived schedules from the working project view.
- [X] T050 [US5] Mount schedule routes for any active role in `api/src/app.ts`
- [X] T051 [P] [US5] Add the schedule form to `web/src/pages/project-detail.tsx` and cover it in `web/tests/schedule-form.test.tsx`

**Checkpoint**: Schedules save with conflicts visible. Pricing mode stays `NONE`.

---

## Phase 8: User Story 6 - Price a job without changing the vendor (Priority: P5)

**Goal**: Each scheduled task has its own fixed price or one spreadsheet/PDF costing sheet. The vendor profile is unchanged.

**Independent Test**: Put two different fixed prices on two schedules for one vendor, attach a PDF to a third unpriced schedule, and confirm vendor GET still shows only indicative rates. Download the file with a session, and receive 401 without one.

### Tests for User Story 6 ⚠️

- [X] T052 [P] [US6] Write failing unit tests for price-or-file exclusivity, a reversal plus a new charge, and rejection of a negative amount or a third decimal place in `api/tests/unit/price.test.ts`
- [X] T053 [P] [US6] Write failing Supertest coverage for spec User Story 6 scenarios 1–7, including unauthenticated download 401, in `api/tests/api/pricing.test.ts`

### Implementation for User Story 6

- [X] T054 [US6] Insert a `REVERSAL` of the current charge and a new `CHARGE` when a fixed price changes, and refuse a charge while `pricing_mode` is `FILE`, in `api/src/lib/price.ts`. Amounts are `DECIMAL(15,2)`, zero or greater, with at most two decimal places.
- [X] T055 [US6] Store costing sheets under `FILE_STORAGE_DIR` and stream them only from `GET /api/schedules/:scheduleId/costing-sheets/:fileId` in `api/src/modules/files/routes.ts`. Accept `.xls`, `.xlsx`, `.csv`, and `.pdf` up to 10 MB. Refuse a file while `pricing_mode` is `FIXED`. Replacing a file sets the previous row `archived = true` and keeps the bytes. There is no static file URL.
- [X] T056 [US6] Mount `PUT /api/schedules/:id/price` and the costing-sheet routes for any active role in `api/src/app.ts`
- [X] T057 [US6] Add per-task price and file controls on `web/src/pages/project-detail.tsx` without writing the task price onto the vendor screen in `web/src/pages/vendor-detail.tsx`

**Checkpoint**: Two tasks for one vendor can show two prices. A signed-out download is refused.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Seed data, one-command startup, and the quickstart demonstration

- [X] T058 Extend `api/prisma/seed.ts` so it is idempotent and also loads categories, vendors, two projects, one vendor linked to both, two schedules with different fixed prices, and one schedule with a sample PDF
- [X] T059 Start compose, migrate, seed, and both dev servers from the root `dev` script in `package.json` using concurrently
- [X] T060 Make sign-in, vendor search, project open, and schedule entry usable at 375px and 1280px in `web/src/styles.css`
- [ ] T061 Run the API and web scenarios in `specs/001-core-auth-directory/quickstart.md` and fix only defects those scenarios expose
- [X] T062 [P] Verify SC-003 in `api/tests/api/vendor-lookup-timing.test.ts`. Conditions: PostgreSQL 17 from `docker-compose.yml`, one API process, 200 vendors each with one category and one location, then `GET /api/vendors` filtered by that category and location. The call must return the matching vendor in under 30 seconds. Do not change the 30-second limit in `specs/001-core-auth-directory/spec.md`.
- [X] T063 [P] Add a Supertest check in `api/tests/api/excluded-routes.test.ts` that Feature 001 does not expose quotation, purchase-order, invoice, or payment routes. Assert those paths are absent. Do not implement that functionality.
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
- Commit after each task or logical group
- Stop at any checkpoint and test that story alone
