import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { addDays, currentMonthInIndia, todayInIndia } from '../../src/lib/india-date';
import { app, createAdvance, createCategory, createProject, createUser, createVendor, monthOffset, resetDatabase, reverseAdvance, signIn } from '../helpers';

type Session = Awaited<ReturnType<typeof signIn>>;

function monthName(label: string): string {
  const [year, month] = label.split('-').map(Number);
  return `${new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${year}`;
}

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const category = await createCategory(admin.id, 'Tiles');

  for (const [name, phone] of [['Sharma Interiors', '9000000501'], ['Patel Tiles', '9000000502'], ['Rao Electricals', '9000000503']]) {
    await createVendor(admin.id, { name, phone, categoryId: category.id });
  }
  const gone = await createVendor(admin.id, { name: 'Old Vendor', phone: '9000000504', categoryId: category.id });
  await prisma.vendor.update({ where: { id: gone.id }, data: { archived: true } });

  const planned = await createProject(admin.id, 'Planned Villa', 'PLANNED');
  const kapoor = await createProject(admin.id, 'Kapoor Residence', 'ACTIVE');
  const lake = await createProject(admin.id, 'Lake House', 'ACTIVE');
  const done = await createProject(admin.id, 'Done Flat', 'COMPLETED');
  const archivedActive = await createProject(admin.id, 'Archived Active', 'ACTIVE');
  const archivedHold = await createProject(admin.id, 'Archived Hold', 'ON_HOLD');
  await prisma.project.updateMany({ where: { id: { in: [archivedActive.id, archivedHold.id] } }, data: { archived: true } });

  const month = currentMonthInIndia();
  // Two advances in this IST month (one on an archived project), one last month, and one on the last day of last month.
  const thisMonth = await createAdvance({ projectId: kapoor.id, amount: '100000.00', receivedOn: todayInIndia(), actorId: admin.id });
  const monthStart = await createAdvance({ projectId: archivedActive.id, amount: '25000.50', receivedOn: month.start, actorId: admin.id });
  const lastMonth = await createAdvance({ projectId: lake.id, amount: '40000.00', receivedOn: monthOffset(-1), actorId: admin.id });
  const lastDayBefore = await createAdvance({ projectId: done.id, amount: '1000.00', receivedOn: addDays(month.start, -1), actorId: admin.id });

  return {
    admin,
    projects: { planned, kapoor, lake, done, archivedActive, archivedHold },
    advances: { thisMonth, monthStart, lastMonth, lastDayBefore },
    asAdmin: await signIn('admin@example.com'),
    asAccountant: await signIn('accountant@example.com'),
    asOffice: await signIn('office@example.com'),
  };
}

function summary(session: Session) {
  return session.client.get('/api/dashboard/summary');
}

function advanceList(session: Session, scope: string) {
  return session.client.get('/api/client-advances').query({ scope });
}

describe('dashboard summary tiles (US4)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('counts non-archived vendors and non-archived projects in each status, filling empty statuses with 0 (US4-1, US4-2, FR-023)', async () => {
    const { asAdmin } = await setup();
    const response = await summary(asAdmin);
    expect(response.status).toBe(200);
    expect(response.body.vendors).toEqual({ active: 3 });
    expect(response.body.projects).toEqual({ PLANNED: 1, ACTIVE: 2, ON_HOLD: 0, COMPLETED: 1 });
  });

  it('sums unreversed advances on all projects, archived included, and those received in the IST month (US4-3, FR-024)', async () => {
    const { asAdmin } = await setup();
    const month = currentMonthInIndia();
    const response = await summary(asAdmin);
    expect(response.body.client_advances).toEqual({
      standing_total: '166000.50',
      received_this_month: '125000.50',
      month: month.label,
      labels: {
        standing_total: 'Client advances received and not reversed, all projects',
        received_this_month: `Client advances received in ${monthName(month.label)} and not reversed`,
      },
    });
    expect(response.body.client_advances.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('counts a reversal against the month the advance was received (US4-7, US4-8)', async () => {
    const { admin, advances, asAdmin } = await setup();
    await reverseAdvance({ advanceId: advances.lastMonth.id, reason: 'Wrong project.', actorId: admin.id });
    let figures = (await summary(asAdmin)).body.client_advances;
    expect(figures.standing_total).toBe('126000.50');
    expect(figures.received_this_month).toBe('125000.50');

    await reverseAdvance({ advanceId: advances.thisMonth.id, reason: 'Keyed twice.', actorId: admin.id });
    figures = (await summary(asAdmin)).body.client_advances;
    expect(figures.standing_total).toBe('26000.50');
    expect(figures.received_this_month).toBe('25000.50');
  });

  it('includes an advance recorded through the API as soon as it is saved (US4-5, FR-026)', async () => {
    const { projects, asAccountant } = await setup();
    const recorded = await asAccountant.client
      .post(`/api/projects/${projects.planned.id}/client-advances`)
      .send({ amount: '500.25', received_on: todayInIndia() });
    expect(recorded.status).toBe(201);
    const figures = (await summary(asAccountant)).body.client_advances;
    expect(figures.standing_total).toBe('166500.75');
    expect(figures.received_this_month).toBe('125500.75');
  });

  it('gives Administrators, Accountants, and the Office Team identical bodies, and refuses signed-out and revoked people (US4-4, FR-025)', async () => {
    const { asAdmin, asAccountant, asOffice } = await setup();
    const bodies = [await summary(asAdmin), await summary(asAccountant), await summary(asOffice)].map((response) => {
      expect(response.status).toBe(200);
      return response.body;
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(bodies[0].client_advances).toBeDefined();

    const anonymous = await request(app).get('/api/dashboard/summary');
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toMatch(/\d+\.\d{2}/);
    await prisma.staffUser.update({ where: { email: 'office@example.com' }, data: { revokedAt: new Date() } });
    const revoked = await summary(asOffice);
    expect(revoked.status).toBe(401);
    expect(JSON.stringify(revoked.body)).not.toMatch(/\d+\.\d{2}/);
  });

  it('shows zero on every tile when there is nothing yet', async () => {
    await createUser({ email: 'admin@example.com' });
    const response = await summary(await signIn('admin@example.com'));
    expect(response.body.vendors).toEqual({ active: 0 });
    expect(response.body.projects).toEqual({ PLANNED: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0 });
    expect(response.body.client_advances.standing_total).toBe('0.00');
    expect(response.body.client_advances.received_this_month).toBe('0.00');
  });
});

describe('lists behind the tiles (US4-6, FR-026)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lists exactly the unreversed advances behind each money tile, newest received first, with the project', async () => {
    const { admin, projects, advances, asOffice } = await setup();
    await reverseAdvance({ advanceId: advances.lastMonth.id, reason: 'Wrong project.', actorId: admin.id });

    // Newest received_on first; on the 1st of a month both current-month advances share a date, and the later-recorded one leads.
    const current = todayInIndia() === currentMonthInIndia().start
      ? [advances.monthStart.id, advances.thisMonth.id]
      : [advances.thisMonth.id, advances.monthStart.id];

    const all = await advanceList(asOffice, 'all');
    expect(all.status).toBe(200);
    expect(all.body.map((a: { id: string }) => a.id)).toEqual([...current, advances.lastDayBefore.id]);
    const onArchived = all.body.find((a: { id: string }) => a.id === advances.monthStart.id);
    expect(onArchived).toMatchObject({
      amount: '25000.50',
      received_on: currentMonthInIndia().start,
      reversal: null,
      created_by: { id: admin.id, name: 'Asha Admin' },
      project: { id: projects.archivedActive.id, name: 'Archived Active', client_name: null, archived: true },
    });

    const month = await advanceList(asOffice, 'month');
    expect(month.status).toBe(200);
    expect(month.body.map((a: { id: string }) => a.id)).toEqual(current);

    const total = (body: { amount: string }[]) => body.reduce((sum, a) => sum + Math.round(Number(a.amount) * 100), 0) / 100;
    const tiles = (await summary(asOffice)).body.client_advances;
    expect(total(all.body).toFixed(2)).toBe(tiles.standing_total);
    expect(total(month.body).toFixed(2)).toBe(tiles.received_this_month);
  });

  it('refuses an unknown scope and a signed-out person', async () => {
    const { asAdmin } = await setup();
    expect((await advanceList(asAdmin, 'year')).status).toBe(400);
    expect((await request(app).get('/api/client-advances').query({ scope: 'all' })).status).toBe(401);
  });

  it('filters GET /projects by status, keeps the archived filter, and leaves the unfiltered list unchanged', async () => {
    const { asAdmin } = await setup();
    const names = (body: { name: string }[]) => body.map((p) => p.name);

    const active = await asAdmin.client.get('/api/projects').query({ status: 'ACTIVE' });
    expect(active.status).toBe(200);
    expect(names(active.body)).toEqual(['Kapoor Residence', 'Lake House']);

    const withArchived = await asAdmin.client.get('/api/projects').query({ status: 'ACTIVE', include_archived: 'true' });
    expect(names(withArchived.body)).toEqual(['Archived Active', 'Kapoor Residence', 'Lake House']);

    expect(names((await asAdmin.client.get('/api/projects')).body)).toEqual(['Done Flat', 'Kapoor Residence', 'Lake House', 'Planned Villa']);
    expect((await asAdmin.client.get('/api/projects').query({ status: 'CANCELLED' })).status).toBe(400);
  });

  it('leaves the Feature 002 GET /dashboard response unchanged', async () => {
    const { asAdmin } = await setup();
    const response = await asAdmin.client.get('/api/dashboard');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['due_soon', 'missing_update', 'overdue', 'recent_delays_and_issues', 'today']);
  });
});
