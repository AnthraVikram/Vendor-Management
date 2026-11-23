import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  addRevision,
  approveRevision,
  attachDocument,
  createProject,
  createProjectDocument,
  createPurchaseOrder,
  createQuotation,
  createUser,
  dayOffset,
  resetDatabase,
  resetFileStorage,
  setRevisionStatus,
  signIn,
} from '../helpers';

// US5 (T050): client purchase orders (FR-029 to FR-033, FR-010, FR-042b, FR-042d).
type Session = Awaited<ReturnType<typeof signIn>>;

async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  await createUser({ email: 'office2@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  await prisma.project.update({ where: { id: project.id }, data: { clientName: 'Mehta Interiors' } });
  const { quotation, revision } = await createQuotation(admin.id, project.id, { amount: '1840000.00' });
  const approval = await approveRevision(admin.id, revision.id);
  const poDoc = () => createProjectDocument(admin.id, { projectId: project.id, documentType: 'PURCHASE_ORDER' });
  return {
    admin,
    office,
    project,
    quotation,
    revision,
    approval,
    poDoc,
    asOffice: await signIn('office@example.com'),
    asOffice2: await signIn('office2@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

const enter = (session: Session, projectId: string, body: Record<string, unknown>) =>
  session.client.post(`/api/projects/${projectId}/purchase-orders`).send({ po_number: 'PO/2026/118', po_date: dayOffset(-1), amount: '1840000.00', ...body });
const act = (session: Session, id: string, action: 'verification' | 'rejection' | 'withdrawal' | 'cancellation', body: Record<string, unknown> = {}) =>
  session.client.post(`/api/purchase-orders/${id}/${action}`).send(body);
const view = async (session: Session, projectId: string) => (await session.client.get(`/api/projects/${projectId}/client-finance`)).body;

describe('US5: client purchase orders', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('saves an Office Team PO as Submitted and a reviewer PO with its PO document as Verified (US5-1, US5-25)', async () => {
    const { office, project, approval, poDoc, asOffice, asAccountant } = await setup();
    const submitted = await enter(asOffice, project.id, { client_approval_id: approval.id });
    expect(submitted.status).toBe(201);
    expect(submitted.body).toMatchObject({ state: 'SUBMITTED', po_number: 'PO/2026/118', approval: { id: approval.id, revision_number: 1 }, created_by: { id: office.id } });
    await act(asOffice, submitted.body.id, 'withdrawal', { reason: 'Typo', expected_state: 'SUBMITTED' });
    const noDoc = await enter(asAccountant, project.id, { client_approval_id: approval.id });
    expect(noDoc.status).toBe(409);
    expect(noDoc.body.code).toBe('PO_DOCUMENT_REQUIRED');
    const verified = await enter(asAccountant, project.id, { client_approval_id: approval.id, document_ids: [(await poDoc()).id], confirm_duplicate: true });
    expect(verified.status).toBe(201);
    expect(verified.body).toMatchObject({ state: 'VERIFIED', label: null });
    const created = await prisma.historyEntry.findFirstOrThrow({ where: { clientPurchaseOrderId: verified.body.id, action: 'CREATED' } });
    expect(created.details).toMatchObject({ record_status: 'VERIFIED' });
  });

  it('names each missing field and refuses a future PO date (US5-27, FR-029)', async () => {
    const { project, asOffice } = await setup();
    const missing = await asOffice.client.post(`/api/projects/${project.id}/purchase-orders`).send({});
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.fields).sort()).toEqual(['amount', 'client_approval_id', 'po_date', 'po_number']);
    const future = await enter(asOffice, project.id, { client_approval_id: (await prisma.clientApproval.findFirstOrThrow()).id, po_date: dayOffset(1) });
    expect(future.status).toBe(400);
    expect(future.body.fields.po_date).toBeTruthy();
  });

  it('refuses without an approved quotation, against an unapproved or foreign approval, or at any other amount (US5-2 to US5-4, US5-12)', async () => {
    const { admin, project, approval, quotation, asOffice } = await setup();
    const bare = await createProject(admin.id, 'Bare');
    const none = await enter(asOffice, bare.id, { client_approval_id: approval.id });
    expect(none.status).toBe(400);
    expect(none.body.fields.client_approval_id).toMatch(/approved/i);
    const mismatch = await enter(asOffice, project.id, { client_approval_id: approval.id, amount: '1839999.99' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body).toMatchObject({ code: 'AMOUNT_MISMATCH', approved_amount: '1840000.00' });
    const r2 = await addRevision(admin.id, quotation.id, { amount: '1910000.00' });
    await setRevisionStatus(admin.id, r2.id, 'DRAFT', 'SUBMITTED');
    const higher = await enter(asOffice, project.id, { client_approval_id: approval.id, amount: '1910000.00' });
    expect(higher.body.code).toBe('AMOUNT_MISMATCH');
    expect(await prisma.clientPurchaseOrder.count()).toBe(0);
  });

  it('allows one current PO per approval and a replacement after cancellation, rejection or withdrawal (US5-17, US5-18, US5-24)', async () => {
    const { project, approval, poDoc, asOffice, asAccountant } = await setup();
    const first = (await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/1' })).body;
    const second = await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/2' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CURRENT_PO_EXISTS');
    expect(second.body.message).toContain('PO/1');
    await act(asAccountant, first.id, 'rejection', { reason: 'Unsigned', expected_state: 'SUBMITTED' });
    const third = (await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/3' })).body;
    await attachDocument((await prisma.staffUser.findFirstOrThrow()).id, { documentId: (await poDoc()).id, record: { kind: 'purchase_order', id: third.id } });
    expect((await act(asAccountant, third.id, 'verification', { expected_state: 'SUBMITTED' })).body.state).toBe('VERIFIED');
    expect((await act(asOffice, third.id, 'cancellation', { reason: 'x', expected_state: 'VERIFIED' })).status).toBe(403);
    expect((await act(asAccountant, third.id, 'cancellation', { expected_state: 'VERIFIED' })).status).toBe(400);
    const cancelled = await act(asAccountant, third.id, 'cancellation', { reason: 'Client replaced it', expected_state: 'VERIFIED' });
    expect(cancelled.body).toMatchObject({ state: 'CANCELLED', po_number: 'PO/3', amount: '1840000.00', cancellation: { reason: 'Client replaced it' } });
    expect((await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/4' })).status).toBe(201);
  });

  it('verifies only with a Purchase order document; rejects with a reason; Office Team cannot decide; withdraw is own-only (US5-5 to US5-7, US5-25)', async () => {
    const { admin, project, approval, poDoc, asOffice, asOffice2, asAccountant } = await setup();
    const po = (await enter(asOffice, project.id, { client_approval_id: approval.id })).body;
    expect((await act(asOffice, po.id, 'verification', { expected_state: 'SUBMITTED' })).status).toBe(403);
    expect((await act(asOffice, po.id, 'rejection', { reason: 'x', expected_state: 'SUBMITTED' })).status).toBe(403);
    expect((await act(asAccountant, po.id, 'verification', { expected_state: 'SUBMITTED' })).body.code).toBe('PO_DOCUMENT_REQUIRED');
    expect((await act(asOffice2, po.id, 'withdrawal', { reason: 'x', expected_state: 'SUBMITTED' })).status).toBe(403);
    await attachDocument(admin.id, { documentId: (await poDoc()).id, record: { kind: 'purchase_order', id: po.id } });
    const before = await prisma.clientPurchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    const verified = await act(asAccountant, po.id, 'verification', { expected_state: 'SUBMITTED' });
    expect(verified.body).toMatchObject({ state: 'VERIFIED', decision: { decision: 'VERIFIED' } });
    expect(await prisma.clientPurchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).toEqual(before);
    expect((await act(asAccountant, po.id, 'verification', {})).body.code).toBe('INVALID_TRANSITION');
  });

  it('warns of a duplicate PO number for a matching client name, records the confirmation, and never blocks (US5-8, US5-28, FR-029a)', async () => {
    const { admin, project, approval, asOffice } = await setup();
    await enter(asOffice, project.id, { client_approval_id: approval.id });
    const other = await createProject(admin.id, 'Studio');
    await prisma.project.update({ where: { id: other.id }, data: { clientName: ' mehta  interiors ' } });
    const { revision } = await createQuotation(admin.id, other.id, { amount: '500000.00' });
    const otherApproval = await approveRevision(admin.id, revision.id);
    const warned = await enter(asOffice, other.id, { client_approval_id: otherApproval.id, amount: '500000.00' });
    expect(warned.status).toBe(409);
    expect(warned.body).toMatchObject({ code: 'DUPLICATE_PO_NUMBER', po_number: 'PO/2026/118', project: { name: 'Lake House' } });
    const saved = await enter(asOffice, other.id, { client_approval_id: otherApproval.id, amount: '500000.00', confirm_duplicate: true });
    expect(saved.status).toBe(201);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientPurchaseOrderId: saved.body.id, action: 'WARNING_CONFIRMED' } });
    expect(entry.details).toMatchObject({ warning: 'DUPLICATE_PO_NUMBER', po_number: 'PO/2026/118', record_status: 'SUBMITTED' });

    for (const name of ['Mehta Interiors Pvt Ltd', 'Mehta Int.', null]) {
      const unrelated = await createProject(admin.id, `P ${name}`);
      await prisma.project.update({ where: { id: unrelated.id }, data: { clientName: name } });
      const q = await createQuotation(admin.id, unrelated.id, { amount: '1000.00' });
      const a = await approveRevision(admin.id, q.revision.id);
      expect((await enter(asOffice, unrelated.id, { client_approval_id: a.id, amount: '1000.00' })).status, String(name)).toBe(201);
    }
    // PO numbers are compared exactly as entered.
    const exact = await createProject(admin.id, 'Exact');
    await prisma.project.update({ where: { id: exact.id }, data: { clientName: 'Mehta Interiors' } });
    const q = await createQuotation(admin.id, exact.id, { amount: '1000.00' });
    const a = await approveRevision(admin.id, q.revision.id);
    expect((await enter(asOffice, exact.id, { client_approval_id: a.id, amount: '1000.00', po_number: 'po/2026/118' })).status).toBe(201);
  });

  it('warns of a pending newer revision, records the confirmation figures, and none without one (US5-10, US5-11, US5-14)', async () => {
    const { admin, project, quotation, approval, asOffice } = await setup();
    const plain = (await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/A' })).body;
    expect(await prisma.historyEntry.count({ where: { clientPurchaseOrderId: plain.id, action: 'WARNING_CONFIRMED' } })).toBe(0);
    await act(asOffice, plain.id, 'withdrawal', { reason: 'Redo', expected_state: 'SUBMITTED' });
    const r2 = await addRevision(admin.id, quotation.id, { amount: '1910000.00' });
    await setRevisionStatus(admin.id, r2.id, 'DRAFT', 'SUBMITTED');
    await setRevisionStatus(admin.id, r2.id, 'SUBMITTED', 'UNDER_REVIEW');
    const warned = await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/B' });
    expect(warned.status).toBe(409);
    expect(warned.body).toMatchObject({ code: 'PENDING_REVISION', authoritative_revision: 1, authoritative_amount: '1840000.00', pending_revision: 2, pending_status: 'UNDER_REVIEW', pending_amount: '1910000.00' });
    expect(await prisma.clientPurchaseOrder.count({ where: { poNumber: 'PO/B' } })).toBe(0);
    const saved = await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/B', confirm_pending_revision: true });
    expect(saved.status).toBe(201);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientPurchaseOrderId: saved.body.id, action: 'WARNING_CONFIRMED' } });
    expect(entry.details).toMatchObject({ warning: 'PENDING_REVISION', authoritative_revision: 1, pending_revision: 2, pending_status: 'UNDER_REVIEW', acknowledged: true });
  });

  it('labels POs on a superseded approval, refuses new ones and their verification, and shows no current PO (US5-13, US5-20 to US5-22)', async () => {
    const { admin, project, quotation, approval, poDoc, asOffice, asAccountant } = await setup();
    const verifiedPo = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1840000.00', poNumber: 'PO/V' });
    const r2 = await addRevision(admin.id, quotation.id, { amount: '1910000.00' });
    await approveRevision(admin.id, r2.id);
    const before = await prisma.clientPurchaseOrder.findUniqueOrThrow({ where: { id: verifiedPo.id } });
    const data = await view(asOffice, project.id);
    expect(data.purchase_orders[0]).toMatchObject({ state: 'VERIFIED', label: 'Matches superseded approval (revision 1)' });
    expect(data.current_po).toBeNull();
    expect(data.current_po_text).toBe('No PO for the current approved amount');
    expect(await prisma.clientPurchaseOrder.findUniqueOrThrow({ where: { id: verifiedPo.id } })).toEqual(before);
    const refused = await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/N' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('APPROVAL_SUPERSEDED');
    expect(refused.body.message).toContain('revision 2');
    const stale = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1840000.00', poNumber: 'PO/S', entryStatus: 'SUBMITTED' });
    await attachDocument(admin.id, { documentId: (await poDoc()).id, record: { kind: 'purchase_order', id: stale.id } });
    expect((await act(asAccountant, stale.id, 'verification', { expected_state: 'SUBMITTED' })).body.code).toBe('APPROVAL_SUPERSEDED');
    expect((await act(asAccountant, stale.id, 'rejection', { reason: 'Old approval', expected_state: 'SUBMITTED' })).body.state).toBe('REJECTED');
  });

  it('on an archived project refuses new POs and verification but allows rejection and cancellation (US5-23)', async () => {
    const { admin, project, approval, asOffice, asAccountant } = await setup();
    const submitted = (await enter(asOffice, project.id, { client_approval_id: approval.id })).body;
    const other = await prisma.clientPurchaseOrder.create({ data: { projectId: project.id, clientApprovalId: approval.id, poNumber: 'PO/X', poDate: new Date(), amount: '1840000.00', entryStatus: 'VERIFIED_ON_ENTRY', createdById: admin.id, updatedById: admin.id } });
    await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
    expect((await enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/Y' })).body.code).toBe('PROJECT_ARCHIVED');
    expect((await act(asAccountant, submitted.id, 'verification', { expected_state: 'SUBMITTED' })).body.code).toBe('PROJECT_ARCHIVED');
    expect((await act(asAccountant, submitted.id, 'rejection', { reason: 'Archived', expected_state: 'SUBMITTED' })).status).toBe(200);
    expect((await act(asAccountant, other.id, 'cancellation', { reason: 'Archived', expected_state: 'VERIFIED' })).status).toBe(200);
  });

  it('saves one PO when two are entered on one approval at once', async () => {
    const { project, approval, asOffice, asAccountant, poDoc } = await setup();
    const results = await Promise.all([
      enter(asOffice, project.id, { client_approval_id: approval.id, po_number: 'PO/1' }),
      enter(asAccountant, project.id, { client_approval_id: approval.id, po_number: 'PO/2', document_ids: [(await poDoc()).id] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.clientPurchaseOrder.count()).toBe(1);
  });
});
