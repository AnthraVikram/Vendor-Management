import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { app, createCategory, createUser, createVendor, resetDatabase, signIn } from '../helpers';

// Feature 005 US2 (T022): vendors assigned to project sections (US2-4 to US2-6, US2-8, FR-015 to FR-019).

type Agent = Awaited<ReturnType<typeof signIn>>['client'];
type Assignment = { id: string; vendor_id: string; vendor_name: string; vendor_phone: string; role_in_section: string | null };
type Section = { id: string; name: string; assignments: Assignment[] };
type Link = { id: string; vendor_id: string; vendor_name: string; assignment_status: string; sections: { id: string; name: string }[] };

let client: Agent;
let adminId: string;
let carpentryId: string;

async function newProject(name: string) {
  return (await client.post('/api/projects').send({ name, status: 'ACTIVE' })).body as { id: string };
}

async function detail(projectId: string) {
  return (await client.get(`/api/projects/${projectId}`)).body as { sections: Section[]; links: Link[]; past_links: unknown[] };
}

async function section(projectId: string, name: string) {
  return (await detail(projectId)).sections.find((row) => row.name === name)!;
}

async function vendor(name: string, phone: string) {
  return createVendor(adminId, { name, phone, categoryId: carpentryId });
}

function assign(sectionId: string, vendorId: string, role?: string) {
  return client.post(`/api/sections/${sectionId}/assignments`).send({ vendor_id: vendorId, ...(role ? { role_in_section: role } : {}) });
}

beforeEach(async () => {
  await resetDatabase();
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  adminId = admin.id;
  carpentryId = (await createCategory(adminId, 'Carpentry')).id;
  client = (await signIn('admin@example.com')).client;
});

describe('who works on which section (US2-4, US2-5, FR-015, FR-016)', () => {
  it('lets one section have several vendors, each shown with contact details and role', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000701');
    const rao = await vendor('Rao Electrical', '9000000702');
    const execution = await section(lake.id, 'Execution');
    expect((await assign(execution.id, mehta.id, 'Lead carpenter')).status).toBe(201);
    expect((await assign(execution.id, rao.id, 'Wiring')).status).toBe(201);
    const shown = await section(lake.id, 'Execution');
    expect(shown.assignments.map((row) => [row.vendor_name, row.vendor_phone, row.role_in_section])).toEqual([
      ['Mehta Carpentry', '9000000701', 'Lead carpenter'],
      ['Rao Electrical', '9000000702', 'Wiring'],
    ]);
  });

  it('lets one vendor work in several sections and several projects without a second vendor record', async () => {
    const lake = await newProject('Lake House');
    const hill = await newProject('Hill Villa');
    const mehta = await vendor('Mehta Carpentry', '9000000703');
    await assign((await section(lake.id, 'Execution')).id, mehta.id);
    await assign((await section(lake.id, 'Site Coordination')).id, mehta.id);
    await assign((await section(hill.id, 'Materials')).id, mehta.id);
    expect(await prisma.vendor.count()).toBe(1);

    const lakeLink = (await detail(lake.id)).links.find((link) => link.vendor_id === mehta.id)!;
    expect(lakeLink.sections.map((row) => row.name)).toEqual(['Execution', 'Site Coordination']);
    const profile = (await client.get(`/api/vendors/${mehta.id}`)).body as { links: { project_id: string; sections: { name: string }[] }[] };
    expect(profile.links.find((link) => link.project_id === lake.id)!.sections.map((row) => row.name)).toEqual(['Execution', 'Site Coordination']);
    expect(profile.links.find((link) => link.project_id === hill.id)!.sections.map((row) => row.name)).toEqual(['Materials']);
  });

  it('refuses the same vendor twice in one section, even when two requests race', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000704');
    const execution = await section(lake.id, 'Execution');
    const responses = await Promise.all([assign(execution.id, mehta.id), assign(execution.id, mehta.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)!.body.code).toMatch(/SECTION_ASSIGNMENT_EXISTS|LINK_EXISTS/);
    expect(await prisma.sectionAssignment.count({ where: { removedAt: null } })).toBe(1);
    expect(await prisma.vendorProjectLink.count({ where: { removedAt: null } })).toBe(1);
    expect((await assign(execution.id, mehta.id)).body.code).toBe('SECTION_ASSIGNMENT_EXISTS');
  });

  it('refuses a role longer than 120 characters', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000705');
    const response = await assign((await section(lake.id, 'Execution')).id, mehta.id, 'x'.repeat(121));
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('role_in_section');
  });
});

describe('assigning to the project at the same time (FR-015a)', () => {
  it('uses the existing project assignment when the vendor is already on the project', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000711');
    await client.post(`/api/projects/${lake.id}/links`).send({ vendor_id: mehta.id, role_on_project: 'Joinery' });
    const response = await assign((await section(lake.id, 'Execution')).id, mehta.id);
    expect(response.status).toBe(201);
    expect(response.body.project_assignment_created).toBe(false);
    expect(await prisma.vendorProjectLink.count()).toBe(1);
  });

  it('assigns a vendor to the project as well when needed, recording both on the vendor and the project', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000712');
    const response = await assign((await section(lake.id, 'Execution')).id, mehta.id);
    expect(response.status).toBe(201);
    expect(response.body.project_assignment_created).toBe(true);

    const links = (await detail(lake.id)).links;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ vendor_name: 'Mehta Carpentry', assignment_status: 'NO_ACTIVITIES' });
    const link = await prisma.vendorProjectLink.findFirstOrThrow({ where: { vendorId: mehta.id } });
    expect([link.roleOnProject, link.scopeOfWork, link.note]).toEqual([null, null, null]);
    for (const target of [{ vendorId: mehta.id }, { projectId: lake.id }]) {
      const actions = (await prisma.historyEntry.findMany({ where: target })).map((entry) => entry.action);
      expect(actions).toEqual(expect.arrayContaining(['ASSIGNED', 'SECTION_ASSIGNED']));
    }
  });

  it('saves neither assignment when the vendor or the project is archived', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000713');
    await prisma.vendor.update({ where: { id: mehta.id }, data: { archived: true } });
    const response = await assign((await section(lake.id, 'Execution')).id, mehta.id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ARCHIVED');
    expect(await prisma.vendorProjectLink.count()).toBe(0);
    expect(await prisma.sectionAssignment.count()).toBe(0);
  });

  it('saves neither when the section assignment fails after the project assignment was made', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000714');
    const execution = await section(lake.id, 'Execution');
    // A section removed after the page was read: the project assignment must roll back with the refusal.
    await client.delete(`/api/sections/${execution.id}`);
    const response = await assign(execution.id, mehta.id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SECTION_REMOVED');
    expect(await prisma.vendorProjectLink.count()).toBe(0);
  });

  it('refuses an unknown vendor', async () => {
    const lake = await newProject('Lake House');
    const response = await assign((await section(lake.id, 'Execution')).id, '00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
  });
});

describe('ending section assignments (US2-6, FR-015b, FR-017)', () => {
  it('ends one section assignment and leaves the vendor in other sections and on the project', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000721');
    const execution = await section(lake.id, 'Execution');
    const coordination = await section(lake.id, 'Site Coordination');
    const first = (await assign(execution.id, mehta.id)).body.assignment as { id: string };
    await assign(coordination.id, mehta.id);

    const ended = await client.delete(`/api/section-assignments/${first.id}`);
    expect(ended.status).toBe(200);
    expect(ended.body.removed_by).toMatchObject({ name: 'Asha Admin' });
    const after = await detail(lake.id);
    expect(after.sections.find((row) => row.name === 'Execution')!.assignments).toEqual([]);
    expect(after.sections.find((row) => row.name === 'Site Coordination')!.assignments.map((row) => row.vendor_name)).toEqual(['Mehta Carpentry']);
    expect(after.links.map((link) => link.vendor_name)).toEqual(['Mehta Carpentry']);
    expect(after.links[0].sections.map((row) => row.name)).toEqual(['Site Coordination']);
    expect(await prisma.sectionAssignment.count()).toBe(2);
    expect((await client.delete(`/api/section-assignments/${first.id}`)).body.code).toBe('ALREADY_REMOVED');
  });

  it('keeps the project assignment when the last section assignment ends', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000722');
    const only = (await assign((await section(lake.id, 'Execution')).id, mehta.id)).body.assignment as { id: string };
    await client.delete(`/api/section-assignments/${only.id}`);
    expect((await detail(lake.id)).links.map((link) => link.vendor_name)).toEqual(['Mehta Carpentry']);
  });

  it('ends every section assignment of a vendor removed from the project, and only on that project', async () => {
    const lake = await newProject('Lake House');
    const hill = await newProject('Hill Villa');
    const mehta = await vendor('Mehta Carpentry', '9000000723');
    await assign((await section(lake.id, 'Execution')).id, mehta.id);
    await assign((await section(lake.id, 'Materials')).id, mehta.id);
    await assign((await section(hill.id, 'Execution')).id, mehta.id);
    const lakeLink = (await detail(lake.id)).links[0];

    const removed = await client.delete(`/api/links/${lakeLink.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.ended_section_assignments).toBe(2);
    const lakeAfter = await detail(lake.id);
    expect(lakeAfter.links).toEqual([]);
    expect(lakeAfter.sections.every((row) => row.assignments.length === 0)).toBe(true);
    expect((await section(hill.id, 'Execution')).assignments.map((row) => row.vendor_name)).toEqual(['Mehta Carpentry']);
    const unassigned = await prisma.historyEntry.count({ where: { vendorId: mehta.id, action: 'SECTION_UNASSIGNED' } });
    expect(unassigned).toBe(2);
  });

  it('edits the role in a section with history, and refuses editing an ended one', async () => {
    const lake = await newProject('Lake House');
    const mehta = await vendor('Mehta Carpentry', '9000000724');
    const row = (await assign((await section(lake.id, 'Execution')).id, mehta.id, 'Helper')).body.assignment as { id: string };
    const edited = await client.patch(`/api/section-assignments/${row.id}`).send({ role_in_section: 'Lead carpenter' });
    expect(edited.status).toBe(200);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { projectId: lake.id, action: 'SECTION_ASSIGNMENT_EDITED' } });
    expect(entry.changes).toEqual({ role_in_section: { from: 'Helper', to: 'Lead carpenter' } });
    await client.delete(`/api/section-assignments/${row.id}`);
    expect((await client.patch(`/api/section-assignments/${row.id}`).send({ role_in_section: 'X' })).body.code).toBe('SECTION_ASSIGNMENT_REMOVED');
  });
});

describe('access (FR-046)', () => {
  it('refuses signed-out requests on every assignment route', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await request(app).post(`/api/sections/${id}/assignments`).send({ vendor_id: id })).status).toBe(401);
    expect((await request(app).patch(`/api/section-assignments/${id}`).send({ role_in_section: 'x' })).status).toBe(401);
    expect((await request(app).delete(`/api/section-assignments/${id}`)).status).toBe(401);
  });
});
