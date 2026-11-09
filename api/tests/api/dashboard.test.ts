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
    // Feature 004 adds `items` and `attention_projects` (supersession of Feature 002 FR-023, spec.md Backward
    // Compatibility). The Feature 002 keys are unchanged, and nothing else is added.
    expect(Object.keys(dashboard.body).sort()).toEqual(['attention_projects', 'due_soon', 'items', 'missing_update', 'overdue', 'recent_delays_and_issues', 'today']);
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

// Feature 004 US6: deadline groups and the projects needing attention, added beside the Feature 002 lists.
describe('dashboard items and attention projects (Feature 004 US6)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  type Item = { name: string; group: string | null; days_overdue: number | null; status: string; last_update_on: string | null; project: { name: string }; responsible: { kind: string; label: string } };

  it('lists every open item on active projects with its group, and leaves out done and archived ones (US6-1 to US6-6, FR-018)', async () => {
    const { admin, session, vendor } = await setup();
    const lake = await createProject(admin.id, 'Lake House');
    await linkVendor(admin.id, vendor.id, lake.id);
    const old = await createProject(admin.id, 'Old Office');
    const add = (name: string, days: number, extra: Record<string, unknown> = {}) =>
      createTimelineItem(admin.id, { projectId: lake.id, name, deadline: dayOffset(days), ...extra });
    await add('Yesterday', -1, { responsibleVendorId: vendor.id });
    await add('Today', 0, { responsibleKind: 'FIRM_TEAM' });
    await add('In three days', 3);
    await add('In seven days', 7);
    await add('In eight days', 8);
    await add('In twenty days', 20);
    await add('In thirty days', 30);
    await add('In ninety days', 90);
    const started = await add('Started', 5);
    await insertProgressUpdate({ itemId: started.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-2)) });
    const done = await add('Done', -4);
    await insertProgressUpdate({ itemId: done.id, status: 'DONE', actorId: admin.id });
    await add('Archived item', -2, { archived: true });
    await createTimelineItem(admin.id, { projectId: old.id, name: 'On archived project', deadline: dayOffset(-1) });
    await prisma.project.update({ where: { id: old.id }, data: { archived: true } });

    const response = await session.client.get('/api/dashboard');
    expect(response.status).toBe(200);
    const items = response.body.items as Item[];
    const groups = Object.fromEntries(items.map((item) => [item.name, item.group]));
    expect(groups).toEqual({
      Yesterday: 'OVERDUE',
      Today: 'DUE_TODAY',
      'In three days': 'COMING_SOON',
      'In seven days': 'COMING_SOON',
      Started: 'COMING_SOON',
      'In eight days': 'UPCOMING',
      'In twenty days': 'UPCOMING',
      'In thirty days': 'UPCOMING',
      'In ninety days': null,
    });
    // Earliest deadline first.
    expect(items[0].name).toBe('Yesterday');
    const yesterday = items.find((item) => item.name === 'Yesterday')!;
    expect(yesterday).toMatchObject({ days_overdue: 1, status: 'NOT_STARTED', last_update_on: null, project: { name: 'Lake House' }, responsible: { kind: 'VENDOR', label: 'Sharma Interiors' } });
    expect(items.find((item) => item.name === 'Today')!.responsible).toMatchObject({ kind: 'FIRM_TEAM', label: 'Firm team' });
    expect(items.find((item) => item.name === 'In three days')!.responsible).toMatchObject({ kind: 'NONE', label: 'None' });
    expect(items.find((item) => item.name === 'Started')).toMatchObject({ status: 'IN_PROGRESS', last_update_on: dayOffset(-2), days_overdue: null });
  });

  it('lists the projects needing attention once each, Delayed first, then by overdue items (US6-17 to US6-19, FR-023a)', async () => {
    const { admin, session } = await setup();
    const make = async (name: string, status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE', days: number | null = null) => {
      const project = await createProject(admin.id, name, status);
      if (days !== null) await prisma.project.update({ where: { id: project.id }, data: { expectedCompletionDate: new Date(`${dayOffset(days)}T00:00:00Z`) } });
      return project;
    };
    const late = await make('Late Project', 'ACTIVE', -1);
    const lateWithItems = await make('Late With Items', 'ACTIVE', -3);
    const twoOverdue = await make('Two Overdue');
    const oneOverdue = await make('One Overdue');
    const calm = await make('Calm Project', 'ACTIVE', 10);
    const finished = await make('Finished', 'COMPLETED', -10);
    const archived = await make('Archived Late', 'ACTIVE', -2);
    for (const [project, count] of [[lateWithItems, 1], [twoOverdue, 2], [oneOverdue, 1], [finished, 2], [archived, 1]] as const) {
      for (let index = 0; index < count; index += 1) {
        await createTimelineItem(admin.id, { projectId: project.id, name: `Late ${index}`, deadline: dayOffset(-1 - index) });
      }
    }
    await createTimelineItem(admin.id, { projectId: calm.id, name: 'Fine', deadline: dayOffset(5) });
    await prisma.project.update({ where: { id: archived.id }, data: { archived: true } });

    const attention = (await session.client.get('/api/dashboard')).body.attention_projects;
    expect(attention.map((row: { name: string }) => row.name)).toEqual(['Late With Items', 'Late Project', 'Two Overdue', 'One Overdue']);
    expect(attention[0]).toMatchObject({
      id: lateWithItems.id,
      health: 'DELAYED',
      overdue_count: 1,
      progress: { done: 0, total: 1 },
      reasons: [{ type: 'PAST_EXPECTED_COMPLETION' }, { type: 'OVERDUE_ITEMS', count: 1 }],
    });
    expect(attention[1]).toMatchObject({ id: late.id, health: 'DELAYED', reasons: [{ type: 'PAST_EXPECTED_COMPLETION' }] });
    expect(attention[2]).toMatchObject({ health: 'ONGOING', reasons: [{ type: 'OVERDUE_ITEMS', count: 2 }] });
  });

  it('keeps the Feature 002 lists unchanged beside the new keys (US6-12, US6-13, FR-022)', async () => {
    const { admin, session, vendor } = await setup();
    const lake = await createProject(admin.id, 'Lake House');
    await linkVendor(admin.id, vendor.id, lake.id);
    await createTimelineItem(admin.id, { projectId: lake.id, name: 'Late', deadline: dayOffset(-2), responsibleVendorId: vendor.id });
    await createTimelineItem(admin.id, { projectId: lake.id, name: 'Today', deadline: dayOffset(0) });
    const stale = await createTimelineItem(admin.id, { projectId: lake.id, name: 'Stale', deadline: dayOffset(20) });
    await insertProgressUpdate({ itemId: stale.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: indiaNoon(dayOffset(-9)) });

    const body = (await session.client.get('/api/dashboard')).body;
    expect(Object.keys(body).sort()).toEqual(['attention_projects', 'due_soon', 'items', 'missing_update', 'overdue', 'recent_delays_and_issues', 'today']);
    expect(itemNames(body.overdue)).toEqual(['Lake House/Late']);
    expect(body.overdue[0]).toMatchObject({ days_overdue: 2, responsible_label: 'Sharma Interiors' });
    // Feature 002 Due soon still includes the item due today; the new Due today group is separate.
    expect(itemNames(body.due_soon)).toEqual(['Lake House/Today']);
    expect(itemNames(body.missing_update)).toEqual(['Lake House/Stale']);
  });

  it('is the same for every role, and refuses a signed-out caller (US6-16, SC-008)', async () => {
    const { admin, session } = await setup();
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
    const lake = await createProject(admin.id, 'Lake House');
    await prisma.project.update({ where: { id: lake.id }, data: { expectedCompletionDate: new Date(`${dayOffset(-1)}T00:00:00Z`) } });
    await createTimelineItem(admin.id, { projectId: lake.id, name: 'Late', deadline: dayOffset(-2) });

    const asAdmin = (await session.client.get('/api/dashboard')).body;
    for (const email of ['office@example.com', 'accountant@example.com']) {
      const other = (await (await signIn(email)).client.get('/api/dashboard')).body;
      expect(other.items, email).toEqual(asAdmin.items);
      expect(other.attention_projects, email).toEqual(asAdmin.attention_projects);
    }
    const signedOut = await request(app).get('/api/dashboard');
    expect(signedOut.status).toBe(401);
    expect(signedOut.body.items).toBeUndefined();
  });
});
