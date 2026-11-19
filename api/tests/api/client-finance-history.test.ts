import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createLegacyAdvance, createProject, createProjectDocument, createUser, dayOffset, resetDatabase, resetFileStorage, signIn } from '../helpers';

// US6 (T057): one chronological client financial history per project (FR-038) and Recent activity (FR-039, research R6).
async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  return { admin, project, asOffice: await signIn('office@example.com'), asAccountant: await signIn('accountant@example.com') };
}

// Builds a project's records through the routes, so every entry is written as it is in use.
async function exercise(project: { id: string }, asOffice: Awaited<ReturnType<typeof signIn>>, asAccountant: Awaited<ReturnType<typeof signIn>>, adminId: string) {
  const quotation = (await asOffice.client.post(`/api/projects/${project.id}/quotation`).send({ title: 'Works', amount: '1840000.00', quotation_date: dayOffset(-3) })).body;
  const revisionId = quotation.revisions[0].id;
  const doc = await createProjectDocument(adminId, { projectId: project.id, documentType: 'QUOTATION' });
  await asOffice.client.post('/api/financial-attachments').send({ record: { kind: 'revision', id: revisionId }, document_id: doc.id });
  await asOffice.client.post(`/api/quotation-revisions/${revisionId}/status`).send({ to: 'SUBMITTED', expected_status: 'DRAFT' });
  await asAccountant.client.post(`/api/quotation-revisions/${revisionId}/status`).send({ to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' });
  const approval = (await asAccountant.client.post(`/api/quotation-revisions/${revisionId}/approval`).send({ expected_status: 'UNDER_REVIEW', amount: '1840000.00' })).body;
  const po = (await asOffice.client.post(`/api/projects/${project.id}/purchase-orders`).send({ client_approval_id: approval.id, po_number: 'PO/1', po_date: dayOffset(-1), amount: '1840000.00' })).body;
  const stage = (await asOffice.client.post(`/api/projects/${project.id}/receipts`).send({ submission_id: randomUUID(), receipt_type: 'STAGE_PAYMENT', amount: '1000.00', received_on: dayOffset(-1) })).body;
  await asAccountant.client.post(`/api/receipts/${stage.id}/verification`).send({ expected_state: 'SUBMITTED' });
  await asAccountant.client.post(`/api/client-advances/${stage.id}/reversal`).send({ reason: 'Bounced' });
  const legacyRoute = (await asAccountant.client.post(`/api/projects/${project.id}/client-advances`).send({ amount: '5000.00', received_on: dayOffset(-1) })).body;
  await asAccountant.client.post(`/api/client-advances/${legacyRoute.id}/reversal`).send({ reason: 'Wrong project' });
  return { quotation, po, stage, legacyRoute };
}

describe('client financial history', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('lists every event once in time order with amount, state, person, time and record link, legacy advances with their original stamps (US6-4, FR-038)', async () => {
    const { admin, project, asOffice, asAccountant } = await setup();
    const legacy = await createLegacyAdvance({ projectId: project.id, amount: '50000.00', receivedOn: dayOffset(-30), actorId: admin.id });
    const legacyTime = new Date(Date.now() - 30 * 86400000);
    await prisma.historyEntry.create({ data: { clientAdvanceId: legacy.id, action: 'CREATED', details: { amount: '50000.00', received_on: dayOffset(-30) }, createdAt: legacyTime, createdById: admin.id, updatedById: admin.id } });
    await exercise(project, asOffice, asAccountant, admin.id);
    const history = (await asOffice.client.get(`/api/projects/${project.id}/client-finance/history`)).body;
    const entries = history.entries as { action: string; created_at: string; state: string | null; amount: string | null; record: { kind: string }; created_by: { name: string } }[];
    const times = entries.map((e) => e.created_at);
    expect([...times].sort()).toEqual(times);
    expect(entries[0]).toMatchObject({ action: 'CREATED', state: 'VERIFIED', amount: '50000.00', record: { kind: 'receipt' }, created_by: { name: 'Asha Admin' } });
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['CREATED', 'REVISION_ADDED', 'ATTACHED', 'STATUS_CHANGED', 'APPROVED', 'VERIFIED', 'REVERSED']),
    );
    const legacyReversal = entries.filter((e) => e.action === 'REVERSED');
    expect(legacyReversal.map((e) => e.state)).toEqual(['REVERSED', 'REVERSED']);
    expect(new Set(entries.map((e) => JSON.stringify(e))).size).toBe(entries.length);
  });

  it('shows Feature 006 events in Recent activity with their status and no amount, and Feature 003 advance entries exactly as before (FR-039, research R6)', async () => {
    const { admin, project, asOffice, asAccountant } = await setup();
    const { stage, legacyRoute } = await exercise(project, asOffice, asAccountant, admin.id);
    const activity = (await asAccountant.client.get('/api/dashboard/overview')).body.recent_activity as {
      action: string;
      target: { kind: string; id: string; name: string };
      status?: string | null;
      changes: Record<string, unknown>;
      details: Record<string, unknown>;
    }[];
    const feature006 = activity.filter((entry) => 'status' in entry);
    expect(feature006.length).toBeGreaterThan(0);
    for (const entry of feature006) {
      expect(JSON.stringify(entry.details)).not.toMatch(/amount/);
      expect(JSON.stringify(entry.changes)).not.toMatch(/amount/);
      expect(entry.target.name).toBe('Lake House');
    }
    const stageReversal = activity.find((entry) => entry.action === 'REVERSED' && entry.target.kind === 'client_receipt');
    expect(stageReversal).toMatchObject({ status: 'REVERSED' });
    const feature003 = activity.filter((entry) => entry.target.kind === 'client_advance' && !('status' in entry));
    expect(feature003.map((e) => e.action).sort()).toEqual(['CREATED', 'REVERSED']);
    for (const entry of feature003) {
      expect(Object.keys(entry).sort()).toEqual(['action', 'changes', 'created_at', 'created_by', 'details', 'id', 'target']);
      expect(entry.details).toHaveProperty('amount');
    }
    expect(stage.id).not.toBe(legacyRoute.id);
  });

  it('reads the history of a non-Advance receipt by client_advance_id, and never rewrites entries', async () => {
    const { admin, project, asOffice, asAccountant } = await setup();
    const { stage } = await exercise(project, asOffice, asAccountant, admin.id);
    const before = await prisma.historyEntry.findMany({ orderBy: { id: 'asc' } });
    const history = (await asOffice.client.get('/api/history').query({ client_advance_id: stage.id })).body;
    expect(history.entries.map((e: { action: string }) => e.action)).toEqual(['REVERSED', 'VERIFIED', 'CREATED']);
    await asAccountant.client.get('/api/dashboard/overview');
    await asOffice.client.get(`/api/projects/${project.id}/client-finance/history`);
    expect(await prisma.historyEntry.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('records attach, removal and supersede events on the document (FR-042c F4)', async () => {
    const { admin, project, asOffice } = await setup();
    const quotation = (await asOffice.client.post(`/api/projects/${project.id}/quotation`).send({ title: 'Works', amount: '100.00', quotation_date: dayOffset(-1) })).body;
    const revisionId = quotation.revisions[0].id;
    const a = await createProjectDocument(admin.id, { projectId: project.id });
    const b = await createProjectDocument(admin.id, { projectId: project.id });
    const first = (await asOffice.client.post('/api/financial-attachments').send({ record: { kind: 'revision', id: revisionId }, document_id: a.id })).body;
    await asOffice.client.post('/api/financial-attachments').send({ record: { kind: 'revision', id: revisionId }, document_id: b.id, supersedes_attachment_id: first.id, supersede_reason: 'Corrected' });
    const docHistory = (await asOffice.client.get('/api/history').query({ document_id: a.id })).body;
    expect(docHistory.entries.map((e: { action: string }) => e.action)).toEqual(['SUPERSEDED', 'ATTACHED']);
  });
});
