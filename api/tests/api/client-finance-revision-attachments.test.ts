import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createProject, createProjectDocument, createUser, dayOffset, resetDatabase, resetFileStorage, signIn } from '../helpers';

// US3-18 to US3-35 through the routes (T040). The generic rules are in client-finance-attachments.test.ts.
async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  const asOffice = await signIn('office@example.com');
  const asAccountant = await signIn('accountant@example.com');
  const quotation = (await asAccountant.client.post(`/api/projects/${project.id}/quotation`).send({ title: 'Works', amount: '1840000.00', quotation_date: dayOffset(-1) })).body;
  const revisionId = quotation.revisions[0].id as string;
  const doc = () => createProjectDocument(admin.id, { projectId: project.id, documentType: 'QUOTATION' });
  const attach = (session: typeof asOffice, documentId: string) =>
    session.client.post('/api/financial-attachments').send({ record: { kind: 'revision', id: revisionId }, document_id: documentId });
  const status = (session: typeof asOffice, body: Record<string, unknown>) => session.client.post(`/api/quotation-revisions/${revisionId}/status`).send(body);
  return { project, revisionId, quotationId: quotation.id as string, asOffice, asAccountant, doc, attach, status };
}

describe('attachments on quotation revisions', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('lets Office Team attach to another person’s Draft without gaining the right to withdraw it (US3-19)', async () => {
    const { asOffice, doc, attach, status } = await setup();
    expect((await attach(asOffice, (await doc()).id)).status).toBe(201);
    expect((await status(asOffice, { to: 'WITHDRAWN', reason: 'x', expected_status: 'DRAFT' })).status).toBe(403);
  });

  it('keeps the actual attachment time for a document added while Under review, and the status stays (US3-20)', async () => {
    const { asOffice, asAccountant, doc, attach, status, quotationId } = await setup();
    await status(asAccountant, { to: 'SUBMITTED', expected_status: 'DRAFT' });
    await status(asAccountant, { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' });
    const added = await attach(asOffice, (await doc()).id);
    expect(added.status).toBe(201);
    const review = await prisma.quotationStatusChange.findFirstOrThrow({ where: { toStatus: 'UNDER_REVIEW' } });
    expect(new Date(added.body.created_at).getTime()).toBeGreaterThanOrEqual(review.createdAt.getTime());
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientQuotationId: quotationId, action: 'ATTACHED' } });
    expect(entry.details).toMatchObject({ record_status: 'UNDER_REVIEW' });
  });

  it('lets a reviewer attach to a Rejected or Withdrawn revision without recording a status change (US3-21, US3-22)', async () => {
    const { asOffice, asAccountant, doc, attach, status, revisionId } = await setup();
    await status(asAccountant, { to: 'WITHDRAWN', reason: 'Redo', expected_status: 'DRAFT' });
    expect((await attach(asOffice, (await doc()).id)).status).toBe(403);
    expect((await attach(asAccountant, (await doc()).id)).status).toBe(201);
    expect(await prisma.quotationStatusChange.count({ where: { quotationRevisionId: revisionId } })).toBe(1);
  });

  it('keeps an attachment on a Draft that is then withdrawn, and refuses its removal (Edge Cases, FR-042d)', async () => {
    const { asOffice, asAccountant, doc, attach, status } = await setup();
    const added = await attach(asOffice, (await doc()).id);
    await status(asAccountant, { to: 'WITHDRAWN', reason: 'Redo', expected_status: 'DRAFT' });
    const removal = await asAccountant.client.post(`/api/financial-attachments/${added.body.id}/removal`).send({ reason: 'x' });
    expect(removal.status).toBe(409);
  });

  it('records attach and removal on the revision’s quotation history and on the document (US3-23, US3-30)', async () => {
    const { asOffice, doc, attach, quotationId } = await setup();
    const document = await doc();
    const added = await attach(asOffice, document.id);
    await asOffice.client.post(`/api/financial-attachments/${added.body.id}/removal`).send({ reason: 'Wrong copy' });
    const again = await attach(asOffice, document.id);
    expect(again.status).toBe(201);
    const onQuotation = await prisma.historyEntry.findMany({ where: { clientQuotationId: quotationId, action: { in: ['ATTACHED', 'ATTACHMENT_REMOVED'] } }, orderBy: { createdAt: 'asc' } });
    expect(onQuotation.map((e) => e.action)).toEqual(['ATTACHED', 'ATTACHMENT_REMOVED', 'ATTACHED']);
    expect(await prisma.historyEntry.count({ where: { documentId: document.id } })).toBe(3);
  });
});
