import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  type AttachTarget,
  approveRevision,
  attachDocument,
  cancelPurchaseOrder,
  createProject,
  createProjectDocument,
  createPurchaseOrder,
  createQuotation,
  createReceipt,
  createUser,
  decideReceipt,
  resetDatabase,
  resetFileStorage,
  setRevisionStatus,
  signIn,
} from '../helpers';

// Feature 006 attachments (T019): FR-041 to FR-042f, FR-010, FR-007, FR-008, OQ-36 to OQ-40.
type Session = Awaited<ReturnType<typeof signIn>>;

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const office2 = await createUser({ email: 'office2@example.com', role: 'OFFICE_TEAM', name: 'Olga Office', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  return {
    admin,
    office,
    office2,
    project,
    asAdmin: await signIn('admin@example.com'),
    asOffice: await signIn('office@example.com'),
    asOffice2: await signIn('office2@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

function attach(session: Session, record: AttachTarget, documentId: string, extra: Record<string, unknown> = {}) {
  return session.client.post('/api/financial-attachments').send({ record, document_id: documentId, ...extra });
}

function remove(session: Session, attachmentId: string, reason: string | null = 'Wrong file') {
  return session.client.post(`/api/financial-attachments/${attachmentId}/removal`).send(reason === null ? {} : { reason });
}

async function historyOf(where: Record<string, string>) {
  return prisma.historyEntry.findMany({ where, orderBy: { createdAt: 'asc' } });
}

describe('financial attachments', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('lets every role attach to a Draft, Submitted or Under review revision without changing it, with two history entries carrying the record status (FR-042a, FR-042c F4)', async () => {
    const { admin, project, asOffice, asAccountant, asAdmin } = await setup();
    const { quotation, revision } = await createQuotation(admin.id, project.id);
    for (const [session, status] of [
      [asOffice, 'DRAFT'],
      [asAccountant, 'SUBMITTED'],
      [asAdmin, 'UNDER_REVIEW'],
    ] as const) {
      if (status === 'SUBMITTED') await setRevisionStatus(admin.id, revision.id, 'DRAFT', 'SUBMITTED');
      if (status === 'UNDER_REVIEW') await setRevisionStatus(admin.id, revision.id, 'SUBMITTED', 'UNDER_REVIEW');
      const document = await createProjectDocument(admin.id, { projectId: project.id, documentType: 'QUOTATION' });
      const response = await attach(session, { kind: 'revision', id: revision.id }, document.id);
      expect(response.status, status).toBe(201);
      const onRecord = (await historyOf({ clientQuotationId: quotation.id })).at(-1)!;
      const onDocument = await historyOf({ documentId: document.id });
      expect(onRecord.action).toBe('ATTACHED');
      expect(onRecord.details).toMatchObject({ record_status: status, document_id: document.id, revision_number: 1 });
      expect(onDocument).toHaveLength(1);
      expect(onDocument[0].details).toMatchObject({ record_status: status });
    }
    const after = await prisma.quotationRevision.findUniqueOrThrow({ where: { id: revision.id } });
    expect(after.amount.toFixed(2)).toBe('1840000.00');
    expect(after.updatedAt.getTime()).toBe(revision.updatedAt.getTime());
  });

  it('applies FR-042b on final records: reviewers attach, Office Team is refused, for revisions, receipts, POs, Cancelled POs and approvals', async () => {
    const { admin, project, asOffice, asAccountant } = await setup();
    const { revision } = await createQuotation(admin.id, project.id);
    const approval = await approveRevision(admin.id, revision.id);
    const verified = await createReceipt(admin.id, { projectId: project.id, amount: '1000.00' });
    const rejected = await createReceipt(admin.id, { projectId: project.id, amount: '1000.00', entryStatus: 'SUBMITTED' });
    await decideReceipt(admin.id, rejected.id, 'REJECTED');
    const po = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: approval.id, amount: '1840000.00' });
    await cancelPurchaseOrder(admin.id, po.id);
    const targets: AttachTarget[] = [
      { kind: 'revision', id: revision.id },
      { kind: 'approval', id: approval.id },
      { kind: 'receipt', id: verified.id },
      { kind: 'receipt', id: rejected.id },
      { kind: 'purchase_order', id: po.id },
    ];
    for (const target of targets) {
      const document = await createProjectDocument(admin.id, { projectId: project.id });
      const refused = await attach(asOffice, target, document.id);
      expect(refused.status, target.kind).toBe(403);
      expect(refused.body.code).toBe('ROLE_NOT_ALLOWED');
      expect((await attach(asAccountant, target, document.id)).status, target.kind).toBe(201);
    }
    const approvalEntry = (await prisma.historyEntry.findMany({ where: { action: 'ATTACHED', document: { financialAttachments: { some: { clientApprovalId: approval.id } } } } }))[0];
    expect(approvalEntry.details).toMatchObject({ record_status: 'APPROVED' });
  });

  it('removes only on active records, with a reason, Office Team only their own, keeping the document and listing the removal (FR-042d)', async () => {
    const { admin, project, asOffice, asOffice2, asAccountant } = await setup();
    const receipt = await createReceipt(admin.id, { projectId: project.id, amount: '5000.00', entryStatus: 'SUBMITTED' });
    const document = await createProjectDocument(admin.id, { projectId: project.id, documentType: 'PAYMENT_PROOF' });
    const added = await attach(asOffice, { kind: 'receipt', id: receipt.id }, document.id);
    expect(added.status).toBe(201);
    expect((await remove(asOffice, added.body.id, null)).status).toBe(400);
    expect((await remove(asOffice2, added.body.id)).status).toBe(403);
    const removed = await remove(asOffice, added.body.id, 'Wrong receipt');
    expect(removed.status).toBe(201);
    const storedDocument = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(storedDocument.archived).toBe(false);
    expect((await historyOf({ clientAdvanceId: receipt.id })).map((e) => e.action)).toEqual(['ATTACHED', 'ATTACHMENT_REMOVED']);
    expect((await historyOf({ documentId: document.id })).map((e) => e.action)).toEqual(['ATTACHED', 'ATTACHMENT_REMOVED']);
    expect((await remove(asAccountant, added.body.id)).status).toBe(409);

    // Re-attaching after removal is a new attachment; the removal stays (OQ-38).
    const again = await attach(asOffice, { kind: 'receipt', id: receipt.id }, document.id);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(added.body.id);
    expect(await prisma.financialAttachmentRemoval.count()).toBe(1);

    // A reviewer may remove someone else's attachment on an active record.
    expect((await remove(asAccountant, again.body.id)).status).toBe(201);
  });

  it('refuses removal on final records and on every approval attachment, for every role', async () => {
    const { admin, project, asAdmin, asAccountant } = await setup();
    const { revision } = await createQuotation(admin.id, project.id);
    const draftDoc = await createProjectDocument(admin.id, { projectId: project.id, documentType: 'QUOTATION' });
    const onRevision = await attachDocument(admin.id, { documentId: draftDoc.id, record: { kind: 'revision', id: revision.id } });
    const approval = await approveRevision(admin.id, revision.id);
    const approvalDoc = await createProjectDocument(admin.id, { projectId: project.id });
    const onApproval = await attachDocument(admin.id, { documentId: approvalDoc.id, record: { kind: 'approval', id: approval.id } });
    for (const session of [asAdmin, asAccountant]) {
      expect((await remove(session, onRevision.id)).status).toBe(409);
      expect((await remove(session, onApproval.id)).status).toBe(409);
    }
  });

  it('supersedes with a reason, keeps both, labels the chain, refuses removal at both ends and records three entries (FR-042e, OQ-38, OQ-39)', async () => {
    const { admin, project, asOffice, asAccountant } = await setup();
    const { quotation, revision } = await createQuotation(admin.id, project.id);
    const a = await createProjectDocument(admin.id, { projectId: project.id, title: 'A' });
    const b = await createProjectDocument(admin.id, { projectId: project.id, title: 'B' });
    const c = await createProjectDocument(admin.id, { projectId: project.id, title: 'C' });
    const first = await attach(asOffice, { kind: 'revision', id: revision.id }, a.id);
    expect((await attach(asOffice, { kind: 'revision', id: revision.id }, b.id, { supersedes_attachment_id: first.body.id })).status).toBe(400);
    const second = await attach(asOffice, { kind: 'revision', id: revision.id }, b.id, { supersedes_attachment_id: first.body.id, supersede_reason: 'Corrected copy' });
    expect(second.status).toBe(201);
    expect((await historyOf({ documentId: a.id })).map((e) => e.action)).toEqual(['ATTACHED', 'SUPERSEDED']);
    expect((await historyOf({ documentId: b.id })).map((e) => e.action)).toEqual(['SUPERSEDED']);
    expect((await historyOf({ clientQuotationId: quotation.id })).map((e) => e.action)).toEqual(['ATTACHED', 'SUPERSEDED']);

    const removeB = await remove(asAccountant, second.body.id);
    expect(removeB.status).toBe(409);
    expect(removeB.body.code).toBe('IN_SUPERSEDE_CHAIN');
    expect(removeB.body.message).toMatch(/supersedes another attachment/);
    const removeA = await remove(asAccountant, first.body.id);
    expect(removeA.status).toBe(409);
    expect(removeA.body.message).toMatch(/has been superseded/);

    // A already superseded; another record's attachment; refused.
    expect((await attach(asOffice, { kind: 'revision', id: revision.id }, c.id, { supersedes_attachment_id: first.body.id, supersede_reason: 'Again' })).status).toBe(409);
    const third = await attach(asOffice, { kind: 'revision', id: revision.id }, c.id, { supersedes_attachment_id: second.body.id, supersede_reason: 'Right file' });
    expect(third.status).toBe(201);
    expect(await prisma.financialAttachment.count({ where: { quotationRevisionId: revision.id } })).toBe(3);
  });

  it('refuses a supersede of a removed attachment or of another record attachment', async () => {
    const { admin, project, asOffice } = await setup();
    const one = await createReceipt(admin.id, { projectId: project.id, amount: '10.00', entryStatus: 'SUBMITTED' });
    const two = await createReceipt(admin.id, { projectId: project.id, amount: '20.00', entryStatus: 'SUBMITTED' });
    const d1 = await createProjectDocument(admin.id, { projectId: project.id });
    const d2 = await createProjectDocument(admin.id, { projectId: project.id });
    const onOne = await attach(asOffice, { kind: 'receipt', id: one.id }, d1.id);
    expect((await attach(asOffice, { kind: 'receipt', id: two.id }, d2.id, { supersedes_attachment_id: onOne.body.id, supersede_reason: 'x' })).status).toBe(409);
    await remove(asOffice, onOne.body.id);
    expect((await attach(asOffice, { kind: 'receipt', id: one.id }, d2.id, { supersedes_attachment_id: onOne.body.id, supersede_reason: 'x' })).status).toBe(409);
  });

  it('refuses duplicates, archived documents until restored, and documents of another project or a vendor (FR-042f, F9)', async () => {
    const { admin, project, asOffice } = await setup();
    const other = await createProject(admin.id, 'Studio Fit-out');
    const receipt = await createReceipt(admin.id, { projectId: project.id, amount: '10.00', entryStatus: 'SUBMITTED' });
    const second = await createReceipt(admin.id, { projectId: project.id, amount: '20.00', entryStatus: 'SUBMITTED' });
    const document = await createProjectDocument(admin.id, { projectId: project.id });
    expect((await attach(asOffice, { kind: 'receipt', id: receipt.id }, document.id)).status).toBe(201);
    const duplicate = await attach(asOffice, { kind: 'receipt', id: receipt.id }, document.id);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('ALREADY_ATTACHED');
    expect((await attach(asOffice, { kind: 'receipt', id: second.id }, document.id)).status).toBe(201);

    const archived = await createProjectDocument(admin.id, { projectId: project.id, archived: true });
    const refused = await attach(asOffice, { kind: 'receipt', id: receipt.id }, archived.id);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('DOCUMENT_ARCHIVED');
    expect(refused.body.message).toMatch(/restore/i);
    await prisma.document.update({ where: { id: archived.id }, data: { archived: false } });
    expect((await attach(asOffice, { kind: 'receipt', id: receipt.id }, archived.id)).status).toBe(201);

    const foreign = await createProjectDocument(admin.id, { projectId: other.id });
    const wrong = await attach(asOffice, { kind: 'receipt', id: receipt.id }, foreign.id);
    expect(wrong.status).toBe(400);
    expect(wrong.body.fields.document_id).toBeTruthy();
  });

  it('keeps a document attached, labelled archived and openable when it is archived after attaching (FR-042, F1)', async () => {
    const { admin, project, asOffice } = await setup();
    const receipt = await createReceipt(admin.id, { projectId: project.id, amount: '10.00', entryStatus: 'SUBMITTED' });
    const document = await createProjectDocument(admin.id, { projectId: project.id });
    await attach(asOffice, { kind: 'receipt', id: receipt.id }, document.id);
    await prisma.document.update({ where: { id: document.id }, data: { archived: true } });
    const view = await asOffice.client.get(`/api/projects/${project.id}/client-finance`);
    expect(view.status).toBe(200);
    const listed = view.body.receipts[0].attachments[0];
    expect(listed.document).toMatchObject({ id: document.id, archived: true });
    expect(listed.current).toBe(true);
  });

  it('refuses attach and remove on an archived project (FR-010)', async () => {
    const { admin, project, asAccountant } = await setup();
    const receipt = await createReceipt(admin.id, { projectId: project.id, amount: '10.00', entryStatus: 'SUBMITTED' });
    const d1 = await createProjectDocument(admin.id, { projectId: project.id });
    const d2 = await createProjectDocument(admin.id, { projectId: project.id });
    const attached = await attachDocument(admin.id, { documentId: d1.id, record: { kind: 'receipt', id: receipt.id } });
    await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
    expect((await attach(asAccountant, { kind: 'receipt', id: receipt.id }, d2.id)).body.code).toBe('PROJECT_ARCHIVED');
    expect((await remove(asAccountant, attached.id)).body.code).toBe('PROJECT_ARCHIVED');
  });

  it('saves one attachment when the same document is attached to the same record twice at once', async () => {
    const { admin, project, asOffice, asAccountant } = await setup();
    const receipt = await createReceipt(admin.id, { projectId: project.id, amount: '10.00', entryStatus: 'SUBMITTED' });
    const document = await createProjectDocument(admin.id, { projectId: project.id });
    const results = await Promise.all([
      attach(asOffice, { kind: 'receipt', id: receipt.id }, document.id),
      attach(asAccountant, { kind: 'receipt', id: receipt.id }, document.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.financialAttachment.count()).toBe(1);
  });

  it('lets every role read the client finance view and refuses signed-out people without amounts (T021)', async () => {
    const { project, asAdmin, asOffice, asAccountant } = await setup();
    for (const session of [asAdmin, asOffice, asAccountant]) {
      const response = await session.client.get(`/api/projects/${project.id}/client-finance`);
      expect(response.status).toBe(200);
      expect(response.body.summary.approved_amount).toBeNull();
      expect(response.body.pending_verification).toEqual([]);
    }
    const { client } = await signIn('nobody@example.com');
    const anonymous = await client.get(`/api/projects/${project.id}/client-finance`);
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toMatch(/\d+\.\d{2}/);
  });
});
