import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  createCategory,
  createProject,
  createTimelineItem,
  createUser,
  createVendor,
  dayOffset,
  indiaNoon,
  insertProgressUpdate,
  linkVendor,
  resetDatabase,
  signIn,
} from '../helpers';
import { prisma } from '../../src/db';

type Entry = { project: { id: string; name: string }; item: { id: string; name: string } | null; responsible_label: string };

async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  const session = await signIn('admin@example.com');
  const category = await createCategory(admin.id, 'Carpentry');
  const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000401', categoryId: category.id });
  return { admin, session, vendor };
}

function itemNames(entries: Entry[]): string[] {
  return entries.map((entry) => `${entry.project.name}/${entry.item?.name ?? '-'}`);
}

describe('dashboard', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lists overdue items across non-archived projects, most overdue first, with project and responsible party (US5-1, US5-4)', async () => {
    const { admin, session, vendor } = await setup();
    const lake = await createProject(admin.id, 'Lake House');
    const studio = await createProject(admin.id, 'Studio', 'COMPLETED');
    const annex = await createProject(admin.id, 'Annex', 'ON_HOLD');
    const planned = await createProject(admin.id, 'Planned Villa', 'PLANNED');
    const shelvedProject = await createProject(admin.id, 'Shelved Project');
    await linkVendor(admin.id, vendor.id, lake.id);
    await createTimelineItem(admin.id, { projectId: lake.id, name: 'Joinery', deadline: dayOffset(-2), responsibleVendorId: vendor.id });
    await createTimelineItem(admin.id, { projectId: studio.id, name: 'Lights', deadline: dayOffset(-5), responsibleKind: 'FIRM_TEAM' });
    await createTimelineItem(admin.id, { projectId: annex.id, name: 'Paint', deadline: dayOffset(-1) });
    await createTimelineItem(admin.id, { projectId: planned.id, name: 'Survey', deadline: dayOffset(-3) });
    await createTimelineItem(admin.id, { projectId: lake.id, name: 'Shelved item', deadline: dayOffset(-9), archived: true });
    await createTimelineItem(admin.id, { projectId: shelvedProject.id, name: 'Hidden', deadline: dayOffset(-9) });
    await prisma.project.update({ where: { id: shelvedProject.id }, data: { archived: true } });

    const dashboard = await session.client.get('/api/dashboard');
    expect(dashboard.status).toBe(200);
    expect(itemNames(dashboard.body.overdue)).toEqual(['Studio/Lights', 'Planned Villa/Survey', 'Lake House/Joinery', 'Annex/Paint']);
    expect(dashboard.body.overdue[0]).toMatchObject({ responsible_label: 'Firm team', deadline: dayOffset(-5), days_overdue: 5 });
    expect(dashboard.body.overdue[2]).toMatchObject({ responsible_label: 'Sharma Interiors', days_overdue: 2 });
    expect(dashboard.body.overdue[3].responsible_label).toBe('None');
    const everything = JSON.stringify(dashboard.body);
    expect(everything).not.toContain('Hidden');
    expect(everything).not.toContain('Shelved item');
  });

  it('puts Due soon and Missing update items in their own lists, and a two-flag item in both (US5-2, US5-7)', async () => {
    const { admin, session } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    await createTimelineItem(admin.id, { projectId: project.id, name: 'Soon B', deadline: dayOffset(5) });
    await createTimelineItem(admin.id, { projectId: project.id, name: 'Soon A', deadline: dayOffset(1) });
    const stale = await createTimelineItem(admin.id, { projectId: project.id, name: 'Stale', deadline: dayOffset(30) });
    await insertProgressUpdate({ itemId: stale.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-10)) });
    const both = await createTimelineItem(admin.id, { projectId: project.id, name: 'Late and stale', deadline: dayOffset(-2) });
    await insertProgressUpdate({ itemId: both.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-8)) });

    const dashboard = await session.client.get('/api/dashboard');
    expect(itemNames(dashboard.body.due_soon)).toEqual(['Lake House/Soon A', 'Lake House/Soon B']);
    expect(dashboard.body.due_soon[0]).toMatchObject({ deadline: dayOffset(1) });
    expect(itemNames(dashboard.body.missing_update)).toEqual(['Lake House/Stale', 'Lake House/Late and stale']);
    expect(dashboard.body.missing_update[0]).toMatchObject({ last_update_on: dayOffset(-10) });
    expect(itemNames(dashboard.body.overdue)).toEqual(['Lake House/Late and stale']);
  });

  it('shows the 10 most recent delays and issues, newest first, leaving out archived projects and items (US5-3, US5-4)', async () => {
    const { admin, session } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const shelvedProject = await createProject(admin.id, 'Shelved Project');
    const item = await createTimelineItem(admin.id, { projectId: project.id, name: 'Joinery', deadline: dayOffset(4), responsibleKind: 'FIRM_TEAM' });
    const shelvedItem = await createTimelineItem(admin.id, { projectId: project.id, name: 'Shelved item', deadline: dayOffset(4), archived: true });
    const stamp = { createdById: admin.id, updatedById: admin.id };
    const base = Date.UTC(2026, 9, 1, 6, 0);
    for (let index = 0; index < 6; index += 1) {
      await prisma.delay.create({
        data: { projectId: project.id, timelineItemId: index === 0 ? item.id : null, reason: `Delay ${index}`, createdAt: new Date(base + index * 120_000), ...stamp },
      });
      await prisma.coordinationIssue.create({
        data: { projectId: project.id, description: `Issue ${index}`, createdAt: new Date(base + index * 120_000 + 60_000), ...stamp },
      });
    }
    await prisma.delay.create({ data: { projectId: project.id, timelineItemId: shelvedItem.id, reason: 'On a shelved item', createdAt: new Date(base + 999_000), ...stamp } });
    await prisma.delay.create({ data: { projectId: shelvedProject.id, reason: 'On a shelved project', createdAt: new Date(base + 999_000), ...stamp } });
    await prisma.project.update({ where: { id: shelvedProject.id }, data: { archived: true } });

    const dashboard = await session.client.get('/api/dashboard');
    const recent = dashboard.body.recent_delays_and_issues as (Entry & { kind: string; text: string })[];
    expect(recent).toHaveLength(10);
    expect(recent.map((entry) => entry.text)).toEqual([
      'Issue 5', 'Delay 5', 'Issue 4', 'Delay 4', 'Issue 3', 'Delay 3', 'Issue 2', 'Delay 2', 'Issue 1', 'Delay 1',
    ]);
    expect(recent[0]).toMatchObject({ kind: 'COORDINATION_ISSUE', project: { name: 'Lake House' }, item: null, responsible_label: 'None' });

    await prisma.delay.deleteMany({ where: { reason: { startsWith: 'Delay ' }, NOT: { reason: 'Delay 0' } } });
    await prisma.coordinationIssue.deleteMany();
    const fewer = await session.client.get('/api/dashboard');
    expect(fewer.body.recent_delays_and_issues).toHaveLength(1);
    expect(fewer.body.recent_delays_and_issues[0]).toMatchObject({
      kind: 'DELAY',
      text: 'Delay 0',
      item: { id: item.id, name: 'Joinery' },
      responsible_label: 'Firm team',
    });
  });

  it('returns four empty lists and no other figures when there is nothing to show (US5-5, FR-023)', async () => {
    const { session } = await setup();
    const dashboard = await session.client.get('/api/dashboard');
    expect(dashboard.status).toBe(200);
    expect(Object.keys(dashboard.body).sort()).toEqual(['due_soon', 'missing_update', 'overdue', 'recent_delays_and_issues', 'today']);
    expect(dashboard.body).toMatchObject({ overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [] });
  });

  it('is the same for every role and refuses signed-out or revoked people (FR-020, FR-024, SC-007)', async () => {
    const { admin, session } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    await createTimelineItem(admin.id, { projectId: project.id, name: 'Joinery', deadline: dayOffset(-1) });
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
    const office = await signIn('office@example.com');
    const accountant = await signIn('accountant@example.com');
    const views = await Promise.all([session, office, accountant].map((who) => who.client.get('/api/dashboard')));
    expect(views.map((view) => view.status)).toEqual([200, 200, 200]);
    expect(views[1].body).toEqual(views[0].body);
    expect(views[2].body).toEqual(views[0].body);
    expect((await session.client.get('/api/dashboard?project_id=x&vendor_id=y')).body).toEqual(views[0].body);

    const revoked = await createUser({ email: 'gone@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const revokedSession = await signIn('gone@example.com');
    await session.client.patch(`/api/staff/${revoked.id}`).send({ revoked: true });
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
    expect((await revokedSession.client.get('/api/dashboard')).status).toBe(401);
  });
});
