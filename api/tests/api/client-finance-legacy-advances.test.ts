import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createLegacyAdvance, createProject, createUser, dayOffset, resetDatabase, resetFileStorage, reverseAdvance, signIn } from '../helpers';

// US1 (T023): every Feature 003 advance, reversal and history entry reads exactly as before (FR-012 to FR-015, FR-040).
async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  const kept = await createLegacyAdvance({ projectId: project.id, amount: '50000.00', receivedOn: dayOffset(-3), actorId: accountant.id });
  const reversed = await createLegacyAdvance({ projectId: project.id, amount: '20000.00', receivedOn: dayOffset(-2), actorId: accountant.id });
  await prisma.clientAdvance.update({ where: { id: kept.id }, data: { paymentMethod: 'UPI', reference: 'UTR123', note: 'First advance' } });
  await reverseAdvance({ advanceId: reversed.id, reason: 'Cheque bounced', actorId: accountant.id });
  await prisma.historyEntry.create({ data: { clientAdvanceId: kept.id, action: 'CREATED', details: { amount: '50000.00', received_on: dayOffset(-3) }, createdById: accountant.id, updatedById: accountant.id } });
  return {
    admin,
    accountant,
    project,
    kept,
    reversed,
    asAdmin: await signIn('admin@example.com'),
    asAccountant: await signIn('accountant@example.com'),
    asOffice: await signIn('office@example.com'),
  };
}

describe('US1: Feature 003 advances preserved', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('shows each existing advance and reversal unchanged, with the same net amount, to every role (US1-1)', async () => {
    const { project, kept, accountant, asAdmin, asAccountant, asOffice } = await setup();
    for (const session of [asAdmin, asAccountant, asOffice]) {
      const response = await session.client.get(`/api/projects/${project.id}/client-advances`);
      expect(response.status).toBe(200);
      expect(response.body.net_amount).toBe('50000.00');
      expect(response.body.advances).toHaveLength(2);
      expect(response.body.advances[0]).toMatchObject({
        id: kept.id,
        amount: '50000.00',
        received_on: dayOffset(-3),
        payment_method: 'UPI',
        reference: 'UTR123',
        note: 'First advance',
        created_by: { id: accountant.id, name: 'Anil Accountant' },
        reversal: null,
      });
      expect(response.body.advances[1].reversal).toMatchObject({ amount: '20000.00', reason: 'Cheque bounced' });
    }
  });

  it('presents them in the Client finance area as Advance receipts recorded under Feature 003, with no invented verification (FR-013)', async () => {
    const { project, kept, reversed, asOffice } = await setup();
    const view = (await asOffice.client.get(`/api/projects/${project.id}/client-finance`)).body;
    const byId = Object.fromEntries(view.receipts.map((r: { id: string }) => [r.id, r]));
    expect(byId[kept.id]).toMatchObject({ receipt_type: 'ADVANCE', state: 'VERIFIED', recorded_under: 'FEATURE_003', decision: null, counted: true });
    expect(byId[reversed.id]).toMatchObject({ receipt_type: 'ADVANCE', state: 'REVERSED', recorded_under: 'FEATURE_003', counted: false });
    expect(await prisma.clientReceiptDecision.count()).toBe(0);
  });

  it('keeps both dashboard money tiles at the values Feature 003 gives (US1-2)', async () => {
    const { asAdmin } = await setup();
    const summary = (await asAdmin.client.get('/api/dashboard/summary')).body;
    expect(summary.client_advances.standing_total).toBe('50000.00');
    expect(summary.client_advances.received_this_month).toBe(
      dayOffset(-3).slice(0, 7) === dayOffset(0).slice(0, 7) ? '50000.00' : '0.00',
    );
    expect(summary.client_advances.labels.standing_total).toBe('Client advances received and not reversed, all projects');
  });

  it('records an advance through the Feature 003 route with the Feature 003 response and history, counted at once (US1-3)', async () => {
    const { project, accountant, asAccountant } = await setup();
    const response = await asAccountant.client
      .post(`/api/projects/${project.id}/client-advances`)
      .send({ amount: '15000.00', received_on: dayOffset(-1), payment_method: 'CASH', reference: '', note: 'Second' });
    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(['amount', 'created_at', 'created_by', 'id', 'note', 'payment_method', 'received_on', 'reference', 'reversal'].sort());
    expect(response.body).toMatchObject({ amount: '15000.00', reference: null, note: 'Second', created_by: { id: accountant.id }, reversal: null });
    const entries = await prisma.historyEntry.findMany({ where: { clientAdvanceId: response.body.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].details).toEqual({ amount: '15000.00', received_on: dayOffset(-1) });
    const stored = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored).toMatchObject({ receiptType: 'ADVANCE', entryStatus: 'VERIFIED_ON_ENTRY' });
    const list = (await asAccountant.client.get(`/api/projects/${project.id}/client-advances`)).body;
    expect(list.net_amount).toBe('65000.00');
  });

  it('reverses under the Feature 003 rules: full amount, once, allowed on an archived project, Feature 003 history (US1-4)', async () => {
    const { project, kept, asAccountant } = await setup();
    await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
    const response = await asAccountant.client.post(`/api/client-advances/${kept.id}/reversal`).send({ reason: 'Keyed twice' });
    expect(response.status).toBe(201);
    expect(response.body.reversal).toMatchObject({ amount: '50000.00', reason: 'Keyed twice' });
    const again = await asAccountant.client.post(`/api/client-advances/${kept.id}/reversal`).send({ reason: 'Again' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REVERSED');
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientAdvanceId: kept.id, action: 'REVERSED' } });
    expect(entry.details).toEqual({ amount: '50000.00', reason: 'Keyed twice' });
  });

  it('offers no route that changes or deletes an advance, and leaves its history as it was (US1-5, US1-6)', async () => {
    const { kept, accountant, asAdmin } = await setup();
    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await asAdmin.client[method](`/api/client-advances/${kept.id}`).send({ amount: '1.00' });
      expect(response.status, method).toBe(404);
    }
    const stored = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: kept.id } });
    expect(stored.amount.toFixed(2)).toBe('50000.00');
    const history = (await asAdmin.client.get('/api/history').query({ client_advance_id: kept.id })).body;
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ action: 'CREATED', created_by: { id: accountant.id, name: 'Anil Accountant' } });
  });

  it('still refuses Office Team on the Feature 003 recording and reversal routes (FR-003)', async () => {
    const { project, kept, asOffice } = await setup();
    expect((await asOffice.client.post(`/api/projects/${project.id}/client-advances`).send({ amount: '1.00', received_on: dayOffset(-1) })).status).toBe(403);
    expect((await asOffice.client.post(`/api/client-advances/${kept.id}/reversal`).send({ reason: 'x' })).status).toBe(403);
  });
});
