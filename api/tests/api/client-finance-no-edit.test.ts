import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { approveRevision, attachDocument, createProject, createProjectDocument, createPurchaseOrder, createQuotation, createReceipt, createUser, resetDatabase, resetFileStorage, signIn } from '../helpers';

// Append-only (T066, SC-008, Constitution III): no route edits or deletes a client financial record.
describe('client finance has no edit or delete routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('answers PUT, PATCH and DELETE on every client-finance path with 404 and changes nothing', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const project = await createProject(admin.id, 'Lake House');
    const { quotation, revision } = await createQuotation(admin.id, project.id, { amount: '1000.00' });
    const approval = await approveRevision(admin.id, revision.id);
    const po = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1000.00' });
    const receipt = await createReceipt(admin.id, { projectId: project.id, amount: '5.00' });
    const document = await createProjectDocument(admin.id, { projectId: project.id });
    const attachment = await attachDocument(admin.id, { documentId: document.id, record: { kind: 'receipt', id: receipt.id } });
    const { client } = await signIn('admin@example.com');
    const snapshot = async () =>
      JSON.stringify(
        await Promise.all([
          prisma.clientQuotation.findMany(),
          prisma.quotationRevision.findMany(),
          prisma.quotationStatusChange.findMany(),
          prisma.clientApproval.findMany(),
          prisma.clientPurchaseOrder.findMany(),
          prisma.clientAdvance.findMany(),
          prisma.financialAttachment.findMany(),
          prisma.historyEntry.findMany(),
        ]),
      );
    const before = await snapshot();
    const paths = [
      `/api/projects/${project.id}/client-finance`,
      `/api/projects/${project.id}/quotation`,
      `/api/quotations/${quotation.id}`,
      `/api/quotation-revisions/${revision.id}`,
      `/api/quotation-revisions/${revision.id}/approval`,
      `/api/purchase-orders/${po.id}`,
      `/api/receipts/${receipt.id}`,
      `/api/client-advances/${receipt.id}`,
      `/api/financial-attachments/${attachment.id}`,
    ];
    for (const url of paths) {
      for (const method of ['put', 'patch', 'delete'] as const) {
        const response = await client[method](url).send({ amount: '1.00', title: 'x' });
        expect([404, 405], `${method} ${url}`).toContain(response.status);
      }
    }
    expect(await snapshot()).toBe(before);
  });
});
