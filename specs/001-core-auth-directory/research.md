# Research: Core Auth and Directory

## Decision: PostgreSQL 17 and Prisma

**Rationale**: Constitution Principle II names PostgreSQL 17 and Prisma. Schema changes go through committed Prisma migrations. Foreign keys are enforced in the database.

**Alternatives considered**: `docs/prd.md` section 12 names the same database and ORM: PostgreSQL 17 and Prisma. No second ORM is added.

**Documentation follow-up**: Principle II requires PostgreSQL 17 and Prisma, and the rationale now says that. The PRD also recommends JWT and Tailwind. Those stay out of this feature for the reasons below.

## Decision: Node.js 24 Active LTS, Express, React, Vitest, Supertest, ESLint, Prettier

**Rationale**: Principle II requires Node LTS and those tools. As of 2026-10-23, Node 24 is the Active LTS line. The root `package.json` engines field and CI use Node 24.

**Alternatives considered**: Node 22 remains a Maintenance LTS. Active LTS is the line this plan pins.

## Decision: One repository, `api/` and `web/`, npm workspaces

**Rationale**: Principle II requires `api/` and `web/` and one command that starts both with seed data. npm workspaces keep a single install. The root `dev` script starts PostgreSQL, applies migrations, seeds, and runs both apps.

**Alternatives considered**: A third `packages/shared` workspace. Rejected. Server validation is the authority. The web app may repeat field checks for messages. Sharing a schema package is extra structure this feature does not need.

## Decision: HTTP API with a server-side session cookie

**Rationale**: Sign-in, sign-out, and immediate refusal after revoke are the spec. A session row in PostgreSQL plus an httpOnly cookie makes revoke take effect on the next request: the API loads the session and rejects it when the account is revoked. The cookie is `SameSite=Lax`, `HttpOnly`, and `Secure` outside local development.

**Alternatives considered**: JWT access and refresh tokens, which `docs/prd.md` section 12 recommends. Rejected. Immediate revoke would need a token denylist, which is a second session store. The constitution requires the simplest design that meets the spec.

## Decision: Zod validates every request body, query, and path parameter

**Rationale**: Principle IV requires a schema library on the server even when the browser already checks input. One library keeps field errors consistent.

**Runtime dependency**: `zod` — Validate every API input with one schema library, as required by Principle IV.

## Decision: bcrypt hashes passwords

**Rationale**: Principle IV requires bcrypt. The hash is never returned. Passwords are at least 8 characters, from the spec.

**Runtime dependency**: `bcrypt` — Hash staff passwords, as required by Principle IV.

## Decision: Local private files for costing sheets

**Rationale**: A costing sheet is one spreadsheet or PDF on a scheduled task. Principle IV says documents are served only through an authenticated endpoint and have no public URL. Bytes live under `FILE_STORAGE_DIR`, outside `web/` and outside Express static files. Download is `GET /api/schedules/:scheduleId/costing-sheets/:fileId` after the session check. Replacing a file archives the previous row and keeps the bytes. This feature does not delete document bytes.

**Alternatives considered**: Object storage, which the PRD lists as a later upgrade. Rejected for this feature. No storage-provider interface is built.

**Runtime dependency**: `multer` — Parse multipart uploads for costing-sheet files. Express does not parse multipart bodies.

## Decision: Spreadsheet or PDF means `.xls`, `.xlsx`, `.csv`, or `.pdf`

**Rationale**: The spec refuses a file that is not a spreadsheet or PDF. The API checks the extension and the leading bytes. CSV is included because it is a spreadsheet the firm can attach without a new product type. Other types, including images and Word documents, are refused.

**Operational limit**: Files larger than 10 MB are refused. The spec does not set a size. This is an operational guard so one upload cannot fill the disk. It is recorded here so it can be changed without a product change.

## Decision: Overlap uses half-open times on one date

**Rationale**: A conflict is the same vendor, the same date, and two active schedules whose times overlap, on any project. Intervals are `[start, end)`. A task that ends at 10:00 and another that starts at 10:00 do not conflict. Different vendors never conflict with each other. Archived schedules are excluded from the check. The vendor availability status is not an input to the check. The API still saves the schedule and returns the conflicting rows.

**Alternatives considered**: Treating a shared endpoint as overlap. Rejected. The spec asks for overlapping times, and a booking that starts when another ends is sequential work.

## Decision: Task prices use reversing entries; indicative rates do not

**Rationale**: Principle III says money is `DECIMAL(15,2)` in INR, never float, and a financial correction is a new reversing entry. A task's agreed price is money on that task. Changing it inserts a reversal of the previous amount and a new charge. The screen shows the latest charge and the earlier amounts with date and author. Indicative vendor rates are directory labels, not task prices, quotations, or payments. Editing an indicative rate updates that directory row.

A task is either unpriced, fixed-price, or file-priced. Setting a fixed price while a current costing sheet exists is refused, and attaching a file while a current fixed price exists is refused. This feature does not switch a task from one method to the other.

## Decision: Removing a link or a schedule hides working rows and keeps prices and files

**Rationale**: Principle III forbids hard deletes of vendors, projects, documents, and financial records. A vendor-project link is none of those, so the link row may be deleted. Schedules on that pair leave the working project view by setting `archived` true. Their price entries and costing-sheet files stay readable. Removing a schedule uses the same archive flag. Vendor and project archive flags are separate from project status.

## Decision: First administrator comes from seed

**Rationale**: The spec forbids a state with no active administrator and forbids self-registration. Seed creates the first administrator and sets `created_by` and `updated_by` to that same row. Local seed passwords come from `.env`, with placeholders only in `.env.example`.

## Decision: Plain CSS in the React app

**Rationale**: The constitution names React and does not name a styling library. The PRD recommends Tailwind. Adding it is an extra dependency the spec does not need. One stylesheet covers the phone and desktop widths in the success criteria.

**Dev dependency**: `concurrently` — Run the API and web dev servers from the one root command required by Principle II.

**Runtime dependency**: `cors` — Allow the local web app on another port to send the session cookie to the API. The allowed origin is `WEB_ORIGIN` only.

## Decision: Tests

**Rationale**: Principle V requires an automated test for every acceptance scenario, business-rule tests written first, and CI running lint, typecheck, and tests.

Business rules are Vitest units with no HTTP: overlap, half-open boundaries, price-or-file exclusivity, reversing entries, GSTIN required when registered, duplicate GSTIN, uniform sign-in failure, last administrator, archive excluded from the default directory, money scale.

Acceptance scenarios are Supertest tests against the Express app and a PostgreSQL database. The web app has Vitest tests for the sign-in form, the vendor filter form, and the schedule form submitting the fields the API expects. Phone and desktop layout are checked in `quickstart.md`, not by a browser farm.

**Dev dependency**: `@testing-library/react` — Render the sign-in, vendor filter, and schedule forms in Vitest.

## Dependencies not added

Quotation comparison, purchase orders, invoices, vendor payments, client advances, milestones, spreadsheet import, a general document library, email password reset, project assignment, JWT, Tailwind, object storage, PWA, and offline support.
