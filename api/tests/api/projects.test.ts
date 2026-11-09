import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createCategory, createTimelineItem, createUser, createVendor, dayOffset, insertProgressUpdate, resetDatabase, signIn } from '../helpers';

describe('projects', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 3 scenarios 1 through 4', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const missing = await session.client.post('/api/projects').send({ status: 'ACTIVE' });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.name).toBeTruthy();

    const created = await session.client.post('/api/projects').send({ name: 'Lake House', status: 'COMPLETED' });
    expect(created.status).toBe(201);
    const listed = await session.client.get('/api/projects');
    expect(listed.body.map((row: { name: string; status: string }) => row.status)).toContain('COMPLETED');

    await session.client.post(`/api/projects/${created.body.id}/archive`);
    expect((await session.client.get('/api/projects')).body).toHaveLength(0);
    const opened = await session.client.get(`/api/projects/${created.body.id}`);
    expect(opened.status).toBe(200);
    await session.client.post(`/api/projects/${created.body.id}/restore`);
    expect((await session.client.get('/api/projects')).body).toHaveLength(1);
  });
});

describe('project dates, figures and filters (Feature 004 US5)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function admin() {
    const user = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
    return { user, session: await signIn('admin@example.com') };
  }

  it('accepts optional dates on create and edit: absent keeps, null clears (FR-014)', async () => {
    const { session } = await admin();
    const created = await session.client.post('/api/projects').send({ name: 'Lake House', start_date: '2026-11-01', expected_completion_date: '2026-12-20' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ start_date: '2026-11-01', expected_completion_date: '2026-12-20' });

    const renamed = await session.client.patch(`/api/projects/${created.body.id}`).send({ name: 'Lake House 2' });
    expect(renamed.body).toMatchObject({ start_date: '2026-11-01', expected_completion_date: '2026-12-20' });

    const cleared = await session.client.patch(`/api/projects/${created.body.id}`).send({ name: 'Lake House 2', expected_completion_date: null });
    expect(cleared.body).toMatchObject({ start_date: '2026-11-01', expected_completion_date: null });

    const plain = await session.client.post('/api/projects').send({ name: 'No Dates' });
    expect(plain.body).toMatchObject({ start_date: null, expected_completion_date: null });
  });

  it('refuses a malformed date and a completion date before the start date, naming the fields (FR-015a)', async () => {
    const { session } = await admin();
    const bad = await session.client.post('/api/projects').send({ name: 'Lake House', start_date: '2026-13-45' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.start_date).toBe('Enter a date as YYYY-MM-DD.');

    const order = 'The expected completion date cannot be before the start date.';
    const reversed = await session.client.post('/api/projects').send({ name: 'Lake House', start_date: '2026-12-01', expected_completion_date: '2026-11-30' });
    expect(reversed.status).toBe(400);
    expect(reversed.body.fields).toMatchObject({ start_date: order, expected_completion_date: order });

    const equal = await session.client.post('/api/projects').send({ name: 'Same Day', start_date: '2026-12-01', expected_completion_date: '2026-12-01' });
    expect(equal.status).toBe(201);

    // Only one date sent: it is checked against the stored other date.
    const onlyOne = await session.client.patch(`/api/projects/${equal.body.id}`).send({ name: 'Same Day', expected_completion_date: '2026-11-15' });
    expect(onlyOne.status).toBe(400);
    expect(onlyOne.body.fields).toMatchObject({ start_date: order, expected_completion_date: order });
    expect((await session.client.get(`/api/projects/${equal.body.id}`)).body.expected_completion_date).toBe('2026-12-01');
  });

  it('records a date change in the project history (FR-015a)', async () => {
    const { session } = await admin();
    const created = (await session.client.post('/api/projects').send({ name: 'Lake House', expected_completion_date: '2026-12-20' })).body;
    await session.client.patch(`/api/projects/${created.id}`).send({ name: 'Lake House', start_date: '2026-11-01', expected_completion_date: '2026-12-31' });
    const entries = (await session.client.get('/api/history').query({ project_id: created.id })).body.entries;
    expect(entries[0]).toMatchObject({
      action: 'EDITED',
      changes: { start_date: { from: null, to: '2026-11-01' }, expected_completion_date: { from: '2026-12-20', to: '2026-12-31' } },
    });
  });

  it('lets every role set, change and clear both dates (FR-036, FR-037)', async () => {
    const { user } = await admin();
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: user.id });
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: user.id });
    for (const email of ['admin@example.com', 'office@example.com', 'accountant@example.com']) {
      const session = await signIn(email);
      const created = await session.client.post('/api/projects').send({ name: `By ${email}`, start_date: '2026-11-01', expected_completion_date: '2026-12-01' });
      expect(created.status, email).toBe(201);
      const changed = await session.client.patch(`/api/projects/${created.body.id}`).send({ name: `By ${email}`, expected_completion_date: '2026-12-15' });
      expect(changed.body.expected_completion_date, email).toBe('2026-12-15');
      const cleared = await session.client.patch(`/api/projects/${created.body.id}`).send({ name: `By ${email}`, start_date: null, expected_completion_date: null });
      expect(cleared.body, email).toMatchObject({ start_date: null, expected_completion_date: null });
    }
  });

  it('returns each project\'s figures in the list (US5-1, FR-008)', async () => {
    const { user, session } = await admin();
    const category = await createCategory(user.id, 'Carpentry');
    const vendor = await createVendor(user.id, { name: 'Sharma Interiors', phone: '9000000500', categoryId: category.id });
    const project = (await session.client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE', start_date: dayOffset(-30), expected_completion_date: dayOffset(20) })).body;
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    const done = await createTimelineItem(user.id, { projectId: project.id, name: 'Survey', deadline: dayOffset(-10) });
    await insertProgressUpdate({ itemId: done.id, status: 'DONE', actorId: user.id });
    await createTimelineItem(user.id, { projectId: project.id, name: 'Late', deadline: dayOffset(-2) });
    await createTimelineItem(user.id, { projectId: project.id, name: 'Soon', deadline: dayOffset(3) });
    await createTimelineItem(user.id, { projectId: project.id, name: 'Shelved', deadline: dayOffset(-5), archived: true });
    await session.client.post('/api/projects').send({ name: 'Empty Project' });

    const list = (await session.client.get('/api/projects')).body;
    const lake = list.find((row: { id: string }) => row.id === project.id);
    expect(lake).toMatchObject({
      start_date: dayOffset(-30),
      expected_completion_date: dayOffset(20),
      vendor_count: 1,
      progress: { done: 1, total: 3 },
      overdue_count: 1,
      next_deadline: dayOffset(-2),
      health: 'ONGOING',
    });
    const empty = list.find((row: { name: string }) => row.name === 'Empty Project');
    expect(empty).toMatchObject({ vendor_count: 0, progress: { done: 0, total: 0 }, overdue_count: 0, next_deadline: null, health: 'ONGOING' });
  });

  it('searches name, client and site ignoring case, and filters to projects needing attention (US5-2 to US5-5, FR-009)', async () => {
    const { user, session } = await admin();
    const lake = (await session.client.post('/api/projects').send({ name: 'Lake House', client_name: 'Mehta Family', site_location: 'Pune', status: 'ACTIVE' })).body;
    const studio = (await session.client.post('/api/projects').send({ name: 'Studio Fit-out', client_name: 'Rao Design', site_location: 'Mumbai', status: 'PLANNED' })).body;
    const villa = (await session.client.post('/api/projects').send({ name: 'Hill Villa', client_name: 'Iyer', site_location: 'Lonavala', status: 'ACTIVE' })).body;
    const old = (await session.client.post('/api/projects').send({ name: 'Old Office', client_name: 'Mehta Group', status: 'ACTIVE' })).body;
    await createTimelineItem(user.id, { projectId: lake.id, name: 'Late', deadline: dayOffset(-1) });
    await createTimelineItem(user.id, { projectId: studio.id, name: 'Soon', deadline: dayOffset(7) });
    await createTimelineItem(user.id, { projectId: villa.id, name: 'Later', deadline: dayOffset(8) });
    await createTimelineItem(user.id, { projectId: old.id, name: 'Late too', deadline: dayOffset(-3) });
    await session.client.post(`/api/projects/${old.id}/archive`);

    const ids = async (query: Record<string, string>) => (await session.client.get('/api/projects').query(query)).body.map((row: { name: string }) => row.name).sort();
    expect(await ids({ q: 'mehta' })).toEqual(['Lake House']);
    expect(await ids({ q: 'MUMBAI' })).toEqual(['Studio Fit-out']);
    expect(await ids({ q: 'villa' })).toEqual(['Hill Villa']);
    expect(await ids({ q: 'mehta', include_archived: 'true' })).toEqual(['Lake House', 'Old Office']);
    expect(await ids({ has_overdue: 'true' })).toEqual(['Lake House']);
    expect(await ids({ has_overdue: 'true', include_archived: 'true' })).toEqual(['Lake House', 'Old Office']);
    expect(await ids({ due_within_7: 'true' })).toEqual(['Studio Fit-out']);
    expect(await ids({ status: 'PLANNED' })).toEqual(['Studio Fit-out']);
    expect(await ids({ status: 'ACTIVE', has_overdue: 'true' })).toEqual(['Lake House']);
    expect(await ids({ q: 'nobody' })).toEqual([]);
    expect((await session.client.get('/api/projects').query({ has_overdue: 'yes' })).status).toBe(400);
  });

  it('returns the overview figures and up to 5 upcoming items on the project (US5-6, US5-7, FR-009a)', async () => {
    const { user, session } = await admin();
    const project = (await session.client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE', expected_completion_date: dayOffset(10) })).body;
    for (const [index, days] of [12, -2, 1, 4, 30, 15, 2].entries()) {
      await createTimelineItem(user.id, { projectId: project.id, name: `Item ${index}`, deadline: dayOffset(days) });
    }
    const done = await createTimelineItem(user.id, { projectId: project.id, name: 'Done late', deadline: dayOffset(20) });
    await insertProgressUpdate({ itemId: done.id, status: 'DONE', actorId: user.id });

    const view = (await session.client.get(`/api/projects/${project.id}`)).body;
    expect(view).toMatchObject({
      expected_completion_date: dayOffset(10),
      health: 'ONGOING',
      progress: { done: 1, total: 8 },
      overdue_count: 1,
      after_completion_count: 3,
      completed_on: null,
    });
    expect(view.upcoming.map((item: { deadline: string }) => item.deadline)).toEqual([dayOffset(-2), dayOffset(1), dayOffset(2), dayOffset(4), dayOffset(12)]);
    expect(view.upcoming[0]).toMatchObject({ name: 'Item 1', item_type: 'ACTIVITY', status: 'NOT_STARTED' });
    expect(view.upcoming[0].flags).toEqual([{ type: 'OVERDUE', days_overdue: 2 }]);

    const empty = (await session.client.post('/api/projects').send({ name: 'Empty' })).body;
    const emptyView = (await session.client.get(`/api/projects/${empty.id}`)).body;
    expect(emptyView).toMatchObject({ progress: { done: 0, total: 0 }, overdue_count: 0, after_completion_count: 0, upcoming: [] });
  });

  it('works out health from status and the expected completion date only (FR-017, edge cases)', async () => {
    const { user, session } = await admin();
    const make = async (name: string, status: string, date: string | null) =>
      (await session.client.post('/api/projects').send({ name, status, expected_completion_date: date })).body;
    const today = await make('Due Today', 'ACTIVE', dayOffset(0));
    const yesterday = await make('Due Yesterday', 'ACTIVE', dayOffset(-1));
    const finished = await make('Finished', 'COMPLETED', dayOffset(-30));
    const held = await make('Held', 'ON_HOLD', dayOffset(-1));
    const undated = await make('Undated', 'PLANNED', null);
    await createTimelineItem(user.id, { projectId: undated.id, name: 'Late', deadline: dayOffset(-5) });
    const archived = await make('Archived Late', 'ACTIVE', dayOffset(-1));
    await session.client.post(`/api/projects/${archived.id}/archive`);

    const health = async (id: string) => (await session.client.get(`/api/projects/${id}`)).body.health;
    expect(await health(today.id)).toBe('ONGOING');
    expect(await health(yesterday.id)).toBe('DELAYED');
    expect(await health(finished.id)).toBe('COMPLETED');
    expect(await health(held.id)).toBe('DELAYED');
    // An overdue item does not make a project Delayed: it shows as the overdue count.
    expect(await health(undated.id)).toBe('ONGOING');
    expect((await session.client.get(`/api/projects/${undated.id}`)).body.overdue_count).toBe(1);
    expect(await health(archived.id)).toBe('DELAYED');
  });

  it('reads the completion date from history (FR-014a)', async () => {
    const { session } = await admin();
    const project = (await session.client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' })).body;
    await session.client.patch(`/api/projects/${project.id}`).send({ name: 'Lake House', status: 'COMPLETED' });
    expect((await session.client.get(`/api/projects/${project.id}`)).body.completed_on).toBe(dayOffset(0));

    await session.client.patch(`/api/projects/${project.id}`).send({ name: 'Lake House', status: 'ACTIVE' });
    expect((await session.client.get(`/api/projects/${project.id}`)).body.completed_on).toBeNull();

    const bornDone = (await session.client.post('/api/projects').send({ name: 'Born Done', status: 'COMPLETED' })).body;
    const view = (await session.client.get(`/api/projects/${bornDone.id}`)).body;
    expect(view.health).toBe('COMPLETED');
    expect(view.completed_on).toBeNull();
  });

  it('refuses signed-out callers on every project route (SC-008)', async () => {
    const { session } = await admin();
    const project = (await session.client.post('/api/projects').send({ name: 'Lake House' })).body;
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get(`/api/projects/${project.id}`)).status).toBe(401);
    expect((await request(app).post('/api/projects').send({ name: 'X' })).status).toBe(401);
    expect((await request(app).patch(`/api/projects/${project.id}`).send({ name: 'X', start_date: '2026-11-01' })).status).toBe(401);
  });
});
