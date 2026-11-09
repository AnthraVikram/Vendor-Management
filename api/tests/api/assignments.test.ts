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
  insertProgressUpdate,
  resetDatabase,
  signIn,
} from '../helpers';
import { prisma } from '../../src/db';

// Feature 004: assignments (vendor-project links) seen from both sides.

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const session = await signIn('admin@example.com');
  const carpentry = await createCategory(admin.id, 'Carpentry');
  const tiling = await createCategory(admin.id, 'Tiling');
  return { admin, session, carpentry, tiling };
}

describe('assignments seen from both sides (US1)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lists every project on the vendor profile with its details and a count (US1-1, US1-7)', async () => {
    const { admin, session, carpentry } = await setup();
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000201', categoryId: carpentry.id });
    const lake = await createProject(admin.id, 'Lake House', 'ACTIVE');
    const studio = await createProject(admin.id, 'Studio Fit-out', 'PLANNED');
    const villa = await createProject(admin.id, 'Hill Villa', 'COMPLETED');
    const old = await createProject(admin.id, 'Old Office', 'ACTIVE');
    await session.client.post(`/api/projects/${lake.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Lead carpenter', scope_of_work: 'Wardrobes', note: 'North wing' });
    await session.client.post(`/api/projects/${studio.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Joinery' });
    await session.client.post(`/api/projects/${villa.id}/links`).send({ vendor_id: vendor.id });
    await session.client.post(`/api/projects/${old.id}/links`).send({ vendor_id: vendor.id });
    await prisma.project.update({ where: { id: old.id }, data: { archived: true } });

    const profile = await session.client.get(`/api/vendors/${vendor.id}`);
    expect(profile.status).toBe(200);
    // Decision D1: archived projects are not counted; Completed projects are.
    expect(profile.body.project_count).toBe(3);
    expect(profile.body.links).toHaveLength(4);
    const lakeLink = profile.body.links.find((link: { project_id: string }) => link.project_id === lake.id);
    expect(lakeLink).toMatchObject({
      project_name: 'Lake House',
      project_status: 'ACTIVE',
      project_archived: false,
      role_on_project: 'Lead carpenter',
      scope_of_work: 'Wardrobes',
      note: 'North wing',
    });
    const oldLink = profile.body.links.find((link: { project_id: string }) => link.project_id === old.id);
    expect(oldLink.project_archived).toBe(true);
  });

  it('shows each vendor on the project with phone, contact person and categories (US1-3)', async () => {
    const { admin, session, carpentry, tiling } = await setup();
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000202', categoryId: carpentry.id });
    await prisma.vendorCategory.create({ data: { vendorId: vendor.id, categoryId: tiling.id, createdById: admin.id, updatedById: admin.id } });
    await prisma.vendor.update({ where: { id: vendor.id }, data: { contactPerson: 'Ravi Sharma' } });
    const plain = await createVendor(admin.id, { name: 'Rao Tiles', phone: '9000000203', categoryId: tiling.id });
    const project = await createProject(admin.id, 'Lake House');
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Lead' });
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: plain.id });

    const view = await session.client.get(`/api/projects/${project.id}`);
    expect(view.status).toBe(200);
    const sharma = view.body.links.find((link: { vendor_id: string }) => link.vendor_id === vendor.id);
    expect(sharma).toMatchObject({ vendor_name: 'Sharma Interiors', vendor_phone: '9000000202', vendor_contact_person: 'Ravi Sharma', role_on_project: 'Lead' });
    expect(sharma.vendor_categories.map((row: { name: string }) => row.name).sort()).toEqual(['Carpentry', 'Tiling']);
    const rao = view.body.links.find((link: { vendor_id: string }) => link.vendor_id === plain.id);
    expect(rao.vendor_contact_person).toBeNull();
  });

  it('shows no projects and a count of 0 for an unassigned vendor (US1-5)', async () => {
    const { admin, session, carpentry } = await setup();
    const vendor = await createVendor(admin.id, { name: 'Idle Works', phone: '9000000204', categoryId: carpentry.id });
    const profile = await session.client.get(`/api/vendors/${vendor.id}`);
    expect(profile.body.links).toEqual([]);
    expect(profile.body.project_count).toBe(0);
  });

  it('keeps an archived vendor\'s assignments listed (US1-6, Feature 001 FR-015)', async () => {
    const { admin, session, carpentry } = await setup();
    const vendor = await createVendor(admin.id, { name: 'Gone Joinery', phone: '9000000205', categoryId: carpentry.id });
    const project = await createProject(admin.id, 'Lake House');
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Joinery' });
    await session.client.post(`/api/vendors/${vendor.id}/archive`);

    const profile = await session.client.get(`/api/vendors/${vendor.id}`);
    expect(profile.body.archived).toBe(true);
    expect(profile.body.links).toHaveLength(1);
    expect(profile.body.links[0]).toMatchObject({ project_name: 'Lake House', role_on_project: 'Joinery' });
  });

  it('reads vendor details from the vendor record, never a copy (US1-8)', async () => {
    const { admin, session, carpentry } = await setup();
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000206', categoryId: carpentry.id });
    const project = await createProject(admin.id, 'Lake House');
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });

    const edited = await session.client.patch(`/api/vendors/${vendor.id}`).send({
      name: 'Sharma Interiors',
      phone: '9000000299',
      category_ids: [carpentry.id],
    });
    expect(edited.status).toBe(200);
    const view = await session.client.get(`/api/projects/${project.id}`);
    expect(view.body.links[0].vendor_phone).toBe('9000000299');
  });

  it('refuses a signed-out caller on both views (SC-008)', async () => {
    const { admin, carpentry } = await setup();
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000207', categoryId: carpentry.id });
    const project = await createProject(admin.id, 'Lake House');
    expect((await request(app).get(`/api/vendors/${vendor.id}`)).status).toBe(401);
    expect((await request(app).get(`/api/projects/${project.id}`)).status).toBe(401);
  });
});

describe('assignment status (US3, FR-010 to FR-012)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  type Status = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

  // Status of the assignment as the project page and the vendor profile each report it.
  async function statusesOf(client: Awaited<ReturnType<typeof signIn>>['client'], vendorId: string, projectId: string) {
    const project = await client.get(`/api/projects/${projectId}`);
    const vendor = await client.get(`/api/vendors/${vendorId}`);
    const onProject = project.body.links.find((link: { vendor_id: string }) => link.vendor_id === vendorId);
    const onVendor = vendor.body.links.find((link: { project_id: string }) => link.project_id === projectId);
    return { project: onProject?.assignment_status, vendor: onVendor?.assignment_status };
  }

  it('gives the status in the spec table for every situation, the same on both pages (US3-1, US3-2, FR-011)', async () => {
    const { admin, session, carpentry } = await setup();
    const main = await createProject(admin.id, 'Lake House', 'ACTIVE');
    const elsewhere = await createProject(admin.id, 'Studio Fit-out', 'ACTIVE');
    const held = await createProject(admin.id, 'Hill Villa', 'ACTIVE');
    const closed = await createProject(admin.id, 'Old Office', 'ACTIVE');

    let phone = 9000000300;
    let itemNumber = 0;
    async function assignedVendor(name: string, projectId: string) {
      phone += 1;
      const vendor = await createVendor(admin.id, { name, phone: String(phone), categoryId: carpentry.id });
      expect((await session.client.post(`/api/projects/${projectId}/links`).send({ vendor_id: vendor.id })).status).toBe(201);
      return vendor;
    }
    async function item(vendorId: string, projectId: string, deadlineInDays: number, status?: Status, archived = false) {
      itemNumber += 1;
      const row = await createTimelineItem(admin.id, {
        projectId,
        name: `Item ${itemNumber}`,
        deadline: dayOffset(deadlineInDays),
        responsibleVendorId: vendorId,
        archived,
      });
      if (status) await insertProgressUpdate({ itemId: row.id, status, actorId: admin.id });
      return row;
    }

    const justAssigned = await assignedVendor('Just Assigned', main.id);
    const itemsElsewhere = await assignedVendor('Items Elsewhere', main.id);
    await session.client.post(`/api/projects/${elsewhere.id}/links`).send({ vendor_id: itemsElsewhere.id });
    await item(itemsElsewhere.id, elsewhere.id, 5);
    const onlyArchived = await assignedVendor('Only Archived', main.id);
    await item(onlyArchived.id, main.id, -3, undefined, true);
    const notStarted = await assignedVendor('Not Started', main.id);
    await item(notStarted.id, main.id, 10);
    await item(notStarted.id, main.id, 12, 'NOT_STARTED');
    const inProgress = await assignedVendor('In Progress', main.id);
    await item(inProgress.id, main.id, 10, 'IN_PROGRESS');
    await item(inProgress.id, main.id, 12);
    const doneAndNot = await assignedVendor('Done And Not', main.id);
    await item(doneAndNot.id, main.id, 10, 'DONE');
    await item(doneAndNot.id, main.id, 12);
    const overdue = await assignedVendor('Overdue', main.id);
    await item(overdue.id, main.id, -1);
    await item(overdue.id, main.id, 10, 'DONE');
    const mixed = await assignedVendor('Mixed', main.id);
    await item(mixed.id, main.id, 5, 'DONE');
    await item(mixed.id, main.id, 6, 'IN_PROGRESS');
    await item(mixed.id, main.id, -2, 'IN_PROGRESS');
    const allDone = await assignedVendor('All Done', main.id);
    await item(allDone.id, main.id, -5, 'DONE');
    await item(allDone.id, main.id, 3, 'DONE');
    const onArchivedProject = await assignedVendor('On Archived Project', closed.id);
    await item(onArchivedProject.id, closed.id, -1);
    const onHeldProject = await assignedVendor('On Held Project', held.id);
    await item(onHeldProject.id, held.id, 4, 'IN_PROGRESS');
    const archivedVendor = await assignedVendor('Archived Vendor', main.id);
    await item(archivedVendor.id, main.id, 9);

    // Items with Firm team or no responsible party count toward no vendor (US3-6).
    await createTimelineItem(admin.id, { projectId: main.id, name: 'Firm overdue', deadline: dayOffset(-4), responsibleKind: 'FIRM_TEAM' });
    await createTimelineItem(admin.id, { projectId: main.id, name: 'Nobody overdue', deadline: dayOffset(-4) });

    await session.client.post(`/api/projects/${closed.id}/archive`);
    await prisma.project.update({ where: { id: held.id }, data: { status: 'ON_HOLD' } });
    await session.client.post(`/api/vendors/${archivedVendor.id}/archive`);

    const expected: [{ id: string }, string, string][] = [
      [justAssigned, main.id, 'NO_ACTIVITIES'],
      [itemsElsewhere, main.id, 'NO_ACTIVITIES'],
      [onlyArchived, main.id, 'NO_ACTIVITIES'],
      [notStarted, main.id, 'NOT_STARTED'],
      [inProgress, main.id, 'IN_PROGRESS'],
      [doneAndNot, main.id, 'IN_PROGRESS'],
      [overdue, main.id, 'DELAYED'],
      [mixed, main.id, 'DELAYED'],
      [allDone, main.id, 'COMPLETED'],
      [onArchivedProject, closed.id, 'DELAYED'],
      [onHeldProject, held.id, 'IN_PROGRESS'],
      [archivedVendor, main.id, 'NOT_STARTED'],
    ];
    for (const [vendor, projectId, status] of expected) {
      expect(await statusesOf(session.client, vendor.id, projectId), status).toEqual({ project: status, vendor: status });
    }
    expect((await statusesOf(session.client, itemsElsewhere.id, elsewhere.id)).vendor).toBe('NOT_STARTED');
  });

  it('turns Delayed when a deadline passes and back when the item is done (US3-3, US3-4)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000350', categoryId: carpentry.id });
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    const late = await createTimelineItem(admin.id, { projectId: project.id, name: 'Wardrobes', deadline: dayOffset(5), responsibleVendorId: vendor.id });
    await insertProgressUpdate({ itemId: late.id, status: 'IN_PROGRESS', actorId: admin.id });
    expect((await statusesOf(session.client, vendor.id, project.id)).project).toBe('IN_PROGRESS');

    await prisma.timelineItem.update({ where: { id: late.id }, data: { deadline: new Date(`${dayOffset(-1)}T00:00:00Z`) } });
    expect(await statusesOf(session.client, vendor.id, project.id)).toEqual({ project: 'DELAYED', vendor: 'DELAYED' });

    await insertProgressUpdate({ itemId: late.id, status: 'DONE', actorId: admin.id });
    expect((await statusesOf(session.client, vendor.id, project.id)).project).toBe('COMPLETED');

    await createTimelineItem(admin.id, { projectId: project.id, name: 'Shelves', deadline: dayOffset(8), responsibleVendorId: vendor.id });
    expect((await statusesOf(session.client, vendor.id, project.id)).project).toBe('IN_PROGRESS');
  });

  it('cannot be set by anyone (US3-5, FR-012)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000351', categoryId: carpentry.id });
    const link = await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Lead' });
    const refused = await session.client.patch(`/api/links/${link.body.id}`).send({ assignment_status: 'COMPLETED' });
    expect(refused.status).toBe(400);
    const after = await prisma.vendorProjectLink.findUniqueOrThrow({ where: { id: link.body.id } });
    expect(after.roleOnProject).toBe('Lead');
    expect((await statusesOf(session.client, vendor.id, project.id)).project).toBe('NO_ACTIVITIES');
  });

  it('never shows a removed assignment as current, even when items still name the vendor', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Gone Tiles', phone: '9000000352', categoryId: carpentry.id });
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    await createTimelineItem(admin.id, { projectId: project.id, name: 'Tiling', deadline: dayOffset(-2), responsibleVendorId: vendor.id });
    await prisma.vendorProjectLink.updateMany({
      where: { vendorId: vendor.id, projectId: project.id },
      data: { removedAt: new Date(), removedById: admin.id },
    });

    const view = await session.client.get(`/api/projects/${project.id}`);
    expect(view.body.links).toEqual([]);
    const profile = await session.client.get(`/api/vendors/${vendor.id}`);
    expect(profile.body.links).toEqual([]);
    expect(profile.body.project_count).toBe(0);
  });
});

describe('past assignments (US4, FR-013)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function assigned(session: Awaited<ReturnType<typeof signIn>>, projectId: string, vendorId: string, body: Record<string, string> = {}) {
    const response = await session.client.post(`/api/projects/${projectId}/links`).send({ vendor_id: vendorId, ...body });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  it('keeps the row on removal and returns who removed it and when (US4-1, FR-013, FR-013c)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000400', categoryId: carpentry.id });
    const link = await assigned(session, project.id, vendor.id, { role_on_project: 'Carpentry', scope_of_work: 'Wardrobes', note: 'North wing' });
    const item = await createTimelineItem(admin.id, { projectId: project.id, name: 'Wardrobes', deadline: dayOffset(5), responsibleVendorId: vendor.id });

    const removed = await session.client.delete(`/api/links/${link.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.removed_by).toEqual({ id: admin.id, name: 'Asha Admin' });
    expect(Number.isNaN(Date.parse(removed.body.removed_at))).toBe(false);
    expect(removed.body.cleared_timeline_item_ids).toEqual([item.id]);

    const row = await prisma.vendorProjectLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.removedAt).not.toBeNull();
    expect(row.removedById).toBe(admin.id);
    expect(row).toMatchObject({ roleOnProject: 'Carpentry', scopeOfWork: 'Wardrobes', note: 'North wing' });
    expect(await prisma.vendor.findUnique({ where: { id: vendor.id } })).not.toBeNull();
  });

  it('lists the past assignment under Past vendors and Past projects, never as current (US4-3, US4-4, US4-5)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000401', categoryId: carpentry.id });
    const link = await assigned(session, project.id, vendor.id, { role_on_project: 'Carpentry', scope_of_work: 'Wardrobes', note: 'North wing' });
    await session.client.delete(`/api/links/${link.id}`);

    const view = (await session.client.get(`/api/projects/${project.id}`)).body;
    expect(view.links).toEqual([]);
    expect(view.past_links).toHaveLength(1);
    expect(view.past_links[0]).toMatchObject({
      id: link.id, vendor_id: vendor.id, vendor_name: 'Sharma Interiors', vendor_archived: false,
      role_on_project: 'Carpentry', scope_of_work: 'Wardrobes', note: 'North wing',
      removed_by: { id: admin.id, name: 'Asha Admin' },
    });
    expect(view.past_links[0].removed_at).toEqual(expect.any(String));
    expect(view.past_links[0].assignment_status).toBeUndefined();

    const profile = (await session.client.get(`/api/vendors/${vendor.id}`)).body;
    expect(profile.links).toEqual([]);
    expect(profile.project_count).toBe(0);
    expect(profile.past_links).toHaveLength(1);
    expect(profile.past_links[0]).toMatchObject({
      id: link.id, project_id: project.id, project_name: 'Lake House', project_archived: false,
      role_on_project: 'Carpentry', scope_of_work: 'Wardrobes', note: 'North wing',
      removed_by: { id: admin.id, name: 'Asha Admin' },
    });
  });

  it('refuses to edit or remove a past assignment again (US4-6)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000402', categoryId: carpentry.id });
    const link = await assigned(session, project.id, vendor.id, { role_on_project: 'Carpentry' });
    await session.client.delete(`/api/links/${link.id}`);
    const before = await prisma.vendorProjectLink.findUniqueOrThrow({ where: { id: link.id } });

    const edit = await session.client.patch(`/api/links/${link.id}`).send({ role_on_project: 'Lead' });
    expect(edit.status).toBe(409);
    expect(edit.body).toMatchObject({ code: 'ASSIGNMENT_REMOVED', message: 'This vendor was removed from the project. A past assignment cannot be changed.' });
    const again = await session.client.delete(`/api/links/${link.id}`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'ALREADY_REMOVED', message: 'This vendor has already been removed from the project.' });
    expect(await prisma.vendorProjectLink.findUniqueOrThrow({ where: { id: link.id } })).toEqual(before);
  });

  it('creates a new current assignment when the vendor is assigned again, keeping every past one (US4-7, US4-8, FR-013b)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000403', categoryId: carpentry.id });
    const first = await assigned(session, project.id, vendor.id, { role_on_project: 'First' });
    await session.client.delete(`/api/links/${first.id}`);
    const second = await assigned(session, project.id, vendor.id, { role_on_project: 'Second' });
    await session.client.delete(`/api/links/${second.id}`);
    const current = await assigned(session, project.id, vendor.id, { role_on_project: 'Current' });

    const view = (await session.client.get(`/api/projects/${project.id}`)).body;
    expect(view.links.map((link: { id: string }) => link.id)).toEqual([current.id]);
    expect(view.past_links.map((link: { id: string }) => link.id)).toEqual([second.id, first.id]);
    expect(view.past_links.map((link: { role_on_project: string }) => link.role_on_project)).toEqual(['Second', 'First']);
  });

  it('removes assignments on archived projects and archived vendors the same way (US4-9)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const other = await createProject(admin.id, 'Studio Fit-out');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000404', categoryId: carpentry.id });
    const onArchivedProject = await assigned(session, project.id, vendor.id);
    const ofArchivedVendor = await assigned(session, other.id, vendor.id);
    await session.client.post(`/api/projects/${project.id}/archive`);
    await session.client.post(`/api/vendors/${vendor.id}/archive`);

    expect((await session.client.delete(`/api/links/${onArchivedProject.id}`)).status).toBe(200);
    expect((await session.client.delete(`/api/links/${ofArchivedVendor.id}`)).status).toBe(200);
    const profile = (await session.client.get(`/api/vendors/${vendor.id}`)).body;
    expect(profile.links).toEqual([]);
    expect(profile.past_links.map((link: { project_archived: boolean }) => link.project_archived).sort()).toEqual([false, true]);
    const archivedView = (await session.client.get(`/api/projects/${project.id}`)).body;
    expect(archivedView.past_links[0]).toMatchObject({ vendor_id: vendor.id, vendor_archived: true });
  });

  it('serializes parallel removals and parallel assignments of the same pair', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000405', categoryId: carpentry.id });
    const link = await assigned(session, project.id, vendor.id);
    const removals = await Promise.all([session.client.delete(`/api/links/${link.id}`), session.client.delete(`/api/links/${link.id}`)]);
    expect(removals.map((response) => response.status).sort()).toEqual([200, 409]);

    const assignments = await Promise.all([
      session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id }),
      session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id }),
    ]);
    expect(assignments.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(assignments.find((response) => response.status === 409)!.body.code).toBe('LINK_EXISTS');
    expect(await prisma.vendorProjectLink.count({ where: { vendorId: vendor.id, projectId: project.id, removedAt: null } })).toBe(1);
  });

  it('keeps both of two parallel edits and records both in each history (spec edge case)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000406', categoryId: carpentry.id });
    const link = await assigned(session, project.id, vendor.id, { role_on_project: 'Old role', scope_of_work: 'Old scope' });
    const edits = await Promise.all([
      session.client.patch(`/api/links/${link.id}`).send({ role_on_project: 'New role' }),
      session.client.patch(`/api/links/${link.id}`).send({ scope_of_work: 'New scope' }),
    ]);
    expect(edits.map((response) => response.status)).toEqual([200, 200]);
    const row = await prisma.vendorProjectLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row).toMatchObject({ roleOnProject: 'New role', scopeOfWork: 'New scope' });
    for (const target of [{ vendorId: vendor.id }, { projectId: project.id }]) {
      const edited = await prisma.historyEntry.findMany({ where: { ...target, action: 'ASSIGNMENT_EDITED' }, orderBy: { createdAt: 'asc' } });
      expect(edited).toHaveLength(2);
      expect(edited.map((entry) => Object.keys(entry.changes as object)).sort()).toEqual([['role_on_project'], ['scope_of_work']]);
    }
  });

  it('lets every role assign, edit and remove (FR-036, FR-037)', async () => {
    const { admin, carpentry } = await setup();
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
    let phone = 9000000410;
    for (const email of ['admin@example.com', 'office@example.com', 'accountant@example.com']) {
      const session = await signIn(email);
      phone += 1;
      const vendor = await createVendor(admin.id, { name: `Vendor ${phone}`, phone: String(phone), categoryId: carpentry.id });
      const project = await createProject(admin.id, `Project ${phone}`);
      const link = await assigned(session, project.id, vendor.id);
      expect((await session.client.patch(`/api/links/${link.id}`).send({ note: 'Checked' })).status, email).toBe(200);
      expect((await session.client.delete(`/api/links/${link.id}`)).status, email).toBe(200);
    }
  });

  it('refuses signed-out callers on assign, edit and remove, changing nothing (SC-008)', async () => {
    const { admin, session, carpentry } = await setup();
    const project = await createProject(admin.id, 'Lake House');
    const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000420', categoryId: carpentry.id });
    const other = await createVendor(admin.id, { name: 'Other Works', phone: '9000000421', categoryId: carpentry.id });
    const link = await assigned(session, project.id, vendor.id, { role_on_project: 'Lead' });
    const before = await prisma.vendorProjectLink.findMany({ orderBy: { id: 'asc' } });

    expect((await request(app).post(`/api/projects/${project.id}/links`).send({ vendor_id: other.id })).status).toBe(401);
    expect((await request(app).patch(`/api/links/${link.id}`).send({ role_on_project: 'X' })).status).toBe(401);
    expect((await request(app).delete(`/api/links/${link.id}`)).status).toBe(401);
    expect(await prisma.vendorProjectLink.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});
