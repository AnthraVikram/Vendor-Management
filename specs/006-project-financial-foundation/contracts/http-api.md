# HTTP API: Client Financial Management

All routes are under `/api`, behind the existing session check (signed-out or revoked: 401, no amounts). JSON bodies are validated with Zod; a validation failure returns 400 with `fields`. Money is a string with two decimals (`"1840000.00"`), GST-inclusive. Dates are `YYYY-MM-DD` (India Standard Time). Roles: **R** = Administrator or Accountant; **O** = Office Team. Rules are in [spec.md](../spec.md); tables in [data-model.md](../data-model.md).

## Common errors

| Status | Code | When |
|---|---|---|
| 403 | `ROLE_NOT_ALLOWED` | Role not allowed by FR-001 / FR-042b, or Office Team acting on a record they did not create where ownership applies |
| 404 | — | Record not found or not on this project |
| 409 | `PROJECT_ARCHIVED` | Action not allowed on an archived project (FR-010) |
| 409 | `STALE` | State changed since it was loaded (FR-007); body includes the current state |
| 409 | `INVALID_TRANSITION` | Transition not in FR-025, or decision on a non-Submitted record; names the current status |
| 409 | `OVERPAYMENT_CONFIRMATION_REQUIRED` | FR-036; body: `approved_amount`, `verified_receipts`, `receipt_amount`, `excess` |
| 409 | `DUPLICATE_PO_NUMBER` | FR-029a; body: earlier PO `po_number`, `project` |
| 409 | `PENDING_REVISION` | FR-032a; body: authoritative revision and amount, pending revision number, status, amount |
| 409 | `INVALID_LINK` | Receipt link to an approval or PO of another project, or to a PO that is not Verified or is Cancelled (FR-021) |
| 409 | `SUBMISSION_ID_REUSED` | A receipt `submission_id` already used for a receipt with different details, or first used on the other creation route (research R13) |

A request repeated with the matching `confirm_*` flag is re-checked and, if the same warning still applies, saved with a `WARNING_CONFIRMED` history entry carrying the figures (research R5).

## Client finance summary and history

| Route | Roles | Response |
|---|---|---|
| `GET /projects/:id/client-finance` | all | Quotation (reference, title) with revisions (number, amount, dates, reason, note, status, status changes, attachments), approvals with `authoritative` and `superseded_by`, POs with state, label and attachments, current PO or `null`, receipts with type, state, `recorded_under`, links, attachments, reversal; `summary`: `approved_amount` or `null`, `verified_receipts`, `outstanding`, `overpaid` or `null`, `basis_text`, `not_available_reason`; `pending_verification` list (FR-046); `project.archived` |
| `GET /projects/:id/client-finance/history` | all | Chronological entries of the project's quotation, POs and receipts (FR-038), each with action, record, amount where it has one, state, person, time |

## Quotation and revisions

| Route | Roles | Body | Notes |
|---|---|---|---|
| `POST /projects/:id/quotation` | R, O | `title`, `amount`, `quotation_date`, `note?`, `validity_date?` | 409 `QUOTATION_EXISTS` if the project has one (OQ-7); creates revision 1 in Draft and the reference |
| `POST /quotations/:id/revisions` | R, O | `amount`, `quotation_date`, `reason`, `note?`, `validity_date?`, `expected_newest_revision` | 409 `REVISION_ACTIVE` naming the active revision and status (FR-023a) |
| `POST /quotation-revisions/:id/status` | per transition | `to` (`SUBMITTED`, `UNDER_REVIEW`, `REJECTED`, `WITHDRAWN`), `expected_status`, `reason?`, `note?` | `SUBMITTED`: R, O. `UNDER_REVIEW`, `REJECTED`: R. `WITHDRAWN` from Draft: R, or O for their own revision; from Submitted: R. Reason required for `REJECTED` and `WITHDRAWN` |
| `POST /quotation-revisions/:id/approval` | R | `expected_status`, `amount`, `client_acceptance_date?`, `note?`, `document_ids?` | Needs Under review, no newer revision, `amount` equal to the revision amount (409 `AMOUNT_MISMATCH`), and a Quotation document either already attached to the revision or among `document_ids` (409 `QUOTATION_DOCUMENT_REQUIRED`). `document_ids` are attached to the approval under the attachment rules (same project, not archived: 409 `DOCUMENT_ARCHIVED`, no duplicate); the approval, status change, attachment links and all history entries are saved together or not at all |

No route edits or deletes a revision, status change or approval.

## Purchase orders

| Route | Roles | Body | Notes |
|---|---|---|---|
| `POST /projects/:id/purchase-orders` | R, O | `client_approval_id`, `po_number`, `po_date`, `amount`, `note?`, `document_ids?`, `confirm_duplicate?`, `confirm_pending_revision?` | Approval must be authoritative (409 `APPROVAL_SUPERSEDED`); amount equal (409 `AMOUNT_MISMATCH`, body gives approved amount); one current PO per approval (409 `CURRENT_PO_EXISTS`); entered by R → Verified and needs a Purchase order document in `document_ids` (409 `PO_DOCUMENT_REQUIRED`); by O → Submitted |
| `POST /purchase-orders/:id/verification` | R | `expected_state` | Needs Submitted, authoritative approval, Purchase order document attached |
| `POST /purchase-orders/:id/rejection` | R | `reason`, `expected_state` | Allowed on archived projects |
| `POST /purchase-orders/:id/withdrawal` | R, O (own) | `reason`, `expected_state` | Submitted only |
| `POST /purchase-orders/:id/cancellation` | R | `reason`, `expected_state` | Verified only; allowed on archived projects |

## Receipts

| Route | Roles | Body | Notes |
|---|---|---|---|
| `POST /projects/:id/receipts` | R, O | `submission_id` (UUID), `receipt_type`, `amount`, `received_on`, `payment_method?`, `reference?`, `note?`, `client_approval_id?` or `client_purchase_order_id?`, `document_ids?`, `confirm_overpayment?` | By R → verified on entry (overpayment check); by O → Submitted. `client_approval_id`: any approval of this project, superseded included; `client_purchase_order_id`: a PO of this project that is Verified and not Cancelled now (otherwise 409 `INVALID_LINK`); a later cancellation or approval never changes the link. Repeat with the same `submission_id` and same details → the original receipt, same status and shape, nothing new saved; different details → 409 `SUBMISSION_ID_REUSED` |
| `POST /receipts/:id/verification` | R | `expected_state`, `confirm_overpayment?` | Submitted only; overpayment check |
| `POST /receipts/:id/rejection` | R | `reason`, `expected_state` | Allowed on archived projects |
| `POST /receipts/:id/withdrawal` | R, O (own) | `reason`, `expected_state` | Submitted only |
| `POST /client-advances/:id/reversal` (existing) | R | `reason` | Unchanged path and response; now any verified receipt type; full amount, once (FR-020) |

**Repeated receipt requests** (both creation routes, research R13): a `submission_id` matches only when the route, project, authenticated user, receipt type, amount, received date, payment method, reference, note, linked approval or PO and the set of `document_ids` (any order) are all the same as the saved receipt. `confirm_*` flags are not compared. A match returns the original receipt; anything else, including the same ID sent to the other creation route, returns 409 `SUBMISSION_ID_REUSED`.

Feature 003 routes keep their paths, permissions (R only for recording and reversing) and response shapes (FR-049):

- `GET /client-advances?scope=` (dashboard drill-down): standing advances = type Advance, verified, not reversed (FR-015).
- `GET /projects/:id/client-advances`: lists advances of type Advance that are verified, including reversed ones with their reversal, as Feature 003 FR-021 shows; `net_amount` counts verified, unreversed advances only. Submitted, Rejected and Withdrawn advances and other receipt types are not listed here; they appear in the Client finance area.
- `POST /projects/:id/client-advances`: R only; records a verified Advance through the shared receipt service, so every receipt rule applies. Two additions, both optional request fields: (1) when an approved quotation exists and the advance would cause an overpayment, it returns 409 `OVERPAYMENT_CONFIRMATION_REQUIRED` and accepts `confirm_overpayment`; (2) it accepts `submission_id` with the same repeat behaviour as the receipts route (original advance returned in this route's existing response shape, or 409 `SUBMISSION_ID_REUSED`). A request without an approved quotation and without `submission_id` (every Feature 003 test case) behaves and responds exactly as before.

For all existing data these routes return exactly what they returned before the migration (SC-001).

## Attachments

| Route | Roles | Body | Notes |
|---|---|---|---|
| `POST /financial-attachments` | per FR-042b | `record` (`{ kind: revision \| approval \| purchase_order \| receipt, id }`), `document_id`, `supersedes_attachment_id?`, `supersede_reason?` | Document of the same project, not archived (409 `DOCUMENT_ARCHIVED`), not already current on the record (409 `ALREADY_ATTACHED`); supersede target current, unsuperseded, same record; reason required with supersede |
| `POST /financial-attachments/:id/removal` | per FR-042d | `reason` | Record active; not in a supersede chain (409 `IN_SUPERSEDE_CHAIN`); never on an approval (409 `INVALID_TRANSITION`); Office Team only for their own attachments |

Attaching to an approval (`record.kind: approval`) is for R only; O gets 403 `ROLE_NOT_ALLOWED` (FR-042b).

## Changed existing routes

| Route | Change |
|---|---|
| `POST /vendors/:id/documents`, `POST /projects/:id/documents` | `document_type` also accepts `QUOTATION`, `PURCHASE_ORDER`, `PAYMENT_PROOF` for projects only; for vendors they are refused (400) (FR-041) |
| `GET /dashboard/summary` | Money tiles count verified, unreversed advances only (FR-015) |
| `GET /dashboard/overview` | `recent_activity` includes quotation, PO and receipt entries (research R6, FR-039). **Feature 003 advance entries** (`CREATED` through the Feature 003 route, `REVERSED` on an Advance): exact existing shape, target kind `client_advance`, no `status`. **Entries added by Feature 006** (every other client-finance entry, including `REVERSED` on a non-Advance receipt and new events on Advance receipts): `status` = `details.record_status`, captured when the entry was written (research R6), for every action including `CREATED`, `REVISION_ADDED`, `WARNING_CONFIRMED` and attachment events; existing entries are never rewritten; no amount in `changes` or `details`; target kind `client_advance` for Advance receipts, `client_receipt` for other receipt types, `client_quotation`, `client_purchase_order`, each with the project id and name. `client_receipt` is a response kind only; all receipts keep the `client_advance_id` history target |
| `GET /history?client_quotation_id=` / `client_purchase_order_id=` | New history targets readable by every role |
