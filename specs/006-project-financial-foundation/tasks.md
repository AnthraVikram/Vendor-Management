---

description: "Task list for Feature 006 — Client Financial Management"
---

# Tasks: Client Financial Management

**Input**: Design documents from `specs/006-project-financial-foundation/` ([plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/http-api.md](./contracts/http-api.md), [quickstart.md](./quickstart.md))

**Tests**: Required. Constitution Principle V: every acceptance scenario has an automated test, and business-rule tests are written first and seen failing for the intended reason before the code that makes them pass.

**Organization**: by user story, in spec priority order (US1 to US4 are P1; US5 and US6 are P2). Shared building blocks used by several stories (schema, migration, state derivation, lock, attachments, document types) are in Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to

## Path Conventions

npm workspaces: `api/` (Express, Prisma) and `web/` (React, Vite). API tests in `api/tests/api` and `api/tests/unit`; web tests in `web/tests`. New server code in `api/src/modules/client-finance/`; new web code in `web/src/pages/client-finance/`.

## Safety rules for every task

- Never run `prisma migrate reset`, `db push`, `npm run dev` or destructive SQL. The migration reaches the embedded test database (port 54329, `vendor_test`) only through `api/tests/global-setup.ts`, and only when `DATABASE_URL` is unset. Never run tests with the development `DATABASE_URL` set. The development database receives the migration only after the product owner reviews the SQL and approves (T075).
- Do not commit, push or merge unless the owner asks. Keep each file's existing line endings. Leave the unrelated `package.json` and `package-lock.json` changes untouched.
- Existing Feature 001 to 005 test assertions stay unchanged; additive cases are allowed only in `api/tests/unit/append-only.test.ts` (T008), `api/tests/api/history.test.ts` (T015) and `api/tests/api/performance.test.ts` (T067), and every other new test goes in a new file. The only superseded test is `web/tests/advances-section.test.tsx` (plan.md, Backward Compatibility); it is moved, with a comment citing the spec's Backward Compatibility table, and listed in the checkpoint note.
- No route, service or script may call `update`, `updateMany`, `upsert`, `delete` or `deleteMany` on a financial model (append-only test, T008).
- Every client-finance write runs in one transaction that starts with the project lock (T016) and contains its checks, rows and every history entry of the action (research R4).
- Every history entry written by Feature 006 code stores `details.record_status`, the associated record's state immediately after the event (research R6), for every action. Entries written by the Feature 003 routes for an Advance (`CREATED` through `POST /projects/:id/client-advances`, `REVERSED` of an Advance) keep their exact Feature 003 `details`. No existing history entry is ever rewritten.
- After code changes, run `graphify update .` (CLAUDE.md).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Record the baseline in this file under T001: `git status --short`, `git rev-parse HEAD`, then from the repository root `npm run lint`, `npm run typecheck`, `npm test` (with `DATABASE_URL` unset) and `npm run build -w web`. Record API and web file, pass and skip counts. Note that `package.json` and `package-lock.json` already carry an unrelated `concurrently` change that this feature must not touch.
- [X] T002 [P] Read-only inventory, recorded under this task: list every existing test that reads client advances, documents, history or dashboard money and activity (`api/tests/api/client-advances.test.ts`, `dashboard-summary.test.ts`, `dashboard-overview.test.ts`, `dashboard.test.ts`, `history.test.ts`, `documents.test.ts`, `archive-preserves.test.ts`, `seed.test.ts`, `performance.test.ts`, `api/tests/unit/append-only.test.ts`, `web/tests/advances-section.test.tsx`, `dashboard-tiles.test.tsx`, `dashboard-overview.test.tsx`, `documents-section.test.tsx`, `history-panel.test.tsx`). For each, state whether it must pass unchanged (all except `advances-section.test.tsx`) or is superseded.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user story work begins until this phase is complete.**

### Schema and migration

- [X] T003 Extend `api/prisma/schema.prisma` per [data-model.md](./data-model.md); every new model has `id` UUID, `created_at`, `created_by`, `updated_at`, `updated_by` (FKs to `staff_users`, `onDelete: Restrict`), every FK `onDelete: Restrict`, money `Decimal @db.Decimal(15, 2)`, dates `@db.Date`:
  - enums `RevisionStatus` (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN`), `ReceiptType` (`ADVANCE`, `STAGE_PAYMENT`, `FINAL_PAYMENT`, `OTHER`), `EntryStatus` (`SUBMITTED`, `VERIFIED_ON_ENTRY`), `RecordedUnder` (`FEATURE_003`, `FEATURE_006`), `RecordDecision` (`VERIFIED`, `REJECTED`, `WITHDRAWN`), `SubmissionRoute` (`RECEIPTS`, `CLIENT_ADVANCES`); `DocumentType` adds `QUOTATION`, `PURCHASE_ORDER`, `PAYMENT_PROOF`; `HistoryAction` adds `REVISION_ADDED`, `STATUS_CHANGED`, `APPROVED`, `VERIFIED`, `REJECTED`, `WITHDRAWN`, `CANCELLED`, `ATTACHED`, `ATTACHMENT_REMOVED`, `SUPERSEDED`, `WARNING_CONFIRMED`
  - `ClientQuotation` (`client_quotations`): `project_id` "Required, **unique**"; `reference` "Required, unique", never changed; `title` "Required, 1 to 200 characters"
  - `QuotationRevision` (`quotation_revisions`): `client_quotation_id`; `number` "unique with `client_quotation_id`"; `amount` "Required, `> 0`"; `quotation_date` "no later than today"; `reason` "Required from revision 2"; optional `note`, `validity_date`
  - `QuotationStatusChange` (`quotation_status_changes`): `quotation_revision_id`, `from_status`, `to_status`, `reason` "Required when `to_status` is `REJECTED` or `WITHDRAWN`", optional `note`; unique (`quotation_revision_id`, `to_status`)
  - `ClientApproval` (`client_approvals`): `quotation_revision_id` "Required, **unique**", `amount`, optional `client_acceptance_date`, `note`
  - `ClientPurchaseOrder` (`client_purchase_orders`): `project_id`, `client_approval_id`, `po_number` "Required, 1 to 100 characters, stored as entered", `po_date`, `amount`, `entry_status`, optional `note`
  - `PurchaseOrderDecision` (`client_purchase_order_id` unique, `decision`, `reason`), `PurchaseOrderCancellation` (`client_purchase_order_id` unique, `reason` required), `ClientReceiptDecision` (`client_advance_id` unique, `decision`, `reason`)
  - `FinancialAttachment` (`financial_attachments`): `document_id`; `quotation_revision_id`, `client_approval_id`, `client_purchase_order_id`, `client_advance_id` "Exactly one set"; `supersedes_attachment_id` "Optional; **unique**"; `supersede_reason` "Required when `supersedes_attachment_id` is set"
  - `FinancialAttachmentRemoval` (`financial_attachment_id` unique, `reason` required)
  - `ClientAdvance` adds `receipt_type` (default `ADVANCE`), `entry_status` (default `VERIFIED_ON_ENTRY`), `recorded_under` (default `FEATURE_006`), optional `client_approval_id`, `client_purchase_order_id`, `submission_id` (`@db.Uuid`, `@unique`), `submission_route`
  - `HistoryEntry` adds optional `client_quotation_id`, `client_purchase_order_id` with relations; indexes per research R12
- [X] T004 Create `api/prisma/migrations/<timestamp>_client_financial_management/migration.sql` with `npx -w api prisma migrate diff --from-schema-datamodel <schema at HEAD> --to-schema-datamodel prisma/schema.prisma --script` (stdout only; never redirect stderr into the file). Then edit by hand, following data-model.md "Migration steps":
  - `CREATE SEQUENCE client_quotation_reference_seq`
  - `recorded_under` added as `NOT NULL DEFAULT 'FEATURE_003'` (fills existing rows), then `ALTER COLUMN recorded_under SET DEFAULT 'FEATURE_006'`
  - checks: `amount > 0` on every new money column; `quotation_revisions` `number = 1 OR reason IS NOT NULL`; status-change reason for `REJECTED`/`WITHDRAWN`; decision reason for `REJECTED`/`WITHDRAWN`; `financial_attachments` `num_nonnulls(quotation_revision_id, client_approval_id, client_purchase_order_id, client_advance_id) = 1` and `(supersedes_attachment_id IS NULL) = (supersede_reason IS NULL)`; `client_advances` `num_nonnulls(client_approval_id, client_purchase_order_id) <= 1` and `(submission_id IS NULL) = (submission_route IS NULL)`
  - replace the history target check with `num_nonnulls(vendor_id, project_id, document_id, vendor_import_run_id, client_advance_id, client_quotation_id, client_purchase_order_id) = 1` (drop the old constraint by name, add the new one)
  Review the full SQL and record under this task that it contains no `UPDATE`, `DELETE`, `INSERT` or `TRUNCATE`, and that its only `DROP` is the replaced history target check constraint. Run `npx -w api prisma generate`.
- [X] T005 [P] Write `api/tests/unit/client-finance-migration.test.ts`: reads the T004 `migration.sql` and asserts no `UPDATE`, `DELETE`, `INSERT`, `TRUNCATE` or `DROP TABLE`/`DROP COLUMN`; exactly one `DROP CONSTRAINT`, for the history target check; `recorded_under` is added with default `'FEATURE_003'` before its default becomes `'FEATURE_006'`; the new history check lists all seven targets.
- [X] T006 [P] Write `api/tests/api/client-finance-migration-rehearsal.test.ts` (migration safety, SC-001). Safety guard first: skip unless the test `DATABASE_URL` host is `127.0.0.1`, its port is `54329` and its database is `vendor_test`; build the rehearsal URL by replacing only the database name with `vendor_migration_rehearsal`, and assert before every operation (create, drop and each `prisma db execute`) that the target database name is exactly `vendor_migration_rehearsal`. Create and drop the scratch database with one standalone statement each, `CREATE DATABASE "vendor_migration_rehearsal"` and `DROP DATABASE IF EXISTS "vendor_migration_rehearsal"`, sent through the test's existing Prisma connection to `vendor_test` with `$executeRawUnsafe` and no `$transaction`; PostgreSQL refuses both inside a transaction block, so a wrapping transaction would fail the test loudly. (Implementation note, 2026-11-18: the `embedded-postgres` `createDatabase`/`dropDatabase` methods first named here refuse to run unless that instance started the cluster, which only `global-setup.ts` may do; they were replaced by this equivalent, dependency-free method. The connection options remain those of `api/tests/global-setup.ts`.) Drop a leftover `vendor_migration_rehearsal` first if it exists, then create it. The test never targets the development database: the guard above requires port 54329 and `vendor_test`, and the development `DATABASE_URL` must never be set when tests run. Then apply every earlier migration in order with the Prisma CLI, `npx prisma db execute --url <rehearsal URL> --file prisma/migrations/<name>/migration.sql` (no new dependency; never `migrate reset` or `db push`), insert Feature 003 data with raw SQL (two projects, three advances, one reversal, their history entries, one document), record per-table row counts and `md5(string_agg(row::text, ...))` checksums of `client_advances` (existing columns only), `client_advance_reversals`, `history_entries` and `documents`, apply the T004 SQL the same way, and assert: counts and checksums equal; every existing advance is `ADVANCE`, `VERIFIED_ON_ENTRY`, `FEATURE_003`, with null links, `submission_id` and `submission_route`; a row inserted afterwards gets `FEATURE_006`. Drop the scratch database at the end with the same `DROP DATABASE IF EXISTS` statement, in `afterAll`, after the same name check (it is the test's own database; never `vendor_test`).
- [X] T007 Update `api/tests/helpers.ts`: in `resetDatabase()`, after `historyEntry` and before `clientAdvanceReversal`, delete `financialAttachmentRemoval`, `financialAttachment`, `clientReceiptDecision`, `purchaseOrderCancellation`, `purchaseOrderDecision`; then, immediately after `clientAdvance` and before `document`, delete `clientPurchaseOrder`, `clientApproval`, `quotationStatusChange`, `quotationRevision`, `clientQuotation` (all foreign keys are RESTRICT, and `client_advances` references POs and approvals). Give `createAdvance` optional `receiptType`, `entryStatus`, `recordedUnder` (defaults unchanged, so Feature 003 tests are unaffected). Add fixture helpers that write directly with Prisma for test setup only: `createLegacyAdvance` (`recordedUnder: 'FEATURE_003'`), `createQuotation`, `addRevision`, `setRevisionStatus` (writes status-change rows), `approveRevision` (status change plus approval), `createPurchaseOrder`, `decidePurchaseOrder`, `cancelPurchaseOrder`, `createReceipt`, `decideReceipt`, `attachDocument`.
- [X] T008 Extend `api/tests/unit/append-only.test.ts` (append-only enforcement, SC-008): add `clientQuotation`, `quotationRevision`, `quotationStatusChange`, `clientApproval`, `clientPurchaseOrder`, `purchaseOrderDecision`, `purchaseOrderCancellation`, `clientReceiptDecision`, `financialAttachment`, `financialAttachmentRemoval` to `appendOnlyModels`, and cases showing `tx.clientApproval.update(` and `tx.financialAttachment.delete(` are caught.
- [X] T009 Run the full API suite (applies the migration to the test database only). Record under this task: the T001 count unchanged plus the new T005, T006 and T008 cases, all passing.

### Shared rules

- [X] T010 [P] Write `api/tests/unit/finance-state.test.ts` first (seen failing): revision state (latest status change, `DRAFT` when none); authoritative approval (highest-numbered `APPROVED` revision; none → null); receipt state (`REVERSED` > decision > `VERIFIED` from `VERIFIED_ON_ENTRY` > `SUBMITTED`); PO state (`CANCELLED` > decision > entry status), "current" = `SUBMITTED` or `VERIFIED`, superseded label "Matches superseded approval (revision n)"; attachment current / removed / "Superseded by"; balance = approved − verified unreversed, outstanding `max(0, d)`, overpaid `max(0, −d)`, "Not available" with reason when no approval; overpayment check returns the four figures; all with `Decimal`, exact to the paisa (₹18,40,000.00 − ₹18,00,000.00 − ₹1,00,000.00 → excess ₹60,000.00).
- [X] T011 Implement `api/src/lib/finance-state.ts` as pure functions to make T010 pass (research R2, R10). Also export the Prisma `where` fragment for "verified, unreversed Advance" used by FR-015 queries.
- [X] T012 [P] Write `api/tests/unit/client-name.test.ts` first: `" mehta  interiors "` and `"Mehta Interiors"` match; `"Mehta Interiors Pvt Ltd"` and `"Mehta Int."` do not; blank or null returns null (FR-029a, OQ-41).
- [X] T013 Implement `api/src/lib/client-name.ts` (trim, collapse whitespace, lower case) and the equivalent SQL expression `lower(regexp_replace(btrim(client_name), '\s+', ' ', 'g'))` as an exported string (research R8).
- [X] T014 [P] Add `FINANCE_REVIEWERS: StaffRole[] = ['ADMINISTRATOR', 'ACCOUNTANT']` to `api/src/lib/permissions.ts`; keep `ADVANCE_RECORDERS` and `ADVANCE_VIEWERS` unchanged.
- [X] T015 Add history targets: in `api/tests/api/history.test.ts` add cases first for `GET /api/history?client_quotation_id=` and `?client_purchase_order_id=` (every role reads; unknown id → 404; two targets → 400); then extend `HistoryTarget` in `api/src/lib/history.ts` with `{ clientQuotationId }` and `{ clientPurchaseOrderId }`, and `TARGETS`, `loadStamps`, `ENTRY_COLUMN` and messages in `api/src/modules/history/routes.ts`. Existing cases unchanged.
- [X] T016 Create `api/src/modules/client-finance/lock.ts`: `lockProject(tx, projectId)` (`SELECT … FROM projects WHERE id = $1::uuid FOR UPDATE`, returns `archived` and `client_name`, 404 if missing); `assertWritable(project, action)` that allows only `REVERSE_RECEIPT`, `REJECT_RECEIPT`, `REJECT_PO`, `CANCEL_PO` on an archived project and otherwise throws 409 `PROJECT_ARCHIVED` (FR-010); `assertExpected(current, expected)` throwing 409 `STALE` with the current state (FR-007); `assertOwnerOrReviewer(staff, createdById)` throwing 403 `ROLE_NOT_ALLOWED`.

### Document types and attachments (used by US2 to US5)

- [X] T017 FR-041 on the API: add cases first to a new `api/tests/api/client-finance-document-types.test.ts` (scenario US3-40): a project document accepts all eight types; a vendor document with `QUOTATION`, `PURCHASE_ORDER` or `PAYMENT_PROOF` is refused with 400 naming `document_type`; existing types unchanged. Then change `api/src/modules/documents/routes.ts` so the accepted list depends on the parent. `documents.test.ts` must pass unchanged.
- [X] T018 [P] FR-041 on the web: add a case to a new `web/tests/client-finance-document-types.test.tsx` first (project upload offers eight types, vendor upload five), then update `web/src/pages/documents-section.tsx`. `documents-section.test.tsx` must pass unchanged.
- [X] T019 Write `api/tests/api/client-finance-attachments.test.ts` first, using the T007 fixtures on every record kind (revision, approval, PO, receipt): permissions by status per FR-042b, including the Cancelled PO row and the approval row (Administrator and Accountant attach, Office Team refused with 403); attaching never changes the record or its status (FR-042a); two history entries per attach and per removal, three per supersede, saved together (FR-042c F4); removal only on active records, reason required, Office Team only their own, refused on final records, on every approval attachment for every role, and on both ends of a supersede chain with the named message (FR-042d, OQ-39); a document archived after it was attached stays attached, labelled archived, openable by every role, and its link is unchanged (FR-042, FR-042c F1); supersede reason required, target current, unsuperseded and on the same record, chain A→B→C (FR-042e); same document twice on one record refused (`ALREADY_ATTACHED`); one document on several records; re-attach after removal is a new attachment; archived document refused (`DOCUMENT_ARCHIVED`) until restored; document of another project or a vendor refused (FR-042f, F9); archived project refuses attach and remove (FR-010); simultaneous attach of the same document to the same record saves one; stale removal refused; every attach, removal and supersede entry (record and document) carries `details.record_status` equal to the record's state at that moment.
- [X] T020 Implement `api/src/modules/client-finance/attachments.ts`: `attachDocuments(tx, record, documentIds, staff)` (used inside record creation) and the routes `POST /financial-attachments` and `POST /financial-attachments/:id/removal` per [contracts/http-api.md](./contracts/http-api.md), with Zod validation, project lock, status from `finance-state.ts`, approval attachments for `FINANCE_REVIEWERS` only and never removable, history entries carrying `details.record_status` on the record target (quotation target with the revision in `details` for revisions and approvals, `client_purchase_order_id` for POs, `client_advance_id` for receipts) and on each document. Make T019 pass.
- [X] T021 Create `api/src/modules/client-finance/routes.ts` with `GET /projects/:id/client-finance` returning the contract shape from the derived states (empty quotation, no POs, receipts list, `summary.approved_amount: null`, `not_available_reason`, `pending_verification: []`, `project.archived`), and mount it with the attachment routes in `api/src/app.ts` after `sessionMiddleware`. Add a smoke case to `api/tests/api/client-finance-attachments.test.ts`: every role reads it; signed out → 401 with no amounts.
- [X] T022 [P] Web groundwork: `web/src/pages/client-finance/types.ts` (response types from the contract) and labels for the new history actions in `web/src/pages/history-panel.tsx` (`REVISION_ADDED` … `WARNING_CONFIRMED`), with cases in a new `web/tests/client-finance-history-labels.test.tsx` (`history-panel.test.tsx` stays unchanged).

**Checkpoint**: migration applied to the test database only; append-only and migration-safety tests in place; state derivation, lock, history targets, document types and attachments working; all Feature 001 to 005 suites green.

---

## Phase 3: User Story 1 — Keep recording client advances exactly as today (Priority: P1) 🎯 MVP

**Goal**: Feature 003 advances, reversals, net amount, tiles and history behave and read exactly as before, now through the shared receipt service.

**Independent Test**: with Feature 003 advances and reversals, every advance, reversal, history entry, net amount and dashboard tile shows the same values; recording and reversing as an Accountant behaves as Feature 003 scenarios 1 to 9; all Feature 003 advance tests pass unchanged.

### Tests for User Story 1 ⚠️ write first, see them fail

- [X] T023 [P] [US1] `api/tests/api/client-finance-legacy-advances.test.ts` (Feature 003 regression): scenarios US1-1 to US1-6 on `createLegacyAdvance` data: same amount, date, method, reference, note, author, time and reversal in `GET /projects/:id/client-advances` and `GET /projects/:id/client-finance` (type Advance, state verified or reversed, `recorded_under: FEATURE_003`, no invented verification row, FR-013); net amount and both tiles equal to the values computed before the change; recording as Accountant through the old route gives the Feature 003 response; reversal rules (full, once, archived allowed); no route changes, re-verifies or deletes a legacy advance (`POST /receipts/:id/verification` → 409 `INVALID_TRANSITION`); history entries unchanged with original person and time (FR-040).
- [X] T024 [P] [US1] `api/tests/api/client-finance-advance-figures.test.ts` (FR-015, OQ-27; also US2-13): with a Submitted advance, a Rejected advance, a Withdrawn advance, a verified Stage payment and verified advances (fixtures), the dashboard tiles, `GET /client-advances?scope=all|month` and the project net amount count only verified, unreversed Advances; once the Submitted advance is verified it is counted; tile labels unchanged; `GET /projects/:id/client-advances` lists verified Advances including reversed ones with their reversal.

### Implementation for User Story 1

- [X] T025 [US1] Create `api/src/modules/client-finance/receipts.ts` with `recordReceipt` (reviewer path: type Advance, `VERIFIED_ON_ENTRY`) and `reverseReceipt` (full amount, once, reason, allowed on archived projects, any verified receipt; refuses Submitted, Rejected, Withdrawn), both inside `lockProject`, writing on the `client_advance_id` target exactly the Feature 003 entries for an Advance (`CREATED` with `amount`, `received_on`; `REVERSED` with `amount`, `reason`; no `record_status`). Reversing a receipt of another type writes `REVERSED` with `details.record_status: REVERSED` (a Feature 006 entry).
- [X] T026 [US1] Make `api/src/modules/client-advances/routes.ts` delegate recording and reversal to T025 with unchanged paths, roles (`ADVANCE_RECORDERS`), validation messages and response shapes; filter the project list to verified Advances including reversed ones, `net_amount` to verified unreversed, and the drill-down to verified unreversed Advances (T011 fragment).
- [X] T027 [US1] Filter the two money-tile aggregates in `api/src/modules/dashboard/routes.ts` with the T011 fragment; labels unchanged.
- [X] T028 [US1] Feature 003 regression run: `client-advances.test.ts`, `dashboard-summary.test.ts`, `dashboard.test.ts`, `dashboard-overview.test.ts`, `history.test.ts`, `archive-preserves.test.ts`, `seed.test.ts` and the web dashboard tests pass with no edits; T023 and T024 pass. Record counts.

**Checkpoint**: US1 works on its own; no Feature 003 test changed.

---

## Phase 4: User Story 2 — Enter receipts and have them verified (Priority: P1)

**Goal**: every role enters receipts; Office Team entries wait for a reviewer; reviewer entries are verified on entry; only verified, unreversed receipts count; repeats are safe.

**Independent Test**: as Office Team enter a ₹2,00,000.00 Stage payment with a payment proof → Submitted, not counted; an Accountant verifies it → counted with person and time; another Office Team entry rejected with a reason → Rejected, never counted.

### Tests for User Story 2 ⚠️ write first, see them fail

- [X] T029 [P] [US2] `api/tests/api/client-finance-receipts.test.ts`: scenarios US2-1 to US2-12, US2-14, US2-15, US2-17 to US2-20: types; Office entry Submitted, reviewer entry verified; verify and reject with person and time, receipt row unchanged; Office Team refused verify, reject, reverse (403); validation messages naming the field (zero, negative, three decimals, above ₹9,999,999,999,999.99, future date, unknown type, vendor fields refused by strict schema, FR-011, NFR-004); full reversal only, partial refused, for every type; archived: new receipt and verify refused, reject and reverse allowed, attach and remove refused; withdrawal by own Office creator with reason, by another Office member refused, without reason refused, no return to Submitted; links (US2-19, FR-021): any approval of the project accepted, including a superseded one; a Verified PO accepted; a Submitted, Rejected, Withdrawn or Cancelled PO, or an approval or PO of another project, refused with 409 `INVALID_LINK`; cancelling the linked PO or approving a newer revision afterwards leaves the receipt and its link unchanged; payment proof attached at entry and later (FR-042b), removal rules on Submitted vs final receipts; two reviewers verify the same receipt at once → one succeeds, the other gets 409 naming the current state; stale `expected_state` → 409 `STALE`; a receipt submitted by an Office Team member who is then revoked can still be verified or rejected and stays attributed to them (US2-20); every Feature 006 entry written carries the expected `details.record_status`.
- [X] T030 [P] [US2] `api/tests/api/client-finance-overpayment.test.ts`: scenario US2-16 (warning body has `approved_amount` 1840000.00, `verified_receipts` 1800000.00, `receipt_amount` 100000.00, `excess` 60000.00; nothing saved without confirmation; with `confirm_overpayment` saved and a `WARNING_CONFIRMED` entry with the four figures, person and time in the same transaction); same on verification of an Office receipt; Office Team submission shows no warning (warning at verification); no warning without an approval (US6-7, FR-035); the Feature 003 `POST /projects/:id/client-advances` route returns the warning only when an approved quotation exists and accepts `confirm_overpayment`, otherwise unchanged; two simultaneous verifications that together overpay → the second gets the warning (re-checked under the lock).
- [X] T031 [P] [US2] `api/tests/api/client-finance-receipt-repeat.test.ts` (idempotency, research R13): same `submission_id` and same details → original receipt, same status code and shape, one row, no extra history entry; document IDs in a different order still match; `confirm_overpayment` not compared (warning first, then confirmed repeat saves once); each differing field (project, user, type, amount, date, method, reference, note, link, document set) → 409 `SUBMISSION_ID_REUSED`, nothing saved; same ID sent to the other creation route → 409; `submission_id` missing on `POST /projects/:id/receipts` → 400; Feature 003 route without the ID behaves as today and with it is protected; a refused first request (validation, archived, warning) leaves the ID unused; two simultaneous identical requests save one receipt.
- [X] T032 [P] [US2] `web/tests/client-finance-receipts.test.tsx`: move the `advances-section.test.tsx` scenarios (record, reverse, read-only states, archived notice) with a comment citing the spec's Backward Compatibility table (Feature 003 FR-017 superseded), adapted to FR-001 (Office Team's control submits for verification); add: type choice, "Awaiting verification" text, verify/reject/withdraw controls by role (FR-044), overpayment confirm dialog with the four figures, one `submission_id` per new receipt reused on retry and on the confirmed repeat, amounts with Indian grouping and "incl. GST".

### Implementation for User Story 2

- [X] T033 [US2] Extend `api/src/modules/client-finance/receipts.ts`: every type (FR-016); Office Team entries `SUBMITTED`; links (at most one, FR-021): `client_approval_id` = any approval of the same project, superseded included; `client_purchase_order_id` = a PO of the same project whose derived state is Verified (not Cancelled) under the lock at entry; otherwise 409 `INVALID_LINK`; the link is never re-checked or changed later; `document_ids` attached in the same transaction through T020; `verifyReceipt`, `rejectReceipt`, `withdrawReceipt` writing one `client_receipt_decisions` row plus a history entry (every Feature 006 entry, including `CREATED` through the new route, verification, rejection, withdrawal and `WARNING_CONFIRMED`, writes `details.record_status`; the Feature 003 route keeps its exact Feature 003 `details`), with `expected_state`, reasons, creator check for Office Team, archived rules (reject allowed, verify and withdraw refused).
- [X] T034 [US2] Overpayment in `receipts.ts` (FR-036): before saving a reviewer receipt or verifying, compute with `finance-state.ts` under the lock; without `confirm_overpayment` → 409 `OVERPAYMENT_CONFIRMATION_REQUIRED` with the four figures; with it, save plus `WARNING_CONFIRMED` entry in the same transaction; skipped when no approval exists. Pass `confirm_overpayment` through the Feature 003 route schema as an optional field.
- [X] T035 [US2] Submission repeat in `receipts.ts` (research R13): after the lock and before other checks, look up `submission_id`; compare route, project, user, type, amount, date, method, reference, note, link and the document-ID set; match → return the original in the caller's response shape; otherwise 409 `SUBMISSION_ID_REUSED`; on a new receipt store `submission_id` and `submission_route`. Required UUID in the new route schema; optional UUID in the Feature 003 route schema.
- [X] T036 [US2] Routes in `api/src/modules/client-finance/routes.ts`: `POST /projects/:id/receipts`, `POST /receipts/:id/verification`, `/rejection`, `/withdrawal`, with Zod `.strict()` bodies per the contract and `FINANCE_REVIEWERS` checks; extend `GET /projects/:id/client-finance` receipts (type, state, `recorded_under`, links, attachments, removed attachments, reversal, decision).
- [X] T037 [US2] Web: `web/src/pages/client-finance/area.tsx` and `receipts.tsx` (entry form with `crypto.randomUUID()` per new receipt, list with states as text, verify/reject/withdraw/reverse by role, overpayment `ConfirmDialog`, attachments panel `attachments.tsx`); replace `<AdvancesSection>` in `web/src/pages/project-detail.tsx` with the Client finance area in place (FR-043).
- [X] T038 [US2] ~~Delete `web/src/pages/advances-section.tsx` and `web/tests/advances-section.test.tsx`~~ **Resolved by owner decision (2026-11-18): retained for existing test compatibility.** The project page no longer uses the component (`web/src/pages/project-detail.tsx` renders `ClientFinanceArea` in its place; no file under `web/src` other than the component itself references it). It is kept because three existing web tests render it directly (`history-panel.test.tsx`, `ist-times.test.tsx`, `loading-placeholders.test.tsx`) and existing test assertions must stay unchanged; `advances-section.test.tsx` is kept and still passes. Its scenarios are also covered for the new panel in `client-finance-receipts.test.tsx` (T032). `web/src/pages/client-advances.tsx` (dashboard drill-down) stays.

**Checkpoint**: US1 and US2 work independently; only the planned web test moved.

---

## Phase 5: User Story 3 — Prepare, submit and revise client quotations (Priority: P1)

**Goal**: one quotation per project with strictly sequential revisions, each with its own status; nothing is edited.

**Independent Test**: as Office Team create a quotation and submit revision 1; an Accountant marks it Under review and rejects it; Office Team adds revision 2 with a reason and submits it; both listed with their own statuses; revision 3 refused now; revision 1 cannot be changed or deleted.

### Tests for User Story 3 ⚠️ write first, see them fail

- [X] T039 [P] [US3] `api/tests/api/client-finance-quotations.test.ts`: scenarios US3-1 to US3-17, US3-36, US3-37, US3-39: create (reference `Q-` + six digits, revision 1 Draft, quotation date not in the future, title 1 to 200); revision needs a reason; `REVISION_ACTIVE` naming revision and status for Draft, Submitted and Under review; new revision after Approved, Rejected or Withdrawn leaves earlier ones unchanged; transitions table FR-025 with roles; reason required for Rejected and Withdrawn; Office Team withdraws only their own Draft; Submitted withdrawal reviewers only; no route edits or deletes a revision; second quotation → `QUOTATION_EXISTS`; archived project refuses every quotation action; submission date recorded automatically; two simultaneous revision requests → exactly one, numbers without gaps or duplicates; stale `expected_status` → `STALE`.
- [X] T040 [P] [US3] `api/tests/api/client-finance-revision-attachments.test.ts`: scenarios US3-18 to US3-35 on revisions through the routes (Draft attach by any role, another person's Draft, Under review attach time, final-status refusals for Office Team, reviewer attach without status change, removal rules, supersede and chain, duplicate, archived document, re-attach).
- [X] T041 [P] [US3] `web/tests/client-finance-quotation.test.tsx`: create form, revision list with own statuses and newest marked, "Add revision" disabled with the reason while one is active, status controls by role, withdraw-own-Draft rule, reason prompts, "incl. GST".

### Implementation for User Story 3

- [X] T042 [US3] `api/src/modules/client-finance/quotations.ts`: `createQuotation` (`nextval('client_quotation_reference_seq')`, revision 1, `CREATED` and `REVISION_ADDED` on the quotation target with `details.record_status: DRAFT`), `addRevision` (`expected_newest_revision`, active check, number = max + 1 under the lock, reason, history with previous and new amount), `changeStatus` (allowed pairs, roles, reason, Draft ownership, archived guard, one status-change row and one `STATUS_CHANGED` entry with `details.record_status` = the new status).
- [X] T043 [US3] Routes `POST /projects/:id/quotation`, `POST /quotations/:id/revisions`, `POST /quotation-revisions/:id/status` in `routes.ts`; quotation, revisions, status changes and attachments in `GET /projects/:id/client-finance`.
- [X] T044 [US3] Web `web/src/pages/client-finance/quotation.tsx` in the Client finance area.

**Checkpoint**: US3 works on its own.

---

## Phase 6: User Story 4 — Review and approve quotations (Priority: P1)

**Goal**: reviewers take a revision through Under review to Approved or Rejected; the approval fixes the approved client amount; the latest approval is authoritative.

**Independent Test**: an Accountant takes Submitted revision 2 with its Quotation document to Under review and approves it at ₹18,40,000.00; the project shows that amount from revision 2; other transitions, a different amount and Office Team review steps are refused.

### Tests for User Story 4 ⚠️ write first, see them fail

- [X] T045 [P] [US4] `api/tests/api/client-finance-approvals.test.ts`: scenarios US4-1 to US4-19: Under review; reject with reason; approve writes status change and approval in one transaction (fault injection after the first insert leaves nothing, FR-008); `AMOUNT_MISMATCH`; `QUOTATION_DOCUMENT_REQUIRED` unless a current, non-removed Quotation-type attachment is on the revision or a Quotation-type project document is in `document_ids`; `document_ids` attached to the approval with their history entries (record and document) in the same transaction; an archived document, another project's document or a vendor document in `document_ids` refuses the whole approval and saves nothing (US4-19); Office Team cannot use the approval route to attach; invalid transitions named; Office Team refused; approval never changes; revision 3 pending leaves revision 2 authoritative; approving revision 3 marks revision 2's approval `superseded_by`; rejected or withdrawn revision 3 keeps revision 2; approving an older revision refused; no approval → no approved amount.
- [X] T046 [P] [US4] `web/tests/client-finance-approval.test.tsx`: approve button only for reviewers on Under review, refusal message without a Quotation document, choosing project documents to attach with the approval, approved amount with revision and "incl. GST", superseded approvals labelled.

### Implementation for User Story 4

- [X] T047 [US4] `approveRevision` in `quotations.ts`: `expected_status`, Under review, newest revision, amount equality, Quotation document on the revision or among `document_ids`, then in one transaction the status-change row, approval row, `APPROVED` history entry (`details.record_status: APPROVED`) and, through T020's `attachDocuments`, one attachment per supplied document with its record and document history entries (FR-026, FR-008).
- [X] T048 [US4] Route `POST /quotation-revisions/:id/approval` with optional `document_ids` (array of UUIDs) in its `.strict()` body; approvals with `authoritative` and `superseded_by` and `summary.approved_amount` in `GET /projects/:id/client-finance`.
- [X] T049 [US4] Web approval controls and display in `web/src/pages/client-finance/quotation.tsx`.

**Checkpoint**: US1 to US4 (the P1 stories) work independently.

---

## Phase 7: User Story 5 — Record the client's purchase order (Priority: P2)

**Goal**: POs reference the authoritative approval at its exact amount; one current PO per approval; warnings for duplicates and pending revisions; reviewer verification and cancellation.

**Independent Test**: with an approval at ₹18,40,000.00, Office Team enters "PO/2026/118" for ₹18,40,000.00 with the PO file → Submitted; an Accountant verifies it; ₹18,00,000.00 or no approval is refused; details never change.

### Tests for User Story 5 ⚠️ write first, see them fail

- [X] T050 [P] [US5] `api/tests/api/client-finance-purchase-orders.test.ts`: scenarios US5-1 to US5-28: required fields named (FR-029); a PO date later than today (India Standard Time) refused naming `po_date`; no approval, non-approved revision, other project, superseded approval (`APPROVAL_SUPERSEDED`) refused; exact amount (`AMOUNT_MISMATCH` with the approved amount); reviewer entry needs a PO document (`PO_DOCUMENT_REQUIRED`), Office entry Submitted; verify needs a PO document and an authoritative approval; reject with reason; withdraw by own Office creator or reviewer; cancel Verified with reason by reviewers only; `CURRENT_PO_EXISTS` naming the current PO; replacement after cancel, reject or withdraw; `DUPLICATE_PO_NUMBER` across matching normalised client names and on the same project, confirmation recorded, no warning for "Mehta Interiors Pvt Ltd" or "Mehta Int.", exact PO-number comparison, blank client names compared only within the project; `PENDING_REVISION` with the authoritative and pending figures, confirmation entry, none when nothing pending; superseded label after a later approval, PO unchanged; current PO or "No PO for the current approved amount"; archived rules; attachment permissions on Verified, Rejected and Cancelled POs; two simultaneous POs on one approval → one saved.
- [X] T051 [P] [US5] `web/tests/client-finance-purchase-orders.test.tsx`: entry form against the authoritative approval, both warnings with confirm, states and superseded label as text, controls by role, current PO line.

### Implementation for User Story 5

- [X] T052 [US5] `api/src/modules/client-finance/purchase-orders.ts` `createPurchaseOrder`: validation, authoritative approval of the same project, amount equality, one current PO, reviewer PO document, `document_ids` via T020, duplicate lookup with the T013 SQL expression, pending-revision check, `confirm_duplicate` and `confirm_pending_revision` with `WARNING_CONFIRMED` entries carrying the figures, history on the `client_purchase_order_id` target, every entry with `details.record_status` (`CREATED` → `SUBMITTED` or `VERIFIED`; `WARNING_CONFIRMED` → the PO's state as saved).
- [X] T053 [US5] `verifyPurchaseOrder`, `rejectPurchaseOrder`, `withdrawPurchaseOrder`, `cancelPurchaseOrder` in `purchase-orders.ts` (one decision or cancellation row and one history entry with `details.record_status`, `expected_state`, reasons, ownership, superseded-approval rule, archived rules).
- [X] T054 [US5] Routes `POST /projects/:id/purchase-orders`, `/purchase-orders/:id/verification|rejection|withdrawal|cancellation`; POs with state, label and attachments and `current_po` in `GET /projects/:id/client-finance`.
- [X] T055 [US5] Web `web/src/pages/client-finance/purchase-orders.tsx`.

**Checkpoint**: US5 works on its own.

---

## Phase 8: User Story 6 — Outstanding balance and client financial history (Priority: P2)

**Goal**: each project shows its approved amount, verified receipts total, outstanding or overpayment, a pending-verification list and one date-ordered history; Recent activity shows client-finance events without amounts.

**Independent Test**: on a project with an approval, a verified PO, a verified advance, a verified payment, a Submitted payment and a reversed advance, the balance equals the approved amount minus the two verified, unreversed receipts to the paisa for every role, and the history lists every event in order.

### Tests for User Story 6 ⚠️ write first, see them fail

- [X] T056 [P] [US6] `api/tests/api/client-finance-summary.test.ts`: scenarios US6-1, US6-2, US6-3, US6-5, US6-6, US6-7; `basis_text` ("Approved client amount ₹18,40,000.00 less verified receipts ₹6,50,000.00"); counted receipts listed; "Not available" with reason, never ₹0.00 (FR-035); overpaid without a new receipt (lower revision approved later) shows ₹0.00 and the overpayment with no warning; no other derived figure in the response (FR-037); `pending_verification` lists Submitted receipts and POs (FR-046); every record carries project, type, business date, amount, state, author, time and links (FR-047); SC-007 hand-computed totals for every seeded project.
- [X] T057 [P] [US6] `api/tests/api/client-finance-history.test.ts`: scenario US6-4 and FR-038: every quotation, revision, status change, approval, PO, receipt, verification, rejection, withdrawal, cancellation, reversal and attachment event once, in time order, with amount where it has one, state, person, time and record link; legacy advances with original dates and authors; Feature 003 entries without `details.record_status` show state Verified for `CREATED` and Reversed for `REVERSED` (research R6), and their history rows are unchanged; `GET /api/dashboard/overview` `recent_activity` (FR-039, decisions 2026-11-18): quotation, PO and new receipt entries with event, project, person, time and `status` equal to the state right after each event, for every action: quotation `CREATED` and `REVISION_ADDED` → Draft, `STATUS_CHANGED` → the new status, `APPROVED`, receipt and PO `CREATED` → Submitted or Verified, decisions, `REVERSED`, `CANCELLED`, and `WARNING_CONFIRMED`, `ATTACHED`, `ATTACHMENT_REMOVED`, `SUPERSEDED` → the record's state at that moment (Approved for an approval); a Feature 006 event on an Advance receipt (for example verifying an Office Team advance) is kind `client_advance` with `status`; no amount in any field; Feature 003 advance entries (`CREATED` through the Feature 003 route, `REVERSED` on an Advance) deep-equal the response they had before this feature (same keys, kind `client_advance`, no `status` key); a reversal of a Stage payment is kind `client_receipt`, `status` Reversed, no amount; a Final payment `CREATED` entry is kind `client_receipt`; `GET /history?client_advance_id=` returns the history of non-Advance receipts too; history rows are unchanged after the request; document history shows attach, removal and supersede events (FR-042c F4).
- [X] T058 [P] [US6] `web/tests/client-finance-summary.test.tsx`: the three figures with "incl. GST" and Indian grouping (FR-045), "Not available", "₹0.00 outstanding" plus "Overpaid by ₹X (incl. GST)", pending list, history list, states in text (NFR-003); dashboard tiles keep Feature 003 labels; the project page's "Budget & Costing" and "Procurement" section text is rendered unchanged and the Client finance area makes no request for it (FR-050); after a receipt is verified elsewhere, re-opening the project shows the new figures from a fresh request, with no cached values (NFR-002).
- [X] T059 [P] [US6] `web/tests/client-finance-recent-activity.test.tsx` (new file; `dashboard-overview.test.tsx` and its Feature 003 assertions stay unchanged): a Feature 003 advance entry (kind `client_advance`, no `status`) renders exactly "Client advance on …" as today; a Feature 006 event on an Advance receipt renders that line with its status; `client_receipt`, `client_quotation` and `client_purchase_order` entries render event, project, person, time and status, including `WARNING_CONFIRMED` and attachment events; no amount appears anywhere in the Recent activity list.

### Implementation for User Story 6

- [X] T060 [US6] Summary and pending list in `GET /projects/:id/client-finance` (`api/src/modules/client-finance/routes.ts`) using `finance-state.ts`, in a fixed number of queries (research R12).
- [X] T061 [US6] `GET /projects/:id/client-finance/history` merging entries of the project's quotation, POs and receipts by time; each entry's state is `details.record_status`, or, for a Feature 003 entry without it, Verified for `CREATED` and Reversed for `REVERSED` (research R6); no history row is written or rewritten.
- [X] T062 [US6] `api/src/modules/dashboard/routes.ts` Recent activity (research R6): include `client_quotation_id` and `client_purchase_order_id` entries; target kinds `client_advance` (unchanged) for receipts of type Advance, `client_receipt` for other receipt types (chosen from `receipt_type` when read; no schema or history-target change, research R6), `client_quotation`, `client_purchase_order`, each with the project id and name; Feature 003 advance entries are returned in their exact existing shape with no `status`; for every other client-finance entry add `status` = `details.record_status`. Feature 003 advance entries are the client-advance entries without `details.record_status` (`CREATED` through the Feature 003 route, `REVERSED` of an Advance); they keep `changes` and `details` exactly; every other client-finance entry, including `REVERSED` on a non-Advance receipt, omits amounts from `changes` and `details`. Never write to existing history entries.
- [X] T063 [US6] Web `web/src/pages/client-finance/summary.tsx` and `history.tsx` in the Client finance area. In `web/src/pages/dashboard.tsx`, keep the existing `client_advance` line ("Client advance on …") exactly as it renders today when the entry has no `status` (Feature 003 entries), and append the status when it has one (Feature 006 events on Advance receipts); add lines for `client_receipt`, `client_quotation` and `client_purchase_order` with the status; no amounts. `dashboard-overview.test.tsx` stays unchanged.

**Checkpoint**: all six stories work independently.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T064 `api/tests/api/client-finance-roles.test.ts` (permissions, SC-005): for every FR-001 action row, each of Administrator, Accountant and Office Team gets the allowed outcome or 403 `ROLE_NOT_ALLOWED`; signed-out and revoked people get 401 with no amount in the body (FR-002); controls hidden in the web are still refused by the server.
- [X] T065 [P] `api/tests/api/client-finance-archived.test.ts` (FR-010): on an archived project every action in FR-010 is refused except reversal, rejection of a Submitted receipt or PO and cancellation of a Verified PO; records stay readable; after restore the refused actions work again; archiving changes no financial row.
- [X] T066 [P] `api/tests/api/client-finance-no-edit.test.ts` (append-only, SC-008): `PUT`, `PATCH` and `DELETE` on every client-finance path and on `/client-advances/:id` return 404 or 405 and change nothing; the T008 scan passes.
- [X] T067 [P] Extend `api/tests/api/performance.test.ts` (NFR-001): 50 projects, each with one quotation of 200 revisions (NFR-001 as corrected 2026-11-18), 10 POs and 200 receipts; `GET /projects/:id/client-finance` and the project page requests under 2 seconds.
- [X] T068 [P] Web layout and accessibility in a new `web/tests/client-finance-layout.test.tsx`, following the patterns of `phone-layout.test.tsx` and `visual-system.test.tsx`: the Client finance area at 375, 768 and 1280 px without horizontal scroll, labelled controls, and states carried by text, not colour alone (NFR-003).
- [X] T069 Full checks: `npm run lint`, `npm run typecheck`, `npm test` (with `DATABASE_URL` unset), `npm run build -w web`; compare with T001; the only removed test is `advances-section.test.tsx` (moved, T038); record counts; run twice for flakiness.
- [X] T070 [P] Run `graphify update .` (CLAUDE.md).
- [X] T071 Diff review recorded under this task: no mixed line endings; no new runtime dependency (NFR-005); `package.json` and `package-lock.json` unchanged by this feature; no secrets; no financial `update`/`delete` outside test helpers; migration only adds; every new route behind the session check with a server-side role check and Zod validation (Constitution IV).
- [X] T072 Read-only review of spec, plan, contract, data model, tasks and changed files for drift; record findings.
- [X] T073 Stop and report to the owner: counts, superseded test, open items, the migration SQL for review.
- [X] T074 Prepare the migration evidence for T075: the T004 SQL, the development database's pending migration list (read-only `prisma migrate status`), current row counts and content checksums of `client_advances`, `client_advance_reversals`, `history_entries` and `documents`.
- [X] T075 **Migration approval gate**: only after explicit owner approval, start the container with `docker start vendor-management-db-1` (never recreate it), take a backup with `docker exec vendor-management-db-1 pg_dump -Fc -U <user> <database>` redirected to a dated file outside the repository (user and database read from `.env` by the shell, never printed or committed; confirm the file is non-empty), apply with `npm run prisma:deploy -w api` (no seed), and record before and after counts and checksums: equal except the new `client_advances` columns, whose existing rows are `ADVANCE`, `VERIFIED_ON_ENTRY`, `FEATURE_003` with null links, submission ID and route.
- [X] T076 Run [quickstart.md](./quickstart.md) scenarios 1 to 11 on the development database after T075, including SC-003 and SC-004 timings; record results and differences here.
- [X] T077 Run `/speckit-converge` against spec, plan and tasks (constitution V, Delivery Gates). It must report **Converged**; complete any tasks it appends, re-run T069, and record the result here. No pull request opens before this task is done; it is the last task before the final delivery gate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001, T002)**: none.
- **Foundational (T003 to T022)**: after Setup; blocks every story. T003 → T004 → T005, T006, T007 → T008 → T009. T010 → T011; T012 → T013; T014, T015, T016 after T009. T017 → T019 → T020 → T021 (T020 needs T011, T015, T016). T018 and T022 any time after T009.
- **US1 (T023 to T028)**: after Phase 2.
- **US2 (T029 to T038)**: after Phase 2; T025 (US1) is the service it extends, so US1's T025 precedes T033. Its fixtures create approvals and POs directly, so it does not wait for US4 or US5.
- **US3 (T039 to T044)**: after Phase 2.
- **US4 (T045 to T049)**: after US3 (approval extends `quotations.ts` and needs real revisions).
- **US5 (T050 to T055)**: after Phase 2; tests use fixtures for approvals, so it can run beside US3 and US4; T054's `current_po` display uses US4's authoritative-approval output.
- **US6 (T056 to T063)**: after US2, US4 and US5 (it summarises their records); T062 also needs every service that writes `details.record_status` (T020, T025, T033 to T035, T042, T047, T052, T053).
- **Polish (T064 to T077)**: after all stories. T069 before T071; T073 before T074; **T075 only after owner approval**; T076 after T075; T077 (converge) last, before any pull request.

### Within Each Story

- Tests first and seen failing; services before routes; routes before web; checkpoint before the next story.
- `receipts.ts` (T025, T033 to T035), `quotations.ts` (T042, T047), `purchase-orders.ts` (T052, T053) and `routes.ts` are shared files: tasks touching the same file run in order.

### Parallel Opportunities

- Phase 2: T005 ∥ T006; T010 ∥ T012 ∥ T014; T018 ∥ T022.
- Each story's test tasks marked [P] run together.
- After Phase 2 and T025: US2 ∥ US3 ∥ US5 (different files), with US4 after US3.
- Polish: T065 ∥ T066 ∥ T067 ∥ T068 ∥ T070.

---

## Parallel Example: User Story 2

```bash
Task: "client-finance-receipts.test.ts (T029)"
Task: "client-finance-overpayment.test.ts (T030)"
Task: "client-finance-receipt-repeat.test.ts (T031)"
Task: "web client-finance-receipts.test.tsx (T032)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 and Phase 2 (migration on the test database only).
2. US1: Feature 003 behaviour preserved through the shared service.
3. Stop and validate: T028 green, no Feature 003 test changed.

### Incremental Delivery

US1 → US2 (receipts, Office Team entry) → US3 → US4 (the approved amount) → US5 → US6 (balance and history) → Polish → owner approval gate (T075) → quickstart (T076). Stop for the owner's review at each checkpoint and always before T075.

---

## Coverage Map

| Requirement | Tasks |
|---|---|
| FR-001, FR-002, FR-044 | T014, T016, T029, T039, T045, T050, T064; web T032, T041, T046, T051 |
| FR-003 | T026 (Feature 003 route stays reviewer-only), T028, T064 |
| FR-004, NFR-004 | T003, T004, T029, T039, T050 |
| FR-005, SC-008 | T008, T039, T045, T050, T066 |
| FR-006 | T016, T029, T039, T050 |
| FR-007 | T016, T029, T039, T045, T050, T019 |
| FR-008 | research R4 in every service task; T045 (fault injection), T019, T030 |
| FR-009, FR-045 | T032, T041, T046, T058 |
| FR-010 | T016, T029, T039, T050, T019, T065 |
| FR-011, FR-033 | T029 (strict schema, no vendor link) |
| FR-012 to FR-015, FR-040, SC-001 | T004 to T006, T023, T024, T025 to T028, T075 |
| FR-016 to FR-021 | T029 to T031, T033 to T037 |
| FR-022 to FR-025a | T039 to T044 |
| FR-026 to FR-028 | T045 to T049 |
| FR-029 to FR-032b | T012, T013, T050 to T055 |
| FR-034 to FR-037, SC-007 | T010, T011, T030, T056, T060 |
| FR-038, FR-039 | T015, T020, T025, T033, T042, T047, T052, T053, T057, T059, T061, T062, T063 |
| FR-041 to FR-042f (approval attachments: T019, T020, T045) | T017 to T020, T029, T040, T050 |
| FR-043, FR-046 | T037, T056, T058, T060, T063 |
| FR-047 | T056 |
| FR-048 | withdrawn; nothing to build |
| FR-049, SC-002 | T002, T028, T069 |
| FR-050 | T058, T069 |
| NFR-001 | T067 |
| NFR-002, NFR-003 | T058, T068 |
| NFR-005 | T071 |
| SC-003, SC-004 | T076 (manual timing) |
| SC-005 | T064 |
| SC-006 | T039, T045 |
| Idempotency (research R13) | T031, T035 |
| Migration safety | T004 to T006, T009, T074, T075 |
| Constitution V converge gate | T077 |

Acceptance scenarios: US1-1 to 6 → T023 (US1-2 also T024); US2-1 to 20 → T029, T030 (16), T024 (13); US3-1 to 17, 36, 37, 39 → T039; US3-18 to 35 → T040; US3-40 → T017, T018; US4-1 to 19 → T045; US5-1 to 28 → T050; US6-1 to 7 → T056, T057, T030 (7); Recent activity web presentation → T059.

## Owner Decisions on Task-Generation Items (2026-11-18)

All six items raised by task generation are decided (spec Clarifications, Session 2026-11-18):

- **O1 — Recent activity amounts**: entries added by Feature 006 expose no amounts; Feature 003 advance entries keep their existing response; the screen is unchanged → FR-039, Backward Compatibility, research R6, contract, T057, T062, T063.
- **O2 — Approval documents**: optional `document_ids` on the approval route; the Quotation document may be on the revision or in the request; approval, links and history saved together → FR-026, US4-19, data model, contract, T045 to T048.
- **O3 — Receipt links**: any approval of the project, superseded included; a PO must be Verified and not Cancelled at entry; later changes never invalidate the link → FR-021, US2-19, data model, contract (`INVALID_LINK`), T029, T033.
- **O4 — Recent activity status**: the record's state immediately after the event, derived from its history entry, never rewritten → FR-039, research R6, contract, T057, T062.
- **O5 — Seeded advances**: no change; existing rows `FEATURE_003`, rows the seed creates after the migration `FEATURE_006` → research R3; no task.
- **O6 — NFR-001**: one quotation per project with up to 200 revisions, 50 projects, 10 POs, 200 receipts, under 2 seconds → spec NFR-001, plan Performance Goals, T067.
- **Analysis follow-up (2026-11-18)**: converge task added (T077); every Feature 006 history entry captures `details.record_status`; status shown for Feature 006 events on Advance receipts; approval attachments by Administrators and Accountants only, never removed; dedicated Recent activity web test (T059); migration rehearsal via the Prisma CLI with a database-name guard (T006); additive-tests rule; C2, C3, C4, I4, I5, U2 and U3 resolved.
- **Follow-up (2026-11-18)**: Feature 003 advance entries keep their exact Recent activity shape with no `status`; reversals of non-Advance receipts are Feature 006 entries with no amount; `client_receipt` is a Recent activity target kind for non-Advance receipts, while every receipt keeps the `client_advance_id` history target → FR-039, research R6, contract, T057, T062.

## Implementation Record

### Phases 1 and 2 (2026-11-18)

- **T001 baseline**: HEAD `16a025b`; working tree had only the Feature 006 documents, `docs/prd.md` and the unrelated `package.json`/`package-lock.json` change. Lint and typecheck clean; API 55 files, 395 passed; web 38 files, 322 passed, 1 skipped; `npm run build -w web` passes.
- **T002 inventory**: every test listed in T002 must pass unchanged except `web/tests/advances-section.test.tsx`. Found during implementation: `web/tests/history-panel.test.tsx`, `ist-times.test.tsx` and `loading-placeholders.test.tsx` also render `AdvancesSection` directly, and seven project-page tests mock `/api/projects/p1/client-advances` without asserting advance content (see T038).
- **T003**: `api/prisma/schema.prisma` gains the six enums, enum values, ten models and the new `client_advances` and `history_entries` columns; only additions (317 lines, no existing line changed). `prisma format` was not used because it re-aligns existing lines.
- **T004**: `api/prisma/migrations/20261118120000_client_financial_management/migration.sql`, generated with `prisma migrate diff` from the HEAD schema plus the hand-written sequence, `recorded_under` default sequence and checks. Reviewed: no `UPDATE`, `DELETE`, `INSERT` or `TRUNCATE` statement; the only `DROP` is `DROP CONSTRAINT "history_entries_target_ck"`, replaced by the seven-target check. `prisma generate` run.
- **T005**: `api/tests/unit/client-finance-migration.test.ts` (4 cases) passes.
- **T006**: `api/tests/api/client-finance-migration-rehearsal.test.ts` passes on the embedded cluster: counts and checksums of `client_advances` (existing columns), `client_advance_reversals`, `history_entries` (existing columns) and `documents` are identical before and after the migration; existing advances read `ADVANCE`, `VERIFIED_ON_ENTRY`, `FEATURE_003`, no links or submission ID; a later row gets `FEATURE_006`. Method changed from the task text, see the T006 implementation note.
- **T007 to T009**: test reset order and Feature 006 fixtures in `api/tests/helpers.ts`; append-only scan covers the ten new models (+1 case). Full API suite green.
- **T010 to T016**: `lib/finance-state.ts` (15 unit cases), `lib/client-name.ts` (3), `FINANCE_REVIEWERS`, history targets (+1 additive case in `history.test.ts`; existing cases unchanged), `client-finance/lock.ts`. Each test was seen failing first.
- **T017, T018**: project-only document types on the API (2 cases) and the web upload form (2 cases); `documents.test.ts` and `documents-section.test.tsx` unchanged and passing. The documents list badge also names the new types.
- **T019 to T021**: attachment service and routes (`client-finance/attachments.ts`, `records.ts`), the full read model `client-finance/view.ts` and `GET /projects/:id/client-finance`, mounted after the session check. 11 cases pass.
- **T022**: `web/src/pages/client-finance/types.ts`; history labels, status words and hidden internal ids in `history-panel.tsx` (1 new web test file; `history-panel.test.tsx` unchanged).
- **Checkpoint**: lint and typecheck clean; API 61 files, 433 passed; web 40 files, 325 passed, 1 skipped. The development database was not started or touched.

### US1 (2026-11-18)

- **T023, T024**: `client-finance-legacy-advances.test.ts` (7 cases) and `client-finance-advance-figures.test.ts` (1). The figures test failed first for the intended reason (Submitted, Rejected and Withdrawn advances and a Stage payment were counted). T023's "re-verifying a legacy advance is refused" needs the US2 verification route, so it was moved to T029.
- **T025 to T027**: `client-finance/receipts.ts` records and reverses receipts under the project lock; the Feature 003 routes delegate to it with unchanged paths, roles, messages and responses; the project list, net amount, drill-down and both tiles use the verified-Advance filters from `finance-state.ts`.
- **T028**: `client-advances`, `dashboard-summary`, `dashboard`, `dashboard-overview`, `history`, `archive-preserves` and `seed` API tests and the web dashboard tests pass with no edits (API 9 files, 62 tests; web 30 tests).

### US2 (2026-11-18)

- **T029 to T031**: `client-finance-receipts.test.ts` (11 cases), `client-finance-overpayment.test.ts` (5), `client-finance-receipt-repeat.test.ts` (6); all 22 failed first (no routes), then passed. One test fix: the withdrawn-receipt case sent `reason` to the verification route, which correctly refuses unknown fields.
- **T033 to T036**: receipt types, Office Team Submitted entries, links (`INVALID_LINK`), documents at entry, verify, reject and withdraw with `expected_state`, ownership and archived rules, overpayment warning and confirmation, repeated-submission guard (route, project, person and every detail compared; document IDs as a set), and the routes. The Feature 003 route accepts the optional `confirm_overpayment` and `submission_id`, and its reversal route now refuses an `amount` other than the full amount (400), as FR-020 requires.
- **T032, T037**: `web/tests/client-finance-receipts.test.tsx` (7 cases) and the Client finance area (`area.tsx`, `receipts.tsx`, `attachments.tsx`, `money.ts`) replacing the Advances section on the project page. The panel was written before its test in this task, so this web step was not strictly test-first. A first full web run failed 16 existing project-page tests because the area crashed on their generic mock replies; the area now treats an unexpected reply as an inline load error, and all of them pass unchanged.
- **T038 not done (needs an owner decision)**: `web/src/pages/advances-section.tsx` cannot be deleted without editing three existing test files that render it directly (`history-panel.test.tsx`, `ist-times.test.tsx`, `loading-placeholders.test.tsx`), which the safety rules forbid. The component and `advances-section.test.tsx` are kept, unused by the project page; both still pass.
- **Checkpoint**: lint and typecheck clean; API 66 files, 463 passed; web 41 files, 332 passed, 1 skipped.

### US3 and US4 (2026-11-18)

- **T039, T040**: `client-finance-quotations.test.ts` (9 cases) and `client-finance-revision-attachments.test.ts` (5); all failed first except the "no edit route" case, which holds before and after.
- **T042, T043**: `client-finance/quotations.ts` (create with `Q-` + six-digit reference from the sequence, sequential revisions with `REVISION_ACTIVE` and `STALE`, the FR-025 transition table with roles, reasons and Draft ownership; every entry carries `record_status`) and the three routes. `APPROVED` sent to the status route is refused with `INVALID_TRANSITION` naming the current status (US4-5).
- **T041, T044**: `web/tests/client-finance-quotation.test.tsx` (5 cases, failed first) and `quotation.tsx`. The quotation form's amount field is labelled "Quoted amount (incl. GST)" so it is not confused with the receipt form's "Amount (incl. GST)". The reason prompt moved to a shared `controls.tsx`.
- **T045, T047, T048**: `client-finance-approvals.test.ts` (9 cases; 6 failed first): approval at the exact amount, Quotation document on the revision or supplied with the approval, documents attached in the same transaction, and an archived, foreign or repeated document rolls back the whole approval (FR-008 fault injection); authoritative and superseded approvals.
- **T046, T049**: `web/tests/client-finance-approval.test.tsx` (3 cases, failed first); Approve control with document choice, approvals list with the current approved amount and superseded labels.

### US5 (2026-11-18)

- **T050**: `client-finance-purchase-orders.test.ts` (10 cases, all failed first): required fields named, future PO date, no or foreign approval, exact amount, one current PO and replacements, PO document before verification, own-only withdrawal, duplicate warning across matching normalised client names (exact PO numbers; aliases, other spellings and blank names not matched), pending-revision warning with recorded figures, superseded label and refusals, current PO text, archived rules, two simultaneous POs.
- **T052 to T054**: `client-finance/purchase-orders.ts` and the five routes. Check order: archived, approval exists and is authoritative, amount, one current PO, reviewer PO document, then the two warnings (each confirmed separately and recorded as `WARNING_CONFIRMED` with its figures and `acknowledged: true`).
- **T051, T055**: `web/tests/client-finance-purchase-orders.test.tsx` (4 cases, failed before the panel was mounted) and `purchase-orders.tsx`.

### US6 (2026-11-18)

- **T056, T060**: `client-finance-summary.test.ts` (5 cases). These passed on their first run, because the balance, basis text, "Not available", overpayment and pending list were already built into the read model in T021; they are not test-first. SC-007 is checked against hand-computed figures to the paisa.
- **T057, T061, T062**: `client-finance-history.test.ts` (4 cases; the two history and Recent activity cases failed first). `GET /projects/:id/client-finance/history` merges the quotation, PO and receipt entries in time order, with the captured `record_status` or, for Feature 003 entries, Verified or Reversed. Recent activity adds quotation and PO entries; Feature 006 entries carry `status` and no amount (`client_advance`, `client_receipt`, `client_quotation`, `client_purchase_order` kinds); Feature 003 advance entries keep their exact shape with no `status`. No history row is written or rewritten by any read.
- **T058, T059, T063**: `web/tests/client-finance-summary.test.tsx` (5) and `client-finance-recent-activity.test.tsx` (1), both failed first; `summary.tsx` (balance, pending list, history) and the dashboard lines. `dashboard-overview.test.tsx` unchanged and passing.
- **Checkpoint**: lint and typecheck clean; API 72 files, 505 passed; web 46 files, 350 passed, 1 skipped.

### Polish (2026-11-18)

- **T064**: `client-finance-roles.test.ts`: 26 FR-001 actions × 3 roles (allowed roles succeed; others get 403 `ROLE_NOT_ALLOWED`), and signed-out and revoked people get 401 with no amount on 13 routes. Passes.
- **T065**: `client-finance-archived.test.ts`: 12 refused actions return `PROJECT_ARCHIVED`; reversal, receipt and PO rejection and PO cancellation still work; records stay readable; refused actions work after restore.
- **T066**: `client-finance-no-edit.test.ts`: `PUT`, `PATCH` and `DELETE` on 9 client-finance paths return 404 and change no row.
- **T067**: `performance.test.ts` (additive): 50 projects × one quotation of 200 revisions, 10 POs and 200 receipts. Client finance request 36 to 48 ms; with the project request, far under 2 seconds.
- **T068**: `web/tests/client-finance-layout.test.tsx`; added `.inline-actions` and `.attachment-list` rules to `styles.css` (the classes were used but unstyled).
- **T069**: lint, typecheck and `npm run build -w web` pass. Two consecutive runs: API 75 files, 511 passed; web 47 files, 352 passed, 1 skipped. Baseline was API 395 and web 322 (+1 skipped): no existing test was changed, removed or skipped.
- **T070**: `graphify update .` run.
- **T071**: no mixed line endings (new files CRLF like the rest of the working tree; tracked diff identical with and without `--ignore-cr-at-eol`); no new dependency; `package.json` and `package-lock.json` carry only the pre-existing, unrelated `concurrently` change; no secrets; no `update`/`delete` of a financial model in `api/src`; the migration only adds; every new route is mounted after the session check, with server-side role checks and strict Zod bodies.
- **T072 review, deviations and readings to note**:
  - T006 creates the scratch database with plain statements through the test connection instead of the `embedded-postgres` methods (implementation note in T006).
  - T038 not done: deleting `advances-section.tsx` would require editing three existing web tests. The component and its test are kept, unused by the project page.
  - Not strictly test-first: the read model behind T056 was built in T021, and the US2 web panel (T037) was written before its test (T032).
  - Error codes the contract leaves open: a document of another project or a vendor is refused with 400 `fields.document_id`; an invalid supersede target is 409 `INVALID_SUPERSEDE`; a PO entered with no approved quotation is 400 `fields.client_approval_id`; the reversal route refuses an `amount` other than the full amount with 400 (FR-020); reversing a receipt that is not verified is 409 `INVALID_TRANSITION`.
  - Response bodies the contract leaves open: the receipt, revision, approval and PO routes return the same object as in `GET /projects/:id/client-finance`.
- **T073**: reported to the owner on 2026-11-18 with these results; stopped before T074, which is the first task that touches the development database.

### T038 decision (2026-11-18)

- Owner decision: `advances-section.tsx` and its test are retained, unused by the project page, so the three existing web tests that render it stay unchanged. Deviation from the task text (which said to delete them) recorded on T038.

### Migration review changes (2026-11-18, owner decisions)

- **Concern 1, atomicity**: `migration.sql` now starts with `BEGIN;` and ends with `COMMIT;`, so the history target check replacement and every other statement apply together or not at all. Checked compatible: `CREATE TYPE`, `CREATE SEQUENCE`, `ALTER TABLE` and non-concurrent `CREATE INDEX` are transaction-safe, and on PostgreSQL 17 `ALTER TYPE ... ADD VALUE` may run in a transaction as long as the new value is not used before `COMMIT` (none is).
- **Concern 2, status transitions**: added `quotation_status_changes_transition_ck`, allowing exactly DRAFT→SUBMITTED, DRAFT→WITHDRAWN, SUBMITTED→UNDER_REVIEW, SUBMITTED→WITHDRAWN, UNDER_REVIEW→APPROVED and UNDER_REVIEW→REJECTED. `from_status` and `to_status` are both `NOT NULL`, so the check cannot evaluate to NULL.
- **Concern 3, defaults**: kept as reviewed.
- **Tests**: `client-finance-migration.test.ts` +2 (one transaction with no other transaction control; exactly the six pairs and both columns NOT NULL). The rehearsal (T006) now applies migrations with `prisma migrate deploy` on a temporary copy of the migrations folder, as T075 will, and adds two cases: a failure injected late in the file leaves the scratch database exactly as it was (data checksums, enum values, sequence, columns, tables and the history target check), then the attempt is marked rolled back and redeployed; and the database accepts the 6 allowed status changes and refuses the other 30 pairs and NULLs.
- **Finding**: with `BEGIN;`/`COMMIT;` temporarily removed, the atomicity case still passed under both `prisma db execute` and `prisma migrate deploy` (Prisma 6.19.3, PostgreSQL 17): in this setup the file was already applied as one implicit transaction. The explicit transaction is kept as the owner decided; it makes atomicity independent of how the file is run.
- **Checks**: lint and typecheck clean; API 75 files, 515 passed; web 47 files, 352 passed, 1 skipped; web build passes.

### Test database rebuild (2026-11-18, owner-approved, test database only)

- Guard checked before acting: host `127.0.0.1`, port `54329`, database name exactly `vendor_test`. The embedded test server was started with the options of `api/tests/global-setup.ts`, `vendor_test` dropped through a connection to the server's `postgres` database, and the server stopped. `vendor_seedcheck` (used by the seed test) was left in place. The development database was not connected to.
- The next test run recreated `vendor_test` through `global-setup.ts`, which applied all six migrations, including the final Feature 006 file (transaction and transition check). API 75 files, 515 passed; web 47 files, 352 passed, 1 skipped.

### T074 baseline (2026-11-18 11:43 IST, owner-authorized, read only)

- Container `vendor-management-db-1` (postgres:17, port 5432) was **already running** ("Up 23 hours, healthy"); it was not started by this task. Database `vendor` on `localhost:5432`.
- `prisma migrate status` (read only): 6 migrations found; 5 applied; 1 pending: `20261118120000_client_financial_management`. All 5 applied rows finished, none rolled back.
- Every query ran through `psql` inside the container in a read-only session (`default_transaction_read_only = on`). Nothing was written, migrated or seeded.
- None of the objects the migration creates exist yet (0 of the four checked tables/sequence, 0 of the six enum types). Current history check: `num_nonnulls(vendor_id, project_id, document_id, vendor_import_run_id, client_advance_id) = 1`.
- Rows and `md5(string_agg(row::text, '|' ORDER BY row::text))` per table:

| Table | Rows | Checksum |
|---|---|---|
| _prisma_migrations | 5 | cd4707e20a14e40d34a6406bb022a0ad |
| categories | 7 | 04547afc56b1dde5f7be3da99f0aaa1a |
| client_advance_reversals | 1 | 5099753229e0978341c3037eeb6f745f |
| client_advances | 3 | bc7a90ef0ae59ea1667382bc579b516a |
| coordination_issue_vendors | 1 | 07e6ff3525043f1367353d1535362188 |
| coordination_issues | 1 | c7f6191513b88306d2e724aafc7e5a75 |
| costing_sheet_files | 1 | 0a84c714b6f602a55149c48736c1eabc |
| delays | 1 | 305fb6beedca9386677e894c6e873884 |
| documents | 0 | empty |
| history_entries | 29 | 4257df84975c01e4232012b13ef0115b |
| project_sections | 46 | 698e95fd464081911666ea59a686fe89 |
| projects | 5 | 7ef887ef24b9efaec0dd2b5ee2b1c138 |
| section_assignments | 3 | 1d0bf62e7947a21e4e2e0afa0835b266 |
| sessions | 11 | 9f3b1af6faa129374931fad50f43bb68 |
| staff_users | 3 | cf435a8466d43a42450d9a40e4d5894c |
| task_price_entries | 2 | ca3bb9a3a50be0e7041fea689aed2f53 |
| timeline_date_changes | 0 | empty |
| timeline_items | 11 | 9c2d5888457acef89f5e3d726b2191b1 |
| timeline_progress_updates | 7 | c3fc873fb4da6f05b9679d8c6a63f9a3 |
| timeline_responsible_changes | 0 | empty |
| vendor_categories | 10 | 2b3458fb8aec50a41f9b941c1387e799 |
| vendor_import_previews | 0 | empty |
| vendor_import_rows | 0 | empty |
| vendor_import_runs | 0 | empty |
| vendor_locations | 10 | 86458ec99bfdb762dc79918b1721657f |
| vendor_materials | 0 | empty |
| vendor_notes | 0 | empty |
| vendor_project_links | 11 | 735a96f13b7fac38dc00d34b7665117c |
| vendor_rates | 4 | 88e55433503560b7b04f57f57d4efe17 |
| vendor_ratings | 1 | 4a4ddbd5a7e5fe61705d196cd9597618 |
| vendor_services | 0 | empty |
| vendors | 10 | 46740ac832cea0984962e9673f245fa9 |
| work_schedules | 3 | 6ed6950cc31f72486770e2f144523bc9 |

- For the after-migration comparison of the two tables that gain columns, checksums over their **existing columns only** (as the rehearsal compares): `client_advances` 3 rows `bc7a90ef0ae59ea1667382bc579b516a`; `history_entries` 29 rows `4257df84975c01e4232012b13ef0115b` (identical to the full-row checksums today, since the new columns do not exist yet).
- **Note for T075**: `sessions` (and any table the running app writes) can change while the app is used, so T075 must take its "before" snapshot immediately before applying, and compare against that.

### T075 migration applied (2026-11-18, owner-approved plan, steps 0 to 6)

- **Plan fixes before running**: the placeholder diff against the T074 table was removed from step 2; step 3 removes the throwaway restore container through an `EXIT` trap, on success or failure. Two execution details: `MSYS_NO_PATHCONV=1` so Git Bash does not rewrite container paths, and `prisma migrate status` output is captured and parsed, because it exits non-zero while a migration is pending.
- **Step 0**: app not running (nothing listening on 4000 or 5173); container `vendor-management-db-1` healthy; target `localhost:5432/vendor` (the WSL relay and Docker backend on port 5432 lead to the same server, confirmed by identical start time and `_prisma_migrations` checksum).
- **Step 1, backup**: `pg_dump -Fc` inside the container, copied to `C:\Users\ASUS\Documents\Projects\VendorManagement-backups\2026-11-18_pre-feature-006\pre-feature-006.dump` (131,941 bytes, SHA-256 `dd52a2b326f7d755a4d3aa3923a38150e7f01332ba3fabe479eed71007bbe800`, recorded in `pre-feature-006.dump.sha256`). The copy inside the container was removed.
- **Step 2**: fresh snapshot `before.txt` (33 tables plus 3 comparison lines), identical to the T074 baseline.
- **Step 3, restore check**: throwaway `postgres:17` container with no published port; checksum OK; 33 `TABLE DATA` entries; restored into `restorecheck`; `restored.txt` identical to `before.txt`: **backup verified**. Container removed.
- **Step 4**: target confirmed; `migrate status` listed exactly one pending migration, `20261118120000_client_financial_management`; `prisma migrate deploy` applied it ("All migrations have been successfully applied."). No seed ran.
- **Step 5**: the 30 tables that the migration does not alter are identical to `before.txt`; `client_advances` (3 rows) and `history_entries` (29 rows) are identical over their existing columns; the 5 earlier `_prisma_migrations` records are identical, plus the new one (6 rows); the 10 new tables exist and are empty.
- **Step 6**: `migrate status` "Database schema is up to date!"; the new migration record is finished, not rolled back, with no logs; enum values DocumentType 8, EntryStatus 2, ReceiptType 4, RecordDecision 3, RecordedUnder 2, RevisionStatus 6, SubmissionRoute 2, and 11 new HistoryAction values; sequence `1|false` (unused); 15 check constraints, including the seven-target `history_entries_target_ck` and the six-pair `quotation_status_changes_transition_ck`; 40 foreign keys, all `ON DELETE RESTRICT`; 22 new indexes; the 3 existing advances are `ADVANCE`, `VERIFIED_ON_ENTRY`, `FEATURE_003` with no links or submission ID; `recorded_under` defaults to `FEATURE_006` for new rows.
- **Evidence** in the backup folder: `pre-feature-006.dump`, `.sha256`, `before.txt`, `restored.txt`, `after.txt`. Scripts used: `t075-common.sh`, `t075-phase1.sh`, `t075-phase2.sh` (session scratchpad).
- Not done, as instructed: no seed, no restore of the development database, T076 not started, nothing committed or pushed.

### T076 quickstart on the development database (2026-11-18 and 2026-11-19, owner-authorized)

- **How it ran**: the API was started with `npx tsx --env-file=../.env src/server.ts` (no `npm run dev`, no seed) and every scenario was driven through the HTTP routes the screens use, signed in as the three seed accounts; the web panels themselves are covered by the automated web tests. Fictional "T076 QA" projects only. 107 checks passed in total (84 in the first run, 23 in the continuation). The API server was stopped afterwards.
- **Scenario 1**: the 3 Feature 003 advances (1 reversed) show as Advance receipts, verified or reversed, "Recorded under Feature 003", with their original author and time and no invented verification; each project's net advances and both dashboard tiles equal the Feature 003 formula over the unchanged rows (the rows are byte-identical to the T075 backup, step 5). Tile label unchanged.
- **Scenario 2 (corrected text verified)**: Office Team created the quotation (reference `Q-` + six digits, revision 1 Draft); the Quotation document was attached afterwards as a separate action; revision 2 refused while revision 1 was Draft; revision 1 withdrawn with a reason; revision 2 added with no document and submitted (submission date recorded); a second quotation refused.
- **Scenario 3**: Under review; approval refused without a Quotation document on revision 2; approved after attaching one; approved amount ₹18,40,000.00 from revision 2.
- **Scenario 4**: Office Team Stage payment ₹6,50,000.00 with payment proof: Awaiting verification, not counted; verified: counted; another receipt withdrawn with a reason and not verifiable afterwards; partial reversal refused, full reversal accepted, second reversal refused; the same submission ID sent twice at once saved one receipt and both responses returned it; the same ID with a different amount refused, nothing saved.
- **Scenario 5**: PO/2026/118 Submitted with its PO document; second PO on the approval refused; verified; on a project whose client name differs only in spacing and case, the duplicate warning named the first PO and project; confirmed, and the confirmation is in the PO history; Verified PO cancelled with a reason; replacement entered.
- **Scenario 6 (corrected text verified)**: fresh project with no PO; revision 1 approved; revision 2 at ₹19,10,000.00 Under review; the PO against revision 1 got the pending-revision warning naming revision 2; confirmed and recorded in the PO history; revision 2 approved with the Quotation document supplied in the approval request (attached in the same save; its removal refused); the earlier PO labelled "Matches superseded approval (revision 1)"; a new PO against revision 1 refused; "No PO for the current approved amount" until the ₹19,10,000.00 PO against revision 2 was entered.
- **Scenario 7**: with ₹18,00,000.00 verified, a ₹1,00,000.00 receipt warned with the four figures (1840000.00, 1800000.00, 100000.00, 60000.00); confirmed; balance ₹0.00 outstanding and overpaid ₹60,000.00; on a project without an approval no warning and "Not available: no approved amount".
- **Scenario 8**: attach; Office Team refused on another person's attachment; removal needs a reason; own removal with a reason, document unchanged; re-attach as a new attachment; supersede needs a reason; supersede with a reason; removing the superseded or superseding attachment refused; archived document refused until restored; a vendor document of type Quotation refused (400) and no vendor document created.
- **Scenario 9**: on the archived project, new receipt, verification, withdrawal, new revision, new PO, PO verification, attach and removal all refused with `PROJECT_ARCHIVED`; reversal, receipt rejection, PO rejection and PO cancellation worked; all records readable.
- **Scenario 10**: the project history listed every kind of event in time order; Recent activity showed the Feature 006 events with their status and no amounts, and non-finance entries kept their shape; the money tiles stayed at their scenario 1 values while a Submitted test advance and all later payments existed; labels unchanged.
- **Scenario 11**: Office Team refused (403) on verify, reject, reverse, Under review, Submitted-revision withdrawal, PO cancellation, the Feature 003 recording route and attaching to a verified receipt; signed out: 401 with no amounts; Accountant verify, Administrator reverse and Administrator withdrawal of a Submitted revision succeeded.
- **SC-003 / SC-004**: system time only: payment-proof upload plus receipt entry 61 ms, verification 22 ms; Client finance view with the three figures 23 ms. The person-timed targets (entry under 1 minute, verification under 30 seconds, reading the figures within 20 seconds) were not timed with a person.
- **Deviations**:
  - Fictional client names ("T076 QA Mehta Interiors" and " t076 qa  mehta interiors ") instead of "Mehta Interiors", so the duplicate-PO check could not match a real client; QA PO numbers such as `PO/2026/118-R`.
  - No Feature 003 advance entry was among the latest 10 Recent activity entries before the test data, so "Feature 003 advance entries appear exactly as before" could not be observed on live data; it is covered by `client-finance-history.test.ts`.
  - The first run stopped in scenario 10 on a test-script filter bug (it counted the project's own `ARCHIVED` entry as a finance entry); the application behaved correctly, and the corrected check passed in the continuation run.
  - Between the runs the host restarted: Docker Desktop was started and the existing container started with `docker start` (not recreated); PostgreSQL completed automatic crash recovery. A read-only check then confirmed the 3 Feature 003 advances, their reversal, the 29 earlier history entries, the 5 existing projects and 25 other business tables identical to T075.
- **Data added (all on QA projects, archived at the end; records kept, append-only)**: 6 projects "T076 QA …" (Mehta Lake House, Mehta Studio, Superseded approval, No approval, Archive check, Permissions), each with the standard 15-section blueprint that project creation adds (Feature 005); QA quotations, revisions, approvals, POs, receipts, decisions, reversals, documents and their history; sign-in sessions. No existing record was changed; no seed, reset, delete or restore.

### T077 convergence (2026-11-19, owner-authorized)

- **Result: Not converged.** Four findings, appended as T078 to T081 under Phase 10. T077 stays open: it requires a Converged result, then a re-run of T069.
- **Checked**: 50 functional requirements (FR-001 to FR-050, with FR-023a, FR-025a, FR-029a, FR-032a, FR-032b and FR-042a to FR-042f), 5 NFRs, 8 success criteria, 110 acceptance scenarios (US1 to US6), the plan's design table and testing strategy, the HTTP contract, the data model and the 6 Constitution principles. No Constitution violation found.
- **Evidence**: lint and typecheck clean; API 75 files, 515 passed; web 47 files, 352 passed, 1 skipped (`DATABASE_URL` unset, embedded test database). These counts match the T069 run after the migration-review changes. T076 passed its 107 quickstart checks on the development database. The server-side rules and the role matrix are covered by the tests named in the Coverage Map.
- **Findings** (all in the web or the documents; no server-side rule is missing):
  - F1 (partial, MEDIUM; FR-022, FR-026): the API accepts a revision's `validity_date` and an approval's `client_acceptance_date`, but the web forms do not offer them and the page does not show them, so staff cannot record them.
  - F2 (partial, MEDIUM; FR-023, FR-025, FR-026, FR-029): the optional notes accepted by the API are not offered on the new-revision, status-change, approval or PO forms, and PO and approval notes are not shown.
  - F3 (partial, LOW; FR-038): the project's client financial history labels entries only "Receipt" or "Purchase order", with no PO number or receipt date and no link to the record.
  - F4 (documentation drift, LOW): `spec.md` still reads "Planned — implementation pending", and `plan.md` says `tasks.md` is "not created here". Neither file was changed by this task.
- **Known limitations kept as documented, no task**: SC-003 and SC-004 were timed by the system only (T076), not with a person; the screens were not clicked through in a browser (web panels covered by automated tests only); the retained `advances-section.tsx` (T038 owner decision); the error codes and response bodies the contract leaves open, and the not-strictly-test-first steps (T072).
- Nothing in application code, migrations, tests or the database was changed; nothing committed or pushed.

## Phase 10: Convergence

- [X] T078 Offer the optional validity date on the quotation and new-revision forms and the optional client acceptance date on the approval form in `web/src/pages/client-finance/quotation.tsx`, and show both when set, per FR-022 and FR-026 (partial)
- [X] T079 Offer the optional note on the new-revision, status-change, approval and PO forms in `web/src/pages/client-finance/quotation.tsx` and `purchase-orders.tsx`, and show PO and approval notes, per FR-023, FR-025, FR-026 and FR-029 (partial)
- [X] T080 Identify each entry in the client financial history (`web/src/pages/client-finance/summary.tsx`) by its PO number or receipt date and type, and link it to the record, per FR-038 (partial)
- [X] T081 With owner approval, update the status line in `spec.md` and the `tasks.md` note in `plan.md` to reflect the implementation, per plan: documentation (partial)

### Convergence tasks T078 to T081 (2026-11-19, owner-approved)

- **Test first**: `web/tests/client-finance-optional-fields.test.tsx` (new, 8 cases). 7 failed before the change for the intended reasons; the eighth ("no note sent when left empty") holds before and after. No existing test was edited.
- **T078** (`quotation.tsx`): optional "Validity date" on the quotation and new-revision forms, and "Client acceptance date" on the approval form; shown as "Valid until …" on the revision and "Client accepted …" on the approval.
- **T079** (`quotation.tsx`, `purchase-orders.tsx`, `controls.tsx`): optional "Revision note", "Approval note" and "PO note"; an optional "Status note" on the Reject and Withdraw forms of a revision (the shared reason form shows the note field only when asked, so the receipt and PO decision forms, whose routes take no note, are unchanged); status-change notes, approval notes and PO notes are shown. Optional fields are sent only when filled in. Submit and Mark under review stay one-click buttons with no note field.
- **T080** (`summary.tsx`, `area.tsx`, plus anchors in `quotation.tsx`, `purchase-orders.tsx`, `receipts.tsx`): each client financial history entry names its record from the data already loaded ("PO PO/2026/118", "Stage payment received 5 Nov 2026", "Quotation revision 2") and links to that record on the page. A record not on the page keeps its plain label. The history route and its response are unchanged.
- **T081** (`spec.md` line 7, `plan.md` line 63): status wording only. The spec's "Planned — implementation pending." now reads "Implemented on this branch (tasks.md T001 to T076; migration applied to the development database on 2026-11-18); final convergence (T077) pending."; the plan's `tasks.md` note reads "task list and implementation record". The spec's "Draft for review" label was left as it is (an approval-status decision for the owner). No requirement was changed.
- **Not changed**: server code, API contract, schema, migrations, the development database, Features 001 to 005 and every existing test.
- **T069 checks** (`DATABASE_URL` unset): lint and typecheck clean; API 75 files, 515 passed; web 48 files, 360 passed, 1 skipped, in two consecutive runs (+1 file and +8 tests, the new file); `npm run build -w web` passes. Touched files keep CRLF line endings throughout. `graphify update .` run.
- **T077** stays open until a fresh `/speckit-converge` reports Converged.

### T077 convergence, second run (2026-11-19, owner-authorized)

- **Result: Not converged.** Two low findings remain, appended as T082 and T083 under Phase 11. T077 stays open.
- **F1 to F4 resolved**: F1 by T078 (validity and client acceptance dates offered and shown); F2 by T079 (revision, approval and PO notes, and the Reject and Withdraw status notes, offered and shown); F3 by T080 (history entries name and link their records); F4 by T081 (status wording in `spec.md` and `plan.md`; the spec's "Draft for review" label was not changed, as instructed).
- **New findings**:
  - G1 (partial, LOW; FR-025): FR-025 keeps "an optional note" with every status change, and the status route accepts one for every transition, but Submit and Mark under review are one-click buttons with no note field, so staff cannot record a note on those two changes. Not implemented in this run, as instructed.
  - G2 (test coverage, LOW; Constitution V): `client-finance-optional-fields.test.tsx` does not assert that a filled-in validity date is sent with a new revision (its first case is named as if it does, but it checks only the new quotation), nor that a status note is sent with a revision rejection (only withdrawal is asserted). Every other new date, note and history-link behaviour has an assertion.
- **Evidence**: no code changed since the T078 to T081 checks. API 75 files, 515 passed; web 48 files, 360 passed, 1 skipped (re-run in this check); lint, typecheck and the web build clean (`DATABASE_URL` unset). No Feature 001 to 005 file or existing test was changed by T078 to T081: they touched only `web/src/pages/client-finance/`, a new test file, and the two status lines.
- **Known limitations kept as documented, no task**: SC-003 and SC-004 timed by the system only (T076), not with a person; no browser walkthrough of the screens (web panels covered by automated tests only); `advances-section.tsx` retained (T038 owner decision); the T072 notes on contract-open error codes and not-strictly-test-first steps.
- Nothing in code, tests, migrations, the database, requirements or product decisions was changed; nothing committed or pushed.

## Phase 11: Convergence

- [X] T082 Offer an optional status note when a revision is submitted or marked Under review in `web/src/pages/client-finance/quotation.tsx`, per FR-025 (partial)
- [X] T083 In `web/tests/client-finance-optional-fields.test.tsx`, add assertions that a filled-in validity date is sent with a new revision and that a status note is sent with a revision rejection, per Constitution V (partial)

### Convergence tasks T082 and T083 (2026-11-19, owner-approved)

- **Tests** (5 cases added to `web/tests/client-finance-optional-fields.test.tsx`; its existing cases unchanged): a filled-in validity date is sent with a new revision; a status note is sent with a revision rejection (exact body); Submit with no note sends exactly `{ to, expected_status }` in one click, and with a typed note adds `note`; Mark under review sends a typed note; Office Team sees no step note on a Submitted revision. The two T083 cases passed on their first run, because they cover behaviour built in T078 and T079; the two T082 send cases failed first, then passed.
- **T082** (`web/src/pages/client-finance/quotation.tsx`): an optional "Note (optional)" field next to Submit (Draft) and Mark under review (Submitted, reviewers only). Both buttons still act in one click; the note is sent only when typed and cleared after a successful change. Server rules, transitions and the status route are unchanged.
- **T083**: done by the two test cases above.
- **T069 checks** (`DATABASE_URL` unset): lint and typecheck clean; API 75 files, 515 passed; web 48 files, 365 passed, 1 skipped, in two consecutive runs (+5 tests, all in the new file); `npm run build -w web` passes. Both touched files keep CRLF line endings. `graphify update .` run.
- **Not changed**: server code, API contract, schema, migrations, the development database, Features 001 to 005 and their tests, requirements and product decisions. The spec's "Draft for review" label is unchanged.
- **T077** stays open until a fresh `/speckit-converge` reports Converged.

### T077 convergence, third run (2026-11-19, owner-authorized)

- **Result: Not converged.** Earlier findings F1 to F4 (first run) and G1 and G2 (second run) are resolved: T078 to T083 are in the code and their tests pass. A sweep of every field each Feature 006 write route accepts, against what the web forms send, found two more gaps, appended as T084 and T085 under Phase 12. T077 stays open.
- **New findings**:
  - H1 (partial, HIGH; FR-001, FR-029, FR-030, US5-1): an Administrator or Accountant cannot enter a PO from the web. A reviewer's PO is verified on entry, so the server requires a Purchase order document in the request's `document_ids` (409 `PO_DOCUMENT_REQUIRED`, `purchase-orders.ts`); `purchase-orders.tsx` never sends `document_ids`, and a document cannot be attached to a PO that was never saved. The API rule is correct and was exercised in T076 through the API; only the web form lacks the document choice. Office Team entry (Submitted, document attached afterwards, then verified) works.
  - H2 (partial, LOW; FR-016, US2-1): the receipt form does not offer documents at entry, although the receipts route accepts `document_ids`. A payment proof can still be attached straight after saving through the receipt's attachments (FR-042b), so nothing is blocked; it takes two steps instead of one.
- **Evidence**: no code changed since the T082 and T083 checks: lint and typecheck clean; API 75 files, 515 passed; web 48 files, 365 passed, 1 skipped (two runs); web build passes (`DATABASE_URL` unset). H1 is confirmed in code: `purchase-orders.ts` lines 99 to 102 refuse a reviewer PO without a Purchase order document in `document_ids`, and the only `document_ids` sent by the web is from the approval form (`quotation.tsx`). The web test for reviewer PO actions covers verify, reject and cancel, not reviewer entry, which is why the suite did not catch it.
- **Known limitations kept as documented, no task**: SC-003 and SC-004 not timed with a person (T076 system timings only); no manual browser walkthrough of the screens.
- Nothing in code, tests, migrations, the database, requirements or product decisions was changed; the spec's "Draft for review" label is unchanged; nothing committed or pushed.

## Phase 12: Convergence

- [X] T084 Let Administrators and Accountants choose the Purchase order document when entering a PO in `web/src/pages/client-finance/purchase-orders.tsx` (sent as `document_ids`, as the approval form does), with a web test that a reviewer PO is sent with its document, per FR-030 and US5-1 (partial)
- [X] T085 Offer optional documents (for example a payment proof) on the receipt entry form in `web/src/pages/client-finance/receipts.tsx`, sent as `document_ids` only when chosen, with a web test, per FR-016 and US2-1 (partial)

### Convergence tasks T084 and T085 (2026-11-19, owner-approved)

- **Tests first**: `web/tests/client-finance-entry-documents.test.tsx` (new, 7 cases). 5 failed before the change for the intended reasons; the 2 cases that pin unchanged behaviour (Office Team PO with no document, receipt with no document) passed before and after. No existing test was edited.
- **Shared picker** (`web/src/pages/client-finance/controls.tsx`, `DocumentChoice`): a "Choose documents" button loads the project's documents on request, offers only those not archived (FR-042f), and names the Quotation, Purchase order and Payment proof types. The server still checks every rule.
- **T084** (`purchase-orders.tsx`): the PO entry form offers the picker; chosen documents go in the existing request as `document_ids`, and are sent again when a duplicate or pending-revision warning is confirmed. For Administrators and Accountants the form says the PO counts as verified when saved and needs a Purchase order document. Office Team entry is unchanged: no document needed, none sent, then verified by a reviewer. Tested: an Accountant's PO is sent with its Purchase order document (exact body); archived documents are not offered; the Office Team body is unchanged; the document is resent with a confirmed warning.
- **T085** (`receipts.tsx`): the receipt entry form offers the same picker; documents stay optional and are sent as `document_ids` only when chosen, together with the same submission ID on an overpayment retry, as the repeat check expects (research R13). Attaching after saving is unchanged. Tested: payment proof sent with the receipt; nothing sent when none is chosen; same documents and submission ID on the confirmed overpayment retry.
- **T069 checks** (`DATABASE_URL` unset), run once on the final code: lint and typecheck clean; API 75 files, 515 passed; web 49 files, 372 passed, 1 skipped, in two consecutive runs (+1 file and +7 tests); `npm run build -w web` passes. Touched files keep CRLF line endings. `graphify update .` run.
- **Test environment issue (not a test failure)**: that API run printed "Tests closed successfully but something prevents Vite server from exiting" and left one backend process of the embedded test cluster (`node_modules/@embedded-postgres`, port 54329) running after its parent had exited. A further API run then failed in global setup ("pre-existing shared memory block is still in use", reported by Vitest as "No test files found"); no test ran. Stopping the leftover process was refused by the session's permission check, so it is still running. The development database (Docker, port 5432) was not involved. Until the leftover process is stopped (or the machine restarts), API test runs cannot start.
- **Not changed**: server code, API contract, schema, migrations, the development database, Features 001 to 005 and their tests, requirements and product decisions; the spec's "Draft for review" label.
- **T077** stays open until a fresh `/speckit-converge` reports Converged.

### Manual browser walkthrough (reported by the owner on 2026-11-19)

- The manual browser walkthrough of Feature 006 was completed.
- All tested workflows worked successfully.
- No issues were observed.
- Recorded as reported by the owner; no individual test cases, timings or other details were supplied, and none are recorded here. SC-003 and SC-004 remain not timed with a person.

### T077 convergence, final run (2026-11-19, owner-authorized)

- **Result: Converged.** No finding remains against the spec, plan, data model, HTTP contract, tasks or the six Constitution principles.
- **Tasks**: T001 to T076 and T078 to T085 complete (84 tasks); T077 completed by this run.
- **Earlier findings resolved**: F1 to F4 (T078 to T081), G1 and G2 (T082, T083), H1 and H2 (T084, T085); each is in the code and covered by passing tests.
- **T069 checks** (the re-run T077 requires; final code, `DATABASE_URL` unset): lint and typecheck clean; API 75 files, 515 passed; web 49 files, 372 passed, 1 skipped; `npm run build -w web` passes; no test process left running. No application or test file has changed since that run.
- **Other evidence**: quickstart scenarios 1 to 11 on the development database (T076, 107 checks, through the API); the manual browser walkthrough reported by the owner (above).
- **Limitations kept**: SC-003 and SC-004 have system timings only (T076); the person-timed targets were not measured. The T038 retained component and the T072 notes stand as recorded.
- Constitution Delivery Gates: converge reports Converged; lint, typecheck and tests green locally (CI not run here). Nothing committed or pushed; no pull request opened.
