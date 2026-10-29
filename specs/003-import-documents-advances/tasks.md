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

- [ ] T018 [P] Implement `phoneKey(text)` and `phoneMatches(candidate, others)` in `api/src/lib/phone.ts`. `phoneKey` removes every whitespace character and every `-`. An empty key never matches. There are no Prisma or HTTP imports. Makes T008 pass
- [ ] T019 [P] Implement `parseCsv(bytes)` in `api/src/lib/csv.ts`: RFC 4180, `TextDecoder('utf-8', { fatal: true })`, BOM dropped, every value kept as text. Makes T009 pass
- [ ] T020 [P] Implement `IMPORT_HEADINGS` (the 16 FR-002 headings in template order) and `matchHeadings(row)` in `api/src/lib/import-headings.ts`. Makes T010 pass
- [ ] T021 [P] Implement `validateRow(cells)` in `api/src/lib/import-rows.ts`. Validate the cells with a Zod `importRowSchema` that turns the text cells into the Feature 001 vendor field types: name and phone are trimmed and required, categories need at least one, team size is a whole number of zero or more, and availability and GST registered map to their enums. Collect every Zod issue as a reason. Then apply `gstinProblem` and `normalizeGstin` from `api/src/lib/vendor-rules.ts`. Use the exact Feature 001 messages (Constitution IV). Semicolon lists are trimmed, empty parts dropped, and duplicates removed ignoring letter case. Makes T011 pass
- [ ] T022 [P] Implement `previewOutcomes` and `confirmOutcomes` in `api/src/lib/import-duplicates.ts`, following `research.md` "Duplicate checks within a file compare only against earlier rows that are not rejected":
  - one pass in file order
  - rejected rows are added to no index
  - possible duplicates are indexed
  - preview-rejected rows stay rejected at confirmation

  Depends on T018 and T021. Makes T012 pass
- [ ] T023 [P] Implement `checkDocumentContent(originalName, bytes)` in `api/src/lib/document-content.ts` using the signature table in `research.md`, with plain byte searches for `word/document.xml`, `xl/workbook.xml`, and the UTF-16LE stream names. Makes T013 pass
- [ ] T024 [P] Implement `diffFields(before, after, fields)` and `recordHistory(tx, { target, action, actorId, changes?, details? })` in `api/src/lib/history.ts`. `target` is exactly one of `vendorId`, `projectId`, `documentId`, `importRunId`, or `clientAdvanceId`. `recordHistory` sets both audit stamps to the actor. Makes T014 pass
- [ ] T025 [P] Add `currentMonthInIndia(now = new Date())` to `api/src/lib/india-date.ts`, built on `todayInIndia`. Makes T015 pass
- [ ] T026 [P] Add `parsePositiveAmount(input, field = 'amount')` to `api/src/lib/money.ts`: the Feature 001 decimal pattern, greater than zero, at most `9999999999999.99`, and the message "Amount must be greater than zero with at most two decimal places." Makes T016 pass
- [ ] T027 [P] Create two files:
  - `api/src/lib/permissions.ts`, exporting `ADVANCE_RECORDERS = ['ADMINISTRATOR', 'ACCOUNTANT']` and `ADVANCE_VIEWERS = ['ADMINISTRATOR', 'ACCOUNTANT', 'OFFICE_TEAM']`
  - `api/src/lib/vendor-lock.ts`, exporting `vendorIdentityLock(tx)`, which runs `SELECT pg_advisory_xact_lock(3001)`
- [ ] T028 Change `api/src/lib/files.ts` and `api/src/middleware/error.ts` so the upload size limit belongs to each route:
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

- [ ] T029 [P] [US1] Write `api/tests/api/client-advances.test.ts` covering US1-1 to US1-9:
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
- [ ] T030 [P] [US1] Change `api/tests/api/excluded-routes.test.ts`: remove `/api/client-advances` from the list. Keep `/api/quotations`, `/api/purchase-orders`, `/api/invoices`, and `/api/payments` returning 404 for GET and POST (FR-029)
- [ ] T031 [P] [US1] Write `web/tests/advances-section.test.tsx`:
  - it renders advances in date order with a reversed badge and the reversal reason
  - it shows `net_amount` as rupees with two decimals
  - the record and reverse controls are shown for `ACCOUNTANT` and `ADMINISTRATOR`, and absent for `OFFICE_TEAM`, while amounts still show
  - a 400 `fields.amount` message appears beside the amount field

### Implementation for User Story 1

- [ ] T032 [US1] Create `api/src/modules/client-advances/routes.ts`:
  - **`GET /projects/:id/client-advances`:** any `ADVANCE_VIEWERS` role. Advances are ordered by `received_on`, then `created_at`, each with `reversal` or `null`. `net_amount` is a Prisma `aggregate` `_sum.amount` with `reversal: null`, returned through `moneyString`.
  - **`POST /projects/:id/client-advances`:** `ADVANCE_RECORDERS` only, else 403 `ROLE_NOT_ALLOWED` "Only an Administrator or an Accountant can record or reverse a client advance." Zod body: `amount` via `parsePositiveAmount`; `received_on` `YYYY-MM-DD` "no later than today in India Standard Time"; `payment_method` optional `PaymentMethod`; `reference` and `note` optional. A project that does not exist gives 404, and an archived one gives 409 `PROJECT_ARCHIVED`. Insert and `recordHistory(CREATED, details { amount, received_on })` in one transaction.
  - **`POST /client-advances/:id/reversal`:** `ADVANCE_RECORDERS` only. Zod requires `reason` trimmed, at least 1 character. Insert the reversal with `amount` copied from the advance, plus `recordHistory(REVERSED, details { amount, reason })`, in one transaction. Catch Prisma `P2002` on `client_advance_id` and return 409 `ALREADY_REVERSED`. Allowed on archived projects.
  - **Response shape:** follows `contracts/http-api.md`, with the project's `client_name` (FR-022).
  - **No other routes:** no update, delete, or `PATCH` route exists

  Makes T029 pass
- [ ] T033 [US1] Change `api/src/app.ts` to mount `clientAdvanceRouter` under `/api` after the session middleware and before the 404 fallback. Confirm T030 passes
- [ ] T034 [US1] Create `web/src/pages/advances-section.tsx`:
  - a list with amount, date received, method, reference, note, and author and time, plus a reversal line with its reason
  - a net amount labelled "Net client advances received (not reversed)"
  - a record form and a reverse form with a required reason, shown only to Administrators and Accountants

  Change `web/src/pages/project-detail.tsx` to render it. Makes T031 pass
- [ ] T035 [US1] Change `api/prisma/seed.ts` to add advances idempotently, matching existing rows by project, amount, and `received_on`, as `data-model.md` "Seed additions" lists:
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

- [ ] T036 [P] [US2] Change `api/tests/api/vendors.test.ts` to add FR-030 cases (US2-13, SC-011). The existing duplicate-phone tests must still pass unchanged.
  - **Gives 409 `PHONE_IN_USE` naming the vendor:**
    - create with `"98765-43210"` when a vendor has `"98765 43210"`
    - create whose phone equals another vendor's alternate phone written with spaces
    - create whose alternate phone equals another vendor's phone
    - an edit that introduces a match
  - **Saves:** the same requests with `confirm_duplicate_phone: true`.
  - **No match:** a vendor whose own phone and alternate phone match each other
- [ ] T037 [US2] Write the preview cases in `api/tests/api/vendor-import.test.ts` (US2-1 to US2-4, US2-7, US2-15):
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
- [ ] T038 [US2] Add the confirmation cases to `api/tests/api/vendor-import.test.ts` (US2-5, US2-6, US2-8, US2-9, US2-10, US2-12; FR-008 to FR-008b, FR-010, FR-011):
  - **Mixed-file confirmation:** confirming the mixed file with only the dashed-phone row in `approved_rows` gives 201 with 2 imported, 1 skipped, and 2 rejected, each with its reason. New categories exist once, matched ignoring letter case and spaces. Each imported vendor has `import_run_id`. Each gets one `CREATED` history row with `details.import_run_id`, and the run gets one `CREATED` row.
  - **Repeat confirmation:** a second sequential confirmation gives 200 with the same run id and body. Two parallel confirmations via `Promise.all` give one run and one set of vendors.
  - **Recheck at confirmation:**
    - a vendor saved through `POST /vendors` between preview and confirmation with a `READY` row's GSTIN makes that row `REJECTED`
    - one with a `READY` row's phone makes it `SKIPPED`
    - other rows still import
  - **Forced failure:** a temporary trigger that `RAISE`s on insert into `vendor_import_runs`, created and dropped in the test, gives 500 `IMPORT_FAILED` with "The import did not happen. Nothing was saved.", zero new vendors, zero runs, and a preview still `OPEN` with its rows intact.
  - **No changes to existing vendors:** existing vendors are never changed.
  - **History:** `GET /vendor-imports` lists the run with who, when, file name, and counts, and `GET /vendor-imports/:runId` returns the row outcomes
- [ ] T039 [US2] Add the lifecycle cases to `api/tests/api/vendor-import.test.ts` (US2-6, US2-11, US2-14, US2-16; FR-008c to FR-008e):
  - **Cancel:** gives 200 and clears the stored `rows` to `[]`. Afterwards, view and confirm give 409 `PREVIEW_CANCELLED`, and no vendor is created.
  - **Expiry:** with `expires_at` set 31 minutes in the past through Prisma, view, confirm, and cancel each give 409 `PREVIEW_EXPIRED`, return no rows in the body, and leave the stored `rows` empty.
  - **Clearing on upload:** another expired preview owned by someone else has its stored `rows` cleared when a new upload by a different user arrives.
  - **After confirmation:** the stored `rows` is `[]`, while `vendor_import_runs` and `vendor_import_rows` keep counts, numbers, outcomes, and reasons.
  - **Ownership:** an Accountant viewing, confirming, or cancelling an Office Team member's preview gets 403 `PREVIEW_NOT_YOURS`, and the preview row is byte-for-byte unchanged.
  - **Signed out:** 401 on every import route
- [ ] T040 [P] [US2] Write `web/tests/vendor-import.test.tsx`:
  - the preview table shows outcome badges, reasons, and named matches
  - checkboxes appear only on `POSSIBLE_DUPLICATE` rows
  - confirm posts `approved_rows` with the ticked row numbers
  - the summary shows the counts and the reasons for skipped and rejected rows
  - a 409 `PREVIEW_EXPIRED` shows "This preview has expired. Upload the file again."
  - a 400 `FILE_TOO_LARGE` shows its message

### Implementation for User Story 2

- [ ] T041 [US2] Change `api/src/modules/vendors/routes.ts`. Request and response shapes stay unchanged.
  - `assertPhone` loads `id, name, phone, alternate_phone` for all vendors (archived included), then calls `phoneMatches` for both the submitted phone and alternate phone.
  - Vendor create and `PATCH` run in one `prisma.$transaction` that first calls `vendorIdentityLock(tx)`, then the GSTIN and phone checks, then the write.
  - `presentVendor` adds `import_run: { id, file_name, created_at } | null` (FR-010).

  Makes T036 pass
- [ ] T042 [P] [US2] Create `api/src/lib/xlsx-read.ts`, exporting `readImportFile(originalName, bytes)`, which returns `{ format, headingRow, rows: [{ row_number, cells }] }`:
  - **`.xlsx`:** the bytes must start with `PK` and contain `xl/workbook.xml`. The 25 MB limit has already been checked by the upload route (T043) before this function is called. Load the buffer with `new ExcelJS.Workbook().xlsx.load(bytes)`, not the streaming `WorkbookReader` (research.md), and read only the first worksheet. A whole numeric cell becomes its integer text. A file that fails to load gives 400 `UNSUPPORTED_FORMAT`.
  - **`.csv`:** use `parseCsv`.
  - **Refusals:** `.xls` or any other extension gives 400 `UNSUPPORTED_FORMAT`. A missing heading row or zero data rows gives `EMPTY_FILE`. More than 1,000 non-blank data rows gives `TOO_MANY_ROWS`, for `.xlsx` and `.csv` alike. The whole file is refused and no rows are returned; the first 1,000 are never kept and the rest dropped.
  - **Row numbers** count the heading row as row 1
- [ ] T043 [US2] Create `api/src/modules/vendor-imports/routes.ts` with:
  - **`GET /vendor-imports/template?format=xlsx|csv`:** the `IMPORT_HEADINGS`, sent as an attachment. In the `.xlsx` template, Phone and Alternate phone are formatted as text.
  - **`POST /vendor-imports/previews`:**
    - `singleUpload('file', 25 * 1024 * 1024, '25 MB')` (FR-003)
    - then one `updateMany` setting `rows = []`, `ignored_headings = []`, and `updated_by` to the uploader, where `status = OPEN`, `expires_at < now`, and `rows` is not already empty (FR-008e, Constitution III)
    - then `readImportFile`, `matchHeadings`, and `validateRow` per row
    - one query for every vendor's `id, name, phone, alternate_phone, gstin`, then `previewOutcomes`
    - store the preview with `expires_at = now + 30 minutes`
    - return 201 in the contract shape, with `counts`, `ignored_headings`, and `rows` including `cells`
- [ ] T044 [US2] Add to `api/src/modules/vendor-imports/routes.ts`.

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
- [ ] T045 [US2] Add `POST /vendor-imports/previews/:id/confirm` to `api/src/modules/vendor-imports/routes.ts`. Zod body: `approved_rows`, an array of positive integers. Steps:
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
- [ ] T046 [US2] Add `GET /vendor-imports` (newest first) and `GET /vendor-imports/:runId` (`{ run, rows }`) to `api/src/modules/vendor-imports/routes.ts`. Mount `vendorImportRouter` under `/api` in `api/src/app.ts`. Makes T037, T038, and T039 pass
- [ ] T047 [US2] Create `web/src/pages/vendor-import.tsx`:
  - template download links and a file upload
  - a preview table with row number, name, badge, reasons, and matches, with a checkbox only on possible duplicates
  - a line "Confirm before <expires_at local time> or upload again"
  - Confirm and Cancel buttons; Confirm is disabled while its request is in flight
  - a summary with counts and the reasons for skipped and rejected rows
  - a message for each refusal code

  Makes T040 pass
- [ ] T048 [US2] Create `web/src/pages/vendor-imports.tsx`, a run list with who, when, file, and counts, plus a run detail with row outcomes. Change `web/src/main.tsx` to add routes `#/vendors/import` and `#/vendor-imports` and an "Import vendors" link on the vendors page. Change `web/src/pages/vendor-detail.tsx` to show "Imported in <file> on <date>" when `import_run` is set

**Checkpoint**: US2 works alone. Quickstart API steps 8–18 pass.

---

## Phase 5: User Story 3 - Keep documents on vendors and projects (Priority: P3)

**Goal**: Staff upload, list, download, archive, and restore documents on vendors and projects. Documents are never deleted and are only served to signed-in staff. On an archived record they are read-only.

**Independent Test**: Upload to a vendor and a project, open both, archive one, show it and restore it, and check that a signed-out request is refused (spec US3).

**Requirements**: FR-012, FR-013, FR-014, FR-015, FR-016; FR-027 for document entries. Success criteria SC-004, SC-005, SC-006 (documents).

### Tests for User Story 3 ⚠️

- [ ] T049 [P] [US3] Write `api/tests/api/documents.test.ts` covering US3-1 to US3-7:
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
- [ ] T050 [P] [US3] Write `web/tests/documents-section.test.tsx`:
  - the list shows title, type, file name, size, uploader, and time
  - the "Show archived" toggle adds `include_archived=true`
  - each 400 field message appears beside its field
  - when the parent is archived, upload, archive, and restore controls are hidden and download links remain
  - no delete control is shown for any document, whether active or archived, and whether the parent is active or archived (US3-6). The API's `DELETE /api/documents/:id` returning 404 stays covered by T049

### Implementation for User Story 3

- [ ] T051 [US3] Create `api/src/modules/documents/routes.ts`:
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
- [ ] T052 [US3] Change `api/src/app.ts` to mount `documentRouter` under `/api`
- [ ] T053 [US3] Create `web/src/pages/documents-section.tsx`, with an upload form (file, title, type, note), a list with download links, a "Show archived" toggle, and archive and restore buttons hidden when the parent is archived. Change `web/src/pages/vendor-detail.tsx` and `web/src/pages/project-detail.tsx` to render it. Makes T050 pass

**Checkpoint**: US3 works alone. Quickstart API steps 19–24 pass.

---

## Phase 6: User Story 4 - See counts and money on the dashboard (Priority: P4)

**Goal**: Tiles for active vendors and non-archived projects by status, plus two money tiles: client advances that still stand, and those received this month. A reversal counts against the month its advance was received. Each tile opens its list.

**Independent Test**: With known vendors, projects, advances, and one reversal, every tile equals the hand-worked figure (spec US4).

**Requirements**: FR-023, FR-024, FR-025, FR-026. Success criteria SC-009, SC-010 (dashboard).

### Tests for User Story 4 ⚠️

- [ ] T054 [P] [US4] Write `api/tests/api/dashboard-summary.test.ts` covering US4-1 to US4-8. Seed the data with factories.
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
- [ ] T055 [P] [US4] Write `web/tests/dashboard-tiles.test.tsx`:
  - the tiles render the counts, the money as rupees with two decimals, and each label
  - the links go to `#/vendors`, `#/projects?status=<STATUS>`, `#/client-advances?scope=all`, and `#/client-advances?scope=month`
  - the Feature 002 lists still render below

### Implementation for User Story 4

- [ ] T056 [US4] Create `api/src/lib/dashboard-summary.ts` exporting the pure `presentSummary(role, figures)`, which adds `client_advances` only when `role` is in `ADVANCE_VIEWERS`. Change `api/src/modules/dashboard/routes.ts` to add `GET /dashboard/summary`, which gathers the figures and returns `presentSummary(req.staff.role, figures)`. The figures are:
  - `vendor.count({ archived: false })`
  - `project.groupBy(status)` where `archived: false`, filling missing statuses with 0
  - for roles in `ADVANCE_VIEWERS` only, `clientAdvance.aggregate` with `reversal: null`, once over all advances and once with `received_on` in `[start, end)` from `currentMonthInIndia()`
  - the label strings from the contract, with the month name in English

  Leave `GET /dashboard` untouched
- [ ] T057 [P] [US4] Add `GET /client-advances?scope=all|month` to `api/src/modules/client-advances/routes.ts`, creating the router file and its mount if US1 is not done yet. It returns unreversed advances with `project { id, name, client_name, archived }`, newest `received_on` first, for `ADVANCE_VIEWERS` only
- [ ] T058 [P] [US4] Change `api/src/modules/projects/routes.ts` so `GET /projects` accepts an optional Zod `status` of `PLANNED`, `ACTIVE`, `ON_HOLD`, or `COMPLETED`, combined with the existing archived filter. Makes T054 pass together with T056 and T057
- [ ] T059 [US4] Make these web changes. Makes T055 pass
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

- [ ] T060 [P] [US5] Write `api/tests/api/history.test.ts` covering US5-1 to US5-6:
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

- [ ] T061 [US5] Change `api/src/modules/vendors/routes.ts`. Rating and note routes are unchanged.
  - **Create:** inside the transaction from T041, call `recordHistory(CREATED)`.
  - **`PATCH`:** load the vendor before the change, compute `diffFields` over the field list in `data-model.md` "Fields compared for vendor `EDITED`", and record `EDITED` only when the diff is not empty.
  - **Archive and restore:** wrap them in a transaction with `ARCHIVED` or `RESTORED`
- [ ] T062 [US5] Change `api/src/modules/projects/routes.ts`:
  - create, `PATCH`, archive, and restore each write history in the same transaction
  - `PATCH` compares name, client name, site location, description, and status, and writes nothing for an empty diff
- [ ] T063 [US5] Create `api/src/modules/history/routes.ts` with `GET /history`. Zod requires exactly one of `vendor_id`, `project_id`, `document_id`, `import_run_id`, or `client_advance_id`, as a UUID. The response is `record`, the target's `created_*` and `updated_*` stamps with names, plus `entries` newest first in the contract shape, or 404 when the target does not exist. Mount `historyRouter` under `/api` in `api/src/app.ts`. Makes T060 pass
- [ ] T064 [US5] Create `web/src/pages/history-panel.tsx`, a collapsible list showing "Created by … on …", "Last updated by … on …", and then each entry with its action, person, time, and changed fields. Render it from `web/src/pages/vendor-detail.tsx`, `web/src/pages/project-detail.tsx`, each document row in `documents-section.tsx`, each run in `vendor-imports.tsx`, and each advance in `advances-section.tsx`

**Checkpoint**: All five stories work. Quickstart API steps 29–32 pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Layout, operations note, full checks, demonstration, and converge

- [ ] T065 [P] Change `web/src/styles.css` so the following stay usable at 390 px width with no horizontal page scroll:
  - dashboard tiles in a responsive grid
  - outcome badges `READY`, `REJECTED`, and `POSSIBLE_DUPLICATE`
  - the preview, document, and advance tables, which stack into cards at phone width
- [ ] T066 [P] A documentation-only task under Constitution V. Add a "Backups" section to `README.md` stating that production backups must include the PostgreSQL database and `FILE_STORAGE_DIR`, and that documents must stay recoverable for at least seven years (FR-016, Constitution Product Boundaries). Record review and approval on this task before marking it done
- [ ] T067 Run `npm run lint`, `npm run typecheck`, and `npm test` from the root and confirm all pass. Record the file and test counts under Notes, and compare them with the baseline from T001
- [ ] T068 Run every API scenario in `quickstart.md` (steps 1–32, 10a, 13a), then the web demonstration at desktop width and at 390 px. Time SC-001 (a 500-row import from upload to summary, under 10 minutes) and SC-004 (document upload and reopen, under 1 minute). On the local database, also time the plan's Performance Goals:
  - `POST /vendor-imports/previews` with a 1,000-row file, under 5 seconds
  - `GET /dashboard/summary`, `GET /client-advances?scope=all`, `GET /client-advances?scope=month`, and `GET /projects/:id/client-advances`, each under 1 second at the seeded volume

  Record the results and any failures under Notes
- [ ] T069 Run `/speckit-converge` and resolve any remaining gaps until it reports Converged. Do not open a pull request, commit, or push unless the user asks

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
- Quickstart results from T068: not run yet.
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
