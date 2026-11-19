import { beforeEach, describe, expect, it } from 'vitest';
import { createAdvance, createProject, createReceipt, createUser, dayOffset, decideReceipt, resetDatabase, resetFileStorage, reverseAdvance, signIn } from '../helpers';

// FR-015, OQ-27 (T024; also US2-13): the Feature 003 figures count verified, unreversed Advances only.
describe('Feature 003 advance figures after Feature 006', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('exclude Submitted, Rejected and Withdrawn advances and later payments; count a Submitted advance once verified', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const project = await createProject(admin.id, 'Lake House');
    const today = dayOffset(0);
    await createAdvance({ projectId: project.id, amount: '10000.00', receivedOn: today, actorId: admin.id });
    const reversedAdvance = await createAdvance({ projectId: project.id, amount: '7000.00', receivedOn: today, actorId: admin.id });
    await reverseAdvance({ advanceId: reversedAdvance.id, reason: 'Wrong', actorId: admin.id });
    const submitted = await createReceipt(admin.id, { projectId: project.id, amount: '1000.00', receivedOn: today, receiptType: 'ADVANCE', entryStatus: 'SUBMITTED' });
    const rejected = await createReceipt(admin.id, { projectId: project.id, amount: '2000.00', receivedOn: today, receiptType: 'ADVANCE', entryStatus: 'SUBMITTED' });
    await decideReceipt(admin.id, rejected.id, 'REJECTED');
    const withdrawn = await createReceipt(admin.id, { projectId: project.id, amount: '3000.00', receivedOn: today, receiptType: 'ADVANCE', entryStatus: 'SUBMITTED' });
    await decideReceipt(admin.id, withdrawn.id, 'WITHDRAWN');
    await createReceipt(admin.id, { projectId: project.id, amount: '4000.00', receivedOn: today, receiptType: 'STAGE_PAYMENT' });

    const { client } = await signIn('admin@example.com');
    const figures = async () => {
      const summary = (await client.get('/api/dashboard/summary')).body.client_advances;
      const all = (await client.get('/api/client-advances').query({ scope: 'all' })).body;
      const month = (await client.get('/api/client-advances').query({ scope: 'month' })).body;
      const list = (await client.get(`/api/projects/${project.id}/client-advances`)).body;
      return { summary, all, month, list };
    };

    const before = await figures();
    expect(before.summary.standing_total).toBe('10000.00');
    expect(before.summary.received_this_month).toBe('10000.00');
    expect(before.summary.labels.standing_total).toBe('Client advances received and not reversed, all projects');
    expect(before.all.map((a: { amount: string }) => a.amount)).toEqual(['10000.00']);
    expect(before.month.map((a: { amount: string }) => a.amount)).toEqual(['10000.00']);
    expect(before.list.net_amount).toBe('10000.00');
    // The project list keeps verified Advances, reversed ones included with their reversal (Feature 003 FR-021).
    expect(before.list.advances.map((a: { amount: string; reversal: unknown }) => [a.amount, a.reversal !== null])).toEqual([
      ['10000.00', false],
      ['7000.00', true],
    ]);

    await decideReceipt(admin.id, submitted.id, 'VERIFIED');
    const after = await figures();
    expect(after.summary.standing_total).toBe('11000.00');
    expect(after.list.net_amount).toBe('11000.00');
    expect(after.all).toHaveLength(2);
  });
});
