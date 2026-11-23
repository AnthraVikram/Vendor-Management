import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  addRevision,
  approveRevision,
  createAdvance,
  createProject,
  createPurchaseOrder,
  createQuotation,
  createReceipt,
  createUser,
  dayOffset,
  resetDatabase,
  resetFileStorage,
  reverseAdvance,
  signIn,
} from '../helpers';

// US6 (T056): the outstanding client balance, its basis and the pending-verification list (FR-034 to FR-037, FR-046, FR-047).
async function seeded() {
  const admin = await createUser({ email: 'admin@example.com' });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  const { revision } = await createQuotation(admin.id, project.id, { amount: '1840000.00' });
  const approval = await approveRevision(admin.id, revision.id);
  await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1840000.00' });
  const advance = await createAdvance({ projectId: project.id, amount: '500000.00', receivedOn: dayOffset(-10), actorId: admin.id });
  const payment = await createReceipt(admin.id, { projectId: project.id, amount: '150000.00' });
  const submitted = await createReceipt(admin.id, { projectId: project.id, amount: '99999.99', entryStatus: 'SUBMITTED' });
  const reversed = await createAdvance({ projectId: project.id, amount: '70000.00', receivedOn: dayOffset(-9), actorId: admin.id });
  await reverseAdvance({ advanceId: reversed.id, reason: 'Bounced', actorId: admin.id });
  return { admin, project, approval, advance, payment, submitted, reversed };
}

const roles = ['admin@example.com', 'office@example.com', 'accountant@example.com'];

describe('US6: outstanding client balance', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('is the approved amount less verified, unreversed receipts, to the paisa, with its basis and counted receipts, for every role (US6-1, US6-5, SC-007)', async () => {
    const { project, advance, payment } = await seeded();
    for (const email of roles) {
      const { client } = await signIn(email);
      const { summary } = (await client.get(`/api/projects/${project.id}/client-finance`)).body;
      expect(summary).toMatchObject({
        approved_amount: '1840000.00',
        verified_receipts: '650000.00',
        outstanding: '1190000.00',
        overpaid: null,
        not_available_reason: null,
        basis_text: 'Approved client amount ₹18,40,000.00 less verified receipts ₹6,50,000.00',
      });
      expect([...summary.counted_receipt_ids].sort()).toEqual([advance.id, payment.id].sort());
    }
  });

  it('reads "Not available" with its reason, never ₹0.00, without an approval, and needs no PO (US6-2, US6-6, FR-035)', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const project = await createProject(admin.id, 'Bare');
    await createReceipt(admin.id, { projectId: project.id, amount: '1000.00' });
    const { client } = await signIn('admin@example.com');
    const { summary } = (await client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(summary).toMatchObject({ approved_amount: null, outstanding: null, not_available_reason: 'Not available: no approved amount', verified_receipts: '1000.00' });

    const withApproval = await createProject(admin.id, 'No PO');
    const { revision } = await createQuotation(admin.id, withApproval.id, { amount: '1000.00' });
    await approveRevision(admin.id, revision.id);
    expect((await client.get(`/api/projects/${withApproval.id}/client-finance`)).body.summary.outstanding).toBe('1000.00');
  });

  it('shows ₹0.00 outstanding and the overpayment when a lower revision is approved later, with no warning (US6-3, Edge Cases)', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const project = await createProject(admin.id, 'Lake House');
    const { quotation, revision } = await createQuotation(admin.id, project.id, { amount: '1000000.00' });
    await approveRevision(admin.id, revision.id);
    await createReceipt(admin.id, { projectId: project.id, amount: '900000.00' });
    const r2 = await addRevision(admin.id, quotation.id, { amount: '850000.00' });
    await approveRevision(admin.id, r2.id);
    const { client } = await signIn('admin@example.com');
    const { summary } = (await client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(summary).toMatchObject({ approved_amount: '850000.00', outstanding: '0.00', overpaid: '50000.00' });
    expect(await prisma.historyEntry.count({ where: { action: 'WARNING_CONFIRMED' } })).toBe(0);
  });

  it('shows only the allowed figures and lists records awaiting verification (FR-037, FR-046)', async () => {
    const { admin, project, approval, submitted } = await seeded();
    const po = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1840000.00', poNumber: 'PO/S', entryStatus: 'SUBMITTED' });
    const { client } = await signIn('accountant@example.com');
    const body = (await client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(Object.keys(body.summary).sort()).toEqual(
      ['approved_amount', 'approved_revision_number', 'basis_text', 'counted_receipt_ids', 'not_available_reason', 'outstanding', 'overpaid', 'verified_receipts'].sort(),
    );
    expect(body.pending_verification.map((p: { kind: string; id: string }) => [p.kind, p.id])).toEqual([
      ['receipt', submitted.id],
      ['purchase_order', po.id],
    ]);
  });

  it('gives every record its project, type, business date, amount, state, author, time and links (FR-047)', async () => {
    const { project, payment } = await seeded();
    const { client } = await signIn('admin@example.com');
    const body = (await client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(body.project.id).toBe(project.id);
    const receipt = body.receipts.find((r: { id: string }) => r.id === payment.id);
    for (const key of ['receipt_type', 'received_on', 'amount', 'state', 'created_by', 'created_at', 'link']) expect(receipt, key).toHaveProperty(key);
    for (const key of ['po_number', 'po_date', 'amount', 'state', 'created_by', 'created_at', 'approval']) expect(body.purchase_orders[0], key).toHaveProperty(key);
    for (const key of ['number', 'quotation_date', 'amount', 'status', 'created_by', 'created_at']) expect(body.quotation.revisions[0], key).toHaveProperty(key);
    for (const key of ['revision_number', 'amount', 'created_at', 'created_by', 'authoritative']) expect(body.approvals[0], key).toHaveProperty(key);
  });
});
