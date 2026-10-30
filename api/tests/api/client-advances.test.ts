import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db';
import { app, createUser, dayOffset, resetDatabase, signIn } from '../helpers';

type Session = Awaited<ReturnType<typeof signIn>>;

async function people() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const project = await prisma.project.create({
    data: { name: 'Kapoor Residence', clientName: 'R. Kapoor', status: 'ACTIVE', createdById: admin.id, updatedById: admin.id },
  });
  return {
    admin,
    accountant,
    office,
    project,
    asAdmin: await signIn('admin@example.com'),
    asAccountant: await signIn('accountant@example.com'),
    asOffice: await signIn('office@example.com'),
  };
}

function record(session: Session, projectId: string, body: Record<string, unknown>) {
  return session.client.post(`/api/projects/${projectId}/client-advances`).send(body);
}

function reverse(session: Session, advanceId: string, body: Record<string, unknown>) {
  return session.client.post(`/api/client-advances/${advanceId}/reversal`).send(body);
}

function list(session: Session, projectId: string) {
  return session.client.get(`/api/projects/${projectId}/client-advances`);
}

describe('client advances (US1)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lets an Accountant and an Administrator record advances, listed with author and time (US1-1, FR-021, FR-022)', async () => {
    const { project, accountant, asAccountant, asAdmin } = await people();
    const first = await record(asAccountant, project.id, {
      amount: '100000', received_on: dayOffset(-10), payment_method: 'BANK_TRANSFER', reference: 'NEFT 8812', note: 'First',
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      amount: '100000.00', received_on: dayOffset(-10), payment_method: 'BANK_TRANSFER', reference: 'NEFT 8812', note: 'First',
      created_by: { id: accountant.id, name: 'Anil Accountant' }, reversal: null,
    });
    expect(Number.isNaN(Date.parse(first.body.created_at))).toBe(false);
    expect((await record(asAdmin, project.id, { amount: '50000.50', received_on: dayOffset(0) })).status).toBe(201);

    const read = await list(asAccountant, project.id);
    expect(read.status).toBe(200);
    expect(read.body.project).toEqual({ id: project.id, name: 'Kapoor Residence', client_name: 'R. Kapoor', archived: false });
    expect(read.body.net_amount).toBe('150000.50');
    expect(read.body.advances.map((a: { amount: string }) => a.amount)).toEqual(['100000.00', '50000.50']);
  });

  it('lists advances by date received, then by time recorded (FR-021)', async () => {
    const { project, asAccountant } = await people();
    await record(asAccountant, project.id, { amount: '3', received_on: dayOffset(-1) });
    await record(asAccountant, project.id, { amount: '1', received_on: dayOffset(-5) });
    await record(asAccountant, project.id, { amount: '2', received_on: dayOffset(-1) });
    const read = await list(asAccountant, project.id);
    expect(read.body.advances.map((a: { amount: string }) => a.amount)).toEqual(['1.00', '3.00', '2.00']);
  });

  it('refuses invalid amounts and dates with 400 fields and saves nothing (US1-2, FR-018)', async () => {
    const { project, asAccountant } = await people();
    const bad = [
      { amount: '0', received_on: dayOffset(0) },
      { amount: '-5', received_on: dayOffset(0) },
      { amount: '10.123', received_on: dayOffset(0) },
      { amount: '1.005', received_on: dayOffset(0) },
      { received_on: dayOffset(0) },
      { amount: '10000000000000.00', received_on: dayOffset(0) },
      { amount: '10' },
      { amount: '10', received_on: dayOffset(1) },
    ];
    for (const body of bad) {
      const response = await record(asAccountant, project.id, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.fields, JSON.stringify(body)).toBeTruthy();
    }
    expect(await prisma.clientAdvance.count()).toBe(0);

    expect((await record(asAccountant, project.id, { amount: '0.01', received_on: dayOffset(0) })).status).toBe(201);
    expect((await record(asAccountant, project.id, { amount: '9999999999999.99', received_on: dayOffset(0) })).status).toBe(201);
  });

  it('has no route that edits or deletes an advance (US1-3, FR-019)', async () => {
    const { project, asAdmin } = await people();
    const created = await record(asAdmin, project.id, { amount: '500', received_on: dayOffset(0) });
    const before = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: created.body.id } });
    expect((await asAdmin.client.patch(`/api/client-advances/${created.body.id}`).send({ amount: '1' })).status).toBe(404);
    expect((await asAdmin.client.put(`/api/client-advances/${created.body.id}`).send({ amount: '1' })).status).toBe(404);
    expect((await asAdmin.client.delete(`/api/client-advances/${created.body.id}`)).status).toBe(404);
    expect(await prisma.clientAdvance.findUniqueOrThrow({ where: { id: created.body.id } })).toEqual(before);
  });

  it('reverses an advance once, in full, with a reason (US1-4, US1-5, FR-020)', async () => {
    const { project, accountant, asAccountant } = await people();
    const kept = await record(asAccountant, project.id, { amount: '20000', received_on: dayOffset(-3) });
    const wrong = await record(asAccountant, project.id, { amount: '50000', received_on: dayOffset(-2) });

    expect((await reverse(asAccountant, wrong.body.id, {})).status).toBe(400);
    expect((await reverse(asAccountant, wrong.body.id, { reason: '   ' })).status).toBe(400);

    const reversed = await reverse(asAccountant, wrong.body.id, { reason: 'Amount keyed wrongly.' });
    expect(reversed.status).toBe(201);
    expect(reversed.body).toMatchObject({
      id: wrong.body.id,
      amount: '50000.00',
      reversal: { amount: '50000.00', reason: 'Amount keyed wrongly.', created_by: { id: accountant.id, name: 'Anil Accountant' } },
    });

    const again = await reverse(asAccountant, wrong.body.id, { reason: 'Again' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REVERSED');

    const read = await list(asAccountant, project.id);
    expect(read.body.advances).toHaveLength(2);
    expect(read.body.advances[1]).toMatchObject({ id: wrong.body.id, amount: '50000.00', reversal: { reason: 'Amount keyed wrongly.' } });
    expect(read.body.advances[0]).toMatchObject({ id: kept.body.id, reversal: null });
    expect(read.body.net_amount).toBe('20000.00');
  });

  it('accepts exactly one of two simultaneous reversals (FR-020)', async () => {
    const { project, asAccountant, asAdmin } = await people();
    const advance = await record(asAccountant, project.id, { amount: '700', received_on: dayOffset(0) });
    const results = await Promise.all([
      reverse(asAccountant, advance.body.id, { reason: 'First' }),
      reverse(asAdmin, advance.body.id, { reason: 'Second' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe('ALREADY_REVERSED');
    expect(await prisma.clientAdvanceReversal.count()).toBe(1);
  });

  it('lets an Office Team member read amounts but refuses recording and reversing (US1-6, US1-8, FR-017)', async () => {
    const { project, asAccountant, asOffice } = await people();
    const advance = await record(asAccountant, project.id, { amount: '1200', received_on: dayOffset(0) });

    const recordAttempt = await record(asOffice, project.id, { amount: '10', received_on: dayOffset(0) });
    expect(recordAttempt.status).toBe(403);
    expect(recordAttempt.body.code).toBe('ROLE_NOT_ALLOWED');
    const reverseAttempt = await reverse(asOffice, advance.body.id, { reason: 'No' });
    expect(reverseAttempt.status).toBe(403);
    expect(reverseAttempt.body.code).toBe('ROLE_NOT_ALLOWED');
    expect(await prisma.clientAdvance.count()).toBe(1);
    expect(await prisma.clientAdvanceReversal.count()).toBe(0);

    const read = await list(asOffice, project.id);
    expect(read.status).toBe(200);
    expect(read.body.net_amount).toBe('1200.00');
    expect(read.body.advances[0].amount).toBe('1200.00');
  });

  it('refuses a new advance on an archived project but still reverses and reads (US1-7)', async () => {
    const { project, asAccountant, asAdmin } = await people();
    const advance = await record(asAccountant, project.id, { amount: '900', received_on: dayOffset(0) });
    expect((await asAdmin.client.post(`/api/projects/${project.id}/archive`)).status).toBe(200);

    const refused = await record(asAccountant, project.id, { amount: '10', received_on: dayOffset(0) });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('PROJECT_ARCHIVED');
    expect((await reverse(asAccountant, advance.body.id, { reason: 'Wrong project.' })).status).toBe(201);

    const read = await list(asAccountant, project.id);
    expect(read.status).toBe(200);
    expect(read.body.project.archived).toBe(true);
    expect(read.body.advances[0].reversal.reason).toBe('Wrong project.');
    expect(read.body.net_amount).toBe('0.00');
  });

  it('answers 404 for an unknown project or advance', async () => {
    const { asAccountant } = await people();
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await record(asAccountant, missing, { amount: '1', received_on: dayOffset(0) })).status).toBe(404);
    expect((await reverse(asAccountant, missing, { reason: 'x' })).status).toBe(404);
    expect((await list(asAccountant, missing)).status).toBe(404);
  });

  it('refuses signed-out and revoked people and sends no amounts (US1-9, FR-025)', async () => {
    const { project, accountant, asAccountant } = await people();
    await record(asAccountant, project.id, { amount: '4321', received_on: dayOffset(0) });

    const signedOut = await request(app).get(`/api/projects/${project.id}/client-advances`);
    expect(signedOut.status).toBe(401);
    expect(JSON.stringify(signedOut.body)).not.toContain('4321');

    await prisma.staffUser.update({ where: { id: accountant.id }, data: { revokedAt: new Date() } });
    const revoked = await list(asAccountant, project.id);
    expect(revoked.status).toBe(401);
    expect(JSON.stringify(revoked.body)).not.toContain('4321');
    expect((await record(asAccountant, project.id, { amount: '1', received_on: dayOffset(0) })).status).toBe(401);
  });

  it('writes one history entry for each advance and each reversal (FR-027, SC-008)', async () => {
    const { project, accountant, asAccountant } = await people();
    const advance = await record(asAccountant, project.id, { amount: '2500.75', received_on: dayOffset(-1) });
    await reverse(asAccountant, advance.body.id, { reason: 'Duplicate entry.' });

    const entries = await prisma.historyEntry.findMany({ where: { clientAdvanceId: advance.body.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => e.action)).toEqual(['CREATED', 'REVERSED']);
    expect(entries.every((e) => e.createdById === accountant.id)).toBe(true);
    expect(entries[0].details).toMatchObject({ amount: '2500.75', received_on: dayOffset(-1) });
    expect(entries[1].details).toMatchObject({ amount: '2500.75', reason: 'Duplicate entry.' });
  });

  it('keeps advance amounts exact to the paisa (SC-007)', async () => {
    const { project, asAccountant } = await people();
    for (const amount of ['0.10', '0.20', '1234567.89']) await record(asAccountant, project.id, { amount, received_on: dayOffset(0) });
    expect((await list(asAccountant, project.id)).body.net_amount).toBe('1234568.19');
  });
});
