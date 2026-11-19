# Quickstart: Client Financial Management

Validation guide for [spec.md](./spec.md). Routes are in [contracts/http-api.md](./contracts/http-api.md); tables and derived states in [data-model.md](./data-model.md).

## Prerequisites

- Features 001 to 005 merged; the development database has the Feature 005 migration (`20261109120000_project_sections`).
- The Feature 006 migration has been reviewed and approved by the product owner, a backup taken, and the migration applied (approval gate in [plan.md](./plan.md#migration-and-rollout)). Never run `prisma migrate reset` or `db push` against the development database.
- Start the app without the seed: `docker start vendor-management-db-1`; from `api/`: `npx tsx --env-file=../.env src/server.ts`; then `npm run dev -w web`. Do not use `npm run dev`.
- Seed accounts: `admin@example.com`, `accountant@example.com` (reviewers), `office@example.com` (Office Team). Passwords are in `.env`.

## Automated checks

```text
npm run lint
npm run typecheck
npm test            # with DATABASE_URL unset: embedded test database
npm run build -w web
```

Expected: all green. Feature 001 to 005 suites pass, apart from the superseded cases listed in plan.md (the Advances section web test moves to the receipts panel).

## Scenarios

Use a fresh active project with client name "Mehta Interiors" unless stated. Amounts are GST-inclusive.

1. **Existing advances preserved (US1)**: before applying the migration, note each project's net client advances and the two dashboard money tiles. Afterwards the same figures show; each existing advance is a receipt of type Advance, verified, "Recorded under Feature 003", with its original author and time; reversed ones show reversed.
2. **Quotation and revisions (US3)**: as Office Team, create the quotation for ₹18,40,000.00. It gets a reference like `Q-000001` and revision 1 in Draft. Then, as a separate action, attach a Quotation document to revision 1. Try adding revision 2: refused while revision 1 is Draft. Withdraw revision 1 with a reason; add revision 2 (no document yet); submit it. Try to create a second quotation: refused.
3. **Review and approval (US4)**: as an Accountant, mark revision 2 Under review and try to approve it: refused, because no Quotation document is attached to revision 2. Attach one, then approve. The approved client amount shows ₹18,40,000.00 "incl. GST" from revision 2.
4. **Receipts and verification (US2)**: as Office Team, enter a Stage payment of ₹6,50,000.00 with a payment proof: "Awaiting verification", not counted. As an Accountant, verify it: counted. As Office Team, enter another and withdraw it with a reason; it stays Withdrawn and cannot be resubmitted. Reverse a verified receipt with a reason: full amount only. Send the same receipt request twice with the same submission ID (as a double click or retry would): one receipt is saved and both responses show it. Send a request reusing that ID with a different amount: refused, nothing saved.
5. **Purchase orders (US5)**: as Office Team, enter PO "PO/2026/118" for ₹18,40,000.00 against revision 2's approval with a PO document: Submitted. Enter a second PO on the same approval: refused. Verify it as an Accountant. On another project whose client name is " mehta  interiors ", enter a PO with number "PO/2026/118": a duplicate warning names the first PO; confirm, and the confirmation appears in the PO history. Cancel a Verified PO with a reason; a replacement can then be entered.
6. **Superseded approval (US5)**: use a fresh project with no purchase order. Create the quotation for ₹18,40,000.00, attach a Quotation document to revision 1 and take it through to Approved. Add revision 2 at ₹19,10,000.00 and take it to Under review. Enter a PO for ₹18,40,000.00 against revision 1's approval: a pending-revision warning names revision 2; confirm, and the confirmation appears in the PO history. Approve revision 2 without attaching a document first, supplying a Quotation document with the approval request: the approval and the document's attachment to it are saved together, and the attachment cannot be removed. The earlier PO shows "Matches superseded approval (revision 1)"; a new PO against revision 1 is refused; the project's current PO reads "No PO for the current approved amount" until a PO for ₹19,10,000.00 is entered against revision 2's approval.
7. **Balance and overpayment (US6)**: with verified receipts close to the approved amount, record a receipt as an Accountant that exceeds it: the warning shows the four figures; confirm; the balance reads "₹0.00 outstanding" and "Overpaid by ₹X (incl. GST)", never negative. On a project without an approved quotation, the balance reads "Not available" and no warning appears.
8. **Attachments**: attach, remove (Office Team: own only, with a reason), supersede (reason required) and re-attach after removal on an active record; try to remove a superseded or superseding attachment: refused; try to attach an archived document: refused until restored; upload a vendor document of type Quotation: refused.
9. **Archived project**: archive the project. Reversal, rejection of a Submitted receipt or PO and cancellation of a Verified PO still work; every other action is refused; all records stay readable.
10. **History and activity**: the project's client financial history lists every event in date order. The dashboard's Recent activity shows the Feature 006 events (quotations, POs, receipts, verifications, attachments and others) with project, person, time and the record's status after the event, and no amounts; advances recorded and reversed through the Feature 003 routes appear exactly as before. The dashboard money tiles show the Feature 003 labels and count only verified, unreversed advances.
11. **Permissions**: repeat a sample of each action as each role; the server refuses every action FR-001 does not allow, whatever the screen shows.

Record results and any difference under the quickstart task in `tasks.md`.
