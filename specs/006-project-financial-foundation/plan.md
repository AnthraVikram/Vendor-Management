# Implementation Plan: Client Financial Management

**Branch**: `006-project-financial-foundation` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-project-financial-foundation/spec.md` (all OQ-1 to OQ-42 decided; checklist 16/16).

## Summary

Each project gains a Client finance area: one client quotation with strictly sequential revisions and per-revision statuses, approvals that fix the approved client amount, client purchase orders that must match an approval exactly, client receipts (the existing Feature 003 advances plus Stage, Final and Other payments) with verification by Administrators and Accountants, the outstanding balance with overpayment handling, document attachments with removal and supersede rules, and one chronological client financial history.

Technical approach (research.md): every financial record is append-only. A record's current state is never stored in a column that changes; it is derived from append-only decision rows (status changes, verifications, rejections, withdrawals, cancellations, reversals, attachment removals). Receipts reuse the existing `client_advances` table, extended additively, so Feature 003 advances stay where they are and keep their routes, history and dashboard behaviour. Every client-finance write locks the project row for the length of its transaction, which serialises the rules that depend on current state (one active revision, one current PO per approval, overpayment, duplicate attachment). History gains two target types (quotation, PO); attachment actions write one entry on the financial record and one on each document involved.

## Technical Context

**Language/Version**: TypeScript on Node LTS (Constitution II), as in Features 001 to 005.

**Primary Dependencies**: Express, Prisma 6.19.3, Zod (API); React 19, Vite (web). No new runtime dependency.

**Storage**: PostgreSQL 17 through Prisma; one additive migration (`<timestamp>_client_financial_management`). Money `DECIMAL(15,2)`; dates `DATE` in India Standard Time (existing `india-date` helpers).

**Testing**: Vitest and Supertest against the embedded test database (port 54329, used only when `DATABASE_URL` is unset); React Testing Library in jsdom for the web.

**Target Platform**: Internal web application; responsive at 375, 768 and 1280 px (Feature 005 NFR-004).

**Project Type**: Web application (`api/` and `web/`, one repository).

**Performance Goals**: Project page with its Client finance area under 2 seconds with 50 projects, each with one quotation of up to 200 revisions, 10 POs and 200 receipts (spec NFR-001, corrected 2026-11-18); checked by an extension of the Feature 005 performance test.

**Constraints**: Append-only financial records (Constitution III); server-side role checks on every route (IV); no change to Feature 003 records or routes beyond the Backward Compatibility table; the development database is touched only after the owner approves the migration.

**Scale/Scope**: Tens of projects, hundreds of receipts per project at most; 10 new tables, 7 new columns on `client_advances`, 2 new history target columns, 1 sequence, new enum values.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Spec before code | `spec.md` complete, no `NEEDS CLARIFICATION` markers (checklist 16/16); `plan.md` precedes code; one branch. PRD coverage: FR-19, approved 2026-11-17, PRD Phase 4 (section 5.4) | Pass |
| II. Fixed stack | TypeScript, Express, React, PostgreSQL 17, Prisma, Vitest, Supertest; no new runtime dependency | Pass |
| III. Data rules | Audit columns on every new table; money `DECIMAL(15,2)`; every financial record append-only, current state derived from append-only rows (research R2); corrections are new entries (reversal, withdrawal, cancellation, new revision, supersede); migration committed, foreign keys enforced. The "archived with a flag" rule: client financial records are never archived or deleted individually; they follow their project's archive flag (spec FR-010), as Feature 003 client advances do today | Pass |
| IV. Security | Every route behind the existing session check plus a server-side role check from FR-001; Zod validation on every body; documents served only by the existing authenticated route | Pass |
| V. Tests and done | Every acceptance scenario (US1 to US6) maps to an automated test (Testing Strategy below); business rules test-first; converge before the pull request | Pass |
| VI. Simplicity | One quotation per project, derived states, one lock; no Feature 010 dashboard, charts or firm-wide lists; PRD Phase 4 covers the scope | Pass |

**Post-design re-check (after Phase 1)**: Pass. The data model adds tables and columns only; it rewrites no existing row (FR-012). Existing advances need no backfill beyond column defaults that encode their existing meaning (research R3). No complexity exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/006-project-financial-foundation/
├── spec.md              # Approved specification
├── plan.md              # This file
├── research.md          # Phase 0: technical decisions
├── data-model.md        # Phase 1: tables, columns, derived states, migration
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   └── http-api.md      # Phase 1: routes, payloads, errors
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 (/speckit-tasks): task list and implementation record
```

### Source Code (repository root)

```text
api/
├── prisma/
│   ├── schema.prisma                         # new models, enums, columns
│   └── migrations/<timestamp>_client_financial_management/migration.sql
├── src/
│   ├── lib/
│   │   ├── permissions.ts                    # FINANCE_REVIEWERS
│   │   ├── history.ts                        # new HistoryTarget kinds
│   │   ├── client-name.ts                    # client-name normalisation (FR-029a)
│   │   └── finance-state.ts                  # pure state derivation and balance (unit-tested)
│   └── modules/
│       ├── client-finance/
│       │   ├── routes.ts                     # summary, history, pending list
│       │   ├── quotations.ts                 # quotation, revisions, status, approval
│       │   ├── purchase-orders.ts            # POs, decisions, cancellation, warnings
│       │   ├── receipts.ts                   # receipt service shared with client-advances
│       │   ├── attachments.ts                # attach, remove, supersede
│       │   └── lock.ts                       # project row lock
│       ├── client-advances/routes.ts         # unchanged paths; delegates to receipts service; dashboard filters
│       ├── dashboard/routes.ts               # tiles and Recent activity filters (FR-015, FR-039)
│       ├── documents/routes.ts               # three project-only document types (FR-041)
│       └── history/routes.ts                 # new targets readable
└── tests/
    ├── api/client-finance-*.test.ts
    └── unit/finance-state.test.ts, client-name.test.ts, append-only.test.ts (extended)

web/
├── src/pages/
│   ├── project-detail.tsx                    # Client finance area replaces the Advances section in place
│   ├── client-finance/                       # summary, quotation, purchase-orders, receipts, attachments, history
│   └── documents-section.tsx                 # new types offered for project documents only
└── tests/client-finance-*.test.tsx
```

**Structure Decision**: The existing `api/` and `web/` web-application layout. New server code is one module, `client-finance`; the existing `client-advances` module keeps its routes and delegates recording and reversal to the shared receipt service, so there is one implementation of receipt rules.

## Design Overview

| Area | Spec | Design (details in data-model.md and contracts) |
|---|---|---|
| Access | FR-001 to FR-003 | `FINANCE_REVIEWERS = [ADMINISTRATOR, ACCOUNTANT]`; every role views; ownership checks compare the requester with the recorded `created_by` |
| Integrity | FR-004 to FR-011 | `parsePositiveAmount` for every amount; append-only rows; project row lock and expected-state fields for stale refusal (FR-007); one transaction per action holding the lock, checks, rows and every history entry of that action (FR-008; research R4); archived-project rules in one guard (FR-010) |
| Existing advances | FR-012 to FR-015 | New `client_advances` columns default to the Feature 003 meaning (Advance, verified on entry, recorded under Feature 003); tiles, drill-down and net amount filter to verified, unreversed advances |
| Receipts | FR-016 to FR-021 | Types Advance, Stage payment, Final payment, Other; Office entries Submitted; one decision row per receipt (verify, reject, withdraw); reversal keeps the Feature 003 table; an optional link to any approval of the project (superseded included) or to a PO that is Verified when the receipt is entered, never invalidated later; a repeated creation request with the same `submission_id` returns the original receipt (research R13) |
| Quotation | FR-022 to FR-028 | One quotation per project (unique `project_id`); revisions numbered per quotation; status from status-change rows; approval row per approved revision, saved with any documents supplied in the approval request (their links and history entries in the same transaction); a Quotation document on the revision or in the request is required; authoritative approval = latest approval |
| Purchase orders | FR-029 to FR-033 | PO references an approval; amount equality checked in the service; one decision row; cancellation row; duplicate and pending-revision warnings returned as 409 with details and accepted with confirmation flags |
| Balance | FR-034 to FR-037 | Pure function over the authoritative approval and verified, unreversed receipts; overpayment check before saving or verifying |
| History | FR-038 to FR-040 | Project-level chronological view merges entries of the quotation, POs, receipts and attachments; every Feature 006 history entry captures `details.record_status` (the record's state immediately after the event) when written; Recent activity: entries added by this feature (including reversals of non-Advance receipts and new events on Advance receipts) show that status and no amount; non-Advance receipts use the response kind `client_receipt` (all receipts keep the `client_advance_id` history target); Feature 003 advance entries keep their exact existing shape with no status; the screen is unchanged for existing entries |
| Documents | FR-041 to FR-042f | Three project-only document types; attachment links with supersede reference; removals in their own table; two history entries per attach or remove, three per supersede; approval attachments by Administrators and Accountants only, never removed |
| Display | FR-043 to FR-047 | Client finance area replaces the Advances section on the project page; "incl. GST" labels; pending-verification list per project; no firm-wide dashboard |

## Backward Compatibility and Superseded Tests

Expected changes to existing tests, all named in the spec's Backward Compatibility table:

- **Web, `advances-section.test.tsx`**: the Advances section is replaced by the Client finance receipts panel (FR-043). Its scenarios (record, reverse, read-only for Office Team on the old form, archived notice) move to `client-finance-receipts.test.tsx` with the Feature 006 permissions; the Office Team "record" control now submits for verification.
- **API, Feature 003 client-advance tests**: kept unchanged. The Feature 003 routes keep their paths, permissions (Administrator and Accountant only) and responses; they now call the shared receipt service, which adds the overpayment check only when an approved quotation exists (none does in those tests) and the repeat check only when a `submission_id` is sent (those tests send none).
- **API, dashboard summary and overview tests**: values unchanged for existing data; new tests cover Submitted, Rejected and Withdrawn advances and subsequent payments being excluded.
- **API, documents tests**: the type list for project documents grows; vendor documents still accept only the five types.
- **Unit, `append-only.test.ts`**: extended to the new tables (no update or delete of any financial row).

## Migration and Rollout

- One additive migration: new enums and enum values, 10 tables, 7 columns on `client_advances` (five with a default or null that matches the existing meaning, plus the nullable, unique `submission_id` and its nullable `submission_route`, both null for existing rows), 2 nullable history target columns, the replaced history target check (existing rows still satisfy it), one sequence. No row is rewritten (FR-012).
- Approval gate, as in Feature 005 T047: before applying it to the development database the owner reviews the SQL; a backup is taken; before and after counts and checksums of `client_advances`, `client_advance_reversals` and `history_entries` must match except for the new columns.
- The development database is started only with `docker start vendor-management-db-1`; never `npm run dev`, which runs the seed and `docker compose up`.
- No seed changes: the spec asks for none.

## Testing Strategy

| Story | Automated coverage |
|---|---|
| US1 (advances preserved) | Before-and-after snapshot test of advances, reversals, history, net amount and tiles; every Feature 003 advance test unchanged |
| US2 (receipts) | API: types, Submitted vs verified on entry, verify, reject, withdraw (owner check, reason), no resubmission, full reversal only, overpayment warning and confirmation history, archived rules, attachments by status, repeated submission on both creation routes (same ID and details return the original, document IDs in another order still match, confirmation flags ignored, simultaneous repeats save one receipt, each differing field refused, same ID on the other route refused, Feature 003 route without the ID unchanged); unit: derived receipt state |
| US3 (quotation and revisions) | API: one quotation per project, reference generation, sequential rule and concurrency, transitions table, reasons, Draft withdrawal ownership, no edit, attachments, supersede chains, re-attachment, archived refusals, vendor document type refusal |
| US4 (approval) | API: Quotation document required, amount equality, authoritative approval, superseded approvals, refusals; unit: authoritative approval |
| US5 (purchase orders) | API: required fields, exact amount, one current PO, warnings (duplicate across matching client names, pending revision) with confirmation history, PO document before verification, verify, reject, withdraw, cancel, superseded-approval rules, archived rules |
| US6 (balance and history) | API and unit: balance rule, "Not available", overpayment display, history order and contents; web: rendering and "incl. GST" labels |
| Cross-cutting | Role matrix test for every FR-001 action and role (SC-005); append-only scan (SC-008); performance at NFR-001 volume |

## Complexity Tracking

No Constitution Check violations; no entries.
