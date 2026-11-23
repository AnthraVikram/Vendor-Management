import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  addRevision,
  approveRevision,
  attachDocument,
  createProject,
  createProjectDocument,
  createQuotation,
  createUser,
  resetDatabase,
  resetFileStorage,
  setRevisionStatus,
  signIn,
} from '../helpers';

// US4 (T045): review and approval fix the approved client amount (FR-026 to FR-028, FR-008).
async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  const { quotation, revision } = await createQuotation(admin.id, project.id, { amount: '1840000.00' });
  const toReview = async (revisionId: string) => {
    await setRevisionStatus(admin.id, revisionId, 'DRAFT', 'SUBMITTED');
    await setRevisionStatus(admin.id, revisionId, 'SUBMITTED', 'UNDER_REVIEW');
  };
  const quotationDoc = async (revisionId?: string) => {
    const document = await createProjectDocument(admin.id, { projectId: project.id, documentType: 'QUOTATION' });
    if (revisionId) await attachDocument(admin.id, { documentId: document.id, record: { kind: 'revision', id: revisionId } });
    return document;
  };
  return { admin, accountant, project, quotation, revision, toReview, quotationDoc, asOffice: await signIn('office@example.com'), asAccountant: await signIn('accountant@example.com') };
}

const approve = (session: Awaited<ReturnType<typeof signIn>>, revisionId: string, body: Record<string, unknown>) =>
  session.client.post(`/api/quotation-revisions/${revisionId}/approval`).send({ expected_status: 'UNDER_REVIEW', ...body });

async function summary(session: Awaited<ReturnType<typeof signIn>>, projectId: string) {
  return (await session.client.get(`/api/projects/${projectId}/client-finance`)).body;
}

describe('US4: approval and the approved client amount', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('approves in one save: status, approval with the revision amount, person and time, history (US4-3)', async () => {
    const { accountant, project, quotation, revision, toReview, quotationDoc, asAccountant } = await setup();
    await toReview(revision.id);
    await quotationDoc(revision.id);
    const response = await approve(asAccountant, revision.id, { amount: '1840000.00' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ revision_number: 1, amount: '1840000.00', authoritative: true, created_by: { id: accountant.id } });
    const view = await summary(asAccountant, project.id);
    expect(view.summary).toMatchObject({ approved_amount: '1840000.00', approved_revision_number: 1 });
    expect(view.quotation.revisions[0].status).toBe('APPROVED');
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientQuotationId: quotation.id, action: 'APPROVED' } });
    expect(entry.details).toMatchObject({ revision_number: 1, record_status: 'APPROVED' });
  });

  it('refuses a different amount, a missing Quotation document, Office Team, and any state but Under review (US4-4 to US4-6, US3-38)', async () => {
    const { admin, project, revision, toReview, quotationDoc, asOffice, asAccountant } = await setup();
    expect((await approve(asAccountant, revision.id, { amount: '1840000.00', expected_status: 'DRAFT' })).body.code).toBe('INVALID_TRANSITION');
    await toReview(revision.id);
    const other = await createProjectDocument(admin.id, { projectId: project.id, documentType: 'DRAWING' });
    await attachDocument(admin.id, { documentId: other.id, record: { kind: 'revision', id: revision.id } });
    const missing = await approve(asAccountant, revision.id, { amount: '1840000.00' });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('QUOTATION_DOCUMENT_REQUIRED');
    // A removed Quotation document does not count.
    const removedDoc = await quotationDoc();
    const removed = await attachDocument(admin.id, { documentId: removedDoc.id, record: { kind: 'revision', id: revision.id } });
    await prisma.financialAttachmentRemoval.create({ data: { financialAttachmentId: removed.id, reason: 'Wrong', createdById: admin.id, updatedById: admin.id } });
    expect((await approve(asAccountant, revision.id, { amount: '1840000.00' })).body.code).toBe('QUOTATION_DOCUMENT_REQUIRED');
    await quotationDoc(revision.id);
    const mismatch = await approve(asAccountant, revision.id, { amount: '1839999.99' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body).toMatchObject({ code: 'AMOUNT_MISMATCH', approved_amount: '1840000.00' });
    expect((await approve(asOffice, revision.id, { amount: '1840000.00' })).status).toBe(403);
    expect(await prisma.clientApproval.count()).toBe(0);
  });

  it('accepts the Quotation document supplied with the approval, attaching it in the same save (US4-19, FR-026)', async () => {
    const { project, quotation, revision, toReview, quotationDoc, asAccountant } = await setup();
    await toReview(revision.id);
    const document = await quotationDoc();
    const response = await approve(asAccountant, revision.id, { amount: '1840000.00', document_ids: [document.id] });
    expect(response.status).toBe(201);
    expect(response.body.attachments.map((a: { document: { id: string } }) => a.document.id)).toEqual([document.id]);
    const attachEntries = await prisma.historyEntry.findMany({ where: { action: 'ATTACHED', OR: [{ clientQuotationId: quotation.id }, { documentId: document.id }] } });
    expect(attachEntries).toHaveLength(2);
    for (const entry of attachEntries) expect(entry.details).toMatchObject({ record_status: 'APPROVED' });
    expect((await summary(asAccountant, project.id)).summary.approved_amount).toBe('1840000.00');
  });

  it('saves nothing when any part fails: an archived, foreign or repeated document refuses the whole approval (US4-19, FR-008)', async () => {
    const { admin, revision, toReview, quotationDoc, asAccountant } = await setup();
    await toReview(revision.id);
    const good = await quotationDoc();
    const archived = await createProjectDocument(admin.id, { projectId: (await prisma.project.findFirstOrThrow()).id, archived: true });
    const otherProject = await createProject(admin.id, 'Studio');
    const foreign = await createProjectDocument(admin.id, { projectId: otherProject.id, documentType: 'QUOTATION' });
    for (const ids of [[good.id, archived.id], [foreign.id], [good.id, good.id]]) {
      const response = await approve(asAccountant, revision.id, { amount: '1840000.00', document_ids: ids });
      expect(response.status, JSON.stringify(ids)).toBeGreaterThanOrEqual(400);
      expect(await prisma.clientApproval.count()).toBe(0);
      expect(await prisma.quotationStatusChange.count({ where: { toStatus: 'APPROVED' } })).toBe(0);
      expect(await prisma.financialAttachment.count({ where: { clientApprovalId: { not: null } } })).toBe(0);
    }
  });

  it('keeps the earlier approval authoritative while a newer revision is pending, rejected or withdrawn, and supersedes it on a newer approval (US4-8 to US4-11, US4-17)', async () => {
    const { admin, project, quotation, revision, toReview, quotationDoc, asAccountant } = await setup();
    await toReview(revision.id);
    await quotationDoc(revision.id);
    const first = (await approve(asAccountant, revision.id, { amount: '1840000.00' })).body;
    const r2 = await addRevision(admin.id, quotation.id, { amount: '1910000.00' });
    expect((await summary(asAccountant, project.id)).summary.approved_amount).toBe('1840000.00');
    await toReview(r2.id);
    await setRevisionStatus(admin.id, r2.id, 'UNDER_REVIEW', 'REJECTED');
    expect((await summary(asAccountant, project.id)).summary.approved_amount).toBe('1840000.00');

    const r3 = await addRevision(admin.id, quotation.id, { amount: '1950000.00' });
    await toReview(r3.id);
    await quotationDoc(r3.id);
    const second = await approve(asAccountant, r3.id, { amount: '1950000.00' });
    expect(second.status).toBe(201);
    const view = await summary(asAccountant, project.id);
    expect(view.summary).toMatchObject({ approved_amount: '1950000.00', approved_revision_number: 3 });
    const earlier = view.approvals.find((a: { id: string }) => a.id === first.id);
    expect(earlier).toMatchObject({ authoritative: false, superseded_by: { revision_number: 3 } });
    const stored = await prisma.clientApproval.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.updatedAt.getTime()).toBe(new Date(first.created_at).getTime());
  });

  it('refuses to approve an Approved revision again or an older revision once a newer exists (US4-12, US4-15, US4-16)', async () => {
    const { admin, quotation, revision, toReview, quotationDoc, asAccountant } = await setup();
    await toReview(revision.id);
    await quotationDoc(revision.id);
    await approve(asAccountant, revision.id, { amount: '1840000.00' });
    expect((await approve(asAccountant, revision.id, { amount: '1840000.00' })).body.code).toMatch(/INVALID_TRANSITION|STALE/);
    await addRevision(admin.id, quotation.id, { amount: '1910000.00' });
    expect((await approve(asAccountant, revision.id, { amount: '1840000.00', expected_status: undefined })).status).toBe(409);
    expect(await prisma.clientApproval.count()).toBe(1);
  });

  it('shows no approved amount when no revision is approved (US4-18)', async () => {
    const { admin, project, revision, asAccountant } = await setup();
    await setRevisionStatus(admin.id, revision.id, 'DRAFT', 'WITHDRAWN');
    expect((await summary(asAccountant, project.id)).summary).toMatchObject({ approved_amount: null, not_available_reason: 'Not available: no approved amount' });
  });

  it('refuses a stale approval (FR-007)', async () => {
    const { revision, toReview, quotationDoc, asAccountant } = await setup();
    await setRevisionStatus((await prisma.staffUser.findFirstOrThrow()).id, revision.id, 'DRAFT', 'SUBMITTED');
    await quotationDoc(revision.id);
    expect((await approve(asAccountant, revision.id, { amount: '1840000.00' })).body.code).toBe('STALE');
    expect(toReview).toBeTruthy();
  });

  it('keeps using approveRevision fixtures consistent with the route', async () => {
    const { admin, revision } = await setup();
    const approval = await approveRevision(admin.id, revision.id);
    expect(approval.amount.toFixed(2)).toBe('1840000.00');
  });
});
