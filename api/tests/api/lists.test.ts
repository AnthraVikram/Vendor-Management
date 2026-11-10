import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  app,
  createCategory,
  createProject,
  createTimelineItem,
  createUser,
  createVendor,
  dayOffset,
  insertProgressUpdate,
  linkVendor,
  resetDatabase,
  signIn,
} from '../helpers';

// Feature 005 US1 (T014): Active and Archived views, sorting, paging and counts for the Vendors and Projects lists
// (FR-004, FR-006, FR-021, FR-026). Existing callers that pass none of the new parameters get the old behaviour.

type Agent = Awaited<ReturnType<typeof signIn>>['client'];

async function signedIn() {
  const admin = await createUser({ email: 'admin@example.com' });
  const { client } = await signIn('admin@example.com');
  return { admin, client };
}

function names(body: { name: string }[]): string[] {
  return body.map((row) => row.name);
}

function counts(response: request.Response) {
  return {
    total: response.headers['x-total-count'],
    active: response.headers['x-active-count'],
    archived: response.headers['x-archived-count'],
  };
}

describe('vendor list views, sorting and paging', () => {
  let client: Agent;
  let adminId: string;

  beforeEach(async () => {
    await resetDatabase();
    const session = await signedIn();
    client = session.client;
    adminId = session.admin.id;
    const tiling = await createCategory(adminId, 'Tiling');
    const carpentry = await createCategory(adminId, 'Carpentry');
    const alpha = await createVendor(adminId, { name: 'Alpha Tiles', phone: '9000000501', categoryId: tiling.id, availability: 'LIMITED' });
    const beta = await createVendor(adminId, { name: 'Beta Wood', phone: '9000000502', categoryId: carpentry.id, availability: 'AVAILABLE' });
    await createVendor(adminId, { name: 'Gamma Works', phone: '9000000503', categoryId: carpentry.id });
    const old = await createVendor(adminId, { name: 'Old Glass', phone: '9000000504', categoryId: tiling.id });
    await prisma.vendor.update({ where: { id: old.id }, data: { archived: true } });
    const lake = await createProject(adminId, 'Lake House');
    const hill = await createProject(adminId, 'Hill Villa');
    await linkVendor(adminId, beta.id, lake.id);
    await linkVendor(adminId, beta.id, hill.id);
    await linkVendor(adminId, alpha.id, lake.id);
  });

  it('shows the Active view by default and the Archived view on request, with counts for both', async () => {
    const active = await client.get('/api/vendors');
    expect(names(active.body)).toEqual(['Alpha Tiles', 'Beta Wood', 'Gamma Works']);
    expect(counts(active)).toEqual({ total: '3', active: '3', archived: '1' });

    const archived = await client.get('/api/vendors?view=archived');
    expect(names(archived.body)).toEqual(['Old Glass']);
    expect(counts(archived)).toEqual({ total: '1', active: '3', archived: '1' });
  });

  it('counts both views for the current search', async () => {
    const response = await client.get('/api/vendors?q=o');
    expect(counts(response)).toEqual({ total: '2', active: '2', archived: '1' });
  });

  it.each([
    ['name', ['Alpha Tiles', 'Beta Wood', 'Gamma Works']],
    ['category', ['Beta Wood', 'Gamma Works', 'Alpha Tiles']],
    ['availability', ['Beta Wood', 'Alpha Tiles', 'Gamma Works']],
    ['project_count', ['Beta Wood', 'Alpha Tiles', 'Gamma Works']],
  ])('sorts by %s', async (sort, expected) => {
    expect(names((await client.get(`/api/vendors?sort=${sort}`)).body)).toEqual(expected);
  });

  it('refuses an unknown sort, naming the field', async () => {
    const response = await client.get('/api/vendors?sort=phone');
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('sort');
  });

  it('returns one page when asked, with the total of all matches', async () => {
    const first = await client.get('/api/vendors?limit=2');
    expect(names(first.body)).toEqual(['Alpha Tiles', 'Beta Wood']);
    expect(first.headers['x-total-count']).toBe('3');
    const second = await client.get('/api/vendors?limit=2&offset=2');
    expect(names(second.body)).toEqual(['Gamma Works']);
  });

  it('caps a page at 200 and refuses a negative offset', async () => {
    expect((await client.get('/api/vendors?limit=201')).status).toBe(400);
    expect((await client.get('/api/vendors?offset=-1')).status).toBe(400);
  });

  it('keeps include_archived=true and the plain array body for existing callers', async () => {
    const response = await client.get('/api/vendors?include_archived=true');
    expect(Array.isArray(response.body)).toBe(true);
    expect(names(response.body)).toEqual(['Alpha Tiles', 'Beta Wood', 'Gamma Works', 'Old Glass']);
  });

  it('refuses signed-out requests', async () => {
    expect((await request(app).get('/api/vendors?view=archived')).status).toBe(401);
  });
});

describe('project list views, sorting, paging and the in-progress filter', () => {
  let client: Agent;
  let adminId: string;

  async function itemWith(projectId: string, name: string, status?: 'IN_PROGRESS' | 'DONE', archived = false) {
    const item = await createTimelineItem(adminId, { projectId, name, deadline: dayOffset(10), archived });
    if (status) await insertProgressUpdate({ itemId: item.id, status, actorId: adminId });
    return item;
  }

  beforeEach(async () => {
    await resetDatabase();
    const session = await signedIn();
    client = session.client;
    adminId = session.admin.id;
    // Half done: in progress.
    const half = await createProject(adminId, 'Half Done', 'ACTIVE');
    await prisma.project.update({ where: { id: half.id }, data: { expectedCompletionDate: new Date('2026-12-31T00:00:00Z') } });
    await itemWith(half.id, 'One', 'DONE');
    await itemWith(half.id, 'Two');
    // Nothing done: 0%.
    const started = await createProject(adminId, 'Not Begun', 'PLANNED');
    await prisma.project.update({ where: { id: started.id }, data: { expectedCompletionDate: new Date('2026-12-01T00:00:00Z') } });
    await itemWith(started.id, 'One', 'IN_PROGRESS');
    // All done: 100%.
    const finished = await createProject(adminId, 'All Done', 'ON_HOLD');
    await itemWith(finished.id, 'One', 'DONE');
    // No items at all: never in progress.
    await createProject(adminId, 'Empty Project', 'ACTIVE');
    // Completed with partial progress: never in progress.
    const completed = await createProject(adminId, 'Closed Early', 'COMPLETED');
    await itemWith(completed.id, 'One', 'DONE');
    await itemWith(completed.id, 'Two');
    // Archived with partial progress: never in progress, and only in the Archived view.
    const archived = await createProject(adminId, 'Shelved', 'ACTIVE');
    await itemWith(archived.id, 'One', 'DONE');
    await itemWith(archived.id, 'Two');
    await prisma.project.update({ where: { id: archived.id }, data: { archived: true } });
  });

  it('shows the Active and Archived views with counts for both', async () => {
    const active = await client.get('/api/projects');
    expect(names(active.body)).toEqual(['All Done', 'Closed Early', 'Empty Project', 'Half Done', 'Not Begun']);
    expect(counts(active)).toEqual({ total: '5', active: '5', archived: '1' });
    expect(names((await client.get('/api/projects?view=archived')).body)).toEqual(['Shelved']);
  });

  it('filters to in-progress projects: not archived, not Completed, with items, above 0% and below 100%', async () => {
    const response = await client.get('/api/projects?progress=in_progress');
    expect(names(response.body)).toEqual(['Half Done']);
    expect(response.headers['x-total-count']).toBe('1');
  });

  it('refuses any other progress filter', async () => {
    const response = await client.get('/api/projects?progress=done');
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('progress');
  });

  it.each([
    ['name', ['All Done', 'Closed Early', 'Empty Project', 'Half Done', 'Not Begun']],
    ['status', ['Not Begun', 'Empty Project', 'Half Done', 'All Done', 'Closed Early']],
    ['expected_completion', ['Not Begun', 'Half Done', 'All Done', 'Closed Early', 'Empty Project']],
    ['progress', ['Not Begun', 'Closed Early', 'Half Done', 'All Done', 'Empty Project']],
  ])('sorts by %s', async (sort, expected) => {
    expect(names((await client.get(`/api/projects?sort=${sort}`)).body)).toEqual(expected);
  });

  it('refuses an unknown sort', async () => {
    expect((await client.get('/api/projects?sort=client')).status).toBe(400);
  });

  it('pages after sorting', async () => {
    const page = await client.get('/api/projects?sort=name&limit=2&offset=1');
    expect(names(page.body)).toEqual(['Closed Early', 'Empty Project']);
    expect(page.headers['x-total-count']).toBe('5');
  });

  it('keeps include_archived=true for existing callers', async () => {
    const response = await client.get('/api/projects?include_archived=true');
    expect(response.body).toHaveLength(6);
  });

  it('refuses signed-out requests', async () => {
    expect((await request(app).get('/api/projects?view=archived')).status).toBe(401);
  });
});
