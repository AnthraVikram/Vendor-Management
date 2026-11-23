import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createProject, createUser, dayOffset, resetDatabase, resetFileStorage, signIn } from '../helpers';

// US3 (T039): one quotation per project, strictly sequential revisions with their own statuses (FR-022 to FR-025a).
type Session = Awaited<ReturnType<typeof signIn>>;

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  await createUser({ email: 'office2@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
  const project = await createProject(admin.id, 'Lake House');
  return {
    office,
    project,
    asAdmin: await signIn('admin@example.com'),
    asOffice: await signIn('office@example.com'),
    asOffice2: await signIn('office2@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

const create = (session: Session, projectId: string, body: Record<string, unknown> = {}) =>
  session.client.post(`/api/projects/${projectId}/quotation`).send({ title: 'Interior works', amount: '1840000.00', quotation_date: dayOffset(-1), ...body });
const revise = (session: Session, quotationId: string, body: Record<string, unknown> = {}) =>
  session.client.post(`/api/quotations/${quotationId}/revisions`).send({ amount: '1910000.00', quotation_date: dayOffset(-1), reason: 'Scope grew', ...body });
const status = (session: Session, revisionId: string, body: Record<string, unknown>) => session.client.post(`/api/quotation-revisions/${revisionId}/status`).send(body);

async function revisionIds(quotationId: string) {
  return (await prisma.quotationRevision.findMany({ where: { clientQuotationId: quotationId }, orderBy: { number: 'asc' } })).map((r) => r.id);
}

describe('US3: client quotations and revisions', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('creates the quotation with a generated reference and revision 1 in Draft, and refuses a second (US3-1, US3-36, US3-39)', async () => {
    const { project, office, asOffice } = await setup();
    const response = await create(asOffice, project.id);
    expect(response.status).toBe(201);
    expect(response.body.reference).toMatch(/^Q-\d{6}$/);
    expect(response.body.revisions).toEqual([expect.objectContaining({ number: 1, status: 'DRAFT', amount: '1840000.00', newest: true, created_by: expect.objectContaining({ id: office.id }) })]);
    const second = await create(asOffice, project.id);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('QUOTATION_EXISTS');
    const entries = await prisma.historyEntry.findMany({ where: { clientQuotationId: response.body.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => [e.action, (e.details as { record_status: string }).record_status])).toEqual([
      ['CREATED', 'DRAFT'],
      ['REVISION_ADDED', 'DRAFT'],
    ]);
  });

  it('validates the title, a positive amount and a quotation date not in the future (FR-022, FR-004)', async () => {
    const { project, asOffice } = await setup();
    for (const [body, field] of [
      [{ title: '' }, 'title'],
      [{ title: 'x'.repeat(201) }, 'title'],
      [{ amount: '0' }, 'amount'],
      [{ quotation_date: dayOffset(1) }, 'quotation_date'],
    ] as const) {
      const response = await create(asOffice, project.id, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.fields[field]).toBeTruthy();
    }
  });

  it('refuses a new revision while one is Draft, Submitted or Under review, naming it (US3-7 to US3-9, SC-006)', async () => {
    const { project, asOffice, asAccountant } = await setup();
    const quotation = (await create(asOffice, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    for (const [label, step] of [
      ['Draft', null],
      ['Submitted', { to: 'SUBMITTED', expected_status: 'DRAFT' }],
      ['Under review', { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' }],
    ] as const) {
      if (step) expect((await status(asAccountant, r1, step)).status).toBe(200);
      const refused = await revise(asOffice, quotation.id, { expected_newest_revision: 1 });
      expect(refused.status, label).toBe(409);
      expect(refused.body.code).toBe('REVISION_ACTIVE');
      expect(refused.body.message).toContain(`Revision 1 is ${label}`);
    }
    expect(await prisma.quotationRevision.count()).toBe(1);
  });

  it('adds a numbered Draft revision with a reason once the newest is final, leaving earlier revisions unchanged (US3-2, US3-3, US3-10 to US3-12)', async () => {
    const { project, asOffice, asAccountant } = await setup();
    const quotation = (await create(asOffice, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    await status(asAccountant, r1, { to: 'SUBMITTED', expected_status: 'DRAFT' });
    await status(asAccountant, r1, { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' });
    expect((await status(asAccountant, r1, { to: 'REJECTED', expected_status: 'UNDER_REVIEW' })).status).toBe(400);
    expect((await status(asAccountant, r1, { to: 'REJECTED', expected_status: 'UNDER_REVIEW', reason: 'Too high' })).status).toBe(200);
    const before = await prisma.quotationRevision.findUniqueOrThrow({ where: { id: r1 } });
    expect((await revise(asOffice, quotation.id, { reason: '', expected_newest_revision: 1 })).status).toBe(400);
    const added = await revise(asOffice, quotation.id, { expected_newest_revision: 1 });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ number: 2, status: 'DRAFT', previous_amount: '1840000.00', amount: '1910000.00', reason: 'Scope grew' });
    expect(await prisma.quotationRevision.findUniqueOrThrow({ where: { id: r1 } })).toEqual(before);
    const view = (await asOffice.client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(view.quotation.revisions.map((r: { number: number; status: string; newest: boolean }) => [r.number, r.status, r.newest])).toEqual([
      [1, 'REJECTED', false],
      [2, 'DRAFT', true],
    ]);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { clientQuotationId: quotation.id, action: 'REVISION_ADDED', details: { path: ['revision_number'], equals: 2 } } });
    expect(entry.details).toMatchObject({ previous_amount: '1840000.00', amount: '1910000.00', reason: 'Scope grew', record_status: 'DRAFT' });
  });

  it('applies the transition table: roles, reasons, Draft ownership and no other change (US3-4, US3-13 to US3-17, US4-5, US4-6)', async () => {
    const { project, asOffice, asOffice2, asAccountant } = await setup();
    const quotation = (await create(asOffice, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    expect((await status(asOffice2, r1, { to: 'WITHDRAWN', reason: 'x', expected_status: 'DRAFT' })).status).toBe(403);
    expect((await status(asOffice, r1, { to: 'WITHDRAWN', expected_status: 'DRAFT' })).status).toBe(400);
    const approve = await status(asAccountant, r1, { to: 'APPROVED', expected_status: 'DRAFT' });
    expect(approve.status).toBe(409);
    expect(approve.body.code).toBe('INVALID_TRANSITION');
    expect(approve.body.message).toMatch(/draft/i);
    const withdrawn = await status(asOffice, r1, { to: 'WITHDRAWN', reason: 'Wrong amount', expected_status: 'DRAFT' });
    expect(withdrawn.body).toMatchObject({ status: 'WITHDRAWN' });
    expect((await status(asAccountant, r1, { to: 'SUBMITTED', expected_status: 'WITHDRAWN' })).body.code).toBe('INVALID_TRANSITION');

    const r2 = (await revise(asOffice, quotation.id, { expected_newest_revision: 1 })).body.id;
    expect((await status(asOffice, r2, { to: 'SUBMITTED', expected_status: 'DRAFT' })).status).toBe(200);
    expect((await status(asOffice, r2, { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' })).status).toBe(403);
    expect((await status(asOffice, r2, { to: 'WITHDRAWN', reason: 'x', expected_status: 'SUBMITTED' })).status).toBe(403);
    expect((await status(asAccountant, r2, { to: 'WITHDRAWN', reason: 'Client asked', expected_status: 'SUBMITTED' })).body.status).toBe('WITHDRAWN');

    const r3 = (await revise(asOffice, quotation.id, { expected_newest_revision: 2 })).body.id;
    await status(asOffice, r3, { to: 'SUBMITTED', expected_status: 'DRAFT' });
    await status(asAccountant, r3, { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' });
    expect((await status(asAccountant, r3, { to: 'WITHDRAWN', reason: 'x', expected_status: 'UNDER_REVIEW' })).body.code).toBe('INVALID_TRANSITION');
    expect((await status(asOffice, r3, { to: 'REJECTED', reason: 'x', expected_status: 'UNDER_REVIEW' })).status).toBe(403);
    const changes = await prisma.quotationStatusChange.findMany({ where: { quotationRevisionId: r2 }, orderBy: { createdAt: 'asc' } });
    expect(changes.map((c) => [c.fromStatus, c.toStatus, c.reason])).toEqual([
      ['DRAFT', 'SUBMITTED', null],
      ['SUBMITTED', 'WITHDRAWN', 'Client asked'],
    ]);
    const view = (await asOffice.client.get(`/api/projects/${project.id}/client-finance`)).body;
    expect(view.quotation.revisions[1].submitted_at).toBeTruthy();
  });

  it('lets a reviewer withdraw any Draft and refuses Office Team on another person’s Draft (US3-16)', async () => {
    const { project, asAccountant, asOffice } = await setup();
    const quotation = (await create(asAccountant, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    expect((await status(asOffice, r1, { to: 'WITHDRAWN', reason: 'x', expected_status: 'DRAFT' })).status).toBe(403);
    expect((await status(asAccountant, r1, { to: 'WITHDRAWN', reason: 'Redo', expected_status: 'DRAFT' })).status).toBe(200);
  });

  it('refuses a stale request and lets only one of two simultaneous revisions through, numbered without gaps (US3-6, FR-007)', async () => {
    const { project, asOffice, asAccountant } = await setup();
    const quotation = (await create(asOffice, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    const stale = await status(asAccountant, r1, { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' });
    expect(stale.body.code).toBe('STALE');
    await status(asOffice, r1, { to: 'WITHDRAWN', reason: 'Redo', expected_status: 'DRAFT' });
    const results = await Promise.all([revise(asOffice, quotation.id, { expected_newest_revision: 1 }), revise(asAccountant, quotation.id, { expected_newest_revision: 1 })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await prisma.quotationRevision.findMany({ orderBy: { number: 'asc' } })).map((r) => r.number)).toEqual([1, 2]);
    expect((await revise(asOffice, quotation.id, { expected_newest_revision: 1 })).body.code).toMatch(/STALE|REVISION_ACTIVE/);
  });

  it('offers no route that edits or deletes a revision, Draft included (US3-5, OQ-9)', async () => {
    const { project, asAdmin } = await setup();
    const quotation = (await create(asAdmin, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    for (const method of ['put', 'patch', 'delete'] as const) {
      expect((await asAdmin.client[method](`/api/quotation-revisions/${r1}`).send({ amount: '1.00' })).status).toBe(404);
      expect((await asAdmin.client[method](`/api/quotations/${quotation.id}`).send({ title: 'x' })).status).toBe(404);
    }
  });

  it('refuses every quotation action on an archived project (US3-37)', async () => {
    const { project, asOffice, asAccountant } = await setup();
    const quotation = (await create(asOffice, project.id)).body;
    const [r1] = await revisionIds(quotation.id);
    await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
    expect((await status(asOffice, r1, { to: 'SUBMITTED', expected_status: 'DRAFT' })).body.code).toBe('PROJECT_ARCHIVED');
    expect((await status(asAccountant, r1, { to: 'WITHDRAWN', reason: 'x', expected_status: 'DRAFT' })).body.code).toBe('PROJECT_ARCHIVED');
    const other = await prisma.project.create({ data: { name: 'Old', status: 'ACTIVE', archived: true, createdById: (await prisma.staffUser.findFirstOrThrow()).id, updatedById: (await prisma.staffUser.findFirstOrThrow()).id } });
    expect((await create(asOffice, other.id)).body.code).toBe('PROJECT_ARCHIVED');
  });
});
