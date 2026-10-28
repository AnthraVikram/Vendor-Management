# Implementation Plan: Core Auth and Directory

**Branch**: `001-core-auth-directory` | **Date**: 2026-10-26, revised 2026-10-27 for the spec clarifications and constitution 1.1.0 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-core-auth-directory/spec.md`

## Summary

Staff sign in with email and password. Administrators create and revoke accounts. Every active role can maintain the vendor directory, projects, vendor-project links, work schedules, and a price that belongs only to a scheduled task. A task carries either a fixed agreed price or one spreadsheet or PDF costing sheet, and staff switch methods by clearing the current one first.

The implementation is a TypeScript monorepo: an Express API in `api/` and a React app in `web/`, PostgreSQL 17 through Prisma, and session cookies. One root command starts the database, migrates, seeds, and runs both apps. CI runs lint, typecheck, and tests. Quotation comparison, purchase orders, invoices, payments, and client advances are not built.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 Active LTS

**Primary Dependencies**: Express, React, Prisma, Zod, bcrypt, multer, cors. Dev: Vitest, Supertest, ESLint, Prettier, concurrently, React Testing Library

**Storage**: PostgreSQL 17 for records. Costing-sheet bytes on the local disk under `FILE_STORAGE_DIR`, downloaded only through an authenticated API route

**Testing**: Vitest for business rules and web forms. Supertest for every acceptance scenario in the spec

**Target Platform**: Responsive web app for a desktop browser and a phone browser. The API runs on Node.js beside PostgreSQL 17

**Project Type**: Internal web application, `api/` and `web/` in one repository

**Performance Goals**: From 200 vendors, a category and location filter returns in under 30 seconds, matching SC-003. Directory sizes beyond a single firm are out of scope

**Constraints**: Money is `DECIMAL(15,2)` INR. No public document URL. No offline mode, PWA, or native client. Server-side validation and role checks on every business route. Archive instead of hard delete for vendors, projects, documents, and task prices

**Scale/Scope**: One firm, three roles, the vendor directory, projects, links, schedules, and per-task pricing described in the spec. Seeded local data is enough to exercise the quickstart

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Before research | After design |
| --- | --- | --- |
| Spec exists and lists FR-01, FR-02, FR-03, FR-04, FR-14, FR-17, and FR-18. No `NEEDS CLARIFICATION` remains in the spec | Pass | Pass. The 2026-10-27 clarifications settled own-role change, password-reset sessions, pricing-method switch, upload size, and touching times in the spec |
| Phase 1 scope matches `docs/prd.md` (Principles I and VI) | Open | Pass. `docs/prd.md` numbers scheduling FR-17 and per-task pricing FR-18 in section 7 and lists both in the Phase 1 scope |
| Stack is TypeScript, Node LTS, Express, React, PostgreSQL 17, Prisma, Vitest, Supertest, ESLint, Prettier | Pass | Pass. Research records each added runtime package |
| Repository shape is `api/` and `web/`, with one command that migrates and seeds | Pass | Pass. Root `npm run dev` |
| Tables carry audit columns. Money is `DECIMAL(15,2)`. Protected rows are archived. Foreign keys and Prisma migrations are required. Deleting a link does not cascade to schedules, prices, or costing sheets | Pass | Pass. See [data-model.md](./data-model.md) |
| Every business route checks the session and the role. Passwords use bcrypt. Secrets stay in `.env`. Files have no public URL. Zod validates input | Pass | Pass. See [contracts/http-api.md](./contracts/http-api.md) |
| Each acceptance scenario gets an automated test. Business rules are tested first. A task is done when its tests pass and its acceptance scenario is demonstrated; a documentation-only task is done under Principle V's documentation rule (constitution 1.1.0). CI runs lint, typecheck, and tests. `/speckit-converge` must report Converged before a pull request | Pass | Pass. Tests are in the task list. Demonstrations are recorded in the quickstart.md T061 log. T064 runs `/speckit-converge` |
| No quotation, purchase-order, invoice, payment, or client-advance behavior | Pass | Pass. Those tables and routes are absent |
| Responsive web only | Pass | Pass. Plain CSS, no PWA |

No gate fails. Complexity tracking is empty.

Scheduling and per-task pricing are FR-17 and FR-18 in `docs/prd.md`. Phase 2 procurement stays out.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-auth-directory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-api.md
└── tasks.md              # /speckit-tasks, not this command
```

### Source Code (repository root)

```text
api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── server.ts
│   ├── app.ts
│   ├── config.ts
│   ├── middleware/
│   │   ├── session.ts
│   │   ├── require-role.ts
│   │   └── error.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── staff/
│   │   ├── vendors/
│   │   ├── projects/
│   │   ├── links/
│   │   ├── schedules/
│   │   └── files/
│   └── lib/
│       ├── money.ts
│       ├── overlap.ts
│       └── passwords.ts
└── tests/
    ├── unit/
    └── api/

web/
├── src/
│   ├── main.tsx
│   ├── styles.css
│   ├── api/
│   ├── pages/
│   │   ├── sign-in.tsx
│   │   ├── vendors.tsx
│   │   ├── vendor-detail.tsx
│   │   ├── projects.tsx
│   │   ├── project-detail.tsx
│   │   └── staff.tsx
│   └── components/
└── tests/

.github/workflows/ci.yml
docker-compose.yml
.env.example
package.json
```

**Structure Decision**: Constitution Principle II fixes `api/` and `web/`. npm workspaces sit at the root so one install and one `dev` script serve both. Prisma schema, migrations, and seed live in `api/prisma`. Business rules that must be tested first live in `api/src/lib` with no HTTP. The web app calls the API and does not talk to PostgreSQL.

## Architecture

The browser talks only to the React app. The React app sends cookies to the Express API. Express checks the session, checks the role, validates the body with Zod, then calls one module. Modules use Prisma. File bytes are written by the files module and are never registered with static middleware.

Module boundaries:

- **auth** signs in, signs out, and changes the caller's password.
- **staff** is the only module that creates or revokes accounts. Its routes require `ADMINISTRATOR`.
- **vendors** owns the directory, categories, labels, indicative rates, notes, ratings, search, and archive.
- **projects** owns project fields, status, and archive.
- **links** owns role, scope, and note. It does not accept a price or a date.
- **schedules** owns the task, date, times, team size, overlap flag, and pricing mode.
- **files** stores and streams costing sheets for a schedule.

A module does not import another module's Prisma queries except for the checks the spec requires: creating a schedule reads the link and the archived flags; deleting a link archives that pair's schedules. Vendor `GET` does not read task prices.

## Authorization

`session.ts` runs before every route except login and health. It loads the session and the staff row. Missing, expired, revoked, or attached to a revoked user becomes 401 with no further work.

`require-role.ts` allows any active role on vendor, project, link, schedule, and file routes. Staff-management routes add `require-role(ADMINISTRATOR)`. A non-administrator receives 403 even if the web page hid the control.

Sign-in returns one message for unknown email, wrong password, and revoked account. The last active administrator cannot be revoked or given another role. The check runs in the staff module inside a transaction that counts active administrators.

No one changes their own role. `PATCH /api/staff/:id` with a `role` that differs from the stored role is refused with 403 `OWN_ROLE` when the target is the caller. This check runs before the last-administrator check, so a lone administrator demoting themselves receives `OWN_ROLE`.

When an administrator sets another person's password, the same transaction revokes every open session of that person, exactly as revoke does. Changing one's own password through `POST /api/auth/password` does not end other sessions; the spec does not ask for it.

Staff changes lock the rows they depend on. The staff transaction locks the target row and the active administrator rows with `SELECT … FOR UPDATE` before counting, so two concurrent revokes or demotions cannot both pass the last-administrator check, and a second concurrent revoke sees the first and returns `ALREADY_REVOKED`.

## Documents

`FILE_STORAGE_DIR` is an absolute directory outside the web build. The database stores the relative key, original name, media type, and size. `GET /api/schedules/:scheduleId/costing-sheets/:fileId` checks the session, then streams the file. Replacing a sheet archives the old row and leaves the old bytes in place. This feature does not add a retention sweeper. Not deleting the bytes is what keeps the sheet recoverable.

## Error handling

Zod failures become 400 with `fields`. Domain refusals use 409 and a stable `code` where the client must branch (`PHONE_IN_USE`, duplicate GSTIN, duplicate link, last administrator, already revoked, price and file together, clearing a method the task does not use). A caller changing their own role receives 403 `OWN_ROLE`. Schedule overlap is a successful save plus a `conflicts` array. Unknown errors become 500 with a generic message and a server log. Passwords, session secrets, and storage keys are not logged.

## Data integrity

Audit columns are set in one Prisma helper used by every write. The helper sets `created_by` and `updated_by` from the session, except the seed administrator, whose `created_by` is itself.

Indicative rates are directory data and may be updated in place. A task's agreed price is corrected only by inserting a reversal and a new charge. Clearing a fixed price inserts a reversal of the open charge and sets `pricing_mode` to `NONE`. Clearing a costing sheet archives the current file row, keeps the bytes, and sets `pricing_mode` to `NONE`. The task can then take the other method. The price and file transactions lock the schedule row with `SELECT … FOR UPDATE`, so a concurrent price save and upload cannot leave both methods current. Amounts are Prisma `Decimal` values mapped to `DECIMAL(15,2)`. The money helper rejects a negative charge and more than two decimal places before insert.

Deleting a link archives schedules for that vendor and project in the same transaction, then deletes the link row. Schedules have no foreign key to the link. Price entries and costing-sheet files restrict deletion of their schedule. Vendors and projects are archived, not deleted.

## Testing strategy

Write the unit tests in `api/tests/unit` first, and leave them failing until the helpers exist:

- Half-open overlap, including a booking that starts when another ends, a cross-project overlap, and two vendors in the same window
- Availability status ignored by the overlap helper
- Fixed price versus current file
- Reversal plus new charge, with the previous amount still readable
- GST registered without GSTIN, duplicate GSTIN, duplicate phone warning
- Last administrator
- Identical sign-in failure for unknown, wrong, and revoked
- Default vendor query excludes archived rows
- Category reuse keeps the stored name
- Link removal archives schedules and leaves prices and costing sheets in place
- A directory of 200 vendors answers a category and location filter in under 30 seconds
- Quotation, purchase-order, invoice, and payment routes are absent
- An administrator changing their own role is refused, including the lone administrator
- An administrator setting another person's password ends that person's open sessions
- Clearing a fixed price writes a reversal and allows a costing sheet; clearing a costing sheet archives it and allows a fixed price; both histories stay readable with date and author
- A file over 10 MB is refused

Then add Supertest cases for the acceptance scenarios in spec User Stories 1 through 6, using the routes in [contracts/http-api.md](./contracts/http-api.md). Web tests cover the sign-in form, the vendor filters, and the schedule form. The vendor filter test is written before that screen. Layout on a phone width and a desktop width is the quickstart demonstration. `/speckit-converge` is the last check before a pull request.

## Delivery

`docker-compose.yml` runs PostgreSQL 17 only. Root scripts:

- `dev` starts compose, waits for the database, runs `prisma migrate deploy`, runs the seed, then starts the API and the web app through concurrently
- `lint`, `typecheck`, and `test` run in both workspaces
- `test` starts from a migrated test database and does not depend on the developer's manual SQL

`.env.example` lists `DATABASE_URL`, `SESSION_SECRET`, `FILE_STORAGE_DIR`, `WEB_ORIGIN`, `API_PORT`, `WEB_PORT`, and the three seed passwords, with local placeholder values. `.env` is gitignored.

GitHub Actions on pull requests: checkout, Node 24, `npm ci`, Prisma generate, PostgreSQL 17 service, migrate, `lint`, `typecheck`, `test`. No deploy job.

Seed is idempotent. It upserts the three staff accounts, categories, vendors, projects, links, two differently priced schedules, and one schedule whose costing sheet is a tiny PDF in the storage directory.

## Implementation order

The order is for `/speckit-tasks`. This command does not write application code.

1. Workspace, tooling, compose, env example, CI, Prisma migration for the data model, seed, and the audit helper.
2. Session auth and staff administration, with the business-rule tests already written.
3. Vendors, categories, search, archive, ratings, and notes.
4. Projects and links.
5. Schedules, overlap, task price entries, and costing-sheet upload and download.
6. React screens for those flows, then the quickstart demonstration.

## Unresolved items

These do not change the approved product behavior. They are recorded so implementation does not invent a second rule.

- **Stack notes.** Principle II, this plan, and `docs/prd.md` section 12 use PostgreSQL 17 and Prisma. The PRD still recommends JWT and Tailwind. This plan keeps server sessions and plain CSS, as recorded in research.
- **Administrator setting their own password through the staff route.** FR-005 covers another person's password and FR-009 covers one's own through `POST /api/auth/password`, which requires the current password. `PATCH /api/staff/:id` on the caller's own id with `password` currently skips that check. The spec does not decide this. This plan does not change it; it goes to `/speckit-clarify`.
- **Vendor PATCH behavior.** The contract says `PATCH /api/vendors/:id` "updates directory fields". The current code reuses the create schema. It requires `name`, `phone`, and `category_ids`, empties omitted `locations`, `services`, `materials`, and `rates`, resets omitted `team_size`, `availability`, and GST fields, and leaves omitted text fields unchanged. The spec does not define update semantics. This plan does not choose between full replacement and partial update; the product owner decides.
- **Completion of tasks without a mapped acceptance scenario.** Principle V (constitution 1.1.0) has no completion rule for tasks that change configuration or tests, or run checks, but map to no acceptance scenario. That covers T004, T005, T007, T009, T063, T090, and T064. tasks.md records them as unresolved. This is a governance decision, not a design change.
- **Retention job.** Costing sheets are not deleted. A seven-year deletion or review workflow is FR-16 and is not built here.

## Complexity Tracking

No constitution violation requires a justification. No extra service, native client, or phase-2 module is introduced.
