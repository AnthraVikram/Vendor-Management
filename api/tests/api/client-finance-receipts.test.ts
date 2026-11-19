import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  addRevision,
  approveRevision,
  cancelPurchaseOrder,
  createLegacyAdvance,
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

// US2 (T029): receipts entered by every role, verified by reviewers (FR-016 to FR-021, FR-010, FR-042b, FR-042d).
type Session = Awaited<ReturnType<typeof signIn>>;

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  await createUser({ email: 'office2@example.com', role: 'OFFICE_TEAM', name: 'Olga Office', actorId: admin.id });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  return {
    admin,
    office,
    accountant,
    project,
    asAdmin: await signIn('admin@example.com'),
    asOffice: await signIn('office@example.com'),
    asOffice2: await signIn('office2@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

function enter(session: Session, projectId: string, body: Record<string, unknown> = {}) {
  return session.client.post(`/api/projects/${projectId}/receipts`).send({
    submission_id: randomUUID(),
    receipt_type: 'STAGE_PAYMENT',
    amount: '200000.00',
    received_on: dayOffset(-1),
    ...body,
  });
}

const decide = (session: Session, id: string, action: 'verification' | 'rejection' | 'withdrawal', body: Record<string, unknown> = {}) =>
  session.client.post(`/api/receipts/${id}/${action}`).send(body);

async function view(session: Session, projectId: string) {
  return (await session.client.get(`/api/projects/${projectId}/client-finance`)).body;
}

describe('US2: receipts and verification', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('saves Office Team receipts of every type as Submitted and uncounted, and reviewer receipts as verified (US2-1, US2-4)', async () => {
    const { project, office, asOffice, asAccountant } = await setup();
    for (const type of ['ADVANCE', 'STAGE_PAYMENT', 'FINAL_PAYMENT', 'OTHER']) {
      const response = await enter(asOffice, project.id, { receipt_type: type, amount: '1000.00' });
      expect(response.status, type).toBe(201);
      expect(response.body).toMatchObject({ receipt_type: type, state: 'SUBMITTED', counted: false, created_by: { id: office.id } });
    }
    const byReviewer = await enter(asAccountant, project.id, { amount: '5000.00' });
    expect(byReviewer.body).toMatchObject({ state: 'VERIFIED', counted: true, entry_status: 'VERIFIED_ON_ENTRY' });
    expect((await view(asOffice, project.id)).summary.verified_receipts).toBe('5000.00');
    const created = await prisma.historyEntry.findFirstOrThrow({ where: { clientAdvanceId: byReviewer.body.id, action: 'CREATED' } });
    expect(created.details).toMatchObject({ record_status: 'VERIFIED' });
  });

  it('verifies and rejects as new entries without changing the receipt; Office Team cannot verify, reject or reverse (US2-2, US2-3, US2-5)', async () => {
    const { project, accountant, asOffice, asAccountant } = await setup();
    const one = (await enter(asOffice, project.id)).body;
    const two = (await enter(asOffice, project.id, { amount: '300.00' })).body;
    const before = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: one.id } });
    expect((await decide(asOffice, one.id, 'verification', { expected_state: 'SUBMITTED' })).status).toBe(403);
    expect((await decide(asOffice, one.id, 'rejection', { reason: 'x', expected_state: 'SUBMITTED' })).status).toBe(403);
    const verified = await decide(asAccountant, one.id, 'verification', { expected_state: 'SUBMITTED' });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({ state: 'VERIFIED', counted: true, decision: { decision: 'VERIFIED', created_by: { id: accountant.id } } });
    const after = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: one.id } });
    expect(after).toEqual(before);
    expect((await asOffice.client.post(`/api/client-advances/${one.id}/reversal`).send({ reason: 'x' })).status).toBe(403);

    expect((await decide(asAccountant, two.id, 'rejection', { expected_state: 'SUBMITTED' })).status).toBe(400);
    const rejected = await decide(asAccountant, two.id, 'rejection', { reason: 'No proof', expected_state: 'SUBMITTED' });
    expect(rejected.body).toMatchObject({ state: 'REJECTED', counted: false, decision: { reason: 'No proof' } });
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientAdvanceId: two.id, action: 'REJECTED' } });
    expect(entry.details).toMatchObject({ reason: 'No proof', record_status: 'REJECTED' });
  });

  it('refuses invalid amounts, dates, types and vendor fields with a message naming the field (US2-6, US2-18, FR-011)', async () => {
    const { project, asOffice } = await setup();
    const cases: [Record<string, unknown>, string][] = [
      [{ amount: '0' }, 'amount'],
      [{ amount: '-5.00' }, 'amount'],
      [{ amount: '10.123' }, 'amount'],
      [{ amount: '10000000000000.00' }, 'amount'],
      [{ received_on: dayOffset(1) }, 'received_on'],
      [{ receipt_type: 'REFUND' }, 'receipt_type'],
      [{ vendor_id: randomUUID() }, 'body'],
    ];
    for (const [body, field] of cases) {
      const response = await enter(asOffice, project.id, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(Object.keys(response.body.fields ?? {}).join(','), JSON.stringify(body)).toContain(field);
    }
    expect(await prisma.clientAdvance.count()).toBe(0);
  });

  it('reverses any verified receipt type in full only, once, with a Feature 006 entry for non-Advances (US2-7)', async () => {
    const { project, asAccountant } = await setup();
    const stage = (await enter(asAccountant, project.id, { amount: '700.00' })).body;
    const partial = await asAccountant.client.post(`/api/client-advances/${stage.id}/reversal`).send({ reason: 'Bounced', amount: '100.00' });
    expect(partial.status).toBe(400);
    expect(partial.body.fields.amount).toBeTruthy();
    expect((await asAccountant.client.post(`/api/client-advances/${stage.id}/reversal`).send({ reason: 'Bounced' })).status).toBe(201);
    expect((await asAccountant.client.post(`/api/client-advances/${stage.id}/reversal`).send({ reason: 'Again' })).status).toBe(409);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientAdvanceId: stage.id, action: 'REVERSED' } });
    expect(entry.details).toMatchObject({ amount: '700.00', reason: 'Bounced', record_status: 'REVERSED' });
    const submitted = (await enter((await signIn('office@example.com')), project.id)).body;
    expect((await asAccountant.client.post(`/api/client-advances/${submitted.id}/reversal`).send({ reason: 'x' })).status).toBe(409);
  });

  it('on an archived project refuses entry, verification and withdrawal but allows rejection and reversal (US2-8, US2-14)', async () => {
    const { project, asOffice, asAccountant } = await setup();
    const submitted = (await enter(asOffice, project.id)).body;
    const toReject = (await enter(asOffice, project.id, { amount: '50.00' })).body;
    const verified = (await enter(asAccountant, project.id, { amount: '60.00' })).body;
    await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
    expect((await enter(asAccountant, project.id)).body.code).toBe('PROJECT_ARCHIVED');
    expect((await decide(asAccountant, submitted.id, 'verification', { expected_state: 'SUBMITTED' })).body.code).toBe('PROJECT_ARCHIVED');
    expect((await decide(asOffice, submitted.id, 'withdrawal', { reason: 'x', expected_state: 'SUBMITTED' })).body.code).toBe('PROJECT_ARCHIVED');
    expect((await decide(asAccountant, toReject.id, 'rejection', { reason: 'Wrong', expected_state: 'SUBMITTED' })).status).toBe(200);
    expect((await asAccountant.client.post(`/api/client-advances/${verified.id}/reversal`).send({ reason: 'Wrong' })).status).toBe(201);
  });

  it('lets only the Office Team creator or a reviewer withdraw a Submitted receipt, with a reason, and never resubmits (US2-15)', async () => {
    const { project, asOffice, asOffice2, asAccountant } = await setup();
    const receipt = (await enter(asOffice, project.id)).body;
    expect((await decide(asOffice2, receipt.id, 'withdrawal', { reason: 'x', expected_state: 'SUBMITTED' })).status).toBe(403);
    expect((await decide(asOffice, receipt.id, 'withdrawal', { expected_state: 'SUBMITTED' })).status).toBe(400);
    const withdrawn = await decide(asOffice, receipt.id, 'withdrawal', { reason: 'Typed twice', expected_state: 'SUBMITTED' });
    expect(withdrawn.body).toMatchObject({ state: 'WITHDRAWN', counted: false });
    for (const action of ['verification', 'rejection', 'withdrawal'] as const) {
      const response = await decide(asAccountant, receipt.id, action, action === 'verification' ? {} : { reason: 'x' });
      expect(response.status, action).toBe(409);
      expect(response.body.code).toBe('INVALID_TRANSITION');
    }
    const other = (await enter(asOffice, project.id)).body;
    expect((await decide(asAccountant, other.id, 'withdrawal', { reason: 'Reviewer withdrew', expected_state: 'SUBMITTED' })).body.state).toBe('WITHDRAWN');
  });

  it('links to any approval of the project, superseded included, or to a Verified PO only, and never re-checks the link (US2-17, US2-19)', async () => {
    const { admin, project, asOffice } = await setup();
    const other = await createProject(admin.id, 'Studio');
    const { quotation, revision } = await createQuotation(admin.id, project.id);
    const first = await approveRevision(admin.id, revision.id);
    const verifiedPo = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: first.id, amount: '1840000.00' });
    const r2 = await addRevision(admin.id, quotation.id, { amount: '1910000.00' });
    await approveRevision(admin.id, r2.id);
    const submittedPo = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: first.id, amount: '1840000.00', poNumber: 'PO/2', entryStatus: 'SUBMITTED' });
    const cancelledPo = await createPurchaseOrder(admin.id, { projectId: project.id, approvalId: first.id, amount: '1840000.00', poNumber: 'PO/3' });
    await cancelPurchaseOrder(admin.id, cancelledPo.id);
    const { revision: otherRevision } = await createQuotation(admin.id, other.id);
    const otherApproval = await approveRevision(admin.id, otherRevision.id);

    const onSuperseded = await enter(asOffice, project.id, { client_approval_id: first.id });
    expect(onSuperseded.status).toBe(201);
    expect(onSuperseded.body.link).toMatchObject({ kind: 'approval', id: first.id, revision_number: 1 });
    const onPo = await enter(asOffice, project.id, { client_purchase_order_id: verifiedPo.id });
    expect(onPo.status).toBe(201);
    for (const body of [{ client_purchase_order_id: submittedPo.id }, { client_purchase_order_id: cancelledPo.id }, { client_approval_id: otherApproval.id }]) {
      const refused = await enter(asOffice, project.id, body);
      expect(refused.status, JSON.stringify(body)).toBe(409);
      expect(refused.body.code).toBe('INVALID_LINK');
    }
    expect((await enter(asOffice, project.id, { client_approval_id: first.id, client_purchase_order_id: verifiedPo.id })).status).toBe(400);
    await cancelPurchaseOrder(admin.id, verifiedPo.id);
    const stored = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: onPo.body.id } });
    expect(stored.clientPurchaseOrderId).toBe(verifiedPo.id);
    expect(await createReceipt(admin.id, { projectId: project.id, amount: '1.00' })).toBeTruthy();
  });

  it('attaches a payment proof given at entry, in the same save, and lists it (US2-9, FR-016)', async () => {
    const { admin, project, asOffice } = await setup();
    const proof = await createProjectDocument(admin.id, { projectId: project.id, documentType: 'PAYMENT_PROOF' });
    const response = await enter(asOffice, project.id, { document_ids: [proof.id] });
    expect(response.status).toBe(201);
    expect(response.body.attachments.map((a: { document: { id: string } }) => a.document.id)).toEqual([proof.id]);
    const archived = await createProjectDocument(admin.id, { projectId: project.id, archived: true });
    const refused = await enter(asOffice, project.id, { document_ids: [archived.id] });
    expect(refused.status).toBe(409);
    expect(await prisma.clientAdvance.count()).toBe(1);
  });

  it('lets one of two simultaneous verifications through and refuses a stale request (FR-007)', async () => {
    const { project, asOffice, asAdmin, asAccountant } = await setup();
    const receipt = (await enter(asOffice, project.id)).body;
    const results = await Promise.all([
      decide(asAdmin, receipt.id, 'verification', { expected_state: 'SUBMITTED' }),
      decide(asAccountant, receipt.id, 'verification', { expected_state: 'SUBMITTED' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.current_state).toBe('VERIFIED');
    const other = (await enter(asOffice, project.id)).body;
    const stale = await decide(asAccountant, other.id, 'verification', { expected_state: 'VERIFIED' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('STALE');
  });

  it('still lets a reviewer decide a receipt whose Office Team author was revoked, keeping the author (US2-20)', async () => {
    const { project, office, asOffice, asAccountant } = await setup();
    const receipt = (await enter(asOffice, project.id)).body;
    await prisma.staffUser.update({ where: { id: office.id }, data: { revokedAt: new Date() } });
    const verified = await decide(asAccountant, receipt.id, 'verification', { expected_state: 'SUBMITTED' });
    expect(verified.status).toBe(200);
    expect(verified.body.created_by.id).toBe(office.id);
  });

  it('refuses to verify a Feature 003 advance again (US1-5, moved from T023)', async () => {
    const { admin, project, asAccountant } = await setup();
    const legacy = await createLegacyAdvance({ projectId: project.id, amount: '50000.00', receivedOn: dayOffset(-5), actorId: admin.id });
    const response = await decide(asAccountant, legacy.id, 'verification', {});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INVALID_TRANSITION');
  });
});
