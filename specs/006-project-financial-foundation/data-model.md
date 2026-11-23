# Data Model: Client Financial Management

PostgreSQL 17 through Prisma, in one committed, additive migration `<timestamp>_client_financial_management` (Constitution III). Decisions are in [research.md](./research.md); rules come from [spec.md](./spec.md).

Conventions for every new table: `id UUID` primary key; `created_at`, `created_by`, `updated_at`, `updated_by` (append-only tables keep `updated_*` equal to `created_*`, as in Feature 003); foreign keys `ON DELETE RESTRICT`; money `DECIMAL(15,2)` with `CHECK (amount > 0)`; dates `DATE` in India Standard Time. No new table has an update or delete path (append-only unit test).

## New enums and values

| Enum | Values |
|---|---|
| `RevisionStatus` | `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `WITHDRAWN` |
| `ReceiptType` | `ADVANCE`, `STAGE_PAYMENT`, `FINAL_PAYMENT`, `OTHER` |
| `EntryStatus` | `SUBMITTED`, `VERIFIED_ON_ENTRY` |
| `RecordedUnder` | `FEATURE_003`, `FEATURE_006` |
| `RecordDecision` | `VERIFIED`, `REJECTED`, `WITHDRAWN` |
| `SubmissionRoute` | `RECEIPTS`, `CLIENT_ADVANCES` |
| `DocumentType` (existing) | adds `QUOTATION`, `PURCHASE_ORDER`, `PAYMENT_PROOF` (project documents only, FR-041) |
| `HistoryAction` (existing) | adds `REVISION_ADDED`, `STATUS_CHANGED`, `APPROVED`, `VERIFIED`, `REJECTED`, `WITHDRAWN`, `CANCELLED`, `ATTACHED`, `ATTACHMENT_REMOVED`, `SUPERSEDED`, `WARNING_CONFIRMED` (existing `CREATED` and `REVERSED` are reused) |

## Tables

### client_quotations — one per project (FR-022)

| Column | Rule |
|---|---|
| `project_id` | Required, **unique** (OQ-7) |
| `reference` | Required, unique; `Q-` + six-digit number from sequence `client_quotation_reference_seq` (research R7); never changed |
| `title` | Required, 1 to 200 characters |

### quotation_revisions (FR-022 to FR-024)

| Column | Rule |
|---|---|
| `client_quotation_id` | Required |
| `number` | Required; unique with `client_quotation_id`; highest existing + 1 under the project lock |
| `amount` | Required, `> 0` (OQ-24), GST-inclusive (OQ-23) |
| `quotation_date` | Required; no later than today |
| `reason` | Required from revision 2 (check `number = 1 OR reason IS NOT NULL`) |
| `note`, `validity_date` | Optional (OQ-14) |

### quotation_status_changes (FR-025)

| Column | Rule |
|---|---|
| `quotation_revision_id` | Required |
| `from_status`, `to_status` | Required (`NOT NULL`); allowed pairs only (state machine below), enforced in the database by `quotation_status_changes_transition_ck` as well as in the service (owner decision 2026-11-18) |
| `reason` | Required when `to_status` is `REJECTED` or `WITHDRAWN` (check) (OQ-13) |
| `note` | Optional |

Unique (`quotation_revision_id`, `to_status`): each status is reached at most once per revision. The `SUBMITTED` row's `created_at` is the automatic submission date (OQ-14).

### client_approvals (FR-026 to FR-028)

| Column | Rule |
|---|---|
| `quotation_revision_id` | Required, **unique** |
| `amount` | Required; equal to the revision's amount, checked in the service in the same transaction |
| `client_acceptance_date` | Optional (OQ-14) |
| `note` | Optional |

Created in the same transaction as the `UNDER_REVIEW → APPROVED` status change, together with a `financial_attachments` row (`client_approval_id`) for each document supplied with the approval and their history entries (FR-026). The Quotation document requirement is met by a current `QUOTATION`-type attachment on the revision or a `QUOTATION`-type document supplied with the approval.

### client_purchase_orders (FR-029 to FR-033)

| Column | Rule |
|---|---|
| `project_id` | Required |
| `client_approval_id` | Required; the approval must belong to the same project and be authoritative when the PO is saved (FR-032b) |
| `po_number` | Required, 1 to 100 characters, stored as entered |
| `po_date` | Required; no later than today |
| `amount` | Required; equal to the approval amount (service check) |
| `entry_status` | `SUBMITTED` (Office Team) or `VERIFIED_ON_ENTRY` (reviewers) |
| `note` | Optional |

### purchase_order_decisions — at most one per PO

`client_purchase_order_id` (unique), `decision` (`VERIFIED`, `REJECTED`, `WITHDRAWN`), `reason` (required for `REJECTED` and `WITHDRAWN`). Only for POs with `entry_status = SUBMITTED`.

### purchase_order_cancellations — at most one per PO

`client_purchase_order_id` (unique), `reason` (required). Only for a Verified PO (FR-031).

### client_advances (existing) — every client receipt (research R3)

Existing columns unchanged. Added:

| Column | Rule |
|---|---|
| `receipt_type` | `ReceiptType`, not null, default `ADVANCE` |
| `entry_status` | `EntryStatus`, not null, default `VERIFIED_ON_ENTRY` |
| `recorded_under` | `RecordedUnder`, not null; existing rows `FEATURE_003`; default for new rows `FEATURE_006` |
| `client_approval_id` | Optional FK; same project; any approval, including a superseded one (FR-021) |
| `client_purchase_order_id` | Optional FK; same project; the PO must be Verified, and not Cancelled, when the receipt is entered (service check); a later cancellation or approval never changes the link (FR-021) |
| `submission_id` | UUID, nullable, **unique**; set from the creation request; null for every existing row and for Feature 003 route requests that omit it (research R13) |
| `submission_route` | `SubmissionRoute`, nullable; the creation route that saved `submission_id` (research R13) |

Checks: at most one of `client_approval_id` and `client_purchase_order_id` is set (FR-021); `submission_id` and `submission_route` are both null or both set. The existing `client_advances_amount_ck` (`amount > 0`) stays.

### client_receipt_decisions — at most one per receipt

`client_advance_id` (unique), `decision` (`VERIFIED`, `REJECTED`, `WITHDRAWN`), `reason` (required for `REJECTED` and `WITHDRAWN`). Only for receipts with `entry_status = SUBMITTED`. Reversal stays in the existing `client_advance_reversals` (FR-020).

### financial_attachments (FR-041 to FR-042f)

| Column | Rule |
|---|---|
| `document_id` | Required; a project document of the same project (F9), not archived when attached (FR-042f) |
| `quotation_revision_id`, `client_approval_id`, `client_purchase_order_id`, `client_advance_id` | Exactly one set (check) |
| `supersedes_attachment_id` | Optional; **unique** (each attachment superseded at most once); must be a current attachment of the same record that is not already superseded (service check) |
| `supersede_reason` | Required when `supersedes_attachment_id` is set (check) |

### financial_attachment_removals

`financial_attachment_id` (unique), `reason` (required). Refused for attachments in a supersede chain, on records in a final status, and for every attachment on an approval (FR-042d). Attaching to an approval is for Administrators and Accountants only (FR-042b).

### history_entries (existing)

Adds nullable `client_quotation_id` and `client_purchase_order_id` (FK, indexed with `created_at`). The target check becomes `num_nonnulls(vendor_id, project_id, document_id, vendor_import_run_id, client_advance_id, client_quotation_id, client_purchase_order_id) = 1`; every existing row still satisfies it.

Every entry written by Feature 006 code stores `details.record_status`, the associated record's state immediately after the event (research R6). Entries written by the Feature 003 routes for an Advance (`CREATED` through `POST /projects/:id/client-advances`, `REVERSED` of an Advance) keep their exact Feature 003 `details`. No existing entry is rewritten.

## Derived states (never stored)

| Record | Current state |
|---|---|
| Revision | Latest `quotation_status_changes.to_status`; `DRAFT` when none |
| Quotation authoritative approval | Approval of the highest-numbered `APPROVED` revision (FR-028) |
| Receipt | `REVERSED` if a reversal exists; else the decision if any; else `VERIFIED` when `entry_status = VERIFIED_ON_ENTRY`, `SUBMITTED` otherwise |
| PO | `CANCELLED` if a cancellation exists; else the decision if any; else `VERIFIED` or `SUBMITTED` from `entry_status`. Current = `SUBMITTED` or `VERIFIED`. Labelled "Matches superseded approval (revision n)" when its approval is not authoritative |
| Attachment | Current when no removal exists; "Superseded by" when another attachment's `supersedes_attachment_id` points to it |
| Project balance | Authoritative approval amount − sum of verified, unreversed receipts; outstanding = max(0, difference); overpayment = max(0, −difference); "Not available" when no approval |
| Dashboard tiles, drill-down, net advances | Receipts with `receipt_type = ADVANCE`, state `VERIFIED`, not reversed (FR-015) |

## State machines

**Revision** (FR-025; withdrawal ownership OQ-13)

```text
DRAFT ──submit──> SUBMITTED ──review──> UNDER_REVIEW ──approve──> APPROVED (final)
  │                   │                       └──reject──> REJECTED (final)
  └──withdraw──> WITHDRAWN (final) <──withdraw──┘
```

At most one revision per quotation is `DRAFT`, `SUBMITTED` or `UNDER_REVIEW` (FR-023a); a new revision needs the newest to be final.

**Receipt / PO**: `SUBMITTED → VERIFIED | REJECTED | WITHDRAWN` (one decision row); entries by reviewers start `VERIFIED`. Receipt: `VERIFIED → REVERSED` (existing reversal). PO: `VERIFIED → CANCELLED`. Final states never return to `SUBMITTED` (OQ-17).

## Archived projects (FR-010)

Allowed while archived: reversal, rejection of a Submitted receipt or PO, cancellation of a Verified PO. Every other write is refused by one guard in the service.

## Migration steps (review before applying)

0. The whole migration runs as one explicit transaction: `BEGIN;` first and `COMMIT;` last (owner decision 2026-11-18). Every statement is allowed in a transaction on PostgreSQL 17; the enum values added with `ALTER TYPE ... ADD VALUE` are not used before `COMMIT`.
1. Create the enums and add the enum values.
2. Create sequence `client_quotation_reference_seq`.
3. Create the 10 new tables with indexes, unique keys, foreign keys and checks.
4. `ALTER TABLE client_advances` add the seven columns: `receipt_type` and `entry_status` with defaults; `recorded_under` added with default `FEATURE_003` (fills existing rows) then its default changed to `FEATURE_006`; the two nullable foreign keys and the at-most-one check; nullable `submission_id` with its unique index and nullable `submission_route` with the both-or-neither check.
5. Add the two history target columns and replace the target check (atomically, inside the transaction). Add the six-transition check on `quotation_status_changes`.
6. Insert no rows (other than the column defaults) and update or delete nothing.

Verification after applying: counts and content checksums of every existing table equal, apart from the new columns on `client_advances` (all existing rows `ADVANCE`, `VERIFIED_ON_ENTRY`, `FEATURE_003`, no links, no submission ID or route).
