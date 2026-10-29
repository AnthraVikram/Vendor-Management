# Implementation Plan: Import, Documents, and Advances

**Branch**: `003-import-documents-advances` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-import-documents-advances/spec.md`

## Summary

This feature adds five things:

- **Client advances**: Administrators and Accountants record advances against a project and correct them only by full-amount reversals. All staff see each project's advances and its net amount.
- **Vendor import**: staff import vendors from `.xlsx` or `.csv`. Every row gets a preview outcome, and the person who uploaded the file approves possible duplicates. Confirmation saves the whole eligible batch or nothing, and repeating it is safe. A preview expires after 30 minutes.
- **Documents**: staff upload documents to vendors and projects. Documents are archived, never deleted, and served only to signed-in staff.
- **Dashboard tiles**: counts of vendors and projects, plus money tiles for advances that still stand, with each reversal counted against the month its advance was received.
- **History**: one append-only history covers the changes the spec names. It starts when this feature is deployed.

The implementation extends the Feature 001 and Feature 002 codebase on this branch. It adds one Prisma migration, four API modules, and one pure-rule library per business rule. It adds one runtime dependency, `exceljs`, for reading and writing `.xlsx`. Four small Feature 001 changes:
- the phone duplicate rule
- a lock shared by vendor writes and import
- history writes in the vendor and project routes
- a `status` filter on the project list

The web app adds an import page, an import history page, document, advance, and history sections, and dashboard tiles.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 Active LTS, as in Features 001 and 002

**Primary Dependencies**: The Feature 001 set: Express, React, Prisma, Zod, bcrypt, multer, and cors. One addition: `exceljs` 4.4.0, to read the first sheet of `.xlsx` files as a stream and to write the template (research.md). CSV is parsed in-house. No new dev dependency

**Storage**: PostgreSQL 17 through Prisma, with seven new tables and one new nullable column on `vendors` in one migration. Documents go in the existing private `FILE_STORAGE_DIR`

**Testing**: Rules get Vitest unit tests written first: phone key, CSV parser, headings, row validation, duplicate detection, document content check, month bounds, and history diff. Supertest covers every acceptance scenario in US1 to US5, including the forced-failure and parallel-confirm cases. Vitest and React Testing Library cover the import preview, the advances section, the document section, and the dashboard tiles

**Target Platform**: Responsive web app in phone and desktop browsers. The API runs on Node.js beside PostgreSQL 17

**Project Type**: Internal web application, `api/` and `web/` in one repository

**Performance Goals**:
- A 1,000-row file previews in under 5 seconds on the local database.
- The confirm transaction finishes inside its 60-second limit.
- SC-001 (500 rows from upload to summary in under 10 minutes) is mostly the person's review time.
- The dashboard summary and the advance lists return in under 1 second at the stated volume: hundreds of vendors, tens of projects, and hundreds of advances.

**Constraints**:
- Advances, reversals, import runs and rows, and history entries are insert-only.
- Documents have no delete path.
- Money is `DECIMAL(15,2)` and is summed in the database.
- Every route checks the session, and role or ownership where the spec requires it, on the server.
- Zod validates every request.
- No background jobs, no notifications, and no object storage.

**Scale/Scope**: One firm and three roles. The spec has five user stories, 34 functional requirements (FR-001 to FR-030, plus FR-008a to FR-008d), and 11 success criteria

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution version 1.1.0, from the `002-timelines-delays` baseline.

| Gate | Before research | After design |
| --- | --- | --- |
| I. Spec exists and lists FR-07, FR-08, FR-09, FR-15, FR-16. No `NEEDS CLARIFICATION`. Agent chose no product default | Pass. 13 product decisions are recorded in Clarifications. The last one, who may confirm a preview, was answered by the product owner when this command started | Pass. No product question is outstanding. One reading of the spec text is recorded under Unresolved items, item 1 |
| II. Stack fixed. Each new runtime dependency has a one-line reason in research | Pass | Pass. `exceljs` only, with its reason in [research.md](./research.md) |
| II. `api/` and `web/`, one start command that seeds | Pass | Pass. Root `npm run dev` unchanged, seed extended |
| III. Audit columns on every table, database foreign keys, committed Prisma migrations, protected records archived | Pass | Pass. Every new table has the five audit columns. Polymorphic history uses one foreign key per target with a check constraint. Documents are archived, never deleted. See [data-model.md](./data-model.md) |
| III. Money `DECIMAL(15,2)` in INR, append-only, corrections by reversing entry | Pass. FR-019 and FR-020 | Pass. Advances and reversals are insert-only, with check constraints `amount > 0`. "Reversed" is derived, never updated |
| IV. Server checks auth and role on every route. Documents only through an authenticated route. Zod on all input | Pass | Pass. See [contracts/http-api.md](./contracts/http-api.md). Downloads are attachments with `nosniff`. Previews are owner-checked |
| V. Automated test for every acceptance scenario, business rules tested first, CI green, `converge` Converged | Pass | Pass. See Testing strategy and [quickstart.md](./quickstart.md) |
| VI. Simplest design, responsive web only, no PRD Phase 2 or 3 | Pass. FR-029 excludes payments, invoices, allocation, exports, and version replacement | Pass. No job, queue, object store, or Phase 2 or 3 code. Expired previews are left in place rather than cleaned up by a job |

No gate fails. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-import-documents-advances/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-api.md
├── checklists/
│   └── requirements.md
└── tasks.md              # /speckit-tasks, not this command
```

### Source Code (repository root)

New files are marked `+`. Changed Feature 001 or Feature 002 files are marked `~`.

```text
api/
├── ~ package.json                        # + exceljs 4.4.0
├── prisma/
│   ├── ~ schema.prisma                   # 5 enums, 7 models, vendors.import_run_id
│   ├── migrations/
│   │   └── + 20261029120000_import_documents_advances/migration.sql
│   └── ~ seed.ts                         # advances, one reversed across months
├── src/
│   ├── ~ app.ts                          # mount the four new routers
│   ├── middleware/
│   │   └── ~ error.ts                    # per-route upload size message
│   ├── lib/
│   │   ├── + phone.ts                    # phoneKey, phoneMatches (FR-030)
│   │   ├── + csv.ts                      # RFC 4180 parse, UTF-8 check
│   │   ├── + import-headings.ts          # 16 headings, matching, missing and repeated
│   │   ├── + import-rows.ts              # cell rules, same messages as the vendor form
│   │   ├── + import-duplicates.ts        # GSTIN and phone, directory and earlier rows
│   │   ├── + xlsx-read.ts                # exceljs stream, first sheet, stop after 1,001 rows
│   │   ├── + document-content.ts         # extension and byte-signature agreement
│   │   ├── + history.ts                  # diffFields, recordHistory(tx, …)
│   │   ├── + permissions.ts              # ADVANCE_RECORDERS, ADVANCE_VIEWERS
│   │   ├── + vendor-lock.ts              # pg_advisory_xact_lock(3001)
│   │   ├── ~ india-date.ts               # currentMonthInIndia
│   │   ├── ~ files.ts                    # per-route size limits
│   │   └── ~ money.ts                    # parsePositiveAmount
│   └── modules/
│       ├── + vendor-imports/routes.ts    # template, previews, confirm, cancel, runs
│       ├── + documents/routes.ts         # upload, list, file, archive, restore
│       ├── + client-advances/routes.ts   # list, record, reverse, tile list
│       ├── + history/routes.ts           # GET /history
│       ├── ~ dashboard/routes.ts         # + GET /dashboard/summary; /dashboard unchanged
│       ├── ~ vendors/routes.ts           # FR-030 phone rule, vendor lock, history
│       └── ~ projects/routes.ts          # history, status filter
└── tests/
    ├── ~ helpers.ts                      # reset order, fixture builders
    ├── + fixtures/                       # small hand-made .xls and renamed binaries
    ├── unit/
    │   ├── + phone.test.ts
    │   ├── + csv.test.ts
    │   ├── + import-headings.test.ts
    │   ├── + import-rows.test.ts
    │   ├── + import-duplicates.test.ts
    │   ├── + document-content.test.ts
    │   ├── + history-diff.test.ts
    │   ├── ~ india-date.test.ts          # month bounds
    │   └── ~ append-only.test.ts         # new insert-only models, no document delete
    └── api/
        ├── + client-advances.test.ts     # US1
        ├── + vendor-import.test.ts       # US2
        ├── + documents.test.ts           # US3
        ├── + dashboard-summary.test.ts   # US4
        ├── + history.test.ts             # US5
        ├── ~ vendors.test.ts             # FR-030 cases (US2-13)
        └── ~ excluded-routes.test.ts     # /api/client-advances now exists

web/
├── src/
│   ├── ~ main.tsx                        # routes and nav: import, imports, client advances
│   ├── ~ styles.css                      # tiles, outcome badges, phone-width tables
│   └── pages/
│       ├── + vendor-import.tsx           # upload, preview, approve, confirm, summary
│       ├── + vendor-imports.tsx          # history list and run detail
│       ├── + documents-section.tsx       # used by vendor and project pages
│       ├── + advances-section.tsx        # project page
│       ├── + client-advances.tsx         # tile list
│       ├── + history-panel.tsx           # vendor, project, document, run, advance
│       ├── ~ dashboard.tsx               # tiles above the Feature 002 lists
│       ├── ~ projects.tsx                # status filter from the hash
│       ├── ~ vendor-detail.tsx           # documents and history sections
│       └── ~ project-detail.tsx          # advances, documents, history sections
└── tests/
    ├── + vendor-import.test.tsx
    ├── + advances-section.test.tsx
    ├── + documents-section.test.tsx
    └── + dashboard-tiles.test.tsx
```

**Structure Decision**: Constitution Principle II fixes `api/` and `web/`. This feature follows the layout of Features 001 and 002:
- Rules that are tested first live in `api/src/lib`, with no HTTP or Prisma.
- Routes live in one module per area under `api/src/modules`.
- Web screens and sections are files in `web/src/pages`.

## Architecture

The request path is unchanged: session middleware, then Zod, then the module, then Prisma.

Module boundaries:

- **vendor-imports** owns previews, runs, and row outcomes. To create vendors it writes `vendors` and their Feature 001 child rows (categories, locations, services, materials), and new `categories`. It never updates or archives an existing vendor (FR-011).
- **documents** owns `documents` and their files. It reads `vendors.archived` and `projects.archived`.
- **client-advances** owns advances and reversals. It reads `projects` and writes nothing else. It never touches vendors or Feature 001 task prices (FR-022).
- **history** is read-only. Every other module writes its own entries with `recordHistory(tx, …)` in the same transaction as the change.
- **dashboard** gains a read-only `summary` route. The Feature 002 route is unchanged.

Feature 001 changes:

1. **vendors**: `assertPhone` uses `phoneMatches` from `phone.ts` over all vendors' phone and alternate phone (FR-030). Create and edit run inside a transaction that first takes `vendorIdentityLock(tx)`, so GSTIN and phone checks never race with an import confirmation. Create, edit, archive, and restore write a history entry. Request and response shapes are unchanged.
2. **projects**: create, edit, archive, and restore write a history entry. `GET /projects` accepts `status`.
3. **error middleware**: the multer size message comes from the limit of the route that raised it. Costing sheets keep "10 MB". Documents and imports say "25 MB".
4. **files**: `inspectUpload` keeps its costing-sheet behaviour. Document checks live in the new `document-content.ts`.

### Import flow

1. **Upload** (`POST /vendor-imports/previews`):
   - Check the format by extension and content: a ZIP containing `xl/workbook.xml` for `.xlsx`, and valid UTF-8 text for `.csv`. Refuse `.xls`.
   - Read the headings and refuse a missing or repeated required heading.
   - Read up to 1,001 non-blank data rows and refuse more than 1,000.
   - Validate each row with `import-rows.ts`.
   - Load every vendor's phone, alternate phone, and GSTIN once, and run `import-duplicates.ts` over the directory and the earlier rows.
   - Store the preview with `expires_at = now + 30 min`.
2. **Confirm**: one transaction (research.md, "Confirmation is one database transaction"):
   - Lock the preview row and handle the confirmed, cancelled, and expired cases.
   - Take the vendor-identity lock and recheck every row.
   - Reuse or create categories ignoring letter case, then create vendors with `import_run_id`, the run, the row outcomes, and history entries. Each vendor gets `CREATED` with `details.import_run_id`, and the run gets `CREATED`.
   - Mark the preview `CONFIRMED`.

   An unexpected error rolls everything back and returns 500 `IMPORT_FAILED`.
3. **Cancel**: lock the preview row and set it to `CANCELLED` if it is `OPEN`.

### Money

- Amounts are parsed by `parsePositiveAmount`: the Feature 001 decimal pattern, greater than zero, and at most 9999999999999.99.
- Sums are Prisma `aggregate` over `client_advances` with `reversal: null`, optionally filtered by project or by `received_on` within `currentMonthInIndia(todayInIndia())`.
- Values leave the API as `moneyString`.
- No floating-point arithmetic touches money.

### Documents

- **Upload**: multer memory storage with a 25 MB limit, then Zod for `title`, `document_type`, and `note`, then `checkDocumentContent(name, bytes)`, then a parent-archived check (409 `PARENT_ARCHIVED`), then write the file under a random key, then one transaction for the row and its history entry. If the transaction fails, unlink the file.
- **Download**: `res.sendFile` from `FILE_STORAGE_DIR` with attachment and `nosniff` headers.
- **Archive and restore**: these update only `archived` and the audit columns, and are refused while the parent is archived.

## Authorization

All routes sit behind the Feature 001 `sessionMiddleware`, so a missing, expired, or revoked session is 401 everywhere.

| Rule | Where it is checked |
| --- | --- |
| Record and reverse advances | `ADVANCE_RECORDERS` (Administrator, Accountant) in the advances module. Otherwise 403 `ROLE_NOT_ALLOWED` |
| Advance amounts on projects, tile lists, and the dashboard summary | `ADVANCE_VIEWERS`, all three roles today. The summary leaves out `client_advances` for any other role (FR-025) |
| Preview view, confirm, and cancel | `preview.created_by === req.staff.id`. Otherwise 403 `PREVIEW_NOT_YOURS`, and nothing changes |
| Everything else in this feature | Any active staff member (spec Assumptions) |

Tests cover every role against the record, reverse, and preview-ownership rules, and a signed-out caller on every new route.

## Error handling

Feature 001's `HttpError` and `errorMiddleware` are reused.
- Zod failures return 400 with `fields`.
- Whole-file import refusals return 400 with a `code`.
- Rule refusals return 409 with the codes in the contract.
- A unique violation on `client_advance_reversals.client_advance_id` is caught in the module and returned as 409 `ALREADY_REVERSED`. The generic Feature 001 `CONFLICT` is not used for it.
- Confirmation wraps its transaction and turns any non-`HttpError` into 500 `IMPORT_FAILED`.

## Data integrity

- Audit columns are set with `stampCreate` and `stampUpdate`. History rows are written in the same transaction as their change.
- Check constraints are added by hand to the generated migration SQL: `documents_parent_ck`, `history_entries_target_ck`, `vendor_import_rows_vendor_ck`, `client_advances_amount_ck`, and `client_advance_reversals_amount_ck`.
- `append-only.test.ts` gains the models `historyEntry`, `clientAdvance`, `clientAdvanceReversal`, `vendorImportRun`, and `vendorImportRow` for every write method. It also gains a second pattern that bans `delete` and `deleteMany` on `document`. As in Feature 002, the test also proves each pattern can fail.
- No route deletes a file under `FILE_STORAGE_DIR`. The only unlink is the cleanup of a file whose row was never committed.

## Testing strategy

Write these unit tests first in `api/tests/unit`, and leave them failing until the helpers exist:

- **phone**: these pairs match:
  - `"98765 43210"` and `"98765-43210"`
  - a phone against an alternate phone, in both directions
  - tabs and multiple spaces

  These do not match:
  - an empty or dash-only key against anything
  - different digits
- **csv**: quoted commas, `""` inside quotes, CRLF and LF line ends, a BOM, blank lines, and invalid UTF-8 being refused.
- **import-headings**: headings in any order, letter case and surrounding spaces ignored, unknown headings collected, a missing Name, Phone, or Categories heading, and a repeated heading.
- **import-rows**:
  - every Feature 001 message: name, phone, and category required
  - team size −1 and 2.5 refused
  - availability `limited` accepted, `Busy` refused
  - GST registered `yes`, `NO`, and blank accepted, `Maybe` refused
  - a GSTIN with not-registered refused, registered without a GSTIN refused, and an invalid GSTIN refused
  - semicolon lists trimmed, emptied, and de-duplicated
  - rows with no vendor rule beyond the form, such as an odd email, accepted
- **import-duplicates**:
  - a GSTIN match with the directory or with an earlier row is rejected
  - phone matches with the directory and with an earlier row are possible duplicates naming the match
  - an earlier rejected row still counts (research.md)
  - a confirmation recheck with an approved set gives imported, skipped, and rejected, including a newly arising possible duplicate that was not approved, which is skipped
- **document-content**:
  - each of the seven accepted kinds passes
  - a renamed `.exe`, `.xls` named `.doc`, `.docx` named `.xlsx`, a JPEG named `.png`, and an empty file are refused
- **india-date**: `currentMonthInIndia` at 23:59 IST on the last day of a month and at 00:01 IST on the first day of the next.
- **history-diff**: changed scalars, unchanged scalars left out, list changes compared ignoring order, and no entry for an edit that changes nothing.

Then add Supertest cases in `api/tests/api` for every acceptance scenario in US1 to US5, using [contracts/http-api.md](./contracts/http-api.md), and these cases:

- `vendor-import.test.ts`:
  - parallel confirmations with `Promise.all` give one run, the same body, and vendors created once
  - the temporary-trigger failure gives 500 `IMPORT_FAILED`, no vendors, no run, and a preview still `OPEN`
  - expiry is tested by setting `expires_at` in the past through Prisma
  - another user's view, confirm, and cancel each give 403 and leave the preview unchanged
  - a vendor created between preview and confirmation with a row's GSTIN makes that row `REJECTED`, and with a row's phone makes it `SKIPPED`
  - extra headings are ignored and listed once
  - phone cells keep their leading zero
- `client-advances.test.ts`:
  - amount boundaries: 0.01, 9999999999999.99, 10000000000000.00, 1.005, today, and tomorrow in India Standard Time
  - a concurrent double reversal gives exactly one 201 and one 409 `ALREADY_REVERSED`
  - reversal on an archived project succeeds, and a new advance there is refused
- `dashboard-summary.test.ts`:
  - an advance received last month and reversed today leaves the month tile unchanged and lowers the total
  - an advance received this month and reversed lowers both tiles
  - archived projects count in money and not in project tiles
  - all three roles get identical bodies
- `documents.test.ts`:
  - downloaded bytes match the upload
  - a refused upload leaves no file under the storage directory
  - archive and restore on an archived parent give 409
  - archived documents still download
- `history.test.ts`:
  - an untouched pre-existing vendor has `record` stamps and no entries
  - each event in the data-model table writes exactly one entry
- `vendors.test.ts`: the Feature 001 duplicate-phone tests still pass, plus the spaced and dashed cases and the phone-against-alternate-phone case.
- `excluded-routes.test.ts`: drop `/api/client-advances` from the excluded list, and keep quotations, purchase orders, invoices, and payments.

Web tests cover:
- the preview table, with badges, reasons, and checkboxes only on possible duplicates
- confirm sending `approved_rows`
- the expired-preview message
- the advances section hiding record and reverse for Office Team while showing amounts
- the document form showing each 400 message
- the dashboard tiles with their labels and links

Phone and desktop layout and the timed criteria SC-001 and SC-004 are demonstrated with the quickstart.

## Delivery

- **Changes:** add `exceljs` to `api/package.json` and refresh `package-lock.json`. No change to `docker-compose.yml`, `.env.example`, CI, or root scripts. CI already runs lint, typecheck, migrate, and test.
- **Seed:** idempotent advances (data-model.md, Seed additions).
- **Production prerequisite (not code):** the backup must include both the PostgreSQL database and `FILE_STORAGE_DIR`, with retention of at least seven years for documents (FR-016, Constitution Product Boundaries, PRD section 8).

## Implementation order

The order is for `/speckit-tasks`. This command does not write application code.

1. Confirm the `002-timelines-delays` baseline on this branch passes `npm run lint`, `npm run typecheck`, and `npm test` before any change. The spec is committed in 80f7f6f. Commit the FR-008d update and these plan documents with it.
2. Add `exceljs` and prove it reads a fixture under Node 24.
3. Prisma schema, migration with the check constraints, test reset order, and seed.
4. Unit tests, then `phone`, `csv`, `import-headings`, `import-rows`, `import-duplicates`, `document-content`, `history`, and `currentMonthInIndia`.
5. Feature 001 changes: the FR-030 phone rule, the vendor-identity lock, and history in vendors and projects, with the existing tests green.
6. US1: client advances.
7. US2: import, including the template, previews, confirmation, cancel, and runs.
8. US3: documents, with the per-route size message.
9. US4: dashboard summary, project `status` filter, and the tile list route.
10. US5: history read route.
11. Web: import pages, sections, dashboard tiles, and navigation.
12. Quickstart demonstration at phone and desktop widths, then `converge`.

## Product decisions recorded during planning

1. **Only the uploader may view, confirm, or cancel an import preview.** Decided by the product owner on 2026-10-29 at the start of this command. It is recorded in the spec as FR-008d and US2-14.

## Unresolved items

No product decision is outstanding. These items record how the plan reads the spec, so implementation does not invent a second rule.

1. **Matches within a file compare against every earlier non-blank row, rejected ones included.** FR-006 and FR-007 say "an earlier row" without qualification, so a later row can be flagged against an earlier row that will not be imported. If the product owner wants rejected rows ignored, the change is confined to `import-duplicates.ts` and its tests.
2. **Size limit for spreadsheet uploads.** The spec limits rows (1,000), not bytes. The upload accepts up to the 25 MB already approved for documents. The streaming reader stops after 1,001 rows, so the work stays bounded.
3. **An expired preview is kept, not deleted.** No cleanup job is added (Constitution VI). Its rows hold only cell text from the uploaded file.

## Complexity Tracking

No constitution violation requires a justification. The one new dependency is recorded in research.md. No new service, job, or Phase 2 or 3 module is introduced.
