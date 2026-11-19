import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  approveRevision,
  attachDocument,
  createProject,
  createProjectDocument,
  createPurchaseOrder,
  createQuotation,
  createReceipt,
  createUser,
  dayOffset,
  resetDatabase,
  resetFileStorage,
  signIn,
} from '../helpers';

// FR-010, OQ-26 (T065): an archived project's client financial records are read-only except the corrections.
async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  const project = await createProject(admin.id, 'Lake House');
  const { quotation, revision } = await createQuotation(admin.id, project.id, { amount: '1000.00' });
  const approval = await approveRevision(admin.id, revision.id);
  const draftProject = await createProject(admin.id, 'Draft project');
  const draft = await createQuotation(admin.id, draftProject.id);
  const submittedReceipt = await createReceipt(admin.id, { projectId: project.id, amount: '10.00', entryStatus: 'SUBMITTED' });
  const rejectable = await createReceipt(admin.id, { projectId: project.id, amount: '11.00', entryStatus: 'SUBMITTED' });
  const verifiedReceipt = await createReceipt(admin.id, { projectId: project.id, amount: '12.00' });
  const submittedPo = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1000.00', entryStatus: 'SUBMITTED', poNumber: 'PO/S' });
  const document = await createProjectDocument(admin.id, { projectId: project.id });
  const attachment = await attachDocument(admin.id, { documentId: document.id, record: { kind: 'receipt', id: submittedReceipt.id } });
  const spare = await createProjectDocument(admin.id, { projectId: project.id });
  await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
  await prisma.project.update({ where: { id: draftProject.id }, data: { archived: true } });
  return { admin, project, draftProject, quotation, revision, approval, draft, submittedReceipt, rejectable, verifiedReceipt, submittedPo, attachment, spare, session: await signIn('admin@example.com') };
}

describe('archived projects (FR-010)', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('refuses every write except the corrections, keeps everything readable, and allows the refused actions after restore', async () => {
    const s = await setup();
    const c = s.session.client;
    const before = await prisma.clientAdvance.count();
    const refused: [string, () => Promise<{ status: number; body: { code?: string } }>][] = [
      ['enter receipt', () => c.post(`/api/projects/${s.project.id}/receipts`).send({ submission_id: randomUUID(), receipt_type: 'OTHER', amount: '1.00', received_on: dayOffset(-1) })],
      ['verify receipt', () => c.post(`/api/receipts/${s.submittedReceipt.id}/verification`).send({})],
      ['withdraw receipt', () => c.post(`/api/receipts/${s.submittedReceipt.id}/withdrawal`).send({ reason: 'x' })],
      ['create quotation', () => c.post(`/api/projects/${s.draftProject.id}/quotation`).send({ title: 'Q', amount: '1.00', quotation_date: dayOffset(-1) })],
      ['add revision', () => c.post(`/api/quotations/${s.quotation.id}/revisions`).send({ amount: '2.00', quotation_date: dayOffset(-1), reason: 'x' })],
      ['submit revision', () => c.post(`/api/quotation-revisions/${s.draft.revision.id}/status`).send({ to: 'SUBMITTED' })],
      ['withdraw revision', () => c.post(`/api/quotation-revisions/${s.draft.revision.id}/status`).send({ to: 'WITHDRAWN', reason: 'x' })],
      ['enter PO', () => c.post(`/api/projects/${s.project.id}/purchase-orders`).send({ client_approval_id: s.approval.id, po_number: 'PO/N', po_date: dayOffset(-1), amount: '1000.00' })],
      ['verify PO', () => c.post(`/api/purchase-orders/${s.submittedPo.id}/verification`).send({})],
      ['withdraw PO', () => c.post(`/api/purchase-orders/${s.submittedPo.id}/withdrawal`).send({ reason: 'x' })],
      ['attach', () => c.post('/api/financial-attachments').send({ record: { kind: 'receipt', id: s.verifiedReceipt.id }, document_id: s.spare.id })],
      ['remove attachment', () => c.post(`/api/financial-attachments/${s.attachment.id}/removal`).send({ reason: 'x' })],
    ];
    for (const [action, send] of refused) {
      const response = await send();
      expect(response.status, action).toBe(409);
      expect(response.body.code, action).toBe('PROJECT_ARCHIVED');
    }
    expect(await prisma.clientAdvance.count()).toBe(before);

    expect((await c.post(`/api/client-advances/${s.verifiedReceipt.id}/reversal`).send({ reason: 'Correction' })).status).toBe(201);
    expect((await c.post(`/api/receipts/${s.rejectable.id}/rejection`).send({ reason: 'Correction' })).status).toBe(200);
    expect((await c.post(`/api/purchase-orders/${s.submittedPo.id}/rejection`).send({ reason: 'Correction' })).status).toBe(200);
    const verifiedPo = await createPurchaseOrder(s.admin.id, { projectId: s.project.id, approvalId: s.approval.id, amount: '1000.00', poNumber: 'PO/V' });
    expect((await c.post(`/api/purchase-orders/${verifiedPo.id}/cancellation`).send({ reason: 'Correction' })).status).toBe(200);

    const view = await c.get(`/api/projects/${s.project.id}/client-finance`);
    expect(view.status).toBe(200);
    expect(view.body.project.archived).toBe(true);
    expect(view.body.receipts).toHaveLength(3);

    await prisma.project.update({ where: { id: s.project.id }, data: { archived: false } });
    await prisma.project.update({ where: { id: s.draftProject.id }, data: { archived: false } });
    expect((await refused[0][1]()).status).toBe(201);
    expect((await refused[5][1]()).status).toBe(200);
  });
});
