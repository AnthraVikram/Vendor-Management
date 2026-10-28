import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  createCategory,
  createProject,
  createUser,
  createVendor,
  dayOffset,
  linkVendor,
  resetDatabase,
  signIn,
} from '../helpers';
import { prisma } from '../../src/db';

async function setup() {
  const admin = await createUser({ email: 'admin@example.com' });
  const session = await signIn('admin@example.com');
  const category = await createCategory(admin.id, 'Carpentry');
  const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000101', categoryId: category.id });
  const project = await createProject(admin.id, 'Mehta Residence');
  await linkVendor(admin.id, vendor.id, project.id);
  return { admin, session, category, vendor, project };
}

describe('timeline items', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('saves milestones and activities, lists them by deadline, and leaves the vendor and link unchanged (US1-1, US1-2, US1-3, US1-10)', async () => {
    const { session, vendor, project } = await setup();
    const vendorBefore = await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } });
    const linkBefore = await prisma.vendorProjectLink.findFirstOrThrow({ where: { vendorId: vendor.id } });

    const milestone = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'MILESTONE', name: 'Handover', deadline: dayOffset(20) });
    expect(milestone.status).toBe(201);
    expect(milestone.body.status).toBe('NOT_STARTED');
    expect(milestone.body.responsible.label).toBe('No responsible party');

    const activity = await session.client.post(`/api/projects/${project.id}/timeline-items`).send({
      item_type: 'ACTIVITY',
      name: 'False ceiling, ground floor',
      planned_date: dayOffset(5),
      deadline: dayOffset(10),
      responsible: { kind: 'VENDOR', vendor_id: vendor.id },
    });
    expect(activity.status).toBe(201);
    expect(activity.body.responsible).toMatchObject({ kind: 'VENDOR', label: 'Sharma Interiors' });

    const firm = await session.client.post(`/api/projects/${project.id}/timeline-items`).send({
      item_type: 'ACTIVITY',
      name: 'Site measure',
      deadline: dayOffset(10),
      responsible: { kind: 'FIRM_TEAM' },
    });
    expect(firm.body.responsible.label).toBe('Firm team');

    const timeline = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.map((item: { name: string }) => item.name)).toEqual([
      'False ceiling, ground floor',
      'Site measure',
      'Handover',
    ]);
    expect(timeline.body.archived_items).toEqual([]);
    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).toEqual(vendorBefore);
    expect(await prisma.vendorProjectLink.findUniqueOrThrow({ where: { id: linkBefore.id } })).toEqual(linkBefore);
  });

  it('refuses an unlinked vendor and an archived vendor as responsible (US1-4)', async () => {
    const { admin, session, category, project } = await setup();
    const unlinked = await createVendor(admin.id, { name: 'Elsewhere', phone: '9000000102', categoryId: category.id });
    const archived = await createVendor(admin.id, { name: 'Retired', phone: '9000000103', categoryId: category.id });
    await linkVendor(admin.id, archived.id, project.id);
    await prisma.vendor.update({ where: { id: archived.id }, data: { archived: true } });

    const notLinked = await session.client.post(`/api/projects/${project.id}/timeline-items`).send({
      item_type: 'ACTIVITY',
      name: 'Tiling',
      deadline: dayOffset(3),
      responsible: { kind: 'VENDOR', vendor_id: unlinked.id },
    });
    expect(notLinked.status).toBe(409);
    expect(notLinked.body.code).toBe('VENDOR_NOT_LINKED');

    const isArchived = await session.client.post(`/api/projects/${project.id}/timeline-items`).send({
      item_type: 'ACTIVITY',
      name: 'Tiling',
      deadline: dayOffset(3),
      responsible: { kind: 'VENDOR', vendor_id: archived.id },
    });
    expect(isArchived.status).toBe(409);
    expect(isArchived.body.code).toBe('VENDOR_ARCHIVED');
    expect(await prisma.timelineItem.count()).toBe(0);
  });

  it('names every field problem in one response and saves nothing (US1-5)', async () => {
    const { session, project } = await setup();
    const several = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ planned_date: dayOffset(9), deadline: dayOffset(4) });
    expect(several.status).toBe(400);
    expect(Object.keys(several.body.fields).sort()).toEqual(['item_type', 'name', 'planned_date']);

    const noDeadline = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'MILESTONE', name: 'Handover' });
    expect(noDeadline.status).toBe(400);
    expect(noDeadline.body.fields).toHaveProperty('deadline');
    expect(await prisma.timelineItem.count()).toBe(0);
  });

  it('keeps every earlier date and responsible party readable with author and time (US1-6, SC-005)', async () => {
    const { session, vendor, project } = await setup();
    const created = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'ACTIVITY', name: 'Wiring', deadline: dayOffset(10) });
    const id = created.body.id as string;

    for (const offset of [12, 14, 16]) {
      expect((await session.client.patch(`/api/timeline-items/${id}`).send({ deadline: dayOffset(offset) })).status).toBe(200);
    }
    await session.client.patch(`/api/timeline-items/${id}`).send({ planned_date: dayOffset(2) });
    await session.client.patch(`/api/timeline-items/${id}`).send({ planned_date: dayOffset(3) });
    await session.client.patch(`/api/timeline-items/${id}`).send({ planned_date: null });
    const patched = await session.client
      .patch(`/api/timeline-items/${id}`)
      .send({ responsible: { kind: 'VENDOR', vendor_id: vendor.id } });
    expect(patched.body.deadline).toBe(dayOffset(16));
    expect(patched.body.planned_date).toBeNull();

    const detail = await session.client.get(`/api/timeline-items/${id}`);
    const deadlines = detail.body.date_changes.filter((row: { field: string }) => row.field === 'DEADLINE');
    expect(deadlines.map((row: { old_value: string }) => row.old_value)).toEqual([dayOffset(14), dayOffset(12), dayOffset(10)]);
    for (const row of deadlines) {
      expect(row.created_by.name).toBe('admin@example.com');
      expect(row.created_at).toBeTruthy();
    }
    const planned = detail.body.date_changes.filter((row: { field: string }) => row.field === 'PLANNED_DATE');
    expect(planned.map((row: { old_value: string | null; new_value: string | null }) => [row.old_value, row.new_value])).toEqual([
      [dayOffset(3), null],
      [dayOffset(2), dayOffset(3)],
      [null, dayOffset(2)],
    ]);
    expect(detail.body.responsible_changes).toHaveLength(1);
    expect(detail.body.responsible_changes[0]).toMatchObject({
      cause: 'EDIT',
      old: { kind: 'NONE' },
      new: { kind: 'VENDOR', label: 'Sharma Interiors' },
    });
  });

  it('archives and restores an item, and an archived item cannot be changed until restored (US1-7, US1-12)', async () => {
    const { session, project } = await setup();
    const created = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'MILESTONE', name: 'Handover', deadline: dayOffset(20) });
    const id = created.body.id as string;

    expect((await session.client.post(`/api/timeline-items/${id}/archive`)).status).toBe(200);
    const timeline = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(timeline.body.items).toEqual([]);
    expect(timeline.body.archived_items.map((item: { id: string }) => item.id)).toEqual([id]);

    const edit = await session.client.patch(`/api/timeline-items/${id}`).send({ name: 'Final handover' });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('ITEM_ARCHIVED');
    expect(edit.body.message).toMatch(/restore/i);

    expect((await session.client.post(`/api/timeline-items/${id}/restore`)).status).toBe(200);
    expect((await session.client.get(`/api/projects/${project.id}/timeline`)).body.items.map((item: { id: string }) => item.id)).toEqual([id]);
    expect(await prisma.timelineItem.count()).toBe(1);
  });

  it('refuses every timeline write on an archived project and keeps its history readable (US1-8, US1-12, FR-025)', async () => {
    const { session, project } = await setup();
    const kept = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'ACTIVITY', name: 'Painting', deadline: dayOffset(10) });
    await session.client.patch(`/api/timeline-items/${kept.body.id}`).send({ deadline: dayOffset(12) });
    const shelved = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'ACTIVITY', name: 'Polishing', deadline: dayOffset(10) });
    await session.client.post(`/api/timeline-items/${shelved.body.id}/archive`);
    expect((await session.client.post(`/api/projects/${project.id}/archive`)).status).toBe(200);

    const attempts = [
      session.client.post(`/api/projects/${project.id}/timeline-items`).send({ item_type: 'MILESTONE', name: 'New', deadline: dayOffset(3) }),
      session.client.patch(`/api/timeline-items/${kept.body.id}`).send({ name: 'Changed' }),
      session.client.post(`/api/timeline-items/${kept.body.id}/archive`),
      session.client.post(`/api/timeline-items/${shelved.body.id}/restore`),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(attempt.status).toBe(409);
      expect(attempt.body.code).toBe('PROJECT_ARCHIVED');
    }

    const timeline = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(timeline.status).toBe(200);
    expect(timeline.body.project.archived).toBe(true);
    expect(timeline.body.items.map((item: { name: string }) => item.name)).toEqual(['Painting']);
    expect(timeline.body.archived_items.map((item: { name: string }) => item.name)).toEqual(['Polishing']);
    const detail = await session.client.get(`/api/timeline-items/${kept.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.date_changes).toHaveLength(1);

    expect((await session.client.post(`/api/projects/${project.id}/restore`)).status).toBe(200);
    expect((await session.client.post(`/api/timeline-items/${shelved.body.id}/restore`)).status).toBe(200);
  });

  it('keeps a responsible vendor archived later and shows it as archived (FR-005)', async () => {
    const { session, vendor, project } = await setup();
    const created = await session.client.post(`/api/projects/${project.id}/timeline-items`).send({
      item_type: 'ACTIVITY',
      name: 'Joinery',
      deadline: dayOffset(10),
      responsible: { kind: 'VENDOR', vendor_id: vendor.id },
    });
    await prisma.vendor.update({ where: { id: vendor.id }, data: { archived: true } });

    const renamed = await session.client.patch(`/api/timeline-items/${created.body.id}`).send({ name: 'Joinery, first floor' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.responsible).toMatchObject({ kind: 'VENDOR', vendor: { id: vendor.id, archived: true } });
  });

  it('never creates, changes, or removes a work schedule, task price, or costing sheet (FR-028)', async () => {
    const { session, vendor, project } = await setup();
    const schedule = await session.client.post(`/api/projects/${project.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Doors',
      work_date: dayOffset(4),
      start_time: '09:00',
      end_time: '12:00',
      required_team_size: 2,
    });
    expect(schedule.status).toBe(201);
    await session.client.put(`/api/schedules/${schedule.body.id}/price`).send({ amount: '1000.00' });
    const snapshot = async () => ({
      schedules: await prisma.workSchedule.findMany({ orderBy: { id: 'asc' } }),
      prices: await prisma.taskPriceEntry.findMany({ orderBy: { id: 'asc' } }),
      files: await prisma.costingSheetFile.findMany({ orderBy: { id: 'asc' } }),
    });
    const before = await snapshot();

    const created = await session.client.post(`/api/projects/${project.id}/timeline-items`).send({
      item_type: 'ACTIVITY',
      name: 'Doors',
      deadline: dayOffset(4),
      responsible: { kind: 'VENDOR', vendor_id: vendor.id },
    });
    await session.client.patch(`/api/timeline-items/${created.body.id}`).send({ deadline: dayOffset(6) });
    await session.client.post(`/api/timeline-items/${created.body.id}/archive`);
    await session.client.post(`/api/timeline-items/${created.body.id}/restore`);

    expect(await snapshot()).toEqual(before);
  });

  it('lets the Accountant change timeline data and refuses signed-out or revoked people (FR-024, SC-007)', async () => {
    const { admin, session: adminSession, project } = await setup();
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
    const accountant = await signIn('accountant@example.com');
    const created = await accountant.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'ACTIVITY', name: 'Plumbing', deadline: dayOffset(5) });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await accountant.client.patch(`/api/timeline-items/${id}`).send({ name: 'Plumbing, kitchen' })).status).toBe(200);
    expect((await accountant.client.post(`/api/timeline-items/${id}/archive`)).status).toBe(200);
    expect((await accountant.client.post(`/api/timeline-items/${id}/restore`)).status).toBe(200);
    expect((await accountant.client.get(`/api/timeline-items/${id}`)).status).toBe(200);
    expect((await accountant.client.get(`/api/projects/${project.id}/timeline`)).status).toBe(200);

    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const officeSession = await signIn('office@example.com');
    await adminSession.client.patch(`/api/staff/${office.id}`).send({ revoked: true });

    const routes: ['get' | 'post' | 'patch', string][] = [
      ['get', `/api/projects/${project.id}/timeline`],
      ['post', `/api/projects/${project.id}/timeline-items`],
      ['get', `/api/timeline-items/${id}`],
      ['patch', `/api/timeline-items/${id}`],
      ['post', `/api/timeline-items/${id}/archive`],
      ['post', `/api/timeline-items/${id}/restore`],
    ];
    for (const [method, path] of routes) {
      expect((await request(app)[method](path).send({})).status).toBe(401);
      expect((await officeSession.client[method](path).send({})).status).toBe(401);
    }
  });
});
