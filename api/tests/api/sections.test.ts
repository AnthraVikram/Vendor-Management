import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { DEFAULT_SECTIONS } from '../../src/lib/blueprint';
import { app, createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';

// Feature 005 US2 (T021): project sections — the blueprint, add, rename, describe, reorder, remove and restore
// (US2-1 to US2-3, US2-7, US2-9, US2-10, FR-008 to FR-014, FR-010a, FR-019).

type Agent = Awaited<ReturnType<typeof signIn>>['client'];
type Section = { id: string; name: string; position: number; description: string | null; notes: string | null };

let client: Agent;
let adminId: string;

async function newProject(name = 'Lake House') {
  const response = await client.post('/api/projects').send({ name, status: 'ACTIVE' });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

async function sectionsOf(projectId: string) {
  const response = await client.get(`/api/projects/${projectId}`);
  return response.body as { sections: Section[]; removed_sections: (Section & { removed_by: { name: string } })[]; sections_version: string };
}

async function historyOf(projectId: string) {
  return prisma.historyEntry.findMany({ where: { projectId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

beforeEach(async () => {
  await resetDatabase();
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  adminId = admin.id;
  client = (await signIn('admin@example.com')).client;
});

describe('the default blueprint (FR-012, FR-013)', () => {
  it('gives a new project its own 15 sections in order, recorded in the CREATED entry only', async () => {
    const project = await newProject();
    const { sections } = await sectionsOf(project.id);
    expect(sections.map((section) => section.name)).toEqual([...DEFAULT_SECTIONS]);
    expect(sections.map((section) => section.position)).toEqual(DEFAULT_SECTIONS.map((_, index) => index));
    const history = await historyOf(project.id);
    expect(history.map((entry) => entry.action)).toEqual(['CREATED']);
    expect(history[0].details).toMatchObject({ blueprint_applied: [...DEFAULT_SECTIONS] });
  });

  it('leaves a project created before Feature 005 without sections', async () => {
    const old = await createProject(adminId, 'Old Lake House');
    const detail = await sectionsOf(old.id);
    expect(detail.sections).toEqual([]);
    expect(detail.removed_sections).toEqual([]);
  });

  it('adds the blueprint to an older project once on request, then refuses', async () => {
    const old = await createProject(adminId, 'Old Lake House');
    const first = await client.post(`/api/projects/${old.id}/sections/blueprint`);
    expect(first.status).toBe(201);
    expect(first.body.sections.map((section: Section) => section.name)).toEqual([...DEFAULT_SECTIONS]);
    expect((await historyOf(old.id)).map((entry) => entry.action)).toEqual(['BLUEPRINT_APPLIED']);
    const again = await client.post(`/api/projects/${old.id}/sections/blueprint`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('HAS_SECTIONS');
  });

  it('changes only the project it is applied to', async () => {
    const a = await newProject('Lake House');
    const b = await newProject('Hill Villa');
    const materials = (await sectionsOf(a.id)).sections.find((section) => section.name === 'Materials')!;
    await client.patch(`/api/sections/${materials.id}`).send({ name: 'Material selection' });
    expect((await sectionsOf(b.id)).sections.map((section) => section.name)).toEqual([...DEFAULT_SECTIONS]);
  });
});

describe('editing sections (US2-2, US2-3, FR-008 to FR-011)', () => {
  it('holds several sections, and adds a custom one last', async () => {
    const project = await newProject();
    const added = await client.post(`/api/projects/${project.id}/sections`).send({ name: '  Landscaping  ', description: 'Garden and lawn' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: 'Landscaping', position: 15, description: 'Garden and lawn' });
    const { sections } = await sectionsOf(project.id);
    expect(sections).toHaveLength(16);
    expect(sections.at(-1)?.name).toBe('Landscaping');
  });

  it('renames and describes a section, recording previous and new values', async () => {
    const project = await newProject();
    const execution = (await sectionsOf(project.id)).sections.find((section) => section.name === 'Execution')!;
    const renamed = await client.patch(`/api/sections/${execution.id}`).send({ name: 'Site execution' });
    expect(renamed.status).toBe(200);
    const described = await client.patch(`/api/sections/${execution.id}`).send({ description: 'Civil and interior works', notes: 'Start after drawings sign-off' });
    expect(described.body).toMatchObject({ name: 'Site execution', description: 'Civil and interior works', notes: 'Start after drawings sign-off' });
    const history = await historyOf(project.id);
    const rename = history.find((entry) => entry.action === 'SECTION_RENAMED')!;
    expect(rename.changes).toEqual({ name: { from: 'Execution', to: 'Site execution' } });
    const edit = history.find((entry) => entry.action === 'SECTION_EDITED')!;
    expect(edit.changes).toEqual({
      description: { from: null, to: 'Civil and interior works' },
      notes: { from: null, to: 'Start after drawings sign-off' },
    });
    expect(edit.details).toMatchObject({ section: { id: execution.id, name: 'Site execution' } });
  });

  it.each([
    ['an empty name', { name: '' }, 'name'],
    ['an 81-character name', { name: 'x'.repeat(81) }, 'name'],
    ['a 5,001-character description', { name: 'Ok', description: 'x'.repeat(5001) }, 'description'],
    ['5,001-character notes', { name: 'Ok', notes: 'x'.repeat(5001) }, 'notes'],
  ])('refuses %s, naming the field', async (_label, body, field) => {
    const project = await newProject();
    const response = await client.post(`/api/projects/${project.id}/sections`).send(body);
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty(field);
  });

  it('refuses a name another current section of the project already uses, whatever its case', async () => {
    const project = await newProject();
    const added = await client.post(`/api/projects/${project.id}/sections`).send({ name: 'execution' });
    expect(added.status).toBe(409);
    expect(added.body.code).toBe('SECTION_NAME_TAKEN');
    expect(added.body.message).toContain('Execution');
    const snagging = (await sectionsOf(project.id)).sections.find((section) => section.name === 'Snagging')!;
    const renamed = await client.patch(`/api/sections/${snagging.id}`).send({ name: 'MATERIALS' });
    expect(renamed.status).toBe(409);
    expect(renamed.body.code).toBe('SECTION_NAME_TAKEN');
  });

  it('reorders all current sections, and refuses a stale or incomplete order', async () => {
    const project = await newProject();
    const before = await sectionsOf(project.id);
    const ids = before.sections.map((section) => section.id);
    const reordered = [ids[6], ...ids.filter((id) => id !== ids[6])];
    const ok = await client.put(`/api/projects/${project.id}/sections/order`).send({ section_ids: reordered, sections_version: before.sections_version });
    expect(ok.status).toBe(200);
    expect(ok.body.sections.map((section: Section) => section.id)).toEqual(reordered);
    expect((await historyOf(project.id)).some((entry) => entry.action === 'SECTIONS_REORDERED')).toBe(true);

    const stale = await client.put(`/api/projects/${project.id}/sections/order`).send({ section_ids: ids, sections_version: before.sections_version });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('SECTIONS_CHANGED');
    expect(stale.body.sections.map((section: Section) => section.id)).toEqual(reordered);

    const fresh = await sectionsOf(project.id);
    const missing = await client.put(`/api/projects/${project.id}/sections/order`).send({ section_ids: ids.slice(1), sections_version: fresh.sections_version });
    expect(missing.status).toBe(400);
  });
});

describe('removing and restoring sections (US2-7, FR-010, FR-010a)', () => {
  it('removes a section without deleting it, ends its vendor assignments, and lists it as removed', async () => {
    const project = await newProject();
    const category = await createCategory(adminId, 'Carpentry');
    const vendor = await createVendor(adminId, { name: 'Mehta Carpentry', phone: '9000000601', categoryId: category.id });
    const budget = (await sectionsOf(project.id)).sections.find((section) => section.name === 'Budget & Costing')!;
    await client.patch(`/api/sections/${budget.id}`).send({ notes: 'Text only' });
    await client.post(`/api/sections/${budget.id}/assignments`).send({ vendor_id: vendor.id });

    const removed = await client.delete(`/api/sections/${budget.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ removed_by: { name: 'Asha Admin' }, ended_assignments: 1 });
    const detail = await sectionsOf(project.id);
    expect(detail.sections.map((section) => section.name)).not.toContain('Budget & Costing');
    expect(detail.removed_sections.map((section) => section.name)).toEqual(['Budget & Costing']);
    expect(await prisma.projectSection.count({ where: { id: budget.id } })).toBe(1);
    expect(await prisma.sectionAssignment.count({ where: { sectionId: budget.id, removedAt: { not: null } } })).toBe(1);
    expect((await client.delete(`/api/sections/${budget.id}`)).body.code).toBe('ALREADY_REMOVED');
  });

  it('restores a removed section last, with its notes, and leaves its vendors past', async () => {
    const project = await newProject();
    const category = await createCategory(adminId, 'Carpentry');
    const vendor = await createVendor(adminId, { name: 'Mehta Carpentry', phone: '9000000602', categoryId: category.id });
    const budget = (await sectionsOf(project.id)).sections.find((section) => section.name === 'Budget & Costing')!;
    await client.patch(`/api/sections/${budget.id}`).send({ notes: 'Text only' });
    await client.post(`/api/sections/${budget.id}/assignments`).send({ vendor_id: vendor.id });
    await client.delete(`/api/sections/${budget.id}`);

    const restored = await client.post(`/api/sections/${budget.id}/restore`);
    expect(restored.status).toBe(200);
    const { sections } = await sectionsOf(project.id);
    expect(sections.at(-1)).toMatchObject({ id: budget.id, name: 'Budget & Costing', notes: 'Text only', position: 14 });
    const current = sections.find((section) => section.id === budget.id) as unknown as { assignments: unknown[] };
    expect(current.assignments).toEqual([]);
    expect((await historyOf(project.id)).some((entry) => entry.action === 'SECTION_RESTORED')).toBe(true);
    expect((await client.post(`/api/sections/${budget.id}/restore`)).body.code).toBe('NOT_REMOVED');
  });

  it('refuses to restore a section whose name is now used by another current section', async () => {
    const project = await newProject();
    const snagging = (await sectionsOf(project.id)).sections.find((section) => section.name === 'Snagging')!;
    await client.delete(`/api/sections/${snagging.id}`);
    await client.post(`/api/projects/${project.id}/sections`).send({ name: 'snagging' });
    const response = await client.post(`/api/sections/${snagging.id}/restore`);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SECTION_NAME_TAKEN');
  });
});

describe('archived projects and access (FR-046)', () => {
  it('refuses every section change on an archived project', async () => {
    const project = await newProject();
    const section = (await sectionsOf(project.id)).sections[0];
    await prisma.project.update({ where: { id: project.id }, data: { archived: true } });
    for (const response of [
      await client.post(`/api/projects/${project.id}/sections`).send({ name: 'Landscaping' }),
      await client.patch(`/api/sections/${section.id}`).send({ name: 'Overview' }),
      await client.delete(`/api/sections/${section.id}`),
    ]) {
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ARCHIVED');
    }
  });

  it.each(['OFFICE_TEAM', 'ACCOUNTANT'] as const)('lets %s change sections, like vendor-project links', async (role) => {
    const project = await newProject();
    await createUser({ email: `${role.toLowerCase()}@example.com`, role, actorId: adminId });
    const other = (await signIn(`${role.toLowerCase()}@example.com`)).client;
    expect((await other.post(`/api/projects/${project.id}/sections`).send({ name: 'Landscaping' })).status).toBe(201);
  });

  it('refuses signed-out requests', async () => {
    const project = await newProject();
    expect((await request(app).post(`/api/projects/${project.id}/sections`).send({ name: 'Landscaping' })).status).toBe(401);
  });
});
