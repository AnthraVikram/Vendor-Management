# Research: Client Financial Management

Technical decisions for [plan.md](./plan.md). Product behaviour comes only from [spec.md](./spec.md); nothing here changes it. The spec has no open questions, so this file records design choices only.

## R1. One module, shared receipt service

- **Decision**: New server module `api/src/modules/client-finance/` (quotations, purchase orders, receipts, attachments, summary and history). The existing `client-advances` module keeps its routes and responses but calls the shared receipt service for recording and reversing.
- **Rationale**: One implementation of receipt rules (FR-014, FR-016 to FR-020); Feature 003 tests and clients keep working (FR-049).
- **Alternatives considered**: Rewriting the Feature 003 routes (breaks FR-049 and its tests); a second, parallel advance implementation (duplicates Feature 003 functionality, which the brief forbids).

## R2. Append-only records with derived state

- **Decision**: No financial row is ever updated or deleted. State lives in append-only rows: revision status changes, receipt decisions (verify, reject, withdraw), PO decisions, PO cancellations, reversals (existing table), attachment removals. Current state = the latest or only such row; otherwise the entry state recorded when the row was created.
- **Rationale**: Constitution III ("financial records are append-only; a correction is a new entry"); the Feature 003 precedent ("reversed" is the existence of a reversal row); the existing append-only unit test can cover every new table.
- **Alternatives considered**: A mutable `status` column per record (simpler queries, but an in-place change to a financial record); event sourcing with snapshots (unnecessary at this volume).

## R3. Receipts reuse `client_advances`

- **Decision**: Every receipt, of any type, is a row in the existing `client_advances` table, extended with seven columns: `receipt_type` (default `ADVANCE`), `entry_status` (default `VERIFIED_ON_ENTRY`), `recorded_under` (`FEATURE_003` for rows that exist when the migration runs, `FEATURE_006` afterwards), `client_approval_id` and `client_purchase_order_id` (nullable, at most one set), and `submission_id` (nullable, unique) with `submission_route` (nullable; R13). The Prisma model and table keep their names; the API and interface call them receipts.
- **Rationale**: Existing advances, reversals and history stay in place and unchanged (FR-012, FR-040); P-1 needs no invented verification row (FR-013): the defaults state exactly what Feature 003 meant. Rows created after the migration, including advances the seed creates on an empty database, get `FEATURE_006`; the seed is unchanged (decision 2026-11-18). Reversal reuses `client_advance_reversals` (FR-020). History keeps its `client_advance_id` target.
- **Alternatives considered**: A new `client_receipts` table with advances copied or unioned in (copying rewrites records; unioning splits one concept across two tables); renaming the table (touches every Feature 003 query for no behaviour gain).

## R4. Concurrency: project lock plus expected state

- **Decision**: Every client-finance write starts its transaction with `SELECT … FROM projects WHERE id = $1 FOR UPDATE`, then re-reads the state it depends on. Requests that change state carry the state the person saw (for example `expected_status`, `expected_newest_revision`); a mismatch returns 409 `STALE`. Unique indexes back the single-decision rules: one decision per receipt, one decision and one cancellation per PO, one status change per revision per target status, one approval per revision, one removal per attachment, one supersede per attachment, unique revision number per quotation.
- **Rationale**: FR-007 and FR-023a (two simultaneous requests create at most one revision), one current PO per approval (FR-031), overpayment (FR-036) and duplicate attachments (FR-042f) all depend on current state that a partial unique index cannot express, because the state is derived (R2). Locking one project row serialises only writes on that project. The pattern matches Feature 004's `lockLink`.
- **Atomicity**: one database transaction per user action contains the project lock, the state checks, the record or decision row, every history entry of that action (two for an attachment or removal, three for a supersede, the warning confirmation where one applies) and any attachment rows created with the record. A failure at any point saves nothing (FR-008).
- **Duplicate submissions**: a repeated status change, decision, cancellation, removal or supersede is refused by its unique key or by the expected-state check (409 `STALE` or `INVALID_TRANSITION`); a repeated quotation, revision or PO is refused by `QUOTATION_EXISTS`, `REVISION_ACTIVE` (with `expected_newest_revision`) or `CURRENT_PO_EXISTS`. Receipts cannot use a key on their content, because two equal receipts can be genuine; a repeated receipt request is recognised by its submission ID instead (R13).
- **Alternatives considered**: Partial unique indexes on a stored status (needs mutable status, rejected in R2); advisory locks (equivalent, less visible).

## R5. Warnings that need confirmation

- **Decision**: The overpayment (FR-036), duplicate PO number (FR-029a) and pending-revision (FR-032a) warnings are returned as HTTP 409 with a code (`OVERPAYMENT_CONFIRMATION_REQUIRED`, `DUPLICATE_PO_NUMBER`, `PENDING_REVISION`) and the figures to show. The client repeats the request with the matching confirmation flag; the server re-checks under the lock and records the confirmation in the record's history in the same transaction.
- **Rationale**: The same request-then-confirm pattern as the Feature 001 duplicate-phone warning; the server never trusts a stale confirmation, because it recomputes the figures before saving.
- **Alternatives considered**: Client-side checks only (bypassable, Constitution IV).

## R6. History targets and the two-entry rule

- **Decision**: Add two nullable target columns to `history_entries`: `client_quotation_id` and `client_purchase_order_id`; receipts keep `client_advance_id`. Revision, status change and approval events are recorded on the quotation target with the revision in `details`. Each attachment or removal writes one entry on the financial record's target and one on the document (`document_id`); a supersede writes a third on the superseded document (FR-042c F4, OQ-38). The single-target check constraint is replaced with one listing all seven targets. The project's client financial history (FR-038) merges the entries of its quotation, POs and receipts by time. Recent activity (Feature 005 FR-023) adds the two new targets (FR-039, decisions 2026-11-18). Receipts of every type keep one history target, `client_advance_id`, because they share one table (R3); a second target column for the same row would let one receipt's history split across two columns. `client_receipt` is therefore a target **kind in the Recent activity response**, chosen when read from the receipt's `receipt_type` (Advance → `client_advance`, as today; any other type → `client_receipt`); no schema, constraint or history-query change is needed for it, and `GET /history?client_advance_id=` keeps serving every receipt. **Status captured when written** (decision 2026-11-18): every history entry written by Feature 006 code stores `details.record_status`, the associated record's state immediately after the event, computed inside the same transaction: the receipt or PO state (`SUBMITTED`, `VERIFIED`, `REJECTED`, `WITHDRAWN`, `REVERSED`, `CANCELLED`) or the revision status (`DRAFT` … `WITHDRAWN`). Every action is covered: quotation `CREATED` and `REVISION_ADDED` → `DRAFT`; `STATUS_CHANGED` → the new status; `APPROVED` → `APPROVED`; receipt or PO `CREATED` → `SUBMITTED` or `VERIFIED`; `VERIFIED`, `REJECTED`, `WITHDRAWN`, `REVERSED`, `CANCELLED` → that state; `WARNING_CONFIRMED`, `ATTACHED`, `ATTACHMENT_REMOVED`, `SUPERSEDED` → the record's unchanged current state (for an approval, `APPROVED`). All entries of one action, including those on documents, carry it. Existing history entries are never rewritten. Recent activity returns it as `status`. Entries written by this feature carry no amount in the response (`changes` and `details` amounts omitted). **Feature 003 advance entries** are the entries the Feature 003 routes write on a receipt of type Advance: `CREATED` by `POST /projects/:id/client-advances` and `REVERSED` of an Advance. They keep their exact Feature 003 `details` (no `record_status`) and their exact existing response shape (no `status`); they are recognised as client-advance entries without `details.record_status`. Where a state is shown for them (the project's client financial history, FR-038), it is fixed by their action: `CREATED` → Verified, because the Feature 003 route records only reviewers' advances, verified on entry; `REVERSED` → Reversed (decision 2026-11-18). Recent activity still returns them with no `status`. Every other client-finance entry, including a `REVERSED` entry on a non-Advance receipt (`client_receipt` kind, `status` Reversed, no amount) and new Feature 006 events on Advance receipts (`client_advance` kind, with `status`), is a Feature 006 entry. The screen presentation of existing entries is unchanged; new entries show their status.
- **Rationale**: This resolves planning constraint PC-1 in favour of explicit targets: records stay findable by their own identity, and the project view is a merge. Every existing row still satisfies the replaced check.
- **Alternatives considered**: Recording everything on the project target (loses per-record history; the receipt and PO history panels would need filtering by details).

## R7. Quotation reference format (technical detail, OQ-14)

- **Decision**: `Q-` followed by a six-digit, zero-padded number from a PostgreSQL sequence (for example `Q-000042`), assigned when the quotation is created, unique across the firm, never edited. Revision numbers are 1, 2, 3 … per quotation, assigned as the highest existing number plus one under the project lock (R4).
- **Rationale**: The owner left the format to planning; a sequence is gap-tolerant, simple and never reused.
- **Alternatives considered**: Year-based numbering (`Q-2026-0001`) needs a reset rule; a project-based code depends on project names, which can change.

## R8. Client-name normalisation (FR-029a)

- **Decision**: Normalised client name = trim, collapse runs of whitespace to one space, lower case; implemented once in `lib/client-name.ts` and as the equivalent SQL expression for the lookup. PO numbers are compared exactly as entered, as the spec defines normalisation only for client names. Projects with no client name are compared only within the same project.
- **Rationale**: The spec's rule verbatim; one implementation for tests and queries.
- **Alternatives considered**: Normalising PO numbers too (not specified; listed under Assumptions to confirm).

## R9. Document types

- **Decision**: Add `QUOTATION`, `PURCHASE_ORDER` and `PAYMENT_PROOF` to the `DocumentType` enum. The documents route accepts them only when the parent is a project; vendor uploads keep the five Feature 003 types (FR-041). Requirements on attachments (a Quotation document before approval, a Purchase order document before verification) check the attached document's type.
- **Rationale**: Feature 003 documents are reused unchanged in content and rules; only the accepted type list depends on the parent.
- **Alternatives considered**: A separate financial document store (duplicates Feature 003 storage, retention and authentication).

## R10. Money and balance arithmetic

- **Decision**: Prisma `Decimal` throughout; existing `parsePositiveAmount` (positive, two decimals, at most ₹9,999,999,999,999.99) and `moneyString`. Balance = authoritative approved amount − sum of verified, unreversed receipts; when negative, outstanding shows ₹0.00 and the excess is the overpayment (FR-034 to FR-036). Implemented as pure functions in `lib/finance-state.ts`.
- **Rationale**: Constitution III (no floating point); pure functions make the rule unit-testable.

## R11. Web structure

- **Decision**: The Client finance area replaces the Advances section in place on the project page (FR-043), as a folder of small components: summary (approved amount, verified receipts total, balance or overpayment, all labelled "incl. GST"), quotation and revisions, purchase orders, receipts, attachments, history and the pending-verification list. Warnings use the existing `ConfirmDialog`; confirmations use the existing toast. Controls follow FR-001 and FR-042b; the server check still applies (FR-044).
- **Rationale**: Reuses Feature 005 components and visual system; no new dependency.

## R12. Performance

- **Decision**: Indexes on every foreign key used in per-project reads (`project_id`, `client_quotation_id`, `quotation_revision_id`, `client_approval_id`, `client_purchase_order_id`, `client_advance_id`, `document_id`) and on history target columns with `created_at`. The project summary is one request with a fixed number of queries. The Feature 005 performance test is extended to the NFR-001 volume.
- **Rationale**: NFR-001 (under 2 seconds); the Feature 005 measurements show headroom.

## R13. Repeated receipt submissions (submission ID)

- **Decision** (adopted by the owner on 2026-11-17): every receipt-creation request carries a `submission_id`, a UUID the client generates once per intended receipt. The Client finance receipt form generates a new one for every new receipt and reuses it only for retries of that same receipt, including the repeat that carries `confirm_overpayment`. It is stored in a new nullable, unique column `client_advances.submission_id`, together with `submission_route` (`RECEIPTS` or `CLIENT_ADVANCES`), the route that created the receipt; both are null or both are set.
  - Inside the receipt transaction, after the project lock and before any other check, the service looks up the ID. Not found: the request is processed normally and the ID is saved with the new receipt.
  - Found with the same details: the original receipt is returned with the original success status and the response shape of the route called; no row, history entry or warning check is added.
  - Found with different details: 409 `SUBMISSION_ID_REUSED`; nothing is saved.
  - "Same details" (confirmed by the owner on 2026-11-18) means the same route, the same project, the same authenticated user, and the same receipt type, amount, received date, payment method, reference, note, linked quotation approval or PO, and attached document IDs. Document IDs are compared as a set, in any order. Confirmation flags (`confirm_overpayment`) are not compared.
  - The same route is part of "same details": an ID first used on one creation route and then sent to the other is refused with 409 `SUBMISSION_ID_REUSED`, even if every other field matches, so the two routes never treat each other's requests as the same submission.
  - Applies to both creation routes: `POST /projects/:id/receipts` (field required) and the Feature 003 `POST /projects/:id/client-advances` (field optional, so existing clients and tests that omit it behave exactly as today, without the safeguard). Neither route's response shape changes.
  - A request that saves nothing (validation error, warning awaiting confirmation, archived project, role refusal) leaves the ID unused, so its repeat is processed normally.
  - Existing rows keep `submission_id` and `submission_route` null; PostgreSQL unique indexes allow any number of nulls, so no existing record changes.
- **Rationale**: A double click or a network retry must not create a second receipt, while two genuinely equal receipts must stay possible (they get different IDs). The project lock (R4) makes simultaneous repeats wait and then find the first receipt; the unique index is the final guard. No product behaviour changes.
- **Alternatives considered**: Refusing receipts with equal content (blocks genuine equal receipts); storing a hash of the request (an extra column; comparing the stored fields is enough); disabling the button only (does not cover network retries).
