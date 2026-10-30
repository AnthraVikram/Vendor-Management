import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { app, createCategory, createUser, dayOffset, resetDatabase, resetFileStorage, signIn } from '../helpers';
import { csvBuffer, pdfBuffer, TEMPLATE_HEADINGS, vendorRow } from '../fixtures/files';

type Session = Awaited<ReturnType<typeof signIn>>;
type Entry = { action: string; changes: Record<string, { from: unknown; to: unknown }>; details: Record<string, unknown>; created_at: string; created_by: { id: string; name: string } };

function history(session: Session, query: Record<string, string>) {
  return session.client.get('/api/history').query(query);
}

async function entries(session: Session, query: Record<string, string>): Promise<Entry[]> {
  const response = await history(session, query);
  expect(response.status).toBe(200);
  return response.body.entries;
}

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const tiles = await createCategory(admin.id, 'Tiles');
  const marble = await createCategory(admin.id, 'Marble');
  return {
    admin,
    office,
    accountant,
    tiles,
    marble,
    asAdmin: await signIn('admin@example.com'),
    asOffice: await signIn('office@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

function vendorBody(categoryIds: string[], extra: Record<string, unknown> = {}) {
  return { name: 'Sharma Interiors', phone: '98765 43210', category_ids: categoryIds, locations: ['Pune'], ...extra };
}

describe('history (US5)', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('records a vendor create, one EDITED entry with the changed fields, nothing for an unchanged save, and archive and restore (US5-3)', async () => {
    const { office, tiles, marble, asOffice } = await setup();
    const created = await asOffice.client.post('/api/vendors').send(vendorBody([tiles.id]));
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const edited = await asOffice.client.patch(`/api/vendors/${id}`).send(vendorBody([tiles.id, marble.id], { phone: '98765 43211' }));
    expect(edited.status).toBe(200);
    const unchanged = await asOffice.client.patch(`/api/vendors/${id}`).send(vendorBody([tiles.id, marble.id], { phone: '98765 43211' }));
    expect(unchanged.status).toBe(200);
    expect((await asOffice.client.post(`/api/vendors/${id}/archive`)).status).toBe(200);
    expect((await asOffice.client.post(`/api/vendors/${id}/restore`)).status).toBe(200);

    const list = await entries(asOffice, { vendor_id: id });
    expect(list.map((e) => e.action)).toEqual(['RESTORED', 'ARCHIVED', 'EDITED', 'CREATED']);
    expect(list.every((e) => e.created_by.id === office.id && e.created_by.name === 'Omar Office')).toBe(true);
    const edit = list[2];
    expect(Object.keys(edit.changes).sort()).toEqual(['categories', 'phone']);
    expect(edit.changes.phone).toEqual({ from: '98765 43210', to: '98765 43211' });
    expect(edit.changes.categories).toEqual({ from: ['Tiles'], to: ['Marble', 'Tiles'] });
    expect(list[3].changes).toEqual({});
  });

  it('records a project create, one EDITED entry over the compared fields, nothing for an unchanged save, and archive and restore (US5-3)', async () => {
    const { admin, asAdmin } = await setup();
    const created = await asAdmin.client.post('/api/projects').send({ name: 'Kapoor Residence', client_name: 'R. Kapoor', status: 'PLANNED' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const change = { name: 'Kapoor Villa', client_name: 'R. Kapoor', site_location: 'Baner', description: 'Full interiors', status: 'ACTIVE' };
    expect((await asAdmin.client.patch(`/api/projects/${id}`).send(change)).status).toBe(200);
    expect((await asAdmin.client.patch(`/api/projects/${id}`).send(change)).status).toBe(200);
    expect((await asAdmin.client.post(`/api/projects/${id}/archive`)).status).toBe(200);
    expect((await asAdmin.client.post(`/api/projects/${id}/restore`)).status).toBe(200);

    const list = await entries(asAdmin, { project_id: id });
    expect(list.map((e) => e.action)).toEqual(['RESTORED', 'ARCHIVED', 'EDITED', 'CREATED']);
    expect(list.every((e) => e.created_by.id === admin.id)).toBe(true);
    expect(list[2].changes).toEqual({
      name: { from: 'Kapoor Residence', to: 'Kapoor Villa' },
      site_location: { from: null, to: 'Baner' },
      description: { from: null, to: 'Full interiors' },
      status: { from: 'PLANNED', to: 'ACTIVE' },
    });
  });

  it('returns the entries that documents, imports, and advances write (US5-1, US5-2)', async () => {
    const { office, accountant, asOffice, asAccountant, asAdmin } = await setup();

    const project = await asAdmin.client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' });
    const doc = await asOffice.client
      .post(`/api/projects/${project.body.id}/documents`)
      .field('title', 'Plan')
      .field('document_type', 'DRAWING')
      .attach('file', pdfBuffer(), 'plan.pdf');
    expect(doc.status).toBe(201);
    await asOffice.client.post(`/api/documents/${doc.body.id}/archive`);
    await asOffice.client.post(`/api/documents/${doc.body.id}/restore`);
    const docEntries = await entries(asAccountant, { document_id: doc.body.id });
    expect(docEntries.map((e) => e.action)).toEqual(['RESTORED', 'ARCHIVED', 'CREATED']);
    expect(docEntries.every((e) => e.created_by.id === office.id)).toBe(true);

    const csv = csvBuffer(TEMPLATE_HEADINGS, [vendorRow({ Name: 'Imported One', Phone: '91111 22222', Categories: 'Tiles' })]);
    const preview = await asOffice.client.post('/api/vendor-imports/previews').attach('file', csv, 'one.csv');
    expect(preview.status).toBe(201);
    const confirmed = await asOffice.client.post(`/api/vendor-imports/previews/${preview.body.id}/confirm`).send({ approved_rows: [] });
    expect(confirmed.status).toBe(201);
    const runEntries = await entries(asAccountant, { import_run_id: confirmed.body.run.id });
    expect(runEntries).toHaveLength(1);
    expect(runEntries[0]).toMatchObject({ action: 'CREATED', created_by: { id: office.id }, details: { imported_count: 1 } });
    const imported = await prisma.vendor.findFirstOrThrow({ where: { name: 'Imported One' } });
    expect((await entries(asAccountant, { vendor_id: imported.id }))[0]).toMatchObject({ action: 'CREATED', details: { import_run_id: confirmed.body.run.id } });

    const advance = await asAccountant.client
      .post(`/api/projects/${project.body.id}/client-advances`)
      .send({ amount: '50000', received_on: dayOffset(-1) });
    expect(advance.status).toBe(201);
    await asAccountant.client.post(`/api/client-advances/${advance.body.id}/reversal`).send({ reason: 'Keyed twice.' });
    const advanceEntries = await entries(asOffice, { client_advance_id: advance.body.id });
    expect(advanceEntries.map((e) => e.action)).toEqual(['REVERSED', 'CREATED']);
    expect(advanceEntries[0]).toMatchObject({ created_by: { id: accountant.id }, details: { amount: '50000.00', reason: 'Keyed twice.' } });
    expect(advanceEntries[1].details).toMatchObject({ amount: '50000.00', received_on: dayOffset(-1) });
  });

  it('returns the record stamps with names, and no entries for a vendor created before deployment (US5-6)', async () => {
    const { admin, office, tiles, asOffice } = await setup();
    const created = new Date('2025-03-01T05:00:00.000Z');
    const updated = new Date('2025-06-01T08:00:00.000Z');
    const vendor = await prisma.vendor.create({
      data: {
        name: 'Old Vendor',
        phone: '90000 11111',
        gstRegistered: false,
        createdAt: created,
        createdById: admin.id,
        updatedById: office.id,
        categories: { create: [{ categoryId: tiles.id, createdById: admin.id, updatedById: admin.id }] },
      },
    });
    // An explicit value overrides @updatedAt, and Prisma stores it as UTC like every other stamp.
    await prisma.vendor.update({ where: { id: vendor.id }, data: { updatedAt: updated } });

    const response = await history(asOffice, { vendor_id: vendor.id });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      record: {
        created_at: created.toISOString(),
        created_by: { id: admin.id, name: 'Asha Admin' },
        updated_at: updated.toISOString(),
        updated_by: { id: office.id, name: 'Omar Office' },
      },
      entries: [],
    });
  });

  it('needs exactly one target as a UUID, and gives 404 for an unknown target', async () => {
    const { asAdmin } = await setup();
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await history(asAdmin, {})).status).toBe(400);
    expect((await history(asAdmin, { vendor_id: missing, project_id: missing })).status).toBe(400);
    expect((await history(asAdmin, { vendor_id: 'not-a-uuid' })).status).toBe(400);
    expect((await history(asAdmin, { invoice_id: missing })).status).toBe(400);
    for (const key of ['vendor_id', 'project_id', 'document_id', 'import_run_id', 'client_advance_id']) {
      expect((await history(asAdmin, { [key]: missing })).status, key).toBe(404);
    }
  });

  it('lets the Office Team and Accountants read every target and refuses signed-out and revoked people (US5-5, FR-028)', async () => {
    const { accountant, tiles, asAdmin, asOffice, asAccountant } = await setup();
    const vendor = await asAdmin.client.post('/api/vendors').send(vendorBody([tiles.id]));
    const project = await asAdmin.client.post('/api/projects').send({ name: 'Lake House' });
    for (const session of [asOffice, asAccountant]) {
      expect((await history(session, { vendor_id: vendor.body.id })).status).toBe(200);
      expect((await history(session, { project_id: project.body.id })).status).toBe(200);
    }
    expect((await request(app).get('/api/history').query({ vendor_id: vendor.body.id })).status).toBe(401);
    await prisma.staffUser.update({ where: { id: accountant.id }, data: { revokedAt: new Date() } });
    expect((await history(asAccountant, { vendor_id: vendor.body.id })).status).toBe(401);
  });

  it('has no write routes: POST, PATCH, and DELETE on /api/history give 404 and change nothing (US5-4)', async () => {
    const { tiles, asAdmin } = await setup();
    const vendor = await asAdmin.client.post('/api/vendors').send(vendorBody([tiles.id]));
    const before = await prisma.historyEntry.findMany({ orderBy: { id: 'asc' } });
    const entryId = before[0].id;
    expect((await asAdmin.client.post('/api/history').send({ vendor_id: vendor.body.id, action: 'EDITED' })).status).toBe(404);
    expect((await asAdmin.client.patch(`/api/history/${entryId}`).send({ action: 'ARCHIVED' })).status).toBe(404);
    expect((await asAdmin.client.delete(`/api/history/${entryId}`)).status).toBe(404);
    expect(await prisma.historyEntry.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});
