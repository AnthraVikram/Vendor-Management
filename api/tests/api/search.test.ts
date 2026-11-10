import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { app, createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';

// Feature 005 US7 (T039): the header search over vendor names and phones and project names and client names
// (US7-1, FR-037, contract "Search").

type Agent = Awaited<ReturnType<typeof signIn>>['client'];

let admin: { id: string };
let client: Agent;
let categoryId: string;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser({ email: 'admin@example.com' });
  client = (await signIn('admin@example.com')).client;
  categoryId = (await createCategory(admin.id, 'Carpentry')).id;
});

function search(q: string) {
  return client.get(`/api/search?q=${encodeURIComponent(q)}`);
}

describe('search limits (FR-037)', () => {
  it.each(['', 'm', 'x'.repeat(101)])('refuses q of %j with 400 and the q field', async (q) => {
    const response = await search(q);
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('q');
  });

  it('refuses a missing q', async () => {
    const response = await client.get('/api/search');
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('q');
  });

  it('accepts 2 and 100 characters', async () => {
    expect((await search('me')).status).toBe(200);
    expect((await search('x'.repeat(100))).status).toBe(200);
  });

  it('refuses signed-out requests', async () => {
    expect((await request(app).get('/api/search?q=meh')).status).toBe(401);
  });
});

describe('search results (US7-1, FR-037)', () => {
  it('finds vendors by name or phone and projects by name or client name, case-insensitively', async () => {
    const mehta = await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000901', categoryId });
    await createVendor(admin.id, { name: 'Rao Electrical', phone: '9000000902', categoryId });
    const lake = await createProject(admin.id, 'Lake House');
    await prisma.project.update({ where: { id: lake.id }, data: { clientName: 'Meher Family' } });
    await createProject(admin.id, 'Studio Fit-out');

    const byName = await search('MEH');
    expect(byName.status).toBe(200);
    expect(byName.body).toEqual({
      vendors: [{ id: mehta.id, name: 'Mehta Carpentry', phone: '9000000901', archived: false }],
      projects: [{ id: lake.id, name: 'Lake House', client_name: 'Meher Family', archived: false }],
    });

    const byPhone = await search('0902');
    expect(byPhone.body.vendors.map((vendor: { name: string }) => vendor.name)).toEqual(['Rao Electrical']);
    expect(byPhone.body.projects).toEqual([]);
  });

  it('includes archived records, marked archived', async () => {
    const old = await createVendor(admin.id, { name: 'Old Glass', phone: '9000000903', categoryId });
    await prisma.vendor.update({ where: { id: old.id }, data: { archived: true } });
    const office = await createProject(admin.id, 'Old Office');
    await prisma.project.update({ where: { id: office.id }, data: { archived: true } });

    const response = await search('old');
    expect(response.body.vendors).toEqual([expect.objectContaining({ name: 'Old Glass', archived: true })]);
    expect(response.body.projects).toEqual([expect.objectContaining({ name: 'Old Office', archived: true })]);
  });

  it('returns at most 5 of each, name matches first', async () => {
    // Six vendors whose phones contain 77 but whose names do not, and one whose name does.
    for (let index = 0; index < 6; index += 1) {
      await createVendor(admin.id, { name: `Vendor ${index}`, phone: `90000077${index}0`, categoryId });
    }
    await createVendor(admin.id, { name: 'Shop 77', phone: '9000000999', categoryId });
    for (let index = 0; index < 6; index += 1) {
      const project = await createProject(admin.id, `Project ${index}`);
      await prisma.project.update({ where: { id: project.id }, data: { clientName: `Client 77-${index}` } });
    }
    await createProject(admin.id, 'Tower 77');

    const response = await search('77');
    expect(response.body.vendors).toHaveLength(5);
    expect(response.body.vendors[0].name).toBe('Shop 77');
    expect(response.body.projects).toHaveLength(5);
    expect(response.body.projects[0].name).toBe('Tower 77');
  });

  it('returns empty lists when nothing matches', async () => {
    await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000901', categoryId });
    expect((await search('zz')).body).toEqual({ vendors: [], projects: [] });
  });
});
