import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCategory,
  createProject,
  createTimelineItem,
  createUser,
  createVendor,
  dayOffset,
  insertProgressUpdate,
  resetDatabase,
  signIn,
} from '../helpers';
import { prisma } from '../../src/db';

describe('links', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 4 and keeps price and file history after removal', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000021', categoryId: category.id });
    const first = await createProject(admin.id, 'Lake House');
    const second = await createProject(admin.id, 'Studio');

    const linkA = await session.client.post(`/api/projects/${first.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Lead', scope_of_work: 'Joinery', note: 'North wing' });
    const linkB = await session.client.post(`/api/projects/${second.id}/links`).send({ vendor_id: vendor.id });
    expect(linkA.status).toBe(201);
    expect(linkB.status).toBe(201);
    const projectView = await session.client.get(`/api/projects/${first.id}`);
    expect(projectView.body.links[0].vendor_id).toBe(vendor.id);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).body.links).toHaveLength(2);
    expect((await session.client.post(`/api/projects/${first.id}/links`).send({ vendor_id: vendor.id })).status).toBe(409);

    await prisma.vendor.update({ where: { id: vendor.id }, data: { archived: true, updatedById: admin.id } });
    const third = await createProject(admin.id, 'Annex');
    expect((await session.client.post(`/api/projects/${third.id}/links`).send({ vendor_id: vendor.id })).status).toBe(409);
    await prisma.vendor.update({ where: { id: vendor.id }, data: { archived: false, updatedById: admin.id } });

    const schedule = await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Doors',
      work_date: '2026-11-02',
      start_time: '09:00',
      end_time: '12:00',
      required_team_size: 2,
    });
    await session.client.put(`/api/schedules/${schedule.body.id}/price`).send({ amount: '1000.00' });
    const file = await session.client
      .post(`/api/schedules/${schedule.body.id}/costing-sheet`)
      .attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'sheet.pdf');
    expect(file.status).toBe(409);

    const unpriced = await session.client.post(`/api/projects/${second.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Measure',
      work_date: '2026-11-05',
      start_time: '09:00',
      end_time: '10:00',
      required_team_size: 1,
    });
    const uploaded = await session.client
      .post(`/api/schedules/${unpriced.body.id}/costing-sheet`)
      .attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'measure.pdf');
    expect(uploaded.status).toBe(201);

    const removed = await session.client.delete(`/api/links/${linkA.body.id}`);
    expect(removed.body.archived_schedule_ids).toContain(schedule.body.id);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).status).toBe(200);
    const history = await session.client.get(`/api/schedules/${schedule.body.id}`);
    expect(history.body.archived).toBe(true);
    expect(history.body.price_history.length).toBeGreaterThan(0);
    expect((await prisma.workSchedule.count({ where: { id: schedule.body.id } }))).toBe(1);
    expect((await prisma.taskPriceEntry.count({ where: { scheduleId: schedule.body.id } }))).toBe(1);
  });

  it('keeps archived records readable, refuses new links to them, and leaves the vendor untouched', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000051', categoryId: category.id });
    await prisma.vendorRate.create({ data: { vendorId: vendor.id, label: 'Day', amount: '1800.00', unit: 'day', createdById: admin.id, updatedById: admin.id } });
    const project = await createProject(admin.id, 'Lake House');
    const before = (await session.client.get(`/api/vendors/${vendor.id}`)).body;

    const link = await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Lead', scope_of_work: 'Joinery', note: 'North wing' });
    expect(link.status).toBe(201);
    const shown = (await session.client.get(`/api/projects/${project.id}`)).body.links[0];
    expect(shown).toMatchObject({ vendor_id: vendor.id, role_on_project: 'Lead', scope_of_work: 'Joinery', note: 'North wing' });
    const after = (await session.client.get(`/api/vendors/${vendor.id}`)).body;
    expect({ phone: after.phone, rates: after.rates, team_size: after.team_size, availability: after.availability })
      .toEqual({ phone: before.phone, rates: before.rates, team_size: before.team_size, availability: before.availability });

    await session.client.post(`/api/vendors/${vendor.id}/archive`);
    expect((await session.client.get(`/api/projects/${project.id}`)).body.links[0].vendor_archived).toBe(true);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).body.links).toHaveLength(1);
    await session.client.post(`/api/vendors/${vendor.id}/restore`);

    const archivedProject = await createProject(admin.id, 'Studio');
    await session.client.post(`/api/projects/${archivedProject.id}/links`).send({ vendor_id: vendor.id });
    await session.client.post(`/api/projects/${archivedProject.id}/archive`);
    const refused = await session.client.post(`/api/projects/${archivedProject.id}/links`).send({ vendor_id: (await createVendor(admin.id, { name: 'Rao', phone: '9000000052', categoryId: category.id })).id });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ARCHIVED');
    expect((await session.client.get(`/api/projects/${archivedProject.id}`)).body.links).toHaveLength(1);

    expect((await session.client.delete(`/api/links/${link.body.id}`)).status).toBe(200);
    expect((await session.client.get(`/api/projects/${project.id}`)).body.links).toHaveLength(0);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).body.phone).toBe(before.phone);
  });

  it('keeps a file-priced schedule\'s costing sheet downloadable after its link is removed', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000061', categoryId: category.id });
    const project = await createProject(admin.id, 'Lake House');
    const link = await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    const schedule = await session.client.post(`/api/projects/${project.id}/schedules`).send({
      vendor_id: vendor.id, task: 'Measure', work_date: '2026-11-05', start_time: '09:00', end_time: '10:00', required_team_size: 1,
    });
    const uploaded = await session.client.post(`/api/schedules/${schedule.body.id}/costing-sheet`).attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'measure.pdf');
    const fileId = uploaded.body.current_file.id as string;

    expect((await session.client.delete(`/api/links/${link.body.id}`)).body.archived_schedule_ids).toContain(schedule.body.id);
    const history = (await session.client.get(`/api/schedules/${schedule.body.id}`)).body;
    expect(history.archived).toBe(true);
    expect(history.file_history.map((file: { id: string }) => file.id)).toContain(fileId);
    expect((await session.client.get(`/api/schedules/${schedule.body.id}/costing-sheets/${fileId}`)).status).toBe(200);
  });
});

describe('link removal and timeline items', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function setup() {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000201', categoryId: category.id });
    const other = await createVendor(admin.id, { name: 'Rao', phone: '9000000202', categoryId: category.id });
    const project = await createProject(admin.id, 'Lake House');
    const elsewhere = await createProject(admin.id, 'Studio');
    const link = await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: other.id });
    await session.client.post(`/api/projects/${elsewhere.id}/links`).send({ vendor_id: vendor.id });
    const item = await createTimelineItem(admin.id, {
      projectId: project.id,
      name: 'Joinery',
      deadline: dayOffset(5),
      plannedDate: dayOffset(1),
      responsibleVendorId: vendor.id,
    });
    const shelved = await createTimelineItem(admin.id, {
      projectId: project.id,
      name: 'Shelving',
      deadline: dayOffset(9),
      responsibleVendorId: vendor.id,
      archived: true,
    });
    const firm = await createTimelineItem(admin.id, {
      projectId: project.id,
      name: 'Measure',
      deadline: dayOffset(2),
      responsibleKind: 'FIRM_TEAM',
    });
    const otherVendorItem = await createTimelineItem(admin.id, {
      projectId: project.id,
      name: 'Wiring',
      deadline: dayOffset(3),
      responsibleVendorId: other.id,
    });
    const otherProjectItem = await createTimelineItem(admin.id, {
      projectId: elsewhere.id,
      name: 'Doors',
      deadline: dayOffset(3),
      responsibleVendorId: vendor.id,
    });
    await insertProgressUpdate({ itemId: item.id, status: 'IN_PROGRESS', actorId: admin.id, note: 'Started' });
    await session.client.patch(`/api/timeline-items/${item.id}`).send({ deadline: dayOffset(6) });
    const stamp = { createdById: admin.id, updatedById: admin.id };
    await prisma.delay.create({ data: { projectId: project.id, timelineItemId: item.id, reason: 'Board late', ...stamp } });
    await prisma.coordinationIssue.create({
      data: {
        projectId: project.id,
        timelineItemId: item.id,
        description: 'Shares the ceiling with the electrician',
        ...stamp,
        vendors: { create: [{ vendorId: vendor.id, ...stamp }] },
      },
    });
    return { admin, session, vendor, project, link: link.body, item, shelved, firm, otherVendorItem, otherProjectItem };
  }

  async function snapshotOf(itemId: string) {
    return {
      item: await prisma.timelineItem.findUniqueOrThrow({ where: { id: itemId } }),
      updates: await prisma.timelineProgressUpdate.findMany({ where: { timelineItemId: itemId }, orderBy: { seq: 'asc' } }),
      dateChanges: await prisma.timelineDateChange.findMany({ where: { timelineItemId: itemId }, orderBy: { id: 'asc' } }),
      responsibleChanges: await prisma.timelineResponsibleChange.findMany({
        where: { timelineItemId: itemId },
        orderBy: { createdAt: 'asc' },
      }),
      delays: await prisma.delay.findMany({ where: { timelineItemId: itemId }, orderBy: { id: 'asc' } }),
      issues: await prisma.coordinationIssue.findMany({
        where: { timelineItemId: itemId },
        include: { vendors: true },
        orderBy: { id: 'asc' },
      }),
    };
  }

  type Snapshot = Awaited<ReturnType<typeof snapshotOf>>;

  function expectOnlyResponsibleCleared(before: Snapshot, after: Snapshot, actorId: string) {
    const { responsibleKind, responsibleVendorId, updatedById, updatedAt, ...rest } = after.item;
    const {
      responsibleKind: _kind,
      responsibleVendorId: _vendor,
      updatedById: _by,
      updatedAt: _at,
      ...restBefore
    } = before.item;
    expect(rest).toEqual(restBefore);
    expect(responsibleKind).toBe('NONE');
    expect(responsibleVendorId).toBeNull();
    expect(updatedById).toBe(actorId);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.item.updatedAt.getTime());
    expect(after.updates).toEqual(before.updates);
    expect(after.dateChanges).toEqual(before.dateChanges);
    expect(after.delays).toEqual(before.delays);
    expect(after.issues).toEqual(before.issues);
    expect(after.responsibleChanges.slice(0, before.responsibleChanges.length)).toEqual(before.responsibleChanges);
    const added = after.responsibleChanges.slice(before.responsibleChanges.length);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      cause: 'LINK_REMOVED',
      oldKind: 'VENDOR',
      newKind: 'NONE',
      newVendorId: null,
      createdById: actorId,
    });
  }

  it('clears the responsible vendor on that project only, keeping everything else (US1-9, US1-10, FR-005)', async () => {
    const { admin, session, vendor, link, item, shelved, firm, otherVendorItem, otherProjectItem } = await setup();
    const before = await snapshotOf(item.id);
    const shelvedBefore = await snapshotOf(shelved.id);
    const othersQuery = { where: { id: { in: [firm.id, otherVendorItem.id, otherProjectItem.id] } }, orderBy: { id: 'asc' as const } };
    const untouched = await prisma.timelineItem.findMany(othersQuery);

    const removed = await session.client.delete(`/api/links/${link.id}`);
    expect(removed.status).toBe(200);
    expect([...removed.body.cleared_timeline_item_ids].sort()).toEqual([item.id, shelved.id].sort());
    expect(removed.body.archived_schedule_ids).toEqual([]);

    const after = await snapshotOf(item.id);
    expectOnlyResponsibleCleared(before, after, admin.id);
    expectOnlyResponsibleCleared(shelvedBefore, await snapshotOf(shelved.id), admin.id);
    expect(after.responsibleChanges.at(-1)?.oldVendorId).toBe(vendor.id);
    expect(await prisma.timelineItem.findMany(othersQuery)).toEqual(untouched);

    const shown = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(shown.body.responsible.label).toBe('No responsible party');
    expect(shown.body.responsible_changes[0]).toMatchObject({ cause: 'LINK_REMOVED', created_by: { id: admin.id } });
  });

  it('also clears it on an archived project, changing nothing else and keeping ordinary writes refused (US1-11, FR-025)', async () => {
    const { admin, session, project, link, item, firm } = await setup();
    expect((await session.client.post(`/api/projects/${project.id}/archive`)).status).toBe(200);
    const before = await snapshotOf(item.id);
    const firmBefore = await prisma.timelineItem.findUniqueOrThrow({ where: { id: firm.id } });

    const removed = await session.client.delete(`/api/links/${link.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.cleared_timeline_item_ids).toContain(item.id);
    expectOnlyResponsibleCleared(before, await snapshotOf(item.id), admin.id);
    expect(await prisma.timelineItem.findUniqueOrThrow({ where: { id: firm.id } })).toEqual(firmBefore);

    const create = await session.client
      .post(`/api/projects/${project.id}/timeline-items`)
      .send({ item_type: 'MILESTONE', name: 'New', deadline: dayOffset(3) });
    expect(create.status).toBe(409);
    expect(create.body.code).toBe('PROJECT_ARCHIVED');
    const edit = await session.client.patch(`/api/timeline-items/${item.id}`).send({ name: 'Changed' });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('PROJECT_ARCHIVED');
  });
});
