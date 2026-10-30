---

description: "Task list for import, documents, and advances"
---

# Tasks: Import, Documents, and Advances

**Input**: Design documents from `/specs/003-import-documents-advances/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: Included. Constitution Principle V requires two things:
- an automated test for every acceptance scenario
- business-rule tests written first

Write each listed test so it fails, then implement the task that makes it pass.

**Organization**: Tasks are grouped by user story, so each story can be implemented and tested as an increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (US1–US5). Setup, Foundational, and Polish have no story label.

## Path Conventions

- API: `api/`. Web: `web/`. Paths match `plan.md`.
- This branch already holds the Feature 001 and Feature 002 code (fast-forward to `3eeb966`, spec commit `80f7f6f`, plan commit `b008ad0`). A file a task calls "change" already exists.
- "USn-m" is acceptance scenario m of user story n in `spec.md`. Error codes and bodies are in `contracts/http-api.md`.
- Constitution IV and Feature 001 research require every new route to validate its body, query, and path parameters with Zod. Ids are UUIDs, and a malformed id gives 400. Spreadsheet cells are validated with a Zod row schema (T021). A task that names a route does not repeat this rule.
- Every write sets `updated_by` to the signed-in person who caused it, including clearing another person's expired preview (T043).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prove the inherited baseline is green, then add and prove the one new dependency.

- [X] T001 Run `npm install`, `npm run lint`, `npm run typecheck`, and `npm test` from the root `package.json` on branch `003-import-documents-advances` with no edits. Record the counts and any pre-existing failure under Notes in this file. Do not commit. The uncommitted spec, plan, and task documents stay uncommitted until the user asks
- [X] T002 Add `"exceljs": "4.4.0"` (exact version, no range) to `dependencies` in `api/package.json`, and run `npm install` so `package-lock.json` updates. The one-line reason is in `research.md`. Add no other dependency
- [X] T003 Write `api/tests/unit/exceljs-smoke.test.ts`:
  - Build a workbook in memory with `exceljs`: sheet `Vendors`, heading row `Name, Phone`, and rows `A, 09876543210` and `B, 98765 43210`, with the Phone column formatted as text.
  - Write it to a buffer, then load it into a new workbook with `workbook.xlsx.load(buffer)`, the non-streaming reader (research.md).
  - Assert the first worksheet yields the three rows in order, and Phone keeps `09876543210` with its leading zero as text.

  This proves the dependency works under Node 24 before importer code relies on it. The streaming `WorkbookReader` is not used: it fails on workbooks `exceljs` writes (research.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, test plumbing, the shared business-rule helpers, and per-route upload limits

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Schema and test plumbing

- [X] T004 Change `api/prisma/schema.prisma` to add the following, exactly as in `data-model.md`. Every new model has `id` UUID, `created_at`, `created_by`, `updated_at`, and `updated_by`, mapped in the Feature 001 `@map` style, with `created_by` and `updated_by` referencing `StaffUser`. Add back-relations on `StaffUser`, `Vendor`, and `Project` without changing any existing column.

  Enums:
  - `ImportPreviewStatus` (`OPEN`, `CONFIRMED`, `CANCELLED`)
  - `ImportRowOutcome` (`IMPORTED`, `SKIPPED`, `REJECTED`)
  - `DocumentType` (`AGREEMENT`, `DRAWING`, `REGISTRATION_CERTIFICATE`, `PHOTO`, `OTHER`)
  - `PaymentMethod` (`CASH`, `BANK_TRANSFER`, `CHEQUE`, `UPI`, `OTHER`)
  - `HistoryAction` (`CREATED`, `EDITED`, `ARCHIVED`, `RESTORED`, `REVERSED`)

  Models, with the field rules to encode:
  - **`VendorImportPreview`** (`vendor_import_previews`):
    - `file_name` "Required"
    - `file_format` "Required. `XLSX` or `CSV`, stored as text"
    - `status` default `OPEN`
    - `expires_at` "Required"
    - `rows` `Json` "Required"
    - `ignored_headings` `String[]`
  - **`VendorImportRun`** (`vendor_import_runs`):
    - `preview_id` "Required. Unique. References `vendor_import_previews.id`"
    - `file_name` "Required"
    - `imported_count`, `skipped_count`, and `rejected_count` "Required. Whole numbers of zero or more"
  - **`VendorImportRow`** (`vendor_import_rows`):
    - `run_id` "Required"
    - `row_number` "Required"
    - `outcome`
    - `reasons` `String[]`
    - `matches` `Json`
    - `vendor_id` optional
    - "Unique: `(run_id, row_number)`"
  - **`Document`** (`documents`):
    - `vendor_id` and `project_id` both optional
    - `title` "Required"
    - `document_type`
    - `note` optional
    - `original_filename` and `media_type` required
    - `byte_size` `Int` required
    - `storage_key` "Required. Unique"
    - `archived` "Default false"
    - indexes `(vendor_id, archived, created_at)` and `(project_id, archived, created_at)`
  - **`ClientAdvance`** (`client_advances`):
    - `project_id` "Required"
    - `amount` "Required `DECIMAL(15,2)`" (`@db.Decimal(15, 2)`)
    - `received_on` "Required `DATE`" (`@db.Date`)
    - `payment_method` optional
    - `reference` and `note` optional
    - indexes `(project_id, received_on)` and `(received_on)`
  - **`ClientAdvanceReversal`** (`client_advance_reversals`):
    - `client_advance_id` "Required. Unique"
    - `amount` `@db.Decimal(15, 2)` required
    - `reason` "Required"
  - **`HistoryEntry`** (`history_entries`):
    - nullable `vendor_id`, `project_id`, `document_id`, `vendor_import_run_id`, and `client_advance_id`
    - `action`
    - `changes` `Json` default `{}`
    - `details` `Json` default `{}`
    - one index per target column with `created_at`

  Also add `Vendor.import_run_id`, "an optional reference to `vendor_import_runs.id`". Every new relation uses `onDelete: Restrict`
- [X] T005 Generate `api/prisma/migrations/20261029120000_import_documents_advances/migration.sql` with `prisma migrate dev --create-only`. Then append these by hand:
  - `documents_parent_ck` CHECK `(("vendor_id" IS NULL) <> ("project_id" IS NULL))`
  - `history_entries_target_ck` CHECK `num_nonnulls("vendor_id","project_id","document_id","vendor_import_run_id","client_advance_id") = 1`
  - `vendor_import_rows_vendor_ck` CHECK `(("outcome" = 'IMPORTED') = ("vendor_id" IS NOT NULL))`
  - `client_advances_amount_ck` CHECK `("amount" > 0)`
  - `client_advance_reversals_amount_ck` CHECK `("amount" > 0)`

  Confirm `prisma migrate deploy` runs clean on an empty database after the two existing migrations
- [X] T006 [P] Change `api/tests/helpers.ts`:
  - **Reset order:** `resetDatabase` deletes, before the Feature 002 and Feature 001 tables, in this order: `historyEntry`, `clientAdvanceReversal`, `clientAdvance`, `document`, `vendorImportRow`; then `vendor.updateMany({ data: { importRunId: null } })`; then `vendorImportRun` and `vendorImportPreview`.
  - **Factories:**
    - `createAdvance({ projectId, amount, receivedOn, actorId })`
    - `reverseAdvance({ advanceId, reason, actorId, createdAt? })`
    - `createDocument({ vendorId?, projectId?, archived? })`
    - `monthOffset(n)`, which returns a `YYYY-MM-15` date n months from the current India Standard Time month and imports `todayInIndia`
  - **Storage:** set a per-test temporary `FILE_STORAGE_DIR` and clear it between tests
- [X] T007 [P] Create `api/tests/fixtures/files.ts` with buffer builders. No binary files are checked in.
  - `csvBuffer(headings, rows, { bom? })`
  - `xlsxBuffer(headings, rows)`, which uses `exceljs` and formats the Phone and Alternate phone columns as text
  - `pdfBuffer()`, starting with `%PDF-1.4`
  - `jpegBuffer()` (`FF D8 FF E0…`) and `pngBuffer()` (8-byte signature)
  - `oleBuffer(streamName)`: the `D0 CF 11 E0 A1 B1 1A E1` header plus `streamName` in UTF-16LE
  - `zipWithEntry(name)`: `PK\x03\x04` plus the entry name
  - `exeBuffer()`, starting with `MZ`
  - `paddedBuffer(bytes)`, for size tests such as 25 MB plus 1 byte

  Add the import fixture rows of `quickstart.md` "Fixtures", including `vendors-mixed`, `vendors-rejected-then-valid`, `vendors-1001`, `vendors-repeated-heading`, and `vendors-over-25mb`

### Business-rule tests first (must fail before T018–T028)

- [X] T008 [P] Write `api/tests/unit/phone.test.ts` for `phoneKey` and `phoneMatches` (FR-030).

  These match:
  - `"98765 43210"` with `"98765-43210"`
  - `" 98765\t43210 "` with `"9876543210"`
  - a candidate phone against another vendor's alternate phone
  - a candidate alternate phone against another vendor's phone

  These do not match:
  - `"--"` or `""` against anything
  - `"98765 43211"` against `"98765 43210"`

  `phoneMatches(candidate, others)` returns every matching `{ id, name }` once
- [X] T009 [P] Write `api/tests/unit/csv.test.ts` for `parseCsv(bytes)`:
  - a quoted comma `"a,b"`
  - an escaped quote `"say ""hi"""`
  - CRLF and LF line ends
  - a leading UTF-8 BOM is dropped
  - blank lines come back as empty rows, which the caller skips
  - a cell `09876543210` stays text
  - invalid UTF-8 bytes throw an `HttpError` 400 with code `UNSUPPORTED_FORMAT` and message "Save the CSV as CSV UTF-8 and upload it again."
- [X] T010 [P] Write `api/tests/unit/import-headings.test.ts` for `matchHeadings(row)` against the 16 FR-002 headings: Name, Phone, Categories, Contact person, Alternate phone, Email, Address, GST registered, GSTIN, GST legal name, Team size, Availability, Manpower note, Locations served, Services, and Materials.
  - Any column order is accepted.
  - `" phone "` and `"PHONE"` match Phone.
  - Unknown headings such as `Rate` are returned in `ignored`.
  - Missing Name, Phone, or Categories throws 400 `MISSING_HEADING` with `headings`.
  - `Phone` twice throws 400 `REPEATED_HEADING` with `headings`
- [X] T011 [P] Write `api/tests/unit/import-rows.test.ts` for `validateRow(cells)`, which returns `{ draft, reasons }` using the Feature 001 messages.
  - **Required:** "Name is required.", "Phone is required.", "A category is required."
  - **Team size:** `-1` and `2.5` give "Team size must be a whole number of zero or greater."; `"4"` and numeric `4` are accepted.
  - **Availability:** `limited` is accepted; `Busy` is refused.
  - **GST registered:** `yes`, `NO`, and blank are accepted, and blank means false. `Maybe` is refused.
  - **GSTIN:** not registered with a GSTIN gives "A vendor who is not GST registered is saved without a GSTIN."; registered without one gives "GSTIN is required."; an invalid one gives "GSTIN must be 15 characters."
  - **Lists:** `"Tiles; tiles ;;Marble"` gives `["Tiles", "Marble"]`.
  - **No extra rules:** an odd email such as `a@b` is accepted, because the vendor form has no email rule (FR-005)
- [X] T012 [P] Write `api/tests/unit/import-duplicates.test.ts` for `previewOutcomes(rows, directory)` and `confirmOutcomes(previewRows, approvedRows, directoryNow)`:
  - **Directory matches:**
    - a GSTIN that belongs to a directory vendor gives `REJECTED`, naming the vendor
    - a phone matching a directory vendor's alternate phone gives `POSSIBLE_DUPLICATE`, naming the vendor
  - **Matches with earlier rows that are not rejected:**
    - a GSTIN equal to an earlier `READY` or `POSSIBLE_DUPLICATE` row gives `REJECTED`, naming the row
    - a phone equal to an earlier `READY` row gives `POSSIBLE_DUPLICATE`, naming the row
  - **Rejected rows never block (US2-15):**
    - row 2 has no name, GSTIN X, and phone P; row 3 is valid with GSTIN X and phone P, and is `READY`
    - row 4 with GSTIN X is `REJECTED` against row 3
  - **Confirmation:**
    - a row rejected in the preview stays `REJECTED` at confirmation, even when the row it matched is not approved
    - an unapproved possible duplicate is `SKIPPED`
    - an approved one is `IMPORTED`
    - a `READY` row whose GSTIN now belongs to a directory vendor is `REJECTED`
    - a `READY` row whose phone now matches a new directory vendor is `SKIPPED` with reason "Phone matches an existing vendor. Not approved."
- [X] T013 [P] Write `api/tests/unit/document-content.test.ts` for `checkDocumentContent(originalName, bytes)`, which returns `{ ext, mediaType }`.
  - **Accepted:**
    - `.pdf` from `pdfBuffer`
    - `.jpg` and `.jpeg` from `jpegBuffer`
    - `.png`
    - `.docx` from `zipWithEntry('word/document.xml')`
    - `.xlsx` from `zipWithEntry('xl/workbook.xml')`
    - `.doc` from `oleBuffer('WordDocument')`
    - `.xls` from `oleBuffer('Workbook')` and from `oleBuffer('Book')`
  - **Refused with 400 and "The file's content does not match its type.":**
    - `exeBuffer` named `.pdf`
    - `oleBuffer('Workbook')` named `.doc`
    - `zipWithEntry('xl/workbook.xml')` named `.docx`
    - `jpegBuffer` named `.png`
  - **Other refusals:** `.txt` is refused as an unaccepted type, and an empty buffer is refused
- [X] T014 [P] Write `api/tests/unit/history-diff.test.ts` for `diffFields(before, after, fields)`:
  - a changed scalar gives `{ phone: { from, to } }`
  - unchanged fields are left out
  - list fields (categories, locations, services, materials) compare ignoring order
  - indicative rates compare as sorted `label amount unit` strings
  - an edit that changes nothing returns `{}`
- [X] T015 [P] Change `api/tests/unit/india-date.test.ts` to add `currentMonthInIndia`:
  - at `2026-10-31T18:29:00Z` (23:59 IST on 31 October) it returns `{ start: '2026-10-01', end: '2026-11-01', label: '2026-10' }`
  - at `2026-10-31T18:31:00Z` (00:01 IST on 1 November) it returns `{ start: '2026-11-01', end: '2026-12-01', label: '2026-11' }`
- [X] T016 [P] Write `api/tests/unit/money.test.ts` for `parsePositiveAmount`:
  - `"0.01"` and `"9999999999999.99"` are accepted
  - `"0"`, `"-5"`, `"10.123"`, `"1.005"`, `"10000000000000.00"`, and `""` are each refused with a 400 `fields.amount`
- [X] T017 [P] Change `api/tests/unit/append-only.test.ts`:
  - Add `historyEntry`, `clientAdvance`, `clientAdvanceReversal`, `vendorImportRun`, and `vendorImportRow` to `appendOnlyModels`.
  - Add a second pattern that bans `delete` and `deleteMany` on `document` anywhere under `api/src`.
  - Keep the self-check that each pattern can fail

### Business-rule helpers

- [X] T018 [P] Implement `phoneKey(text)` and `phoneMatches(candidate, others)` in `api/src/lib/phone.ts`. `phoneKey` removes every whitespace character and every `-`. An empty key never matches. There are no Prisma or HTTP imports. Makes T008 pass
- [X] T019 [P] Implement `parseCsv(bytes)` in `api/src/lib/csv.ts`: RFC 4180, `TextDecoder('utf-8', { fatal: true })`, BOM dropped, every value kept as text. Makes T009 pass
- [X] T020 [P] Implement `IMPORT_HEADINGS` (the 16 FR-002 headings in template order) and `matchHeadings(row)` in `api/src/lib/import-headings.ts`. Makes T010 pass
- [X] T021 [P] Implement `validateRow(cells)` in `api/src/lib/import-rows.ts`. Validate the cells with a Zod `importRowSchema` that turns the text cells into the Feature 001 vendor field types: name and phone are trimmed and required, categories need at least one, team size is a whole number of zero or more, and availability and GST registered map to their enums. Collect every Zod issue as a reason. Then apply `gstinProblem` and `normalizeGstin` from `api/src/lib/vendor-rules.ts`. Use the exact Feature 001 messages (Constitution IV). Semicolon lists are trimmed, empty parts dropped, and duplicates removed ignoring letter case. Makes T011 pass
- [X] T022 [P] Implement `previewOutcomes` and `confirmOutcomes` in `api/src/lib/import-duplicates.ts`, following `research.md` "Duplicate checks within a file compare only against earlier rows that are not rejected":
  - one pass in file order
  - rejected rows are added to no index
  - possible duplicates are indexed
  - preview-rejected rows stay rejected at confirmation

  Depends on T018 and T021. Makes T012 pass
- [X] T023 [P] Implement `checkDocumentContent(originalName, bytes)` in `api/src/lib/document-content.ts` using the signature table in `research.md`, with plain byte searches for `word/document.xml`, `xl/workbook.xml`, and the UTF-16LE stream names. Makes T013 pass
- [X] T024 [P] Implement `diffFields(before, after, fields)` and `recordHistory(tx, { target, action, actorId, changes?, details? })` in `api/src/lib/history.ts`. `target` is exactly one of `vendorId`, `projectId`, `documentId`, `importRunId`, or `clientAdvanceId`. `recordHistory` sets both audit stamps to the actor. Makes T014 pass
- [X] T025 [P] Add `currentMonthInIndia(now = new Date())` to `api/src/lib/india-date.ts`, built on `todayInIndia`. Makes T015 pass
- [X] T026 [P] Add `parsePositiveAmount(input, field = 'amount')` to `api/src/lib/money.ts`: the Feature 001 decimal pattern, greater than zero, at most `9999999999999.99`, and the message "Amount must be greater than zero with at most two decimal places." Makes T016 pass
- [X] T027 [P] Create two files:
  - `api/src/lib/permissions.ts`, exporting `ADVANCE_RECORDERS = ['ADMINISTRATOR', 'ACCOUNTANT']` and `ADVANCE_VIEWERS = ['ADMINISTRATOR', 'ACCOUNTANT', 'OFFICE_TEAM']`
  - `api/src/lib/vendor-lock.ts`, exporting `vendorIdentityLock(tx)`, which runs `SELECT pg_advisory_xact_lock(3001)`
- [X] T028 Change `api/src/lib/files.ts` and `api/src/middleware/error.ts` so the upload size limit belongs to each route:
  - Add `singleUpload(field, maxBytes, label)`, which wraps multer memory storage and turns `LIMIT_FILE_SIZE` into `HttpError(400, 'Check the highlighted fields.', { code: 'FILE_TOO_LARGE', fields: { file: 'The file must be <label> or smaller.' } })`.
  - Switch the Feature 001 costing-sheet route in `api/src/modules/files/routes.ts` to `singleUpload('file', MAX_FILE_BYTES, '10 MB')`, so its message stays "The file must be 10 MB or smaller."
  - Remove the fixed "10 MB" branch from `errorMiddleware`.
  - Run the existing `api/tests/api/pricing.test.ts` and confirm it still passes

**Checkpoint**: Schema migrated, rule tests green, upload limits per route. User stories can start.

---

## Phase 3: User Story 1 - Record client advances and correct them by reversal (Priority: P1) 🎯 MVP

**Goal**: Administrators and Accountants record advances on a project and reverse them in full with a reason. All staff see the advances, the reversals, and the net amount.

**Independent Test**: Record two advances, reverse one, and check that the project shows both advances, the reversal, the net amount, and authors and times. The advance cannot be edited or deleted (spec US1).

**Requirements**: FR-017, FR-018, FR-019, FR-020, FR-021, FR-022; FR-027 for advance entries; FR-029. Success criteria SC-006 (advances), SC-007, SC-008, SC-010.

### Tests for User Story 1 ⚠️

- [X] T029 [P] [US1] Write `api/tests/api/client-advances.test.ts` covering US1-1 to US1-9:
  - **Recording:** an Accountant and an Administrator each record (201), the advance is listed with author and time, and `net_amount` rises.
  - **Validation (400 `fields`):** `0`, `-5`, `10.123`, `1.005`, a missing amount, `10000000000000.00`, a missing date, and tomorrow in India Standard Time are each refused. `0.01` and `9999999999999.99` are accepted.
  - **No edit or delete:** `PATCH` and `DELETE` on `/api/client-advances/:id` return 404, and the row is unchanged.
  - **Reversal:**
    - a reversal with a reason gives 201; the advance keeps its row, `reversal` is set, and `net_amount` drops
    - a reversal with no reason gives 400, and a second reversal gives 409 `ALREADY_REVERSED`
    - two parallel reversals give exactly one 201 and one 409
  - **Roles:** an Office Team member gets 403 `ROLE_NOT_ALLOWED` on record and reverse, and 200 with amounts on read.
  - **Archived project:** a new advance gives 409 `PROJECT_ARCHIVED`, a reversal succeeds, and the read works.
  - **Signed out or revoked:** 401 on read, with no amount in the body.
  - **History:** each record writes one `history_entries` row with `action = CREATED` and `client_advance_id`. Each reversal writes one `REVERSED` row with the reason and amount in `details`.
  - **Money format:** money in responses is a string with two decimals (FR-021, SC-007)
- [X] T030 [P] [US1] Change `api/tests/api/excluded-routes.test.ts`: remove `/api/client-advances` from the list. Keep `/api/quotations`, `/api/purchase-orders`, `/api/invoices`, and `/api/payments` returning 404 for GET and POST (FR-029)
- [X] T031 [P] [US1] Write `web/tests/advances-section.test.tsx`:
  - it renders advances in date order with a reversed badge and the reversal reason
  - it shows `net_amount` as rupees with two decimals
  - the record and reverse controls are shown for `ACCOUNTANT` and `ADMINISTRATOR`, and absent for `OFFICE_TEAM`, while amounts still show
  - a 400 `fields.amount` message appears beside the amount field

### Implementation for User Story 1

- [X] T032 [US1] Create `api/src/modules/client-advances/routes.ts`:
  - **`GET /projects/:id/client-advances`:** any `ADVANCE_VIEWERS` role. Advances are ordered by `received_on`, then `created_at`, each with `reversal` or `null`. `net_amount` is a Prisma `aggregate` `_sum.amount` with `reversal: null`, returned through `moneyString`.
  - **`POST /projects/:id/client-advances`:** `ADVANCE_RECORDERS` only, else 403 `ROLE_NOT_ALLOWED` "Only an Administrator or an Accountant can record or reverse a client advance." Zod body: `amount` via `parsePositiveAmount`; `received_on` `YYYY-MM-DD` "no later than today in India Standard Time"; `payment_method` optional `PaymentMethod`; `reference` and `note` optional. A project that does not exist gives 404, and an archived one gives 409 `PROJECT_ARCHIVED`. Insert and `recordHistory(CREATED, details { amount, received_on })` in one transaction.
  - **`POST /client-advances/:id/reversal`:** `ADVANCE_RECORDERS` only. Zod requires `reason` trimmed, at least 1 character. Insert the reversal with `amount` copied from the advance, plus `recordHistory(REVERSED, details { amount, reason })`, in one transaction. Catch Prisma `P2002` on `client_advance_id` and return 409 `ALREADY_REVERSED`. Allowed on archived projects.
  - **Response shape:** follows `contracts/http-api.md`, with the project's `client_name` (FR-022).
  - **No other routes:** no update, delete, or `PATCH` route exists

  Makes T029 pass
- [X] T033 [US1] Change `api/src/app.ts` to mount `clientAdvanceRouter` under `/api` after the session middleware and before the 404 fallback. Confirm T030 passes
- [X] T034 [US1] Create `web/src/pages/advances-section.tsx`:
  - a list with amount, date received, method, reference, note, and author and time, plus a reversal line with its reason
  - a net amount labelled "Net client advances received (not reversed)"
  - a record form and a reverse form with a required reason, shown only to Administrators and Accountants

  Change `web/src/pages/project-detail.tsx` to render it. Makes T031 pass
- [X] T035 [US1] Change `api/prisma/seed.ts` to add advances idempotently, matching existing rows by project, amount, and `received_on`, as `data-model.md` "Seed additions" lists:
  - two advances on one seeded project: one received this month, and one received last month and reversed this month
  - one advance on a second project

  Run the seed twice and confirm no duplicates

**Checkpoint**: US1 works alone. Quickstart API steps 1–7 pass.

---

## Phase 4: User Story 2 - Import vendors from a spreadsheet (Priority: P2)

**Goal**: The uploader previews an `.xlsx` or `.csv` file of up to 25 MB and 1,000 rows, approves possible duplicates, and confirms. Confirmation saves all eligible rows or nothing and is safe to repeat. The preview expires after 30 minutes, and its cell values are cleared once it is confirmed, cancelled, or expired. The vendor form uses the same phone rule.

**Independent Test**: Upload the mixed file and check the preview outcomes. Skip the phone duplicate, confirm, and check that only valid rows became vendors and the summary counts match (spec US2).

**Requirements**: FR-001 to FR-011, including FR-008a to FR-008e; FR-027 for imported vendors and runs; FR-030. Success criteria SC-001, SC-002, SC-003, SC-011.

### Tests for User Story 2 ⚠️

- [X] T036 [P] [US2] Change `api/tests/api/vendors.test.ts` to add FR-030 cases (US2-13, SC-011). The existing duplicate-phone tests must still pass unchanged.
  - **Gives 409 `PHONE_IN_USE` naming the vendor:**
    - create with `"98765-43210"` when a vendor has `"98765 43210"`
    - create whose phone equals another vendor's alternate phone written with spaces
    - create whose alternate phone equals another vendor's phone
    - an edit that introduces a match
  - **Saves:** the same requests with `confirm_duplicate_phone: true`.
  - **No match:** a vendor whose own phone and alternate phone match each other
- [X] T037 [US2] Write the preview cases in `api/tests/api/vendor-import.test.ts` (US2-1 to US2-4, US2-7, US2-15):
  - **Templates:** both templates return the 16 headings, and the `.xlsx` Phone column is text.
  - **Mixed file:** `vendors-mixed.csv` gives the outcomes listed in quickstart step 9, with row numbers and named matches, and the vendor count is unchanged.
  - **`vendors-rejected-then-valid.csv`:** row 2 `REJECTED`, row 3 `READY`, and row 4 `REJECTED` against row 3.
  - **Extra headings:** an extra `Rate` heading appears once in `ignored_headings`.
  - **Leading zeros:** a CSV phone `09876543210` keeps its leading zero in `cells`.
  - **Whole-file refusals (400, no preview row):**
    - `vendors-over-25mb.csv` gives `FILE_TOO_LARGE` with "The file must be 25 MB or smaller."
    - `vendors-1001.csv` gives `TOO_MANY_ROWS`
    - the repeated `Phone` heading gives `REPEATED_HEADING`
    - no Phone heading gives `MISSING_HEADING`
    - headings only gives `EMPTY_FILE`
    - `old.xls` from `oleBuffer('Workbook')` gives `UNSUPPORTED_FORMAT`
    - an `.xlsx`-named PDF gives `UNSUPPORTED_FORMAT`
    - an invalid UTF-8 CSV gives `UNSUPPORTED_FORMAT`
  - **Blank rows:** they are not listed and not counted
  - **Same rule as the form:** the phone pairs used in T036 give `POSSIBLE_DUPLICATE` here, naming the same vendor, so the form and the import flag the same duplicates (SC-011)
- [X] T038 [US2] Add the confirmation cases to `api/tests/api/vendor-import.test.ts` (US2-5, US2-6, US2-8, US2-9, US2-10, US2-12; FR-008 to FR-008b, FR-010, FR-011):
  - **Mixed-file confirmation:** confirming the mixed file with only the dashed-phone row in `approved_rows` gives 201 with 2 imported, 1 skipped, and 2 rejected, each with its reason. New categories exist once, matched ignoring letter case and spaces. Each imported vendor has `import_run_id`. Each gets one `CREATED` history row with `details.import_run_id`, and the run gets one `CREATED` row.
  - **Repeat confirmation:** a second sequential confirmation gives 200 with the same run id and body. Two parallel confirmations via `Promise.all` give one run and one set of vendors.
  - **Recheck at confirmation:**
    - a vendor saved through `POST /vendors` between preview and confirmation with a `READY` row's GSTIN makes that row `REJECTED`
    - one with a `READY` row's phone makes it `SKIPPED`
    - other rows still import
  - **Forced failure:** a temporary trigger that `RAISE`s on insert into `vendor_import_runs`, created and dropped in the test, gives 500 `IMPORT_FAILED` with "The import did not happen. Nothing was saved.", zero new vendors, zero runs, and a preview still `OPEN` with its rows intact.
  - **No changes to existing vendors:** existing vendors are never changed.
  - **History:** `GET /vendor-imports` lists the run with who, when, file name, and counts, and `GET /vendor-imports/:runId` returns the row outcomes
- [X] T039 [US2] Add the lifecycle cases to `api/tests/api/vendor-import.test.ts` (US2-6, US2-11, US2-14, US2-16; FR-008c to FR-008e):
  - **Cancel:** gives 200 and clears the stored `rows` to `[]`. Afterwards, view and confirm give 409 `PREVIEW_CANCELLED`, and no vendor is created.
  - **Expiry:** with `expires_at` set 31 minutes in the past through Prisma, view, confirm, and cancel each give 409 `PREVIEW_EXPIRED`, return no rows in the body, and leave the stored `rows` empty.
  - **Clearing on upload:** another expired preview owned by someone else has its stored `rows` cleared when a new upload by a different user arrives.
  - **After confirmation:** the stored `rows` is `[]`, while `vendor_import_runs` and `vendor_import_rows` keep counts, numbers, outcomes, and reasons.
  - **Ownership:** an Accountant viewing, confirming, or cancelling an Office Team member's preview gets 403 `PREVIEW_NOT_YOURS`, and the preview row is byte-for-byte unchanged.
  - **Signed out:** 401 on every import route
- [X] T040 [P] [US2] Write `web/tests/vendor-import.test.tsx`:
  - the preview table shows outcome badges, reasons, and named matches
  - checkboxes appear only on `POSSIBLE_DUPLICATE` rows
  - confirm posts `approved_rows` with the ticked row numbers
  - the summary shows the counts and the reasons for skipped and rejected rows
  - a 409 `PREVIEW_EXPIRED` shows "This preview has expired. Upload the file again."
  - a 400 `FILE_TOO_LARGE` shows its message

### Implementation for User Story 2

- [X] T041 [US2] Change `api/src/modules/vendors/routes.ts`. Request and response shapes stay unchanged.
  - `assertPhone` loads `id, name, phone, alternate_phone` for all vendors (archived included), then calls `phoneMatches` for both the submitted phone and alternate phone.
  - Vendor create and `PATCH` run in one `prisma.$transaction` that first calls `vendorIdentityLock(tx)`, then the GSTIN and phone checks, then the write.
  - `presentVendor` adds `import_run: { id, file_name, created_at } | null` (FR-010).

  Makes T036 pass
- [X] T042 [P] [US2] Create `api/src/lib/xlsx-read.ts`, exporting `readImportFile(originalName, bytes)`, which returns `{ format, headingRow, rows: [{ row_number, cells }] }`:
  - **`.xlsx`:** the bytes must start with `PK` and contain `xl/workbook.xml`. The 25 MB limit has already been checked by the upload route (T043) before this function is called. Load the buffer with `new ExcelJS.Workbook().xlsx.load(bytes)`, not the streaming `WorkbookReader` (research.md), and read only the first worksheet. A whole numeric cell becomes its integer text. A file that fails to load gives 400 `UNSUPPORTED_FORMAT`.
  - **`.csv`:** use `parseCsv`.
  - **Refusals:** `.xls` or any other extension gives 400 `UNSUPPORTED_FORMAT`. A missing heading row or zero data rows gives `EMPTY_FILE`. More than 1,000 non-blank data rows gives `TOO_MANY_ROWS`, for `.xlsx` and `.csv` alike. The whole file is refused and no rows are returned; the first 1,000 are never kept and the rest dropped.
  - **Row numbers** count the heading row as row 1
- [X] T043 [US2] Create `api/src/modules/vendor-imports/routes.ts` with:
  - **`GET /vendor-imports/template?format=xlsx|csv`:** the `IMPORT_HEADINGS`, sent as an attachment. In the `.xlsx` template, Phone and Alternate phone are formatted as text.
  - **`POST /vendor-imports/previews`:**
    - `singleUpload('file', 25 * 1024 * 1024, '25 MB')` (FR-003)
    - then one `updateMany` setting `rows = []`, `ignored_headings = []`, and `updated_by` to the uploader, where `status = OPEN`, `expires_at < now`, and `rows` is not already empty (FR-008e, Constitution III)
    - then `readImportFile`, `matchHeadings`, and `validateRow` per row
    - one query for every vendor's `id, name, phone, alternate_phone, gstin`, then `previewOutcomes`
    - store the preview with `expires_at = now + 30 minutes`
    - return 201 in the contract shape, with `counts`, `ignored_headings`, and `rows` including `cells`
- [X] T044 [US2] Add to `api/src/modules/vendor-imports/routes.ts`.

  **Expiry rule for every preview route (FR-008e):** clearing an expired preview is a write of its own, and it must be committed before the 409 `PREVIEW_EXPIRED` response is sent.
  - Never throw the 409 from inside a transaction that also does the clearing, because the throw would roll the clearing back.
  - Inside a transaction, clear `rows` and `ignored_headings` (setting `updated_by` to the caller), return an `EXPIRED` result without throwing, and send the 409 only after the transaction has committed.
  - Outside a transaction, run the clearing update, wait for it, then send the 409.

  Routes:
  - **`GET /vendor-imports/previews/:id`:**
    - not the uploader gives 403 `PREVIEW_NOT_YOURS`, with no write
    - `CANCELLED` gives 409 `PREVIEW_CANCELLED`
    - expired: run and await the clearing update if `rows` is not empty, then give 409 `PREVIEW_EXPIRED` with no rows
    - `CONFIRMED` gives `{ status, run_id }`
    - otherwise the full body
  - **`POST /vendor-imports/previews/:id/cancel`:** owner check, then one transaction that locks the row `FOR UPDATE`:
    - `OPEN` and not expired: set `CANCELLED`, clear `rows` and `ignored_headings`, and return 200 after commit
    - expired: clear `rows` and `ignored_headings` if not empty, leave `status` as `OPEN`, return `EXPIRED` without throwing, and give 409 `PREVIEW_EXPIRED` with no rows after the transaction commits
    - `CONFIRMED`: 409 `PREVIEW_CONFIRMED`, with no write
    - already `CANCELLED`: 200, with no write
- [X] T045 [US2] Add `POST /vendor-imports/previews/:id/confirm` to `api/src/modules/vendor-imports/routes.ts`. Zod body: `approved_rows`, an array of positive integers. Steps:
  1. Owner check, giving 403 `PREVIEW_NOT_YOURS`.
  2. One `prisma.$transaction` with `{ timeout: 60_000, maxWait: 10_000 }`:
     - `SELECT … FOR UPDATE` on the preview
     - if `CONFIRMED`, return the stored run with 200
     - if `CANCELLED`, 409 `PREVIEW_CANCELLED`
     - if expired, clear `rows` and `ignored_headings` if not empty, set `updated_by` to the caller, and return an `EXPIRED` result without throwing. The transaction then commits the clearing and does nothing else. After the commit, respond 409 `PREVIEW_EXPIRED` with no rows (T044 expiry rule)
     - `vendorIdentityLock(tx)`
     - load the directory again and call `confirmOutcomes`
     - reuse or create categories ignoring letter case, via `reuseCategory`
     - create each `IMPORTED` vendor and its Feature 001 child rows, with `import_run_id`
     - create the run and `vendor_import_rows`
     - `recordHistory` `CREATED` for each vendor (`details.import_run_id`) and for the run (counts in `details`)
     - set the preview `CONFIRMED` and clear its `rows`
  3. Return 201.

  Wrap the transaction so any non-`HttpError` becomes 500 `IMPORT_FAILED`. Never update an existing vendor (FR-011)
- [X] T046 [US2] Add `GET /vendor-imports` (newest first) and `GET /vendor-imports/:runId` (`{ run, rows }`) to `api/src/modules/vendor-imports/routes.ts`. Mount `vendorImportRouter` under `/api` in `api/src/app.ts`. Makes T037, T038, and T039 pass
- [X] T047 [US2] Create `web/src/pages/vendor-import.tsx`:
  - template download links and a file upload
  - a preview table with row number, name, badge, reasons, and matches, with a checkbox only on possible duplicates
  - a line "Confirm before <expires_at local time> or upload again"
  - Confirm and Cancel buttons; Confirm is disabled while its request is in flight
  - a summary with counts and the reasons for skipped and rejected rows
  - a message for each refusal code

  Makes T040 pass
- [X] T048 [US2] Create `web/src/pages/vendor-imports.tsx`, a run list with who, when, file, and counts, plus a run detail with row outcomes. Change `web/src/main.tsx` to add routes `#/vendors/import` and `#/vendor-imports` and an "Import vendors" link on the vendors page. Change `web/src/pages/vendor-detail.tsx` to show "Imported in <file> on <date>" when `import_run` is set

**Checkpoint**: US2 works alone. Quickstart API steps 8–18 pass.

---

## Phase 5: User Story 3 - Keep documents on vendors and projects (Priority: P3)

**Goal**: Staff upload, list, download, archive, and restore documents on vendors and projects. Documents are never deleted and are only served to signed-in staff. On an archived record they are read-only.

**Independent Test**: Upload to a vendor and a project, open both, archive one, show it and restore it, and check that a signed-out request is refused (spec US3).

**Requirements**: FR-012, FR-013, FR-014, FR-015, FR-016; FR-027 for document entries. Success criteria SC-004, SC-005, SC-006 (documents).

### Tests for User Story 3 ⚠️

- [X] T049 [P] [US3] Write `api/tests/api/documents.test.ts` covering US3-1 to US3-7:
  - **Upload and download:**
    - upload a PDF to a vendor and a JPEG to a project with a title and `document_type`, and get 201 in the contract shape
    - download gives bytes equal to the upload, with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`
  - **Signed out or revoked:** 401 on download, list, and upload.
  - **Refused uploads (400):** `exeBuffer` named `.pdf`, `oleBuffer('Workbook')` named `.doc`, `.txt`, `paddedBuffer(25 MB + 1)` giving `FILE_TOO_LARGE` with "The file must be 25 MB or smaller.", and a missing title. After each refusal there is no new file under the test `FILE_STORAGE_DIR` and no new row.
  - **Archive and restore:** archive hides the document unless `include_archived=true`, the archived document still downloads, and restore returns it.
  - **No delete:** `DELETE /api/documents/:id` gives 404, and the row and file still exist.
  - **Archived vendor or project:**
    - the list (with `include_archived=true`) and downloads work
    - upload, archive, and restore each give 409 `PARENT_ARCHIVED`
    - a document archived before its parent was archived stays archived and readable
  - **History:** upload, archive, and restore each write one history row (`CREATED`, `ARCHIVED`, `RESTORED`) with `document_id`
- [X] T050 [P] [US3] Write `web/tests/documents-section.test.tsx`:
  - the list shows title, type, file name, size, uploader, and time
  - the "Show archived" toggle adds `include_archived=true`
  - each 400 field message appears beside its field
  - when the parent is archived, upload, archive, and restore controls are hidden and download links remain
  - no delete control is shown for any document, whether active or archived, and whether the parent is active or archived (US3-6). The API's `DELETE /api/documents/:id` returning 404 stays covered by T049

### Implementation for User Story 3

- [X] T051 [US3] Create `api/src/modules/documents/routes.ts`:
  - **Upload, `POST /vendors/:id/documents` and `POST /projects/:id/documents`:**
    - `singleUpload('file', 25 * 1024 * 1024, '25 MB')`
    - Zod for `title` "Required. Trimmed, at least 1 character", `document_type` (`DocumentType`), and `note` optional
    - `checkDocumentContent`; a missing parent gives 404, and an archived parent gives 409 `PARENT_ARCHIVED`
    - write the file as `randomUUID() + ext` under `FILE_STORAGE_DIR`
    - one transaction to create the row and `recordHistory(CREATED)`; if it throws, unlink the file and rethrow
  - **List, `GET /vendors/:id/documents` and `GET /projects/:id/documents`:** `include_archived`, newest first.
  - **`GET /documents/:id/file`:** `res.sendFile` with the headers above. The `Content-Disposition` file name has quotes, CR, and LF removed, as for Feature 001 costing sheets.
  - **`POST /documents/:id/archive` and `/restore`:** 409 `PARENT_ARCHIVED` while the parent is archived; repeating the same action returns the document unchanged; write history.
  - **No delete route**

  Makes T049 pass
- [X] T052 [US3] Change `api/src/app.ts` to mount `documentRouter` under `/api`
- [X] T053 [US3] Create `web/src/pages/documents-section.tsx`, with an upload form (file, title, type, note), a list with download links, a "Show archived" toggle, and archive and restore buttons hidden when the parent is archived. Change `web/src/pages/vendor-detail.tsx` and `web/src/pages/project-detail.tsx` to render it. Makes T050 pass

**Checkpoint**: US3 works alone. Quickstart API steps 19–24 pass.

---

## Phase 6: User Story 4 - See counts and money on the dashboard (Priority: P4)

**Goal**: Tiles for active vendors and non-archived projects by status, plus two money tiles: client advances that still stand, and those received this month. A reversal counts against the month its advance was received. Each tile opens its list.

**Independent Test**: With known vendors, projects, advances, and one reversal, every tile equals the hand-worked figure (spec US4).

**Requirements**: FR-023, FR-024, FR-025, FR-026. Success criteria SC-009, SC-010 (dashboard).

### Tests for User Story 4 ⚠️

- [X] T054 [P] [US4] Write `api/tests/api/dashboard-summary.test.ts` covering US4-1 to US4-8. Seed the data with factories.
  - **Counts:**
    - `vendors.active` excludes archived vendors
    - `projects` counts non-archived projects for each of `PLANNED`, `ACTIVE`, `ON_HOLD`, and `COMPLETED`
  - **Money:**
    - `standing_total` sums unreversed advances on all projects, an archived project included
    - `received_this_month` sums unreversed advances with `received_on` in `currentMonthInIndia()`
  - **Month attribution:**
    - an advance from `monthOffset(-1)` reversed now lowers `standing_total` and leaves `received_this_month` unchanged
    - an advance received this month and then reversed lowers both
  - **Labels:** `labels` are present and `month` is `YYYY-MM`.
  - **Roles:** Administrator, Accountant, and Office Team get identical bodies. Signed out gets 401.
  - **Lists behind the tiles:**
    - `GET /client-advances?scope=month` and `?scope=all` list exactly the advances behind each tile, with `project`
    - `GET /projects?status=ACTIVE` lists only non-archived Active projects
    - `GET /projects` without `status` is unchanged
  - **Feature 002:** `GET /dashboard` is unchanged, and the existing `api/tests/api/dashboard.test.ts` still passes

  Also write `api/tests/unit/dashboard-summary.test.ts` for the pure `presentSummary(role, figures)`:
  - for each role in `ADVANCE_VIEWERS`, the result includes `client_advances`
  - for a role outside `ADVANCE_VIEWERS` (a test-only value cast to `StaffRole`), the result has no `client_advances` key and no amount anywhere in it (FR-025)
- [X] T055 [P] [US4] Write `web/tests/dashboard-tiles.test.tsx`:
  - the tiles render the counts, the money as rupees with two decimals, and each label
  - the links go to `#/vendors`, `#/projects?status=<STATUS>`, `#/client-advances?scope=all`, and `#/client-advances?scope=month`
  - the Feature 002 lists still render below

### Implementation for User Story 4

- [X] T056 [US4] Create `api/src/lib/dashboard-summary.ts` exporting the pure `presentSummary(role, figures)`, which adds `client_advances` only when `role` is in `ADVANCE_VIEWERS`. Change `api/src/modules/dashboard/routes.ts` to add `GET /dashboard/summary`, which gathers the figures and returns `presentSummary(req.staff.role, figures)`. The figures are:
  - `vendor.count({ archived: false })`
  - `project.groupBy(status)` where `archived: false`, filling missing statuses with 0
  - for roles in `ADVANCE_VIEWERS` only, `clientAdvance.aggregate` with `reversal: null`, once over all advances and once with `received_on` in `[start, end)` from `currentMonthInIndia()`
  - the label strings from the contract, with the month name in English

  Leave `GET /dashboard` untouched
- [X] T057 [P] [US4] Add `GET /client-advances?scope=all|month` to `api/src/modules/client-advances/routes.ts`, creating the router file and its mount if US1 is not done yet. It returns unreversed advances with `project { id, name, client_name, archived }`, newest `received_on` first, for `ADVANCE_VIEWERS` only
- [X] T058 [P] [US4] Change `api/src/modules/projects/routes.ts` so `GET /projects` accepts an optional Zod `status` of `PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED`, combined with the existing archived filter. Makes T054 pass together with T056 and T057
- [X] T059 [US4] Make these web changes. Makes T055 pass
  - Change `web/src/pages/dashboard.tsx` to render tiles from `GET /api/dashboard/summary` above the Feature 002 lists.
  - Create `web/src/pages/client-advances.tsx`, a list for `scope=all|month`.
  - Change `web/src/pages/projects.tsx` to read `status` from the hash query and pass it to the API.
  - Change `web/src/main.tsx` to add `#/client-advances` and pass the query

**Checkpoint**: US4 works alone. Quickstart API steps 25–28 pass.

---

## Phase 7: User Story 5 - Trace who changed important records (Priority: P5)

**Goal**: Every active staff member can read history for vendors, projects, documents, imports, and advances. Vendor and project changes are recorded from deployment on.

**Independent Test**: Edit a vendor, archive a document, run an import, and record and reverse an advance. Each change appears once with the right person and time (spec US5).

**Requirements**: FR-027 for vendors and projects, FR-028. Success criteria SC-006 (history), SC-008.

### Tests for User Story 5 ⚠️

- [X] T060 [P] [US5] Write `api/tests/api/history.test.ts` covering US5-1 to US5-6:
  - **Vendors:**
    - a vendor create gives `CREATED`
    - a `PATCH` changing phone and categories gives one `EDITED` entry, with `changes.phone { from, to }` and `changes.categories { from, to }`
    - a `PATCH` changing nothing gives no entry
    - archive and restore give `ARCHIVED` and `RESTORED`
  - **Projects:** the same four actions, comparing name, client name, site location, description, and status.
  - **Other targets:**
    - documents, imports, and advances return the entries their stories write
    - `GET /history` with zero or two target parameters gives 400
  - **Pre-existing vendor:** a vendor inserted directly through Prisma with older stamps returns `record` with those stamps and `entries: []`.
  - **Roles:** Office Team and Accountant can read every target. Signed out gets 401.
  - **No writes:** `POST`, `PATCH`, and `DELETE` on `/api/history` give 404

### Implementation for User Story 5

- [X] T061 [US5] Change `api/src/modules/vendors/routes.ts`. Rating and note routes are unchanged.
  - **Create:** inside the transaction from T041, call `recordHistory(CREATED)`.
  - **`PATCH`:** load the vendor before the change, compute `diffFields` over the field list in `data-model.md` "Fields compared for vendor `EDITED`", and record `EDITED` only when the diff is not empty.
  - **Archive and restore:** wrap them in a transaction with `ARCHIVED` or `RESTORED`
- [X] T062 [US5] Change `api/src/modules/projects/routes.ts`:
  - create, `PATCH`, archive, and restore each write history in the same transaction
  - `PATCH` compares name, client name, site location, description, and status, and writes nothing for an empty diff
- [X] T063 [US5] Create `api/src/modules/history/routes.ts` with `GET /history`. Zod requires exactly one of `vendor_id`, `project_id`, `document_id`, `import_run_id`, or `client_advance_id`, as a UUID. The response is `record`, the target's `created_*` and `updated_*` stamps with names, plus `entries` newest first in the contract shape, or 404 when the target does not exist. Mount `historyRouter` under `/api` in `api/src/app.ts`. Makes T060 pass
- [X] T064 [US5] Create `web/src/pages/history-panel.tsx`, a collapsible list showing "Created by … on …", "Last updated by … on …", and then each entry with its action, person, time, and changed fields. Render it from `web/src/pages/vendor-detail.tsx`, `web/src/pages/project-detail.tsx`, each document row in `documents-section.tsx`, each run in `vendor-imports.tsx`, and each advance in `advances-section.tsx`

**Checkpoint**: All five stories work. Quickstart API steps 29–32 pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Layout, operations note, full checks, demonstration, and converge

- [X] T065 [P] Change `web/src/styles.css` so the following stay usable at 390 px width with no horizontal page scroll:
  - dashboard tiles in a responsive grid
  - outcome badges `READY`, `REJECTED`, and `POSSIBLE_DUPLICATE`
  - the preview, document, and advance tables, which stack into cards at phone width
- [X] T066 [P] A documentation-only task under Constitution V. Add a "Backups" section to `README.md` stating that production backups must include the PostgreSQL database and `FILE_STORAGE_DIR`, and that documents must stay recoverable for at least seven years (FR-016, Constitution Product Boundaries). Record review and approval on this task before marking it done
- [X] T067 Run `npm run lint`, `npm run typecheck`, and `npm test` from the root and confirm all pass. Record the file and test counts under Notes, and compare them with the baseline from T001
- [X] T068 Run every API scenario in `quickstart.md` (steps 1–32, 10a, 13a), then the web demonstration at desktop width and at 390 px. Time SC-001 (a 500-row import from upload to summary, under 10 minutes) and SC-004 (document upload and reopen, under 1 minute). On the local database, also time the plan's Performance Goals:
  - `POST /vendor-imports/previews` with a 1,000-row file, under 5 seconds
  - `GET /dashboard/summary`, `GET /client-advances?scope=all`, `GET /client-advances?scope=month`, and `GET /projects/:id/client-advances`, each under 1 second at the seeded volume

  Record the results and any failures under Notes
- [X] T069 Run `/speckit-converge` and resolve any remaining gaps until it reports Converged. Do not open a pull request, commit, or push unless the user asks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001, then T002, then T003.
- **Foundational (Phase 2)**: depends on Setup.
  - T004, then T005, then T006 and T007 in parallel.
  - Rule tests T008–T017 can run in parallel; each must fail first.
  - Helpers T018–T027 make them pass. T022 also needs T018 and T021.
  - T028 is independent of the rule tests.
- **User stories (Phases 3–7)**: each depends only on Phase 2. They can run in priority order or in parallel, subject to the shared files below.
- **Polish (Phase 8)**: depends on every story it touches. T067 to T069 come last, in order.

### User Story Dependencies

- **US1 (P1)**: Phase 2 only.
- **US2 (P2)**: Phase 2 only. T041 changes `vendors/routes.ts`, which T061 (US5) also changes, so do T041 first.
- **US3 (P3)**: Phase 2 only.
- **US4 (P4)**: Phase 2 only. T057 adds to the US1 router file and creates it if US1 has not started. Its tests seed advances with factories, not US1 routes.
- **US5 (P5)**: Phase 2 for the history route. Its tests for documents, imports, and advances need US1–US3 done. T061 comes after T041.

### Shared files (no parallel edits)

| File | Tasks, in order |
| --- | --- |
| `api/src/app.ts` | T033 → T046 → T052 → T063 |
| `api/src/modules/vendors/routes.ts` | T041 → T061 |
| `api/src/modules/projects/routes.ts` | T058 → T062 |
| `api/src/modules/client-advances/routes.ts` | T032 → T057 |
| `api/tests/api/vendor-import.test.ts` | T037 → T038 → T039 |
| `web/src/pages/vendor-detail.tsx` | T048 → T053 → T064 |
| `web/src/pages/project-detail.tsx` | T034 → T053 → T064 |
| `web/src/main.tsx` | T048 → T059 |

### Within Each User Story

- Tests are written first and must fail.
- Then the API module, then mounting, then the web.
- A story is done when its tests pass and its quickstart steps are demonstrated (Constitution V).

### Parallel Opportunities

- T006 and T007. All of T008–T017. All of T018–T027 (except that T022 waits for T018 and T021).
- In each story, the tests marked [P] (for example T029, T030, T031).
- Across stories after Phase 2: US1, US3, and US4 touch different module files and can proceed together. US2 and US5 share `vendors/routes.ts`.

---

## Parallel Example: Foundational rule tests

```text
Task: "Write api/tests/unit/phone.test.ts (T008)"
Task: "Write api/tests/unit/csv.test.ts (T009)"
Task: "Write api/tests/unit/import-headings.test.ts (T010)"
Task: "Write api/tests/unit/import-rows.test.ts (T011)"
Task: "Write api/tests/unit/import-duplicates.test.ts (T012)"
Task: "Write api/tests/unit/document-content.test.ts (T013)"
Task: "Write api/tests/unit/history-diff.test.ts (T014)"
```

## Parallel Example: User Story 1

```text
Task: "Write api/tests/api/client-advances.test.ts (T029)"
Task: "Change api/tests/api/excluded-routes.test.ts (T030)"
Task: "Write web/tests/advances-section.test.tsx (T031)"
```

## Parallel Example: Stories after Phase 2

```text
Developer A: US1 (T029–T035)
Developer B: US3 (T049–T053)
Developer C: US4 (T054–T059)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: baseline green and `exceljs` proven.
2. Phase 2: schema, migration, rule tests, helpers, upload limits.
3. Phase 3: US1, client advances.
4. **Stop and validate**: T029–T031 green, and quickstart API steps 1–7 pass.

### Incremental Delivery

1. Setup + Foundational: the foundation is ready.
2. US1: advances (MVP).
3. US2: import and the shared phone rule.
4. US3: documents.
5. US4: dashboard tiles.
6. US5: history read and vendor and project history.
7. Polish: layout, backups note, full checks, quickstart, converge.

Each story keeps the earlier stories' tests and the Feature 001 and Feature 002 suites green.

---

## Notes

- [P] tasks touch different files and depend on no incomplete task.
- A task is done when its tests pass and its acceptance scenario is demonstrated (Constitution Principle V). A passing typecheck alone does not finish a task. T066 is documentation-only and follows the documentation rule in Principle V.
- Do not commit or push unless the user asks. One feature, one branch, one pull request.
- Baseline from T001 (2026-10-29, Node 24.21.0, npm 11.19.0, branch at `b008ad0`): `npm install` left `package-lock.json` unchanged. Lint and typecheck are clean. API: 25 files, 106 tests passed. Web: 11 files, 21 passed and 1 skipped (pre-existing). No pre-existing failures. The `ECONNRESET` / "Connection terminated unexpectedly" lines after the API run are the embedded PostgreSQL shutting down, as noted for Feature 002. npm 11 reports install scripts it did not run (bcrypt, esbuild, prisma); the already-built `node_modules` works.
- Quickstart results from T068: run 2026-10-30; all API steps, both web widths, and all timings passed. See the T068 note below.
- T004 (2026-10-29): `prisma validate` passes. The Prisma CLI needs `DATABASE_URL` in the environment when run from `api/`; any well-formed URL works, since validate and generate do not connect. `prisma generate` wrote the new client code, and all seven new models are present, but it could not replace `query_engine-windows.dll.node` (Windows EPERM) while the local `npm run dev` API server held it. That engine is the same 6.19.3 binary. Rerun `prisma generate` with the dev server stopped before T005's migration. Typecheck is clean. Rules the database does not enforce, such as `byte_size` 1 to 26,214,400 and run counts of zero or more, are left to the API, as `data-model.md` lists them as rules and T005 adds only the five named check constraints.
- T005 (2026-10-29): with the dev server stopped, `prisma generate` completed, engine included. The migration was created with `prisma migrate dev --create-only` against a throwaway embedded PostgreSQL on port 54331, created in the scratchpad and deleted afterwards. The dev database (Docker, 5432) and the test cluster were not used for this. Prisma named the folder `20261029063307_…`; it was renamed to `20261029120000_import_documents_advances` before being applied anywhere. The five check constraints were appended by hand, and the file was saved with CRLF like the other migrations. On a second empty throwaway database:
  - `prisma migrate deploy` applied all three migrations, and `prisma migrate status` reported up to date
  - `prisma migrate diff --from-url … --to-schema-datamodel` reported "No difference detected"
  - a 20-case probe confirmed each constraint rejects its invalid states with SQLSTATE 23514 and its own name, and accepts the valid ones; every case was rolled back

  Afterwards `npm run test -w api` applied the migration to the disposable `vendor_test` database: 26 files and 107 tests passed. Lint and typecheck are clean.
- T006/T007 (2026-10-29), where the delivered work differs from the task text:
  - `createDocument` takes `actorId` in its object, as `createAdvance` does, because a document row requires `created_by`. It also writes the row's file under `FILE_STORAGE_DIR`.
  - Per-test storage is an explicit `resetFileStorage()`: a new `mkdtemp` folder each call, the previous one removed, and the config cache reset. Feature 003 file tests call it. It is not inside `resetDatabase`, so Feature 001 and 002 tests are unchanged.
  - The fixtures keep their own copy of the 16 FR-002 headings (`TEMPLATE_HEADINGS`), so tests check the importer against the spec rather than against the importer's own list.

  Checks: a temporary check (3 tests, deleted after the run) filled every new table with linked rows and confirmed `resetDatabase()` empties all of them. It also exercised every helper and fixture builder: 25 MB + 1 byte, 1,001 rows, a leading-zero phone through XLSX, and CSV quoting. Full suites: API 26 files, 107 tests; web 11 files, 21 passed, 1 skipped. Typecheck and lint are clean. The project's code is not Prettier-formatted (48 of 54 committed API `.ts` files fail `prettier --check`, which CI does not run), so the new code follows the surrounding line style and was not reformatted.
- T008–T017 (2026-10-29), rule tests written first:
  - **Failing as intended:** 9 test files fail only because the helpers they test do not exist yet. Vitest reports "Cannot find module" or "is not a function". `npm run typecheck -w api` shows exactly 9 errors, one TS2307 or TS2305 per new test file, and no other error.
  - **Still passing:** the 3 existing `india-date` tests, and the 3 `append-only` tests. The append-only file is a source guard, so it passes with no offending code; its self-check proves each pattern catches `update` and `delete` on the new models and `delete` on `document`.
  - **Signatures fixed by these tests:**
    - `phoneMatches(candidate, others)` returns `{ id, name }[]`
    - `matchHeadings(row)` returns `{ index, ignored }`; refusals carry `extra.headings`
    - `validateRow(cells)` returns `{ draft, reasons }`; cells may be text or numbers
    - `previewOutcomes` and `confirmOutcomes` take and return `{ rowNumber, outcome, reasons, matches, draft }`, with matches `{ kind: 'VENDOR', vendorId, vendorName }` or `{ kind: 'ROW', rowNumber }`
    - `checkDocumentContent` refuses with `fields.file`, as Feature 001's `inspectUpload` does
  - **Messages not fixed by the spec:** where the spec gives no exact message, as for invalid availability, a bad "GST registered" value, or an unaccepted document type, the tests check that the reason names the field rather than inventing wording.
  - **Whole suites:** API 9 files failing as above, 25 passing, 108 tests passing. Web 11 files, 21 passed, 1 skipped. Lint is clean.
- T018–T028 (2026-10-29), rule helpers: all 9 rule-test files now pass, with no test changed.
  - **New wording:** where the spec gave none, the helpers use:
    - "Availability must be Available, Limited, Unavailable, or blank."
    - "GST registered must be Yes, No, or blank."
    - "This GSTIN is already on row N."
    - "The file must be a PDF, JPG, PNG, Word, or Excel file."
  - **`vendorIdentityLock`** uses `$executeRaw`, because `pg_advisory_xact_lock` returns `void`, which `$queryRaw` cannot read.
  - **Temporary check** (3 tests, deleted after the run): two transactions taking the lock ran one after the other, and an oversized costing sheet now returns `code: 'FILE_TOO_LARGE'` with the unchanged message "The file must be 10 MB or smaller."
  - **`recordHistory`** has no caller yet. Its first use is T032, whose API tests exercise it.
  - **Full run:** API 34 files, 161 tests passed. Web 11 files, 21 passed, 1 skipped. Typecheck 0 errors. Lint clean.
- T029–T031 (2026-10-29), US1 tests written first:
  - **API:** 10 of 12 `client-advances` tests fail with 404 because the routes do not exist yet. The other 2 pass now and must keep passing after T032: unknown ids give 404, and signed-out or revoked callers get 401 through the Feature 001 session middleware.
  - **Web:** fails only on the missing `advances-section` module.
  - **Design decision for T034:** the advances section reads the viewer's role from the existing `/api/auth/me`, so `main.tsx` needs no change. The role only decides which controls are shown; the server still enforces `ROLE_NOT_ALLOWED`.
  - **Display format:** money is shown as `₹` plus two decimals, matching the plain-number style already used for task prices.
- T032–T035 (2026-10-29), where the delivered work differs from the task text:
  - **T033 with T032:** the two-line mount in `app.ts` was done together with T032, because T032's API tests cannot reach the routes until they are mounted.
  - **Malformed ids:** path ids are checked with `z.string().uuid()`, so a malformed id is 400 rather than a database error.
  - **Feature 001 `web/tests/pricing-controls.test.tsx`:** its fetch mock now answers `GET /api/auth/me` and `GET /api/projects/p1/client-advances`, because the project page now renders the advances section. This follows the Feature 002 precedent; no assertion changed.
  - **T035 seed key:** advances are found again by project, amount, and a fixed seed reference (`SEED-ADV-1` to `SEED-ADV-3`), not by `received_on`. The dates are relative to today and `npm run dev` reruns the seed, so a date key would add rows every day, against `data-model.md`'s "rerunnable without duplicates". Each seeded advance and reversal gets its `CREATED` or `REVERSED` history entry.
  - **Seed check** (throwaway PostgreSQL on port 54331, never the dev database): run twice, 3 advances, 1 reversal, 4 history entries. After moving one seeded date back a day and running again, still 3 advances.
  - **Full run:** API 35 files, 173 tests. Web 12 files, 25 passed, 1 skipped. Typecheck 0 errors. Lint exit 0.
- T036–T040 (2026-10-29), US2 tests written first:
  - **Failing as intended:**
    - `vendors.test.ts` new FR-030 test: `"98765-43210"` is accepted with 201, because the form still compares exact text (T041).
    - `vendor-import.test.ts`: 17 of 18 tests fail on 404, or on its knock-on effect (no preview body or id), because the routes do not exist yet (T043–T046).
    - `web/tests/vendor-import.test.tsx`: fails only on the missing module (T047).
  - **Passing now and after:** the 5 existing vendor tests, unchanged, and the import test that every route refuses a signed-out caller, through the Feature 001 session middleware.
  - **Response names:** the tests assert the contract's snake_case match fields (`vendor_id`, `vendor_name`, `row_number`); the T022 helper's camelCase is mapped in T043.
  - **UI names fixed by T040** for T047 to implement:
    - links "Download Excel template" and "Download CSV template"
    - input "Spreadsheet file", buttons "Preview" and "Confirm import"
    - a table named "Preview", with badges "Ready", "Rejected", and "Possible duplicate"
    - checkboxes "Import row N anyway"
    - a region "Import summary" with "Imported N", "Skipped N", "Rejected N", and "Row N: reason"
  - **Directory for the import tests** is inserted through Prisma rather than `POST /vendors`, so the preview tests do not depend on the T041 phone rule. The recheck test adds vendors through `POST /vendors` on purpose, as the task says.
  - **Typecheck:** API 0 errors. Web 1 error, the missing `vendor-import` module. Two test typing slips (the supertest binary parser's parameter type, and the `vendor()` helper's return type) were fixed before ticking.
  - **Whole suites:** API 2 files, 18 tests failing as above, 34 files and 174 tests passing. Web 1 file failing (missing module), 12 files, 25 passed, 1 skipped. Lint exit 0.
- T041 (2026-10-29), vendor form phone rule and vendor identity lock:
  - **Phone rule:** `assertPhone` now takes the transaction client and the candidate's phone and alternate phone together. It loads `id, name, phone, alternatePhone` of every other vendor, archived included, and calls `phoneMatches` (FR-030). Stored phone values are unchanged. The 409 `PHONE_IN_USE` body still carries `matches: [{ id, name }]`, now listing each matching vendor once across both numbers.
  - **Lock:** create and `PATCH` each run one `prisma.$transaction` that calls `vendorIdentityLock(tx)` first, then `assertPhone`, then `assertGstinUnique` (now also on `tx`), then the write.
    - Field validation that needs no directory read (Zod, GSTIN format, category ids) still runs before the transaction, so bad input never waits for the lock.
    - `vendor-lock.ts` is unchanged; this is its first caller.
  - **`presentVendor`** adds `import_run: { id, file_name, created_at } | null` (FR-010).
  - **Checks:**
    - `vendors.test.ts`: 6/6, so T036 now passes and the 5 existing tests pass unchanged.
    - A temporary race check (3 tests, deleted after the run): two simultaneous creates with the same phone, written differently; two with the same GSTIN; and an edit racing a create to one phone. With the lock, exactly one write wins each time and the other gets `PHONE_IN_USE` or `GSTIN_IN_USE`. In a control run with the lock briefly disabled, all three failed: `[201, 201]`, the generic `CONFLICT`, and both writes winning. The lock was restored, and `vendor-lock.ts` is identical to HEAD.
    - Full run: API 17 failing, all in `vendor-import.test.ts` awaiting T042–T046; 175 passing. Web: the `vendor-import` page test awaits T047; 25 passed, 1 skipped. Typecheck: API 0, web 1 (missing page module). Lint exit 0.
- T042 (2026-10-29), import file reader `api/src/lib/xlsx-read.ts`:
  - **Shape:** `readImportFile(name, bytes)` returns `{ format, headingRow, rows: [{ row_number, cells }] }`, where `headingRow` and `cells` are text in column order.
  - **`.xlsx`:** must start with a ZIP signature and contain `xl/workbook.xml`. It is loaded with `workbook.xlsx.load()`, not the streaming reader, and only the first worksheet is read. Every cell becomes text: a whole number becomes its integer text, rich text and formula results become their text, and an empty cell becomes `''`. A load failure is `UNSUPPORTED_FORMAT`.
  - **`.csv`:** reuses `parseCsv`. The extension check ignores letter case, and any other extension is `UNSUPPORTED_FORMAT`.
  - **Rows:** blank rows are left out of `rows` but keep their place in the numbering.
  - **Refusals:**
    - a blank heading row, or no non-blank data rows: `EMPTY_FILE`
    - more than 1,000 non-blank data rows: `TOO_MANY_ROWS`, refusing the whole file with nothing truncated
  - **Deviations:**
    1. T042 lists no test. Because the routes do not exist until T043, a unit test `api/tests/unit/xlsx-read.test.ts` (11 tests) was written first and seen failing on the missing module. It covers CSV and xlsx reading, leading zeros, numeric cells, first sheet only, blank-row numbering, the 1,000/1,001 boundary for both formats, empty files, and seven unsupported or mismatched files.
    2. The reader also refuses over 25 MB with `FILE_TOO_LARGE` and "The file must be 25 MB or smaller.", as a guard for any caller; the upload route stays the first check. `MAX_IMPORT_BYTES` is exported for T043.
  - **New wording:** "Upload the vendor list as an .xlsx or .csv file.", "The file needs a heading row and at least one vendor row.", and "The file has N vendor rows. Upload at most 1,000 rows at a time."
  - **Checks:** reader 11/11, and related unit tests 47/47 (csv, headings, rows, duplicates, exceljs smoke, append-only). Full API run: 186 passing, with the same 17 import-route tests failing as they await T043–T046. Web unchanged (25 passed, 1 skipped; the page test awaits T047). Typecheck: API 0, web 1 (missing page). Lint exit 0. No later task started.
- T043 (2026-10-29), template and upload-and-preview routes in `api/src/modules/vendor-imports/routes.ts`:
  - **Template:** `GET /vendor-imports/template?format=` with a Zod-checked `xlsx` or `csv` sends an attachment.
    - CSV: the 16 headings and a CRLF.
    - xlsx: sheet `Vendors`, Phone and Alternate phone columns formatted `@`.
  - **`POST /vendor-imports/previews`:**
    - `singleUpload('file', MAX_IMPORT_BYTES, '25 MB')`; a missing file gives 400 `fields.file` "Choose an .xlsx or .csv file."
    - one `updateMany` that clears `rows` and `ignored_headings` and sets `updated_by` on every expired `OPEN` preview whose rows are not already `[]` (FR-008e)
    - then `readImportFile`, `matchHeadings`, `validateRow` per row, one directory query, and `previewOutcomes`
    - the preview is stored with `expires_at = now + 30 minutes`
  - **Stored rows:** `rows` holds exactly the rows returned: `{ row_number, outcome, name, reasons, matches, cells }`. Matches are in the contract's snake_case (`vendor_id`, `vendor_name`, `row_number`), mapped from the helper's camelCase. `cells` holds only recognised headings, trimmed, so T045 can rebuild each draft with `validateRow`.
  - **Mount:** `vendorImportRouter` was mounted in `app.ts` now, because the T043 tests cannot reach unmounted routes; T046 still adds the list and detail routes.
  - **Test-data fix:** in `vendor-import.test.ts` `setup()`, the directory vendor "Alternate Holder" had main phone `90000 00001`, the same number as `vendorsValid()` row 2, so the xlsx test's all-`READY` expectation could not hold. Its main phone is now `90000 07771`; its alternate phone `91111 33333`, which the SC-011 test uses, is unchanged. No assertion changed.
  - **Checks:**
    - all 7 preview tests (T037) pass, as do "clears another person's expired preview when a new file is uploaded" and "refuses a signed-out caller"
    - related unit tests 46/46
    - full API: 194 passing, 9 failing, all needing the view, confirm, cancel, or list routes of T044–T046
    - web unchanged (page test awaits T047)
    - typecheck API 0; lint exit 0
- T044 (2026-10-29), view and cancel a preview:
  - **Shared helpers:** `loadOwnPreview` (UUID check, 404, then 403 `PREVIEW_NOT_YOURS` before any write), `isExpired`, `clearRows`, and `presentPreview`, which the upload route now also uses.
  - **`GET /vendor-imports/previews/:id`:** `CANCELLED` gives 409 `PREVIEW_CANCELLED`; `CONFIRMED` gives `{ status, run_id }`; an expired `OPEN` preview has its rows cleared by an awaited update, then gives 409 `PREVIEW_EXPIRED`; otherwise the upload body.
  - **`POST …/cancel`:** owner check, then a transaction with `SELECT … FOR UPDATE`:
    - `CONFIRMED`: 409 `PREVIEW_CONFIRMED`, no write
    - `CANCELLED`: 200, no write
    - expired: clear the rows if any, return `EXPIRED` without throwing, and send the 409 after commit
    - otherwise: set `CANCELLED` and clear the rows
  - **Reading of the spec:** expiry applies only to previews still `OPEN`. T044 lists "expired" before `CONFIRMED` for `GET`, but `data-model.md` says `CONFIRMED` and `CANCELLED` never change again, the contract says a confirmed preview returns `{ status, run_id }`, and T045 checks `CONFIRMED` before expiry. So a confirmed preview viewed after 30 minutes still returns its run id. Every case T044 lists behaves as written.
  - **New wording:** "This preview has expired. Upload the file again.", "This preview was cancelled. Upload the file again.", "This preview has already been confirmed.", "Only the person who uploaded this file can use its preview.", "Import preview not found."
  - **Checks:**
    - the three lifecycle tests that use view and cancel (cancel, expiry, uploader only) now pass those steps and stop only at their confirm request (404, T045)
    - a temporary check (7 tests, deleted after the run) covered every T044 branch: an open view equal to the upload body; 403 on view and cancel with the row unchanged; expired view and expired cancel giving 409 with the stored rows and headings empty afterwards, proving the clearing committed, and status still `OPEN`; cancel then repeat cancel with no write and view `PREVIEW_CANCELLED`; a confirmed preview giving `{ status, run_id }` even after expiry and cancel giving `PREVIEW_CONFIRMED` with no write; 404 for an unknown id and 400 for a malformed one
    - full API: 194 passing, 9 failing, all needing T045's confirm or T046's list. Web unchanged. Typecheck API 0; lint exit 0.
- T045 (2026-10-29), confirm an import (`POST /vendor-imports/previews/:id/confirm`):
  - **Before the transaction:** `loadOwnPreview` (403 or 404), then Zod `approved_rows: number[]` of positive integers.
  - **One `prisma.$transaction`** `{ timeout: 60_000, maxWait: 10_000 }`:
    - `SELECT … FOR UPDATE` on the preview
    - `CONFIRMED`: return the stored run (200)
    - `CANCELLED`: 409 `PREVIEW_CANCELLED`
    - expired `OPEN`: clear the rows and return `EXPIRED` without throwing; the 409 is sent after commit
    - then `vendorIdentityLock(tx)`, the directory reloaded, and `confirmOutcomes` over the stored rows, with each draft rebuilt by `validateRow(cells)` and matches converted back to camelCase
    - categories reused via `reuseCategory` or created once
    - the run created, then each `IMPORTED` vendor with its category, location, service, and material rows and `import_run_id`, plus one `CREATED` history entry with `details.import_run_id`
    - `vendor_import_rows` via `createMany`, the run's `CREATED` history entry with the counts, and the preview set to `CONFIRMED` with its rows cleared
  - **After the transaction:** any non-`HttpError` from it becomes 500 `IMPORT_FAILED`. The response is `presentRun()`: 201 the first time, 200 when already confirmed.
  - **Deviation from the listed order:** the run is created before the vendors, because each vendor's `import_run_id` is a foreign key to it. The counts are already known from `confirmOutcomes`. It is all one transaction, so the result is the same.
  - **Locking:** confirmation holds the preview row lock, then the vendor identity lock. Vendor create and edit take only the vendor lock, and cancel takes only the row lock, so no two operations wait on each other in opposite order. A second confirmation waits on the row lock, then sees `CONFIRMED` and returns the same run.
  - **Checks:**
    - `vendor-import.test.ts` 17/18; the only failure is the run-list test, which needs T046's `GET /vendor-imports`
    - covered: mixed confirmation, sequential and parallel repeat, recheck, forced failure at the run insert, cancel, expiry on all three routes, rows cleared after confirm, uploader only, signed out
    - a temporary check (2 tests, deleted after the run):
      1. a forced failure at the **last** insert (`vendor_import_rows`), after categories, the run, vendors, and history were written, left all four counts unchanged and the preview `OPEN` with its rows; a retry then gave 201
      2. a confirmation racing a `POST /vendors` with the same phone as a `READY` row, over 6 rounds: both orders occurred, the loser got `PHONE_IN_USE` or the row was `SKIPPED`, and there was never more than one vendor with that phone. A control run with the lock briefly disabled failed (form 201 and row `IMPORTED`, a duplicate). The lock was restored, and `vendor-lock.ts` is identical to HEAD.
    - full API: 202 passing, 1 failing (T046). Web unchanged (page test awaits T047). Typecheck API 0; lint exit 0.
- T046 (2026-10-29), import history:
  - **`GET /vendor-imports`:** every run, newest first (`created_at` descending, then `id`), each in the contract's `run` shape.
  - **`GET /vendor-imports/:runId`:** a UUID-checked id (400 if malformed); returns `{ run, rows }` with rows by row number, or 404 "Import run not found."
  - **Shared helpers:** `presentRunSummary` was split out of `presentRun`, so the list, the detail, and confirmation return one identical `run` shape. `presentRun` now gives 404 instead of Prisma's not-found error.
  - **Access:** any active staff member, through the session middleware.
  - **Mount:** the mount T046 lists was already done in T043.
  - **Checks:**
    - `vendor-import.test.ts` 18/18, including the run list and detail test, whose detail must equal the confirmation body
    - a temporary check (1 test, deleted after the run): an empty list is `[]`, two runs come back newest first with exactly the 7 `run` fields, an unknown id gives 404, a malformed id gives 400, and `/vendor-imports/template` still reaches the template route
    - full API 37 files and 203 tests, all passing. Web: the `vendor-import` page test awaits T047; 25 passed, 1 skipped. Typecheck API 0; lint exit 0.
- T047–T048 (2026-10-29), import pages:
  - **Tests first:** written and seen failing on the missing modules before the pages existed.
    - `web/tests/vendor-import.test.tsx` gained 3 tests: cancel clears the preview and says nothing was imported; a 409 `PREVIEW_CANCELLED` on confirm shows its message; Confirm is disabled while in flight, so a second click sends nothing. The 6 T040 tests are unchanged.
    - New `web/tests/vendor-imports.test.tsx` (5 tests): the run list; opening a run, with outcomes, reasons, and an "Open vendor" link only on imported rows; opening a run by id; the vendor page's "Imported in <file> on <date>" line, and its absence for a hand-added vendor.
    - New `web/tests/import-routes.test.tsx` (1 test): through the real `main.tsx`, `#/vendors/import`, `#/vendor-imports?run=…`, and the "Import vendors" link on `#/vendors` work, and `/api/vendors/import` is never requested. A control run with the route guard removed failed (VendorDetail opened for the id "import" and crashed); the guard was restored.
  - **`vendor-import.tsx` (T047):**
    - template links, plus a link to the history
    - a "Spreadsheet file" input and a "Preview" button posting `FormData`
    - counts, ignored columns, and "Confirm before <local time> or upload again."
    - a "Preview" table with row, name, outcome badge, reasons, and matches (vendor name or "Row N"), and an "Import row N anyway" checkbox only on `POSSIBLE_DUPLICATE`
    - "Confirm import" posts `{ approved_rows }` sorted; it and "Cancel preview" are disabled while any request is in flight
    - an "Import summary" region with "Imported N", "Skipped N", "Rejected N", and "Row N: reason" for every row not imported, plus a link to the run in the history
    - **messages:** expired, cancelled, and failed imports use fixed page wording; every other refusal (`FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `EMPTY_FILE`, `TOO_MANY_ROWS`, `MISSING_HEADING`, `REPEATED_HEADING`, `PREVIEW_NOT_YOURS`) shows the server's `fields.file` or message. An expired or cancelled preview is cleared from the page.
  - **`vendor-imports.tsx` (T048):** an "Import runs" table (when, by, file, counts, and a "View <file>" button) and a run's "Run rows" table. It accepts `runId` for `#/vendor-imports?run=<id>`.
  - **`vendor-detail.tsx`:** adds "Imported in <file> on <date>", linked to the run.
  - **`main.tsx`:**
    - routes for `/vendors/import` and `/vendor-imports`, with `?run=` read like the existing `?item=`
    - `/vendors/import` excluded from the vendor-id route
    - an "Import vendors" link above the vendors list; the nav is unchanged
  - **Not done here:** no viewer-role lookup, because every role may import and uploader-only is enforced by the server. No new CSS: the badges reuse `.flag`, and the outcome-badge colours and phone-width tables belong to T065.
  - **Checks:** web 15 files, 40 passed, 1 skipped (pre-existing). API 37 files, 203 tests. Typecheck 0 errors; lint exit 0.
- T049 (2026-10-29), US3 API tests written first in `api/tests/api/documents.test.ts` (10 tests):
  - **Upload:** a PDF to a vendor by Office Team and a JPEG to a project by an Accountant, checking the full contract shape (trimmed title, note, `media_type`, `byte_size`, author). Lists are newest first.
  - **Download:** byte-identical, with `Content-Type`, an `attachment` disposition naming the file, and `nosniff`.
  - **401:** signed out and revoked, on download, list, and upload.
  - **Six refused uploads:** a renamed `.exe`, an `.xls` named `.doc`, a `.txt`, 25 MB + 1 byte (`FILE_TOO_LARGE`), a missing title, and a blank title. After each, the per-test storage folder is empty and there are no rows.
  - **Archive and restore:** a repeated archive is unchanged; archived documents still download.
  - **DELETE:** 404, with the row and file kept.
  - **Archived vendor and archived project:** documents listed and downloadable, including one archived before its parent; upload, archive, and restore give 409 `PARENT_ARCHIVED` with no change.
  - **Not found and bad input:** 404 for an unknown parent or document, and 400 for an unknown `document_type`.
  - **History:** `CREATED`, `ARCHIVED`, `RESTORED`, by the actor.
  - **Additions beyond the task text:** newest-first ordering, the blank-title and bad `document_type` cases, unknown ids, and a repeated archive. Each comes from the contract.
  - **Failing as intended:** all 10 fail only because the routes do not exist (T051–T052): 404 where 200, 201, 400, or 409 is expected, or its knock-on effects (no list, no row, an empty storage folder, no history). The four 404 checks in the unknown-id test pass only for that reason now and become real checks after T051.
  - **Checks:** typecheck API 0; lint exit 0. Full API: 37 files and 203 tests still passing, plus these 10 failing.
- T050 (2026-10-29), US3 web tests written first in `web/tests/documents-section.test.tsx` (9 tests):
  - **Interface fixed for T053:** `DocumentsSection({ parent: 'vendors' | 'projects', parentId, parentArchived })` loads `GET /api/{parent}/{id}/documents`, plus `?include_archived=true` when "Show archived" is ticked.
    - a "Documents" list
    - each item shows title, type label, file name, size in KB or MB to one decimal, uploader, date, and note, with a "Download <file>" link to `/api/documents/:id/file`
    - an "Archived" marker on archived items
    - "Archive" and "Restore" buttons
    - upload form fields "File", "Title", "Document type", and "Note", with an "Upload document" button that posts `FormData`
    - "No documents yet." when empty
  - **Covered:**
    - the list fields
    - the toggle's query, archived marking, and restore
    - archive and restore POST URLs
    - the upload `FormData` (file, title, type, note) to the project route
    - each 400 field message beside its field with `aria-invalid` (file, title, type)
    - the 25 MB message
    - on an archived parent, upload, archive, and restore hidden with downloads kept
    - no delete control in all four combinations of active or archived parent and default or archived list
    - the empty state
  - **Additions beyond the task text:** the archive and restore POSTs, the upload `FormData`, the 25 MB message, and the empty state. The parent's archived state comes in as a prop because both detail pages already load it; T053 passes `vendor.archived` and `project.archived`.
  - **Failing as intended:** only the missing `documents-section` module. Web typecheck shows just that TS2307. The other 15 web files still pass (40 passed, 1 skipped). Lint exit 0.
- T051 (2026-10-29), document routes in `api/src/modules/documents/routes.ts`:
  - **Upload:**
    - order: multer (25 MB, `FILE_TOO_LARGE`), then the Zod fields and `checkDocumentContent` together, so one 400 names every bad field, then 404 for a missing parent and 409 `PARENT_ARCHIVED`
    - a missing file gives `fields.file` "Choose a file to upload."; a bad `document_type` gives "Choose a document type."
    - the file is written as `randomUUID() + ext`, then one transaction re-reads the parent `FOR SHARE` (so a parent archived in between still gives 409), creates the row and writes `CREATED` history. Any failure unlinks the file and rethrows
  - **List:** `include_archived=true` as in vendors and projects; newest first (`created_at desc, id desc`); 404 for an unknown parent; works on archived parents.
  - **Download:** `res.attachment` with the name stripped of quotes, CR, and LF, then `Content-Type` from `media_type` and `X-Content-Type-Options: nosniff`. `sendFile` reads from `FILE_STORAGE_DIR`.
  - **Archive and restore:**
    - one transaction: the document `FOR UPDATE`, its parent `FOR SHARE`, 409 `PARENT_ARCHIVED` while the parent is archived
    - a repeat returns the document unchanged and writes no history; otherwise `ARCHIVED` or `RESTORED` history with empty `changes`, per data-model
  - **No delete route.** Path ids are Zod uuids (400 when malformed).
  - **Beyond the task text:** the parent share lock and combined 400 messages. `res.attachment` also gives non-ASCII names a `filename*` form, so such names cannot break the header.
  - **Checks:**
    - `documents.test.ts` 10/10
    - a temporary forced-insert-failure test (trigger on `documents`) gave 500 with no file, row, or history left; it was deleted after the run
- T052 (2026-10-29), `api/src/app.ts` mounts `documentRouter` under `/api` after the import router.
  - **Checks:** full API 38 files, 213 tests passing; typecheck API 0; lint exit 0. The `ECONNRESET` printed after each run is the embedded Postgres shutting down and also appears on an unrelated unit file.
- T053 (2026-10-29), `web/src/pages/documents-section.tsx`, rendered on `vendor-detail.tsx` (`vendor.archived`) and `project-detail.tsx` (`project.archived`), after the advances section on projects:
  - **List:** title, type label, "Archived" marker, file name, size (B, or KB/MB to one decimal), uploader, date, note, and a "Download <file>" link to `/api/documents/:id/file`. "Show archived" reloads with `include_archived=true`; "No documents yet." when empty.
  - **Upload form:** "File" (with an `accept` list of the eight extensions), "Title", "Document type" (starts at "Choose", so a missing type gets the server's message), and "Note". It posts `FormData`, shows each 400 field message beside its field with `aria-invalid`, and clears and reloads after a 201.
  - **25 MB:** a larger file is refused in the browser with the server's wording, without sending it. No `required` attributes, so every check stays on the server.
  - **Archived parent:** no upload form and no Archive or Restore buttons; the list, toggle, and downloads remain. Other errors such as 409 `PARENT_ARCHIVED` show the server message.
  - **No delete control.**
  - **Checks:**
    - `documents-section.test.tsx` 9/9
    - full web 16 files, 49 passed and 1 skipped (as before), with no existing test changed
    - full API 38 files, 213 tests
    - typecheck web and API 0; lint exit 0
- T054 (2026-10-29), US4 API tests written first:
  - **`api/tests/api/dashboard-summary.test.ts` (10 tests), fixtures:**
    - 3 active vendors and 1 archived
    - projects in all four statuses plus an archived Active and an archived On hold, so On hold fills with 0
    - advances: today, the IST month start (on an archived project), `monthOffset(-1)`, and the day before the month start, as a boundary
  - **Covered:**
    - counts; both sums (166000.50 and 125000.50)
    - an older reversal changes only the total, and a this-month reversal changes both
    - an advance recorded through the API shows at once
    - identical bodies for the three roles; 401 for signed out and revoked, with no amount in the body
    - zero tiles on an empty database
    - `scope=all|month` lists that match the tile sums, with `project`; 400 for an unknown scope
    - `GET /projects?status=` alone and with `include_archived`; unchanged without `status`; 400 for an unknown status
    - Feature 002 `GET /dashboard` keys unchanged
  - **`api/tests/unit/dashboard-summary.test.ts` (5 tests):**
    - the contract example for each `ADVANCE_VIEWERS` role
    - January and December month names
    - an outside role (cast) gets no `client_advances` and no amount
    - **Interface fixed for T056:** `presentSummary(role, { vendorsActive, projects, advances: { standingTotal, receivedThisMonth, month } | null })`
  - **Failing as intended before T056–T058:** 9 API tests (404, or `status` ignored) and the unit file's missing module. The Feature 002 keys test passed throughout.
- T055 (2026-10-29), `web/tests/dashboard-tiles.test.tsx` (8 tests):
  - **Tiles:** inside the "At a glance" region, each is a link holding its value and label:
    - "Vendors not archived" → `#/vendors`
    - "<Status> projects, not archived" → `#/projects?status=<STATUS>`
    - the two money tiles show `₹` with two decimals and the API label, → `#/client-advances?scope=all|month`
  - **Without `client_advances`:** no money tile and no `₹`.
  - **Feature 002:** the lists still render after the tiles.
  - **Additions beyond the task text, fixing T059's interfaces:**
    - `ClientAdvances({ scope })` lists project link, date, and amount, or "No client advances to show."
    - `Projects({ openProject, status })` fetches `/api/projects?status=…`
    - the app shell opens `#/client-advances?scope=all` and `#/projects?status=ON_HOLD`
  - Failing as intended before T059: the missing `client-advances` module.
- T056 (2026-10-29), `api/src/lib/dashboard-summary.ts` and `GET /dashboard/summary` in `api/src/modules/dashboard/routes.ts`:
  - `presentSummary` adds `client_advances` only when the figures exist and the role is in `ADVANCE_VIEWERS`, with English month names from a fixed list (no locale dependence)
  - the route counts with `vendor.count` and `project.groupBy` (0-filled) and, for viewers only, runs two `aggregate`s with `reversal: { is: null }`, the second limited to `[start, end)` of `currentMonthInIndia()`
  - `GET /dashboard` is untouched
- T057 (2026-10-29), `GET /client-advances?scope=all|month`:
  - Zod scope, 400 otherwise; `ADVANCE_VIEWERS` only
  - lists unreversed advances, the month scope by `received_on` in the IST month
  - each item is `presentAdvance` plus `project { id, name, client_name, archived }`, ordered `received_on desc, created_at desc`
- T058 (2026-10-29), `GET /projects` takes an optional Zod `status`, ANDed with the existing `include_archived` filter. Without it the query is unchanged.
- T059 (2026-10-29), web changes:
  - **`dashboard.tsx`:**
    - the "At a glance" tiles load from `/api/dashboard/summary` independently of the Feature 002 lists, so a failure in one does not hide the other
    - the page heading is now "Dashboard" and the "Today" line says the archive note applies to the lists below
    - no new `h2`, so the Feature 002 heading order is unchanged
  - **New page:** `client-advances.tsx`.
  - **`projects.tsx`:** takes `status`, sends it with `include_archived`, and shows "Showing <Status> projects only" with a link back to all projects.
  - **`main.tsx`:**
    - routes `#/client-advances?scope=…`
    - passes `status` to Projects, keyed on it, matching on the path without its query
  - **`styles.css`:** an auto-fit `.dashboard-tiles` grid.
  - **`web/tests/dashboard.test.tsx`:** the mock now answers `/api/dashboard/summary` with a counts-only body; its assertions are unchanged (as with `pricing-controls` in T034).
- **US4 checks (2026-10-29):**
  - focused API 33/33
  - full API 40 files, 228 tests
  - full web 17 files, 57 passed and 1 skipped (as before)
  - typecheck API and web 0; lint exit 0
  - **Flake:** `project-timeline-focus.test.tsx` ("highlights and scrolls…", the `scrollIntoView` context check) failed once in five full web runs. It passed in the other four and 3/3 alone. It renders only `ProjectTimeline`, which US4 does not touch. Recorded as an existing flake, not fixed.
  - **Not run:** quickstart API steps 25–28 (US4 checkpoint), and steps 19–24 from US3. Both remain on T068's list.
- T060 (2026-10-29), US5 tests written first.
  - **`api/tests/api/history.test.ts` (7 tests), covering:**
    - **Vendors:** create, then one `EDITED` with exactly `phone` and `categories` (category names, sorted), then nothing for an unchanged save, then archive and restore, newest first, all by the acting person.
    - **Projects:** the same sequence; the edit covers name, site location, description, and status, with an unchanged client name left out.
    - **Other targets:** document `CREATED`/`ARCHIVED`/`RESTORED`; the import run's `CREATED` with counts, and the imported vendor's `CREATED` with `details.import_run_id`; the advance's `CREATED` (amount, date) and `REVERSED` (amount, reason).
    - **Pre-existing vendor:** one inserted through Prisma with 2025 stamps returns `record` with both names and `entries: []`.
    - **Bad queries:** 400 for zero targets, two targets, a non-UUID, or an unknown key; 404 for each of the five targets when unknown.
    - **Roles:** Office Team and Accountant read; 401 signed out and revoked.
    - **No writes:** `POST`, `PATCH`, and `DELETE` give 404 with the entries unchanged.
  - **Before T061–T063:** all 7 failed (404 route; no vendor entry).
  - **Test-setup fix during T063:** the stamp was first set with a raw-SQL `UPDATE` of a JS `Date`, which the IST session shifted by 5:30. It now uses `prisma.vendor.update({ updatedAt })`, stored in UTC like the app's own stamps; the assertion is unchanged.
  - **`web/tests/history-panel.test.tsx` (8 tests), added because T064 has no test task:**
    - **Interface:** `HistoryPanel({ target, id, label? })`.
    - **Behaviour:**
      - closed with no request until "Show history"
      - the stamps and each entry: action, person, IST time, `Field: from → to` with "(blank)", Yes/No, and joined lists
      - advance amount (₹) and reason; a "From an import" link
      - an empty message; no edit or delete control
    - **Opening from each page:** a document row, an advance, an import run, the vendor page ("Vendor history"), and the project page ("Project history") each request the right `/api/history?…` query.
- T061 (2026-10-29), `api/src/modules/vendors/routes.ts`:
  - **Create:** `CREATED` inside the T041 transaction.
  - **`PATCH`:** under the lock, re-reads the vendor, diffs a snapshot before and after over the 17 data-model fields, and writes `EDITED` only for a non-empty diff.
    - The snapshot is taken from the saved rows, not the request body, because fields left out of the body stay unchanged in Prisma.
    - Field keys use the API names; categories are names, and rates read "label: amount / unit".
  - **Archive and restore:** one transaction that locks the row (`FOR UPDATE`) and writes `ARCHIVED` or `RESTORED` only when the flag changes. A repeat still updates the stamps as before but writes no entry, as for documents.
  - Rating and note routes are unchanged.
- T062 (2026-10-29), `api/src/modules/projects/routes.ts`:
  - create, `PATCH`, archive, and restore each write history in the same transaction
  - `PATCH` and archive/restore lock the row first
  - `PATCH` diffs name, client name, site location, description, and status
  - repeats and empty diffs write nothing
- T063 (2026-10-29), `api/src/modules/history/routes.ts` (`GET /history`), mounted in `app.ts` after the document router:
  - **Query:** a strict Zod object allowing exactly one of the five keys, as a UUID, otherwise 400.
  - **`record`:** the target's own four stamps, with names looked up from `staff_users`.
  - **`entries`:** newest first (`created_at desc, id desc`) in the contract shape.
  - 404 when the target does not exist. There are no write routes.
- T064 (2026-10-29), `web/src/pages/history-panel.tsx`:
  - **Behaviour:**
    - a "Show history"/"Hide history" button with `aria-expanded`, which fetches on each open, so pages make no extra request until asked
    - times in IST
    - a link for `details.import_run_id`
  - **Rendered on:** `vendor-detail.tsx`, `project-detail.tsx`, each document row, each advance, and the opened import run.
  - Existing page tests needed no mock changes.
- **US5 checks (2026-10-29):**
  - focused history API 7/7, web 8/8
  - full API 41 files, 235 tests
  - full web 18 files, 65 passed and 1 skipped (as before), in 5 of 5 full runs; the `project-timeline-focus` flake did not recur this time and stays recorded under T059
  - typecheck API and web 0; lint exit 0
  - **Lock order** stays acyclic:
    - vendor `PATCH` takes the advisory lock, then the vendor row
    - vendor archive and restore take the row only
    - document upload takes the row `FOR SHARE` only
    - import confirm takes the preview row, then the advisory lock, and creates new rows
  - **Not run:** quickstart API steps 29–32 (US5 checkpoint), together with 19–28. All remain on T068's list.
- **Carried to T065–T069:**
  - **T068:** the quickstart walkthrough and timings, including US3 steps 19–24, US4 steps 25–28, and US5 steps 29–32
  - **Import coverage gaps, revisited where the task text permits:**
    - imported vendor fields beyond categories
    - case-variant category reuse across rows
    - permanent confirm-versus-form race and late-failure tests (proven so far only by temporary checks)
    - a 1,000-row confirm
- T065 (2026-10-30), phone-width layout:
  - **`web/src/styles.css`:**
    - rules for the classes the import pages already used but had no CSS for: `.table-wrap` (a wide table scrolls inside its box) and the outcome badges `.outcome-ready`, `.outcome-rejected`, and `.outcome-duplicate`
    - `.card` wraps long words
    - `ul.grid` card lists drop bullets and indent
  - **At 700 px and below:**
    - the dashboard tiles use two columns, and the money tiles (`.tile-wide`) take a full row so an amount up to ₹9999999999999.99 stays on one line
    - each `.table-wrap` row becomes a card, with each cell labelled from `data-label`
    - the `thead` is kept for screen readers but clipped as a block, because `overflow` does not clip a table row group
  - **Markup:**
    - `data-label` on the preview, import-runs, and run-rows cells
    - `Tile wide` for the money tiles in `dashboard.tsx`
    - "Show archived" in `documents-section.tsx` now uses the existing `label.check`
  - **Documents and advances:** these were built as card lists, not tables (T053, T034), so they need no table stacking.
  - **Test:** `web/tests/phone-layout.test.tsx` (2 tests): every cell's `data-label` equals its column heading in all three tables, and each outcome has its badge class.
  - **Width check:**
    - **Setup:** a temporary test (deleted after use) rendered the real pages in filled states with long names, a 23 MB file name, the largest amount, and an open history. The HTML went to the scratchpad with the real stylesheet. Headless Edge loaded each page in a 390 px iframe, since headless windows will not go below about 477 px.
    - **Pages:** dashboard, import preview, import history with a run and its history, documents with history, advances with a reversal and the record form, and the client-advances list.
    - **Result:** all six fit their viewport with no horizontal scroll and nothing past the right edge. The viewport was 375 px for the five pages with a scrollbar and 390 px for the client-advances list.
    - One false alarm (558 px) was the probe's own output line and was excluded.
    - Screenshots of the preview, documents, and dashboard were inspected.
  - **Left for T068:** the live web demonstration at 390 px with the real app.
- T066 (2026-10-30), `README.md` "Backups" section written. It states:
  - the application does not back itself up
  - production backups must include the `DATABASE_URL` PostgreSQL database and the `FILE_STORAGE_DIR` folder, taken and restored together
  - documents are archived, never deleted, and must stay recoverable for at least seven years (FR-016)
  - uploaded import spreadsheets are not stored
  - the `docker-compose.yml` database is for development and is not a backup
  - **Not ticked:** the task requires recorded review and approval, which is pending with the user.
  - **Review and approval (2026-10-30):** reviewed against Constitution V and Product Boundaries, FR-016, research.md "Backups", and the code.
    - **Code checked:**
      - `api/src/modules/documents/routes.ts` and `files/routes.ts` write each file before its row commits
      - the only `unlink` removes the file of a failed upload whose row was never saved
      - no route deletes a document or a stored file
      - import previews keep cell values in `vendor_import_previews.rows` until confirm, cancel, or expiry clearing
    - **Wording corrected (Backups section only):**
      - "at the same point in time", which cannot be done across a database and a folder, became an ordered pair: database first, folder second, with the reason
      - restoring only one is now stated not to be a recovery
      - "documents are archived" became "no way to delete; archiving only hides"
      - seven years is now framed as the project's requirement "from upload", subject to law and firm policy, not a reviewed legal requirement
      - "import spreadsheets are not stored" became "the file is never stored; open-preview cell values are held until cleared, so a backup can contain them"
    - No backup automation, retention control, or recovery guarantee is claimed.
    - **Approval:** given by the user in the 2026-10-30 instruction, on the condition that the section accurately reflects the system and policy, which this review confirmed. It covers this README section only.
- **Import regression coverage (2026-10-30)**, `api/tests/api/vendor-import-regression.test.ts` (5 tests), extending T038/T041/T045 coverage:
  - **All 16 template fields:** saved on the imported vendor and read back through `GET /vendors/:id`.
  - **Category reuse:** "Marble"/" MARBLE ", "Granite"/"granite", and "tiles"/"TILES" against a directory "Tiles" give exactly three categories, with "Tiles" keeping its id.
  - **Confirm against a simultaneous form save:**
    - 4 rounds of `Promise.all`; either the form gets 409 `PHONE_IN_USE` and the row is `IMPORTED`, or the form gets 201 and the row is `SKIPPED`
    - exactly one vendor holds the phone each round
    - **Control:** with `vendorIdentityLock` briefly disabled the test failed in round 2 (both saved); the lock was restored and `vendor-lock.ts` is identical to HEAD
  - **Failure at the last insert (`vendor_import_rows`):** 500 `IMPORT_FAILED`; vendors, categories, runs, run rows, and history counts unchanged; the preview stays `OPEN` with its rows; a retry gives 201.
  - **A 1,000-row file:**
    - previews as 1,000 ready and confirms in one step: 1,000 vendors, 1,000 run rows, 1,000 vendor `CREATED` entries
    - **Timings:** preview 108–127 ms, confirm 1.7–2.2 s on the embedded test database (logged per run)
    - this is not the T068 timing, which uses the local database
- T067 (2026-10-30), root checks:
  - **Results:**
    - `npm run lint` exit 0; `npm run typecheck` exit 0 (API and web)
    - `npm test`: API 42 files, 240 tests passed; web 19 files, 67 passed and 1 skipped
    - **Against the T001 baseline:** API was 25 files and 106 tests (+17 files, +134 tests); web was 11 files, 21 passed and 1 skipped (+8 files, +46 tests, same skipped test)
  - **Flakes:**
    - **Seen:** across 16 recorded full web runs before the fix (T059, T064, and here), 2 failed:
      - `project-timeline-focus` at its `toHaveBeenCalled` check, both times (line 49 in T059 too)
      - once alongside it, the Feature 001 `vendor-filters` test with "Value "cat-1" not found in options"
    - **Cause:** both tests checked asynchronous work right after a `findBy…` resolved:
      - the scroll runs in a `useEffect` that can trail the DOM commit
      - the category options arrive with a second request after the form renders
    - **Fixed in the tests only, assertions unchanged:**
      - `await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())`
      - `await findByRole('option', { name: 'Carpentry' })` before selecting
    - **After the fix:** 10 of 10 full web runs passed, followed by the clean root run above. Ten runs cannot prove the flake is gone entirely; the cause and fix are both specific.
- T068 (2026-10-30), quickstart and acceptance on the running app:
  - **Environment:**
    - **Database:** a disposable embedded PostgreSQL 17 cluster created for this task on 127.0.0.1:54331, database `vendor_t068`, data in the session scratchpad. The Docker development database (5432) was not running and was not touched.
    - **App:** the API ran through `tsx` from the working tree on :4100 with `FILE_STORAGE_DIR` in the scratchpad; the web ran on Vite :5174, proxying `/api`.
    - **Setup:** migrations through `prisma migrate deploy` and the seed through `prisma db seed`, as `npm run dev` does.
    - **Results:** the runner scripts and JSON results are in the scratchpad `t068/` folder.
  - **API steps 1–32, 10a, 13a: 34/34 passed** on a freshly migrated and seeded database. The runner refuses any `DATABASE_URL` other than the disposable one.
    - **Setup the quickstart assumed:** a directory vendor with a GSTIN (29AAAAA0000A1Z5) and an alternate phone, created through the vendor form API before step 9. The seed has none.
    - **Expiry setup (steps 13 and 13a):** `expires_at` was moved 31 minutes back in UTC through Prisma.
    - **First run:** 32/34. Steps 13 and 13a failed because the runner first used SQL `now() - 31 min`. The cluster's session time zone is Asia/Calcutta and the column holds UTC, so the preview was really expiring 4 h 59 min ahead (confirmed with `SHOW TimeZone`). This was a test-procedure fault, not an app fault. The database was dropped and recreated, and the full rerun passed 34/34.
    - **Coverage:** steps 19–24 (documents), 25–28 (dashboard, with each figure recomputed from the lists), and 29–32 (history) all passed against the real app.
  - **`quickstart.md` corrected (wording only):**
    - the GSTIN and alternate-phone vendor is now a directory vendor added before step 9, not a "seeded vendor"
    - step 13 now notes that the column is UTC
    - the seed and the requirements are unchanged
  - **Web demonstration, all 5 steps:**
    - **Browser:** Chrome 156 (headless) driven over the DevTools protocol, with real mouse clicks (desktop) or touch taps (mobile), typed input, and real file inputs.
    - **Viewports:** desktop 1280×900 (1265 px wide with the scrollbar), and mobile 390×844 at device scale 3.
    - **Result:** 7/7 checks passed at each width:
      - the mixed import: preview, row 5 ticked, 2/1/2 summary
      - the 500-row import
      - document upload and reopen with identical bytes
      - the Accountant records and reverses, and the Office Team has no record or reverse controls but sees the amounts
      - the dashboard tiles sit above the Feature 002 lists, each states what it counts, and all 7 open their lists
      - the vendor history panel
    - **Page checks:**
      - all 9 page checks per width showed no horizontal scroll and nothing past the right edge
      - 75 API requests per run, none failed or unexpected (only the sign-in page's `/api/auth/me` 401)
      - 0 console errors
    - Screenshots are in `t068/web-desktop/` and `t068/web-mobile/`.
  - **Timings:**

    | Measure | Threshold | Desktop | 390 px | Result |
    | --- | --- | --- | --- | --- |
    | SC-001: 500-row import, upload to summary | < 10 min | 1.42 s | 1.36 s | Pass |
    | SC-004: document upload and reopen | < 1 min | 0.135 s | 0.153 s | Pass |

    - **Limitation:** both are automated browser timings, so they exclude a person's reading and clicking time. The margins are wide.
  - **Performance goals:**
    - **Method:** timed over HTTP with `performance.now()` from a client on the same machine.
    - **Volume:** 1,011 vendors, 3 projects, 8 advances, 7 reversals, 1,040 history entries, 4 documents, which is more than the seeded volume.

    | Request | Runs | Median | Max | Threshold | Result |
    | --- | --- | --- | --- | --- | --- |
    | `POST /vendor-imports/previews`, 1,000-row `.xlsx` | 5 | 195 ms | 216 ms | < 5 s | Pass |
    | `POST /vendor-imports/previews`, 1,000-row `.csv` | 5 | 153 ms | 163 ms | < 5 s | Pass |
    | `GET /dashboard/summary` | 20 | 2.3 ms | 3.2 ms | < 1 s | Pass |
    | `GET /client-advances?scope=all` | 20 | 2.2 ms | 2.6 ms | < 1 s | Pass |
    | `GET /client-advances?scope=month` | 20 | 2.2 ms | 2.9 ms | < 1 s | Pass |
    | `GET /projects/:id/client-advances` | 20 | 2.7 ms | 2.8 ms | < 1 s | Pass |

    - **Limitation:** this is a local developer machine, not production hardware.
  - **Findings, not fixed (outside T068's pass criteria; recorded, not changed):**
    1. **Recording dates shown in UTC.** The advances section ("Recorded by … · date"), the document list date, and the import-run date print `created_at.slice(0, 10)`, which is the UTC calendar date. Between 00:00 and 05:30 IST they show the previous day: an advance recorded at 00:17 IST on 30 October shows "2026-10-29". The history panel and the dashboard already use IST.
    2. **Unlabelled file input on the project page.** The Feature 001 costing-sheet `<input type="file" name="file">` on the project page has no label. It predates this feature.
  - All processes started for T068 (the disposable Postgres, the API, the web server, and Chrome) were stopped afterwards.
- T069 (2026-10-30), convergence:
  - **First pass:** `tasks_appended`.
    - **Checked:** 31 functional requirements (FR-001–FR-030 with FR-008a–e), 11 success criteria, the 34 US1–US5 acceptance scenarios, the plan decisions, and all six constitution principles plus Product Boundaries. No constitution violation was found.
    - **Findings, all `partial`:**
      - F1 HIGH: FR-021, US1/AC1, US1/AC4, SC-008
      - F2 MEDIUM: US3/AC1
      - F3 MEDIUM: FR-010, US2/AC9
    - **The gap:** the advance, reversal, document, and import-run times were shown as `created_at.slice(0, 10)`, a UTC date with no time, showing the previous day between 00:00 and 05:30 IST (seen live in T068).
    - **Result:** appended T070–T072 as Phase 9.
    - **Not appended:** the Feature 001 costing-sheet file input without a label, which is outside this feature's artifacts.
  - **T070–T072, implemented test-first:**
    - **Test:** `web/tests/ist-times.test.tsx` (4 tests) uses 2026-10-29T19:00Z, which is 2026-10-30 00:30 IST. All 4 failed first.
    - **Helper:** new `web/src/time.ts` with `istDateTime` ("YYYY-MM-DD HH:mm IST") and `istDate`. The history panel now uses the same helper, with unchanged output.
    - **Where:**
      - `advances-section.tsx`: an advance and its reversal show the time recorded
      - `documents-section.tsx`: the upload time
      - `vendor-imports.tsx`: the run list and the run detail
      - `vendor-detail.tsx`: the "Imported in … on" link now uses the IST day, still a date only, since FR-010 needs only which import
    - **Existing tests:** none were changed; their substring date checks still hold.
    - **Own-test correction:** one assertion in the new test was wrong. It banned "2026-10-29 ·", which legitimately appears in the date-received line, and it was narrowed to the recorded line, which the old code would fail.
  - **Final checks:**
    - root `npm run lint` exit 0 and `npm run typecheck` exit 0
    - `npm test`: API 42 files, 240 tests passed, including all 5 `vendor-import-regression` tests; web 20 files, 71 passed and 1 skipped (the pre-existing skipped test)
    - 5 more full web runs: 5/5 passed
    - `vendor-lock.ts` is identical to HEAD
  - **Second pass:** **Converged**. F1–F3 are resolved with tests, and no new gap was found; that pass made no change to `tasks.md`.
  - **Open, but not a gap in this feature's artifacts:** the unlabelled Feature 001 costing-sheet input.
  - **Not done:** no pull request was opened, and nothing was committed or pushed.

## Phase 9: Convergence

- [X] T070 Show the time each client advance and reversal was recorded, in India Standard Time, instead of the UTC calendar date in `web/src/pages/advances-section.tsx` per FR-021, US1/AC1, US1/AC4, SC-008 (partial)
- [X] T071 Show each document's upload time, in India Standard Time, instead of the UTC calendar date in `web/src/pages/documents-section.tsx` per US3/AC1 (partial)
- [X] T072 Show when each import ran, in India Standard Time, instead of the UTC calendar date in `web/src/pages/vendor-imports.tsx` and `web/src/pages/vendor-detail.tsx` per FR-010, US2/AC9 (partial)
