import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { approveRevision, createProject, createProjectDocument, createQuotation, createReceipt, createUser, dayOffset, resetDatabase, resetFileStorage, signIn } from '../helpers';

// Repeated receipt submissions (T031, research R13).
async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  const other = await createProject(admin.id, 'Studio');
  const d1 = await createProjectDocument(admin.id, { projectId: project.id });
  const d2 = await createProjectDocument(admin.id, { projectId: project.id });
  return { admin, project, other, d1, d2, asAccountant: await signIn('accountant@example.com'), asAdmin: await signIn('admin@example.com'), asOffice: await signIn('office@example.com') };
}

describe('repeated receipt submissions', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('returns the original for the same ID and details, with document IDs in any order, and saves nothing new', async () => {
    const { project, d1, d2, asOffice } = await setup();
    const body = { submission_id: randomUUID(), receipt_type: 'STAGE_PAYMENT', amount: '5000.00', received_on: dayOffset(-1), payment_method: 'UPI', reference: 'R1', note: 'n', document_ids: [d1.id, d2.id] };
    const first = await asOffice.client.post(`/api/projects/${project.id}/receipts`).send(body);
    const again = await asOffice.client.post(`/api/projects/${project.id}/receipts`).send({ ...body, document_ids: [d2.id, d1.id] });
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(await prisma.clientAdvance.count()).toBe(1);
    expect(await prisma.historyEntry.count({ where: { clientAdvanceId: first.body.id } })).toBe(3);
  });

  it('refuses the same ID with any differing detail, and on another project, saving nothing', async () => {
    const { project, other, d1, d2, asOffice, asAccountant } = await setup();
    const id = randomUUID();
    const base = { submission_id: id, receipt_type: 'STAGE_PAYMENT', amount: '5000.00', received_on: dayOffset(-1), payment_method: 'UPI', reference: 'R1', note: 'n', document_ids: [d1.id] };
    expect((await asOffice.client.post(`/api/projects/${project.id}/receipts`).send(base)).status).toBe(201);
    const variants: Record<string, unknown>[] = [
      { receipt_type: 'OTHER' },
      { amount: '5000.01' },
      { received_on: dayOffset(-2) },
      { payment_method: 'CASH' },
      { reference: 'R2' },
      { note: 'm' },
      { document_ids: [d1.id, d2.id] },
    ];
    for (const change of variants) {
      const response = await asOffice.client.post(`/api/projects/${project.id}/receipts`).send({ ...base, ...change });
      expect(response.status, JSON.stringify(change)).toBe(409);
      expect(response.body.code).toBe('SUBMISSION_ID_REUSED');
    }
    expect((await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send(base)).body.code).toBe('SUBMISSION_ID_REUSED');
    expect((await asOffice.client.post(`/api/projects/${other.id}/receipts`).send({ ...base, document_ids: [] })).body.code).toBe('SUBMISSION_ID_REUSED');
    expect(await prisma.clientAdvance.count()).toBe(1);
  });

  it('refuses a link change and an ID first used on the other route', async () => {
    const { admin, project, asAccountant } = await setup();
    const { revision } = await createQuotation(admin.id, project.id, { amount: '9000000.00' });
    const approval = await approveRevision(admin.id, revision.id);
    const id = randomUUID();
    const legacy = await asAccountant.client.post(`/api/projects/${project.id}/client-advances`).send({ submission_id: id, amount: '5000.00', received_on: dayOffset(-1) });
    expect(legacy.status).toBe(201);
    const replay = await asAccountant.client.post(`/api/projects/${project.id}/client-advances`).send({ submission_id: id, amount: '5000.00', received_on: dayOffset(-1) });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(legacy.body);
    const crossed = await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send({ submission_id: id, receipt_type: 'ADVANCE', amount: '5000.00', received_on: dayOffset(-1) });
    expect(crossed.body.code).toBe('SUBMISSION_ID_REUSED');
    const other = randomUUID();
    await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send({ submission_id: other, receipt_type: 'OTHER', amount: '1.00', received_on: dayOffset(-1) });
    const linked = await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send({ submission_id: other, receipt_type: 'OTHER', amount: '1.00', received_on: dayOffset(-1), client_approval_id: approval.id });
    expect(linked.body.code).toBe('SUBMISSION_ID_REUSED');
    expect(await prisma.clientAdvance.count()).toBe(2);
  });

  it('needs the ID on the receipts route; the Feature 003 route without it behaves as before', async () => {
    const { project, asAccountant } = await setup();
    const missing = await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send({ receipt_type: 'OTHER', amount: '1.00', received_on: dayOffset(-1) });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.submission_id).toBeTruthy();
    for (let i = 0; i < 2; i += 1) {
      expect((await asAccountant.client.post(`/api/projects/${project.id}/client-advances`).send({ amount: '1.00', received_on: dayOffset(-1) })).status).toBe(201);
    }
    expect(await prisma.clientAdvance.count()).toBe(2);
  });

  it('ignores the confirmation flag and leaves an ID unused when the first request saved nothing', async () => {
    const { admin, project, asAccountant } = await setup();
    const { revision } = await createQuotation(admin.id, project.id, { amount: '1000.00' });
    await approveRevision(admin.id, revision.id);
    await createReceipt(admin.id, { projectId: project.id, amount: '900.00' });
    const body = { submission_id: randomUUID(), receipt_type: 'STAGE_PAYMENT', amount: '200.00', received_on: dayOffset(-1) };
    expect((await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send(body)).status).toBe(409);
    const saved = await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send({ ...body, confirm_overpayment: true });
    expect(saved.status).toBe(201);
    const replay = await asAccountant.client.post(`/api/projects/${project.id}/receipts`).send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(saved.body.id);
    expect(await prisma.clientAdvance.count()).toBe(2);
  });

  it('saves one receipt for two simultaneous identical requests', async () => {
    const { project, asOffice } = await setup();
    const body = { submission_id: randomUUID(), receipt_type: 'STAGE_PAYMENT', amount: '5000.00', received_on: dayOffset(-1) };
    const results = await Promise.all([1, 2].map(() => asOffice.client.post(`/api/projects/${project.id}/receipts`).send(body)));
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(await prisma.clientAdvance.count()).toBe(1);
  });
});
