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
  linkVendor,
  resetDatabase,
  signIn,
} from '../helpers';
import { prisma } from '../../src/db';

function textFor(path: string): Record<string, string> {
  return path === 'delays' ? { reason: 'Late' } : { description: 'Clash' };
}

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const session = await signIn('admin@example.com');
  const category = await createCategory(admin.id, 'Carpentry');
  const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '9000000301', categoryId: category.id });
  const project = await createProject(admin.id, 'Mehta Residence');
  await linkVendor(admin.id, vendor.id, project.id);
  const item = await createTimelineItem(admin.id, {
    projectId: project.id,
    name: 'False ceiling',
    deadline: dayOffset(-2),
    responsibleVendorId: vendor.id,
  });
  return { admin, session, category, vendor, project, item };
}

describe('delays and coordination issues', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('records a delay on an item and shows it on the item and the project (US4-1)', async () => {
    const { session, project, item } = await setup();
    const saved = await session.client
      .post(`/api/projects/${project.id}/delays`)
      .send({ reason: 'Gypsum board delivery late', timeline_item_id: item.id });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({
      project_id: project.id,
      timeline_item: { id: item.id, name: 'False ceiling' },
      reason: 'Gypsum board delivery late',
      created_by: { name: 'Asha Admin' },
    });
    expect(saved.body.created_at).toBeTruthy();

    const onItem = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(onItem.body.delays.map((row: { id: string }) => row.id)).toEqual([saved.body.id]);
    const onProject = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(onProject.body.delays.map((row: { id: string }) => row.id)).toEqual([saved.body.id]);
  });

  it('records a coordination issue naming a linked vendor without touching the vendor record (US4-2, FR-019)', async () => {
    const { admin, session, vendor, project, item } = await setup();
    await prisma.vendorNote.create({ data: { vendorId: vendor.id, noteType: 'COORDINATION', body: 'Prefers mornings', createdById: admin.id, updatedById: admin.id } });
    await prisma.vendorRating.create({ data: { vendorId: vendor.id, score: 4, createdById: admin.id, updatedById: admin.id } });
    const vendorBefore = await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id }, include: { notes: true, ratings: true } });

    const saved = await session.client.post(`/api/projects/${project.id}/coordination-issues`).send({
      description: 'Electrician and carpenter both need the ceiling on Monday',
      timeline_item_id: item.id,
      vendor_ids: [vendor.id, vendor.id],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.vendors).toEqual([{ id: vendor.id, name: 'Sharma Interiors', archived: false }]);
    expect(await prisma.coordinationIssueVendor.count()).toBe(1);

    const onProject = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(onProject.body.coordination_issues[0]).toMatchObject({
      description: 'Electrician and carpenter both need the ceiling on Monday',
      vendors: [{ name: 'Sharma Interiors' }],
    });
    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id }, include: { notes: true, ratings: true } })).toEqual(vendorBefore);
  });

  it('requires the text and refuses an unlinked vendor or another project\'s item (US4-3, US4-4, US4-7)', async () => {
    const { admin, session, category, project } = await setup();
    const blankDelay = await session.client.post(`/api/projects/${project.id}/delays`).send({ reason: '   ' });
    expect(blankDelay.status).toBe(400);
    expect(blankDelay.body.fields).toHaveProperty('reason');
    const noDescription = await session.client.post(`/api/projects/${project.id}/coordination-issues`).send({});
    expect(noDescription.status).toBe(400);
    expect(noDescription.body.fields).toHaveProperty('description');

    const unlinked = await createVendor(admin.id, { name: 'Elsewhere', phone: '9000000302', categoryId: category.id });
    const notLinked = await session.client
      .post(`/api/projects/${project.id}/coordination-issues`)
      .send({ description: 'Clash', vendor_ids: [unlinked.id] });
    expect(notLinked.status).toBe(409);
    expect(notLinked.body.code).toBe('VENDOR_NOT_LINKED');
    expect(notLinked.body.vendor_ids).toEqual([unlinked.id]);

    const other = await createProject(admin.id, 'Studio');
    const foreign = await createTimelineItem(admin.id, { projectId: other.id, name: 'Doors', deadline: dayOffset(3) });
    for (const path of ['delays', 'coordination-issues']) {
      const attempt = await session.client
        .post(`/api/projects/${project.id}/${path}`)
        .send({ ...textFor(path), timeline_item_id: foreign.id });
      expect(attempt.status).toBe(409);
      expect(attempt.body.code).toBe('ITEM_NOT_ON_PROJECT');
    }
    expect(await prisma.delay.count()).toBe(0);
    expect(await prisma.coordinationIssue.count()).toBe(0);
  });

  it('keeps a delay readable after the deadline changes and the item is Done (US4-5)', async () => {
    const { session, project, item } = await setup();
    const saved = await session.client.post(`/api/projects/${project.id}/delays`).send({ reason: 'Rain', timeline_item_id: item.id });
    await session.client.patch(`/api/timeline-items/${item.id}`).send({ deadline: dayOffset(4) });
    await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE' });
    const detail = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(detail.body.status).toBe('DONE');
    expect(detail.body.delays.map((row: { id: string }) => row.id)).toEqual([saved.body.id]);
  });

  it('records a delay or issue against the project generally (US4-6)', async () => {
    const { session, project } = await setup();
    const delay = await session.client.post(`/api/projects/${project.id}/delays`).send({ reason: 'Client away' });
    const issue = await session.client.post(`/api/projects/${project.id}/coordination-issues`).send({ description: 'Site access' });
    expect(delay.body.timeline_item).toBeNull();
    expect(issue.body.timeline_item).toBeNull();
    expect(issue.body.vendors).toEqual([]);
    const onProject = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(onProject.body.delays[0].timeline_item).toBeNull();
    expect(onProject.body.coordination_issues[0].timeline_item).toBeNull();
  });

  it('accepts an archived vendor that is still linked (US4-8)', async () => {
    const { admin, session, category, project } = await setup();
    const retired = await createVendor(admin.id, { name: 'Retired Works', phone: '9000000303', categoryId: category.id });
    await linkVendor(admin.id, retired.id, project.id);
    await prisma.vendor.update({ where: { id: retired.id }, data: { archived: true } });
    const saved = await session.client
      .post(`/api/projects/${project.id}/coordination-issues`)
      .send({ description: 'Old snag list', vendor_ids: [retired.id] });
    expect(saved.status).toBe(201);
    expect(saved.body.vendors).toEqual([{ id: retired.id, name: 'Retired Works', archived: true }]);
  });

  it('refuses attaching to an archived item and writing on an archived project (US1-12, FR-025)', async () => {
    const { admin, session, project } = await setup();
    const shelved = await createTimelineItem(admin.id, { projectId: project.id, name: 'Shelved', deadline: dayOffset(2), archived: true });
    for (const path of ['delays', 'coordination-issues']) {
      const attempt = await session.client
        .post(`/api/projects/${project.id}/${path}`)
        .send({ ...textFor(path), timeline_item_id: shelved.id });
      expect(attempt.status).toBe(409);
      expect(attempt.body.code).toBe('ITEM_ARCHIVED');
    }
    await session.client.post(`/api/projects/${project.id}/archive`);
    for (const path of ['delays', 'coordination-issues']) {
      const attempt = await session.client.post(`/api/projects/${project.id}/${path}`).send(textFor(path));
      expect(attempt.status).toBe(409);
      expect(attempt.body.code).toBe('PROJECT_ARCHIVED');
    }
  });

  it('keeps the vendor name on an issue after the vendor is unlinked (Edge Cases)', async () => {
    const { session, vendor, project } = await setup();
    const issue = await session.client
      .post(`/api/projects/${project.id}/coordination-issues`)
      .send({ description: 'Clash', vendor_ids: [vendor.id] });
    const link = await prisma.vendorProjectLink.findFirstOrThrow({ where: { vendorId: vendor.id, projectId: project.id } });
    expect((await session.client.delete(`/api/links/${link.id}`)).status).toBe(200);
    const onProject = await session.client.get(`/api/projects/${project.id}/timeline`);
    expect(onProject.body.coordination_issues[0]).toMatchObject({ id: issue.body.id, vendors: [{ id: vendor.id, name: 'Sharma Interiors' }] });
  });

  it('has no route to edit, delete, close, or resolve a delay or issue (FR-018, FR-029)', async () => {
    const { session, project } = await setup();
    const delay = await session.client.post(`/api/projects/${project.id}/delays`).send({ reason: 'Rain' });
    const issue = await session.client.post(`/api/projects/${project.id}/coordination-issues`).send({ description: 'Clash' });
    for (const path of [`/api/delays/${delay.body.id}`, `/api/coordination-issues/${issue.body.id}`]) {
      expect((await session.client.patch(path).send({ reason: 'x', description: 'x' })).status).toBe(404);
      expect((await session.client.delete(path)).status).toBe(404);
      expect((await session.client.post(`${path}/close`)).status).toBe(404);
      expect((await session.client.post(`${path}/resolve`)).status).toBe(404);
    }
    expect(await prisma.delay.count()).toBe(1);
    expect(await prisma.coordinationIssue.count()).toBe(1);
  });

  it('lets the Accountant record both and refuses signed-out or revoked people (FR-024, SC-007)', async () => {
    const { admin, session, project } = await setup();
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
    const accountant = await signIn('accountant@example.com');
    expect((await accountant.client.post(`/api/projects/${project.id}/delays`).send({ reason: 'Rain' })).status).toBe(201);
    expect((await accountant.client.post(`/api/projects/${project.id}/coordination-issues`).send({ description: 'Clash' })).status).toBe(201);

    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const officeSession = await signIn('office@example.com');
    await session.client.patch(`/api/staff/${office.id}`).send({ revoked: true });
    for (const path of [`/api/projects/${project.id}/delays`, `/api/projects/${project.id}/coordination-issues`]) {
      expect((await request(app).post(path).send({ reason: 'x', description: 'x' })).status).toBe(401);
      expect((await officeSession.client.post(path).send({ reason: 'x', description: 'x' })).status).toBe(401);
    }
    expect(await prisma.delay.count()).toBe(1);
    expect(await prisma.coordinationIssue.count()).toBe(1);
  });
});
