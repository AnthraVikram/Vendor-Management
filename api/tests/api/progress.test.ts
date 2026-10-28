import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createProject, createTimelineItem, createUser, dayOffset, resetDatabase, signIn } from '../helpers';
import { prisma } from '../../src/db';
import { todayInIndia } from '../../src/lib/india-date';

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const session = await signIn('admin@example.com');
  const project = await createProject(admin.id, 'Mehta Residence');
  const item = await createTimelineItem(admin.id, { projectId: project.id, name: 'False ceiling', deadline: dayOffset(10) });
  return { admin, session, project, item };
}

describe('progress updates', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('records status, note, date, and author, and keeps every update in save order (US2-1, US2-2)', async () => {
    const { session, item } = await setup();
    const first = await session.client
      .post(`/api/timeline-items/${item.id}/progress-updates`)
      .send({ status: 'IN_PROGRESS', note: 'Framing done on the east side' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ id: item.id, status: 'IN_PROGRESS', last_update_on: todayInIndia(), done_on: null });

    await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'IN_PROGRESS', note: 'Boards fixed' });
    await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'NOT_STARTED', note: 'Paused for rework' });

    const detail = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(detail.body.status).toBe('NOT_STARTED');
    expect(detail.body.progress_updates.map((row: { note: string }) => row.note)).toEqual([
      'Paused for rework',
      'Boards fixed',
      'Framing done on the east side',
    ]);
    expect(detail.body.progress_updates[2]).toMatchObject({ status: 'IN_PROGRESS', created_by: { name: 'Asha Admin' } });
    expect(detail.body.progress_updates[2].created_at).toBeTruthy();
  });

  it('marks Done with the date of that update, and leaves Done when set back (US2-3, US2-4)', async () => {
    const { session, item } = await setup();
    const done = await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE' });
    expect(done.body).toMatchObject({ status: 'DONE', done_on: todayInIndia() });

    const reopened = await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'IN_PROGRESS' });
    expect(reopened.body).toMatchObject({ status: 'IN_PROGRESS', done_on: null });
    const detail = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(detail.body.progress_updates.map((row: { status: string }) => row.status)).toEqual(['IN_PROGRESS', 'DONE']);
  });

  it('refuses a missing or unknown status (US2-5)', async () => {
    const { session, item } = await setup();
    const missing = await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ note: 'No status' });
    expect(missing.status).toBe(400);
    expect(missing.body.fields).toHaveProperty('status');
    const unknown = await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'PAUSED' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.fields).toHaveProperty('status');
    expect(await prisma.timelineProgressUpdate.count()).toBe(0);
  });

  it('keeps two updates saved at the same time, in save order (Edge Cases)', async () => {
    const { session, item } = await setup();
    const [a, b] = await Promise.all([
      session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'IN_PROGRESS', note: 'A' }),
      session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE', note: 'B' }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const rows = await prisma.timelineProgressUpdate.findMany({ where: { timelineItemId: item.id }, orderBy: { seq: 'asc' } });
    expect(rows).toHaveLength(2);
    const detail = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(detail.body.status).toBe(rows[1].status);
  });

  it('refuses updates on an archived item or project, and has no edit or delete route (US1-12, FR-010, FR-025)', async () => {
    const { admin, session, project, item } = await setup();
    const update = await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'IN_PROGRESS' });
    const updateId = (await prisma.timelineProgressUpdate.findFirstOrThrow()).id;
    expect(update.status).toBe(201);
    expect((await session.client.patch(`/api/progress-updates/${updateId}`).send({ status: 'DONE' })).status).toBe(404);
    expect((await session.client.delete(`/api/progress-updates/${updateId}`)).status).toBe(404);
    expect((await session.client.patch(`/api/timeline-items/${item.id}/progress-updates/${updateId}`).send({ status: 'DONE' })).status).toBe(404);
    expect((await session.client.delete(`/api/timeline-items/${item.id}/progress-updates/${updateId}`)).status).toBe(404);

    const archivedItem = await createTimelineItem(admin.id, { projectId: project.id, name: 'Old', deadline: dayOffset(4), archived: true });
    const onArchivedItem = await session.client.post(`/api/timeline-items/${archivedItem.id}/progress-updates`).send({ status: 'DONE' });
    expect(onArchivedItem.status).toBe(409);
    expect(onArchivedItem.body.code).toBe('ITEM_ARCHIVED');

    await session.client.post(`/api/projects/${project.id}/archive`);
    const onArchivedProject = await session.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE' });
    expect(onArchivedProject.status).toBe(409);
    expect(onArchivedProject.body.code).toBe('PROJECT_ARCHIVED');
    expect(await prisma.timelineProgressUpdate.count()).toBe(1);
  });

  it('keeps an update attributed to its author after the author is revoked (Edge Cases)', async () => {
    const { admin, session, item } = await setup();
    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
    const officeSession = await signIn('office@example.com');
    await officeSession.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'IN_PROGRESS', note: 'Started' });
    expect((await session.client.patch(`/api/staff/${office.id}`).send({ revoked: true })).status).toBe(200);

    const detail = await session.client.get(`/api/timeline-items/${item.id}`);
    expect(detail.body.progress_updates[0].created_by).toEqual({ id: office.id, name: 'Omar Office' });
  });

  it('lets the Accountant record progress and refuses signed-out or revoked people (FR-024, SC-007)', async () => {
    const { admin, session, item } = await setup();
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });
    const accountant = await signIn('accountant@example.com');
    expect((await accountant.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE' })).status).toBe(201);

    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const officeSession = await signIn('office@example.com');
    await session.client.patch(`/api/staff/${office.id}`).send({ revoked: true });
    expect((await request(app).post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE' })).status).toBe(401);
    expect((await officeSession.client.post(`/api/timeline-items/${item.id}/progress-updates`).send({ status: 'DONE' })).status).toBe(401);
    expect(await prisma.timelineProgressUpdate.count()).toBe(1);
  });
});
