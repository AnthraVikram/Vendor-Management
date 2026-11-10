import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HistoryAction } from '@prisma/client';
import { prisma } from '../../src/db';
import {
  app,
  createAdvance,
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

// Feature 005 US3 (T029): the dashboard overview — counts, progress, recently updated projects and recent activity
// (US3-1 to US3-4, US3-7, FR-020 to FR-025). Every figure comes from the saved records.

type Agent = Awaited<ReturnType<typeof signIn>>['client'];

let admin: { id: string };
let client: Agent;

async function items(projectId: string, done: number, open: number) {
  for (let index = 0; index < done + open; index += 1) {
    const item = await createTimelineItem(admin.id, { projectId, name: `Item ${index}`, deadline: dayOffset(10 + index) });
    if (index < done) await insertProgressUpdate({ itemId: item.id, status: 'DONE', actorId: admin.id });
  }
}

async function history(target: { vendorId?: string; projectId?: string; clientAdvanceId?: string }, action: HistoryAction, minutesAgo: number) {
  return prisma.historyEntry.create({
    data: { ...target, action, createdAt: new Date(Date.now() - minutesAgo * 60_000), createdById: admin.id, updatedById: admin.id },
  });
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  client = (await signIn('admin@example.com')).client;
});

describe('dashboard counts (US3-1, FR-020)', () => {
  it('counts vendors and projects from the saved records, each project once whatever its sections', async () => {
    const category = await createCategory(admin.id, 'Carpentry');
    const mehta = await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000801', categoryId: category.id });
    await createVendor(admin.id, { name: 'Rao Electrical', phone: '9000000802', categoryId: category.id });
    const old = await createVendor(admin.id, { name: 'Old Glass', phone: '9000000803', categoryId: category.id });
    await prisma.vendor.update({ where: { id: old.id }, data: { archived: true } });

    // One vendor in two sections of a project still counts as one vendor (no double counting).
    const lake = (await client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' })).body as { id: string };
    const detail = (await client.get(`/api/projects/${lake.id}`)).body as { sections: { id: string }[] };
    await client.post(`/api/sections/${detail.sections[0].id}/assignments`).send({ vendor_id: mehta.id });
    await client.post(`/api/sections/${detail.sections[1].id}/assignments`).send({ vendor_id: mehta.id });
    await items(lake.id, 1, 1);

    const halfway = await createProject(admin.id, 'Hill Villa', 'ON_HOLD');
    await items(halfway.id, 2, 2);
    const notStarted = await createProject(admin.id, 'Studio', 'PLANNED');
    await items(notStarted.id, 0, 2);
    const finished = await createProject(admin.id, 'All Done', 'ACTIVE');
    await items(finished.id, 2, 0);
    await createProject(admin.id, 'No Items', 'ACTIVE');
    const closed = await createProject(admin.id, 'Closed Early', 'COMPLETED');
    await items(closed.id, 1, 1);
    const shelved = await createProject(admin.id, 'Shelved', 'ACTIVE');
    await items(shelved.id, 1, 1);
    await prisma.project.update({ where: { id: shelved.id }, data: { archived: true } });

    const response = await client.get('/api/dashboard/overview');
    expect(response.status).toBe(200);
    expect(response.body.counts).toEqual({
      vendors_all: 3,
      vendors_archived: 1,
      projects_not_archived: 6,
      // Lake House 50% and Hill Villa 50%; not 0%, 100%, no items, Completed or archived.
      projects_in_progress: 2,
      projects_archived: 1,
    });
  });

  it('leaves the Feature 003 summary and the Feature 004 dashboard responses as they were (FR-025)', async () => {
    const summary = await client.get('/api/dashboard/summary');
    expect(Object.keys(summary.body.vendors)).toEqual(['active']);
    expect(Object.keys(summary.body.projects).sort()).toEqual(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'PLANNED']);
    const dashboard = await client.get('/api/dashboard');
    expect(Object.keys(dashboard.body).sort()).toEqual(['attention_projects', 'due_soon', 'items', 'missing_update', 'overdue', 'recent_delays_and_issues', 'today']);
  });
});

describe('project progress (US3-2, US3-3, FR-022)', () => {
  it('lists up to 10 open projects with items, lowest percentage first, from done over non-archived items', async () => {
    for (const [index, done] of [3, 0, 1, 2, 4, 1, 2, 3, 0, 1, 2].entries()) {
      const project = await createProject(admin.id, `Project ${String(index).padStart(2, '0')}`, 'ACTIVE');
      await items(project.id, done, 4 - done);
    }
    const withArchivedItem = await createProject(admin.id, 'Archived Item', 'ACTIVE');
    await items(withArchivedItem.id, 1, 1);
    await createTimelineItem(admin.id, { projectId: withArchivedItem.id, name: 'Dropped', deadline: dayOffset(5), archived: true });
    await createProject(admin.id, 'No Items', 'ACTIVE');
    const completed = await createProject(admin.id, 'Completed One', 'COMPLETED');
    await items(completed.id, 0, 1);

    const { progress } = (await client.get('/api/dashboard/overview')).body as { progress: { name: string; done: number; total: number; percent: number; health: string; status: string }[] };
    expect(progress).toHaveLength(10);
    expect(progress.map((row) => row.percent)).toEqual([...progress.map((row) => row.percent)].sort((a, b) => a - b));
    expect(progress[0]).toMatchObject({ done: 0, total: 4, percent: 0, status: 'ACTIVE' });
    expect(progress[0].health).toBeDefined();
    const names = progress.map((row) => row.name);
    expect(names).not.toContain('No Items');
    expect(names).not.toContain('Completed One');
    // An archived item is not counted: 1 of 2, so 50%.
    expect(progress.find((row) => row.name === 'Archived Item')).toMatchObject({ done: 1, total: 2, percent: 50 });
  });

  it('rounds the percentage to a whole number', async () => {
    const project = await createProject(admin.id, 'Thirds', 'ACTIVE');
    await items(project.id, 1, 2);
    const { progress } = (await client.get('/api/dashboard/overview')).body as { progress: { percent: number }[] };
    expect(progress[0].percent).toBe(33);
  });
});

describe('recently updated projects (US3-4, FR-023)', () => {
  it('lists up to 5 open projects by their newest change to the project, its sections, assignments or timeline', async () => {
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000811', categoryId: category.id });
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((letter) => `Project ${letter}`);
    const projects = [];
    for (const name of names) projects.push(await createProject(admin.id, name, 'ACTIVE'));
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    for (const [index, project] of projects.entries()) {
      await prisma.project.update({ where: { id: project.id }, data: { updatedAt: at(1000 + index) } });
    }
    // Newest changes: a timeline item on C, a progress update on E, a section on F, a section assignment on A, a link on G.
    const item = await createTimelineItem(admin.id, { projectId: projects[2].id, name: 'Tiling', deadline: dayOffset(3) });
    await prisma.timelineItem.update({ where: { id: item.id }, data: { updatedAt: at(10) } });
    const other = await createTimelineItem(admin.id, { projectId: projects[4].id, name: 'Paint', deadline: dayOffset(3) });
    await prisma.timelineItem.update({ where: { id: other.id }, data: { updatedAt: at(900) } });
    await insertProgressUpdate({ itemId: other.id, status: 'IN_PROGRESS', actorId: admin.id, createdAt: at(5) });
    const section = await prisma.projectSection.create({ data: { projectId: projects[5].id, name: 'Execution', position: 0, createdById: admin.id, updatedById: admin.id, updatedAt: at(20) } });
    const sectionA = await prisma.projectSection.create({ data: { projectId: projects[0].id, name: 'Execution', position: 0, createdById: admin.id, updatedById: admin.id, updatedAt: at(800) } });
    await prisma.sectionAssignment.create({ data: { sectionId: sectionA.id, vendorId: vendor.id, createdById: admin.id, updatedById: admin.id, updatedAt: at(2) } });
    await prisma.vendorProjectLink.create({ data: { vendorId: vendor.id, projectId: projects[6].id, createdById: admin.id, updatedById: admin.id, updatedAt: at(30) } });
    expect(section).toBeDefined();
    const archived = await createProject(admin.id, 'Archived Recent', 'ACTIVE');
    await prisma.project.update({ where: { id: archived.id }, data: { archived: true } });

    const { recently_updated: recent } = (await client.get('/api/dashboard/overview')).body as { recently_updated: { name: string; updated_at: string }[] };
    expect(recent.map((row) => row.name)).toEqual(['Project A', 'Project E', 'Project C', 'Project F', 'Project G']);
    expect(new Date(recent[0].updated_at).getTime()).toBeGreaterThan(at(3).getTime());
  });
});

describe('recent activity (US3-4, FR-023)', () => {
  it('lists the 10 newest vendor and project history entries with who, what and when', async () => {
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000821', categoryId: category.id });
    const project = await createProject(admin.id, 'Lake House', 'ACTIVE');
    for (let minutes = 20; minutes >= 9; minutes -= 1) await history({ projectId: project.id }, 'EDITED', minutes);
    await history({ vendorId: vendor.id }, 'ARCHIVED', 1);

    const { recent_activity: activity } = (await client.get('/api/dashboard/overview')).body as {
      recent_activity: { action: string; target: { kind: string; id: string; name: string }; created_at: string; created_by: { name: string } }[];
    };
    expect(activity).toHaveLength(10);
    expect(activity[0]).toMatchObject({ action: 'ARCHIVED', target: { kind: 'vendor', id: vendor.id, name: 'Mehta Carpentry' }, created_by: { name: 'Asha Admin' } });
    expect(activity[1]).toMatchObject({ action: 'EDITED', target: { kind: 'project', id: project.id, name: 'Lake House' } });
    expect(activity.map((row) => new Date(row.created_at).getTime())).toEqual([...activity.map((row) => new Date(row.created_at).getTime())].sort((a, b) => b - a));
  });

  // Feature 003 FR-017 lets all three roles view advance amounts; the overview follows the same ADVANCE_VIEWERS list.
  it('shows client-advance entries to every role allowed to see advance amounts (Feature 003 FR-017, FR-025)', async () => {
    const project = await createProject(admin.id, 'Lake House', 'ACTIVE');
    const advance = await createAdvance({ projectId: project.id, amount: '50000.00', receivedOn: dayOffset(-1), actorId: admin.id });
    await prisma.historyEntry.deleteMany();
    await history({ clientAdvanceId: advance.id }, 'CREATED', 1);
    await history({ projectId: project.id }, 'EDITED', 2);
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    await createUser({ email: 'accounts@example.com', role: 'ACCOUNTANT', actorId: admin.id });

    const kinds = async (agent: Agent) =>
      ((await agent.get('/api/dashboard/overview')).body.recent_activity as { target: { kind: string } }[]).map((row) => row.target.kind);
    expect(await kinds(client)).toEqual(['client_advance', 'project']);
    expect(await kinds((await signIn('accounts@example.com')).client)).toEqual(['client_advance', 'project']);
    expect(await kinds((await signIn('office@example.com')).client)).toEqual(['client_advance', 'project']);
  });
});

describe('access', () => {
  it('refuses signed-out requests to the overview and the summary', async () => {
    expect((await request(app).get('/api/dashboard/overview')).status).toBe(401);
    expect((await request(app).get('/api/dashboard/summary')).status).toBe(401);
  });
});
