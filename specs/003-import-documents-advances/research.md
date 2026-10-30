# Research: Import, Documents, and Advances

The stack, repository shape, session auth, Zod validation, audit helpers, local file storage, India Standard Time helpers, and test tools are decided in [Feature 001 research](../001-core-auth-directory/research.md) and [Feature 002 research](../002-timelines-delays/research.md). This feature reuses them. The decisions below are the ones this feature adds.

No item in the Technical Context of [plan.md](./plan.md) was left as `NEEDS CLARIFICATION`. Every product question was answered by the product owner and recorded in the spec's Clarifications.

## Decision: Build on `002-timelines-delays`

**Rationale**: The spec fixes the baseline (Clarifications, 2026-10-29). On 2026-10-29 the `003-import-documents-advances` branch was fast-forwarded from `main` (a5641c2) to `002-timelines-delays` (3eeb966). That commit holds the Feature 001 and Feature 002 code, the two existing migrations, and their tests. The fast-forward created no merge commit and did not touch `main`. Local uncommitted files (`.specify/integration.json`, `.specify/integrations/claude.manifest.json`, the 003 spec folder, and ignored local files) were kept.

**Alternatives considered**: Waiting for Features 001 and 002 to merge to `main`. Rejected by the product owner. Merging 002 with a merge commit. Not needed, because 003 had no commits of its own.

## Decision: One new runtime dependency, `exceljs` 4.4.0, to read `.xlsx` and write the `.xlsx` template

**Rationale** (the one-line reason for Constitution Principle II): `.xlsx` is a zipped XML format that Node cannot read without a library, and FR-001 requires it.

- **Whole-workbook read:** the importer loads the uploaded buffer with `workbook.xlsx.load(buffer)` and reads only the first worksheet.
  - **Size:** the 25 MB upload limit (FR-003) is checked by multer before the workbook is loaded, so memory and work stay bounded by that limit.
  - **Rows:** non-blank data rows are counted after loading. A file with more than 1,000 is refused as a whole with `TOO_MANY_ROWS`. The import never keeps the first 1,000 rows and drops the rest.
- **Streaming reader not used (found in T003, 2026-10-29):** `exceljs`'s streaming `WorkbookReader` was the first choice, because it could stop after 1,001 rows. A workbook written by `exceljs` itself made it throw `TypeError: Cannot read properties of undefined (reading 'sheets')` in `WorkbookReader._parseWorksheet`.
  - **Cause:** the streaming reader needs the `xl/workbook.xml` part before the worksheet parts. `exceljs` writes that part last, after `xl/worksheets/sheet1.xml`.
  - **Why it matters:** the `.xlsx` format does not fix the order of parts. So the streaming reader would fail on our own template and on other tools that order parts the same way.
  - **Fix:** `workbook.xlsx.load(buffer)` read the same file correctly, phone leading zero included.
- **Template:** the same package writes the blank `.xlsx` template (FR-002), with the phone columns formatted as text so leading zeros survive.
- **Licence:** MIT.
- **First task:** prove that the package installs and reads a fixture under Node 24 before any importer code depends on it.

**Alternatives considered**:
- **SheetJS `xlsx`:** rejected. The npm registry copy is no longer updated; current releases come from the vendor's own CDN.
- **`read-excel-file`:** rejected. It is read-only, so writing the template would still need a second package.
- **Keeping the `exceljs` streaming reader and refusing files whose workbook part comes late:** rejected. It would refuse valid files, including our own template.
- **Hand-written unzip plus XML parsing:** rejected. It means more code and more risk than one well-used package.

## Decision: Parse CSV with a small in-house parser

**Rationale**: The CSV side needs only RFC 4180:
- comma separators
- quoted fields, with `""` inside quotes
- CR LF or LF line ends
- an optional UTF-8 byte-order mark

A pure function of about 40 lines in `api/src/lib/csv.ts`, written test-first, avoids a second dependency. The bytes are decoded with `TextDecoder('utf-8', { fatal: true })`. A file that is not valid UTF-8 is refused with "Save the CSV as CSV UTF-8 and upload it again." Values are kept as text, with no number or date conversion, so phone numbers keep their leading zeros.

**Alternatives considered**:
- **`exceljs` CSV reader:** rejected. It converts cells to numbers and dates, which damages phone numbers.
- **`csv-parse`:** rejected. It is a second dependency for a small grammar.

## Decision: Import previews live in the database, belong to the uploader, and expire after 30 minutes

**Rationale**: FR-004 and FR-008 to FR-008d need a preview that outlives the upload request. It must be confirmable once, owned by one person, and expire after 30 minutes.

- **Storage:** one `vendor_import_previews` row holds:
  - the file name
  - the uploader
  - `expires_at = created_at + 30 minutes`
  - the parsed rows as `jsonb` (cell text and preview outcome only)
  - a status of `OPEN`, `CONFIRMED`, or `CANCELLED`
- **Raw file:** not kept.
- **Ownership:** every preview route compares `created_by` with the session user. A different user gets 403 `PREVIEW_NOT_YOURS` and the row is not touched (FR-008d).
- **Expiry:** checked against the server clock on each request. An expired preview cannot be viewed, confirmed, or cancelled (FR-008c).
- **Cleanup without a job (FR-008e):** a preview row stays as a small marker (id, owner, status, `expires_at`) so a later request still gets the right refusal, `PREVIEW_EXPIRED` or `PREVIEW_CANCELLED`, instead of a bare 404. Its `rows` and `ignored_headings` are set to empty:
  - inside the confirm transaction, after the run and its row outcomes hold the audit record
  - inside the cancel request
  - on any request for that preview once it has expired
  - at the start of every preview upload, with one `UPDATE … SET rows = '[]' WHERE status = 'OPEN' AND expires_at < now() AND rows <> '[]'` covering everyone's expired previews

  The empty markers are kept rather than deleted. They hold no vendor data, and deleting them would turn a clear refusal into a 404.

**Alternatives considered**:
- **Keeping expired preview data until a job deletes it:** rejected. A job or timer is new infrastructure (Constitution VI), and opportunistic clearing meets FR-008e.
- **Deleting preview rows outright:** rejected. A later confirm on that id would return 404, not the expired or cancelled message FR-008c asks for.
- **Previews in server memory:** rejected. They would be lost on restart and cannot be locked across concurrent requests.
- **Signed tokens carrying the rows:** rejected. A 1,000-row token is large, and it cannot be marked as used, so FR-008b would fail.

## Decision: Confirmation is one database transaction, serialized by a row lock and an advisory lock

**Rationale**: FR-008a needs all-or-nothing on failure. FR-008b needs a confirmation to be safe to repeat. FR-008 needs rows rechecked against the directory as it is at that moment. One Prisma interactive transaction (timeout 60 s) does the following:

1. `SELECT … FOR UPDATE` on the preview row. A concurrent second confirmation waits here.
2. If the preview is already `CONFIRMED`, return the stored run summary with 200. Nothing new is written.
3. If it is `CANCELLED`, refuse with 409 `PREVIEW_CANCELLED`. If it is past `expires_at`, refuse with 409 `PREVIEW_EXPIRED`.
4. `SELECT pg_advisory_xact_lock(3001)`, the vendor-identity lock. Vendor create and vendor edit from Feature 001 take the same lock, so GSTIN and phone checks never race with an import.
5. Load the phone, alternate phone, and GSTIN of every vendor, recheck every row, create categories, vendors, child rows, the run, the row outcomes, and history entries, and mark the preview `CONFIRMED`.

Any thrown error rolls back the whole transaction. The route turns an unexpected failure into 500 `IMPORT_FAILED` with "The import did not happen. Nothing was saved." The preview stays `OPEN`, so the person can retry until it expires.

**Alternatives considered**:
- **Rely on the GSTIN unique constraint alone:** rejected. A race would raise a unique violation and roll back the whole batch, when FR-008 says only that row is rejected.
- **An idempotency key sent by the browser:** rejected. The preview id already identifies the operation.

## Decision: Phone matching is one pure function used by the vendor form and the import

**Rationale**: FR-030 and SC-011 require one rule in both places.
- `phoneKey(text)` removes every whitespace character and every `-`.
- `phoneMatches(candidate, others)` compares the candidate's phone and alternate phone against each other vendor's phone and alternate phone, including archived vendors, which Feature 001 already includes.
- An empty key never matches.

The Feature 001 `assertPhone` changes from an exact SQL match to loading `id, name, phone, alternate_phone` for all vendors and calling `phoneMatches`. At the stated directory size of hundreds of vendors, that is one small query. The 409 `PHONE_IN_USE` response and its `matches` list keep their Feature 001 shape.

**Alternatives considered**:
- **A stored normalized phone column:** rejected. It would add a backfill migration and a second source of truth for little gain at this volume.
- **`regexp_replace` in SQL:** workable, but it would put the rule in two languages.

## Decision: Duplicate checks within a file compare only against earlier rows that are not rejected

**Rationale**: FR-006 and FR-007, as clarified on 2026-10-29, say a rejected row never blocks a later row. `import-duplicates.ts` walks the rows in file order:

1. **Validation:** a row that fails validation (FR-005) is rejected and added to no index.
2. **GSTIN check:** it is checked against the directory's GSTINs and against an index of GSTINs from earlier rows that are not rejected. A hit rejects the row, which is then added to no index.
3. **Phone check:** the row's phone keys are checked against the directory and against an index of phone keys from earlier rows that are not rejected. A hit makes it a possible duplicate naming the match.
4. **Indexing:** the row is added to both indexes. A possible duplicate is added too, because it may still be imported.

So two eligible rows can never share a GSTIN, and a phone shared by eligible rows is always shown as a possible duplicate.

At confirmation:
- **Rows rejected in the preview** stay rejected, whatever happens to the rows around them (FR-008).
- **Every other row** is rechecked against the directory as it is then.
- **Within the file**, nothing changes at confirmation, because the file's contents are fixed.

**Alternatives considered**:
- **Comparing against every earlier row, rejected ones included:** the first draft. Rejected by the product owner, because a row that will never be imported should not block a valid one.
- **Re-deriving file matches at confirmation from approvals:** for example, letting row 8 import because the row 4 it duplicated was not approved. Rejected. It would import a row the person saw as rejected, against FR-008.

## Decision: Import headings and cell rules

**Rationale**:
- **Headings:** the 16 headings of FR-002 come from the Feature 001 vendor form. They are matched after trimming and lower-casing.
- **Unknown headings:** ignored, and the preview lists them once.
- **Refused files:** a repeated heading refuses the file. So does a missing Name, Phone, or Categories heading.

Cell rules mirror the Feature 001 form exactly, with the same messages. Cells are validated by a Zod row schema plus the Feature 001 GSTIN helpers, because Constitution IV requires a schema library for all input, file contents included:

| Cells | Rule |
| --- | --- |
| Name, Phone | Required after trim |
| Categories | At least one value after splitting on `;` |
| Categories, Locations served, Services, Materials | Split on `;`, trimmed, empty parts dropped, duplicates removed ignoring letter case |
| GST registered | `Yes`, `No`, or blank, ignoring letter case. Blank is No, which matches Feature 001's `gst_registered ?? false` |
| GSTIN | `gstinProblem` and `normalizeGstin` from `vendor-rules.ts` |
| Team size | A whole number of zero or more. Numeric `.xlsx` cells are accepted when they are whole |
| Availability | `Available`, `Limited`, `Unavailable`, or blank, ignoring letter case |
| Email, Address, Contact person, Manpower note, GST legal name | No format rule, because the Feature 001 form has none |

A numeric `.xlsx` phone cell is converted to its integer text. The template formats phone columns as text, so this is a fallback.

**Alternatives considered**: Stricter email or phone format checks. Rejected, because FR-005 rejects only what the vendor form would refuse.

## Decision: Documents use the Feature 001 private file store, with content checks by byte signature

**Rationale**: Documents are stored under `FILE_STORAGE_DIR` with a random `uuid + extension` key, like costing sheets. They are served only through an authenticated route with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, so no document has a public URL (Constitution IV, FR-014).

FR-013 requires a check of the actual content. The extension and the content must agree:

| Extension | Content check |
| --- | --- |
| `.pdf` | Starts with `%PDF` |
| `.jpg`, `.jpeg` | Starts with `FF D8 FF` |
| `.png` | Starts with the 8-byte PNG signature |
| `.docx` | ZIP signature `PK`, plus the entry name `word/document.xml` in the archive |
| `.xlsx` | ZIP signature `PK`, plus the entry name `xl/workbook.xml` |
| `.doc` | OLE compound file signature `D0 CF 11 E0`, plus the UTF-16 stream name `WordDocument` |
| `.xls` | OLE compound file signature, plus the UTF-16 stream name `Workbook` or `Book` |

The marker searches are plain byte searches on the uploaded buffer. They tell `.doc` from `.xls` and `.docx` from `.xlsx` without a dependency. A file whose content does not match its extension is refused with "The file's content does not match its type."

**Sizes:**
- The size limit becomes per route. Documents allow 25 MB. Costing sheets keep 10 MB.
- The import limit is 25 MB (FR-003). Multer refuses a larger file before the workbook is loaded or any row is read. A file over 1,000 non-blank data rows is refused as a whole after reading, with nothing imported.
- The Feature 001 error middleware's fixed "10 MB" message is replaced by a message carrying each route's own limit.

**Write order:** the file is written before the database row. If the row insert fails, the file is unlinked as a best effort. No document row ever points at a missing file, which covers the edge case "nothing partial is stored".

**Alternatives considered**:
- **A MIME-sniffing dependency such as `file-type`:** rejected. Seven fixed signatures do not need it, and it cannot tell `.doc` from `.xls` on its own.
- **Object storage:** out of scope. PRD section 12 says local storage first.

## Decision: Client advances and reversals are two append-only tables; "reversed" is derived

**Rationale**:
- `client_advances` holds the amount (`DECIMAL(15,2)`, check `amount > 0`), the date received, method, reference, note, and project.
- `client_advance_reversals` holds a `client_advance_id` with a UNIQUE constraint, the copied amount, and the reason.
- An advance is reversed exactly when a reversal row exists. No column on the advance ever changes, so both tables are insert-only (Constitution III, FR-019).
- The unique constraint enforces "reversed at most once" under concurrency. A unique violation becomes 409 `ALREADY_REVERSED`.
- The reversal schema has no reversal-of-reversal path (FR-020).

This mirrors the Feature 001 `task_price_entries` charge-and-reversal pattern, but uses two tables. An advance reversal carries a mandatory reason, and it can never itself be reversed.

**Alternatives considered**:
- **One table with a `kind` column, like task prices:** rejected. It would need nullable reason and received-date columns, and a check that a reversal never points at a reversal.
- **A `reversed` boolean on the advance:** rejected, because it is an update to a financial record.

## Decision: Money tiles count standing advances by date received

**Rationale**: FR-024 and the 2026-10-29 clarification define both tiles. The month bounds come from a new `currentMonthInIndia(today)` helper in `india-date.ts`, which returns `[YYYY-MM-01, first day of next month)`.

| Figure | Calculation |
| --- | --- |
| Total tile | Sum of `client_advances.amount` with no reversal row, across all projects |
| Month tile | The same sum, restricted to `received_on` inside the current India Standard Time calendar month |
| Project net (FR-021) | The same sum, restricted to one project. This equals advances minus reversals |

A reversal therefore affects only the month in which its advance was received.

**Computation:** each figure is one Prisma `aggregate` with `reversal: null`, summed in PostgreSQL `numeric` and returned as a string with two decimals. JavaScript floating point is never used (SC-007).

**Alternatives considered**: Counting reversals by the date they were recorded. Rejected by the product owner (Clarifications, 2026-10-29).

## Decision: Advance permissions are checked in the module with one shared role list

**Rationale**: FR-017 says Administrators and Accountants record and reverse, and all three roles view. `api/src/lib/permissions.ts` exports `ADVANCE_RECORDERS` and `ADVANCE_VIEWERS`. The advances routes and the dashboard summary check these lists on the server. A refusal is 403 `ROLE_NOT_ALLOWED` with "Only an Administrator or an Accountant can record or reverse a client advance."

All three roles can view today, but `ADVANCE_VIEWERS` is still checked, so a later role cannot receive amounts by accident (FR-025).

Feature 001's `requireRole` keeps its staff-only message, because changing it would change Feature 001 responses.

**Alternatives considered**: Generalizing `requireRole` with a message argument. Workable, but it touches every Feature 001 staff route for one new use.

## Decision: History is one append-only table with one nullable foreign key per record type

**Rationale**: FR-027 covers several record types. Constitution III requires foreign keys enforced in the database, so one polymorphic `entity_id` column is not allowed. `history_entries` instead has the following nullable foreign keys, with a check constraint that exactly one is set:
- `vendor_id`
- `project_id`
- `document_id`
- `vendor_import_run_id`
- `client_advance_id`

Each entry also stores an `action` and a `changes` `jsonb` value in the form `{ field: { from, to } }` for edits. Other actions carry small `details`, such as the import run of an imported vendor or a reversal reason.

**How entries are written:**
- Entries are written in the same transaction as the change.
- The diff comes from a pure `diffFields(before, after, fields)` in `api/src/lib/history.ts`, written test-first. It compares scalar fields as values and list fields (categories, locations, services, materials) as sorted name lists.
- Indicative rates are compared as a sorted list of `label amount unit` strings.

**Pre-existing records:** history starts at deployment (FR-027). The read route also returns the record's existing `created_*` and `updated_*` stamps, so a pre-existing record shows who created it and who last changed it. No earlier entries are made up.

**Append-only enforcement:** follows Feature 002's approach. `append-only.test.ts` is extended to ban update and delete calls on `historyEntry`, `clientAdvance`, `clientAdvanceReversal`, `vendorImportRun`, and `vendorImportRow`, and delete calls on `document`.

**Alternatives considered**:
- **Database triggers:** rejected. The test reset deletes rows, and Feature 002 relies on the source check.
- **A generic polymorphic id without foreign keys:** rejected under Constitution III.
- **Per-type history tables:** rejected. That would mean five tables with one shape.

## Decision: Dashboard tiles are a separate read route

**Rationale**: Feature 002's `GET /api/dashboard` and its tests define the timeline lists. A new `GET /api/dashboard/summary` returns the count tiles and, for `ADVANCE_VIEWERS`, the money tiles. The web dashboard calls both. Feature 002's route and tests are not changed.

**Click-through lists:**
- The vendor tile opens the existing directory.
- A project tile opens the project list with a new `status` filter on `GET /api/projects`. This is a small Feature 001 addition.
- A money tile opens `GET /api/client-advances?scope=all|month`, the standing advances behind that tile.

**Alternatives considered**: Adding fields to `GET /api/dashboard`. Rejected. It mixes two features' scopes in one response and risks Feature 002's shape tests.

## Decision: Forcing a confirmation failure in tests uses a temporary database trigger

**Rationale**: US2-12 and SC-003 need a failure part way through confirmation. The test:

1. creates a trigger that raises on insert into `vendor_import_runs`, which happens after the vendors are inserted
2. confirms
3. checks for 500 `IMPORT_FAILED`, zero new vendors, zero runs, and a preview still `OPEN`
4. drops the trigger

No test hook is added to application code.

**Alternatives considered**: A test-only environment flag in the route. Rejected. It is application code that exists only for tests.

## Decision: Backups of the file store are an operations prerequisite, not code

**Rationale**: FR-016 is met in code by having no delete path for documents. Constitution Product Boundaries asks that documents stay recoverable for seven years, and PRD section 8 requires backups before production use. Both the PostgreSQL database and `FILE_STORAGE_DIR` must therefore be inside the production backup. That belongs in the deployment runbook and is recorded under Delivery in the plan. No backup code is written in this feature.
