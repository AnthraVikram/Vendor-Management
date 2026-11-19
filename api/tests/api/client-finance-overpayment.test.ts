import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { approveRevision, createProject, createQuotation, createReceipt, createUser, dayOffset, resetDatabase, resetFileStorage, signIn } from '../helpers';

// FR-036, OQ-22 (T030): US2-16, US6-7 and the Feature 003 route addition.
type Session = Awaited<ReturnType<typeof signIn>>;

async function setup(withApproval = true) {
  const admin = await createUser({ email: 'admin@example.com' });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  if (withApproval) {
    const { revision } = await createQuotation(admin.id, project.id, { amount: '1840000.00' });
    await approveRevision(admin.id, revision.id);
  }
  await createReceipt(admin.id, { projectId: project.id, amount: '1800000.00' });
  return { project, asOffice: await signIn('office@example.com'), asAccountant: await signIn('accountant@example.com'), asAdmin: await signIn('admin@example.com') };
}

const enter = (session: Session, projectId: string, body: Record<string, unknown> = {}) =>
  session.client.post(`/api/projects/${projectId}/receipts`).send({ submission_id: randomUUID(), receipt_type: 'STAGE_PAYMENT', amount: '100000.00', received_on: dayOffset(-1), ...body });

const FIGURES = { approved_amount: '1840000.00', verified_receipts: '1800000.00', receipt_amount: '100000.00', excess: '60000.00' };

describe('overpayment warning', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('warns a reviewer with the four figures, saves nothing without confirmation, and records the confirmation (US2-16)', async () => {
    const { project, asAccountant } = await setup();
    const warned = await enter(asAccountant, project.id);
    expect(warned.status).toBe(409);
    expect(warned.body).toMatchObject({ code: 'OVERPAYMENT_CONFIRMATION_REQUIRED', ...FIGURES });
    expect(await prisma.clientAdvance.count()).toBe(1);
    const confirmed = await enter(asAccountant, project.id, { confirm_overpayment: true });
    expect(confirmed.status).toBe(201);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientAdvanceId: confirmed.body.id, action: 'WARNING_CONFIRMED' } });
    expect(entry.details).toMatchObject({ warning: 'OVERPAYMENT', ...FIGURES, record_status: 'VERIFIED' });
    const view = (await asAccountant.client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(view.summary).toMatchObject({ outstanding: '0.00', overpaid: '60000.00' });
  });

  it('warns when a reviewer verifies an Office Team receipt, not when Office Team submits it', async () => {
    const { project, asOffice, asAccountant } = await setup();
    const submitted = await enter(asOffice, project.id);
    expect(submitted.status).toBe(201);
    const warned = await asAccountant.client.post(`/api/receipts/${submitted.body.id}/verification`).send({ expected_state: 'SUBMITTED' });
    expect(warned.status).toBe(409);
    expect(warned.body).toMatchObject({ code: 'OVERPAYMENT_CONFIRMATION_REQUIRED', ...FIGURES });
    const verified = await asAccountant.client.post(`/api/receipts/${submitted.body.id}/verification`).send({ expected_state: 'SUBMITTED', confirm_overpayment: true });
    expect(verified.status).toBe(200);
    expect(await prisma.historyEntry.count({ where: { clientAdvanceId: submitted.body.id, action: 'WARNING_CONFIRMED' } })).toBe(1);
  });

  it('never warns without an approved quotation (US6-7, FR-035)', async () => {
    const { project, asAccountant } = await setup(false);
    expect((await enter(asAccountant, project.id, { amount: '9000000.00' })).status).toBe(201);
    const view = (await asAccountant.client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(view.summary.not_available_reason).toBe('Not available: no approved amount');
  });

  it('adds the warning to the Feature 003 route only when an approved quotation exists', async () => {
    const withApproval = await setup();
    const legacy = (body: Record<string, unknown>) =>
      withApproval.asAccountant.client.post(`/api/projects/${withApproval.project.id}/client-advances`).send({ amount: '100000.00', received_on: dayOffset(-1), ...body });
    const warned = await legacy({});
    expect(warned.status).toBe(409);
    expect(warned.body).toMatchObject({ code: 'OVERPAYMENT_CONFIRMATION_REQUIRED', ...FIGURES });
    const confirmed = await legacy({ confirm_overpayment: true });
    expect(confirmed.status).toBe(201);
    expect(Object.keys(confirmed.body)).not.toContain('state');
  });

  it('re-checks under the lock: of two verifications that together overpay, the second is warned', async () => {
    const { project, asOffice, asAdmin, asAccountant } = await setup();
    const one = (await enter(asOffice, project.id, { amount: '30000.00' })).body;
    const two = (await enter(asOffice, project.id, { amount: '30000.00' })).body;
    const results = await Promise.all([
      asAdmin.client.post(`/api/receipts/${one.id}/verification`).send({ expected_state: 'SUBMITTED' }),
      asAccountant.client.post(`/api/receipts/${two.id}/verification`).send({ expected_state: 'SUBMITTED' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body).toMatchObject({ code: 'OVERPAYMENT_CONFIRMATION_REQUIRED', excess: '20000.00' });
  });
});
