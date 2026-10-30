import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db';
import { app, createCategory, createProject, createUser, createVendor, resetDatabase, resetFileStorage, signIn } from '../helpers';
import { MAX_UPLOAD_BYTES, exeBuffer, jpegBuffer, oleBuffer, paddedBuffer, pdfBuffer } from '../fixtures/files';

type Session = Awaited<ReturnType<typeof signIn>>;

// Reads a binary response body into a Buffer.
function binary(res: unknown, callback: (error: Error | null, body: Buffer) => void) {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

function upload(session: Session, parent: string, bytes: Buffer, fileName: string, fields: Record<string, string>) {
  let req = session.client.post(`/api/${parent}/documents`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return req.attach('file', bytes, fileName);
}

function download(session: Session, documentId: string) {
  return session.client.get(`/api/documents/${documentId}/file`).buffer(true).parse(binary);
}

function list(session: Session, parent: string, includeArchived = false) {
  return session.client.get(`/api/${parent}/documents`).query(includeArchived ? { include_archived: 'true' } : {});
}

let storageDir = '';

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const category = await createCategory(admin.id, 'Tiles');
  const vendor = await createVendor(admin.id, { name: 'Sharma Interiors', phone: '98765 43210', categoryId: category.id });
  const project = await createProject(admin.id, 'Kapoor Residence');
  return {
    admin,
    office,
    accountant,
    vendor,
    project,
    vendorPath: `vendors/${vendor.id}`,
    projectPath: `projects/${project.id}`,
    asAdmin: await signIn('admin@example.com'),
    asOffice: await signIn('office@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

describe('documents on vendors and projects (US3)', () => {
  beforeEach(async () => {
    await resetDatabase();
    storageDir = resetFileStorage();
  });

  it('uploads a PDF to a vendor and a JPEG to a project, returning the contract shape (US3-1, FR-012)', async () => {
    const { office, accountant, vendor, project, vendorPath, projectPath, asOffice, asAccountant } = await setup();
    const pdf = pdfBuffer();
    const agreement = await upload(asOffice, vendorPath, pdf, 'agreement.pdf', { title: '  Rate agreement 2026  ', document_type: 'AGREEMENT', note: 'Signed copy' });
    expect(agreement.status).toBe(201);
    expect(agreement.body).toMatchObject({
      vendor_id: vendor.id,
      project_id: null,
      title: 'Rate agreement 2026',
      document_type: 'AGREEMENT',
      note: 'Signed copy',
      original_filename: 'agreement.pdf',
      media_type: 'application/pdf',
      byte_size: pdf.length,
      archived: false,
      created_by: { id: office.id, name: 'Omar Office' },
    });
    expect(Number.isNaN(Date.parse(agreement.body.created_at))).toBe(false);

    const photo = await upload(asAccountant, projectPath, jpegBuffer(), 'site.jpg', { title: 'Site photo', document_type: 'PHOTO' });
    expect(photo.status).toBe(201);
    expect(photo.body).toMatchObject({
      vendor_id: null,
      project_id: project.id,
      title: 'Site photo',
      document_type: 'PHOTO',
      note: null,
      original_filename: 'site.jpg',
      media_type: 'image/jpeg',
      created_by: { id: accountant.id, name: 'Anil Accountant' },
    });

    expect((await list(asOffice, vendorPath)).body.map((d: { id: string }) => d.id)).toEqual([agreement.body.id]);
    expect((await list(asOffice, projectPath)).body.map((d: { id: string }) => d.id)).toEqual([photo.body.id]);
  });

  it('lists a record’s documents newest first (US3-1)', async () => {
    const { vendorPath, asOffice } = await setup();
    const first = await upload(asOffice, vendorPath, pdfBuffer(), 'first.pdf', { title: 'First', document_type: 'OTHER' });
    const second = await upload(asOffice, vendorPath, pdfBuffer(), 'second.pdf', { title: 'Second', document_type: 'OTHER' });
    expect((await list(asOffice, vendorPath)).body.map((d: { id: string }) => d.id)).toEqual([second.body.id, first.body.id]);
  });

  it('downloads the exact bytes as an attachment that the browser must not sniff (US3-2, FR-014)', async () => {
    const { vendorPath, projectPath, asOffice, asAdmin } = await setup();
    const pdf = pdfBuffer();
    const jpeg = jpegBuffer();
    const agreement = await upload(asOffice, vendorPath, pdf, 'agreement.pdf', { title: 'Agreement', document_type: 'AGREEMENT' });
    const photo = await upload(asOffice, projectPath, jpeg, 'site.jpg', { title: 'Site', document_type: 'PHOTO' });

    for (const [id, bytes, type, name] of [
      [agreement.body.id, pdf, 'application/pdf', 'agreement.pdf'],
      [photo.body.id, jpeg, 'image/jpeg', 'site.jpg'],
    ] as [string, Buffer, string, string][]) {
      const response = await download(asAdmin, id);
      expect(response.status).toBe(200);
      expect((response.body as Buffer).equals(bytes)).toBe(true);
      expect(response.headers['content-type']).toContain(type);
      expect(response.headers['content-disposition']).toMatch(/^attachment/);
      expect(response.headers['content-disposition']).toContain(name);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('refuses signed-out and revoked people on download, list, and upload (US3-3, SC-005)', async () => {
    const { accountant, vendorPath, asOffice, asAccountant } = await setup();
    const doc = await upload(asOffice, vendorPath, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'OTHER' });
    const anonymous = request(app);
    expect((await anonymous.get(`/api/documents/${doc.body.id}/file`)).status).toBe(401);
    expect((await anonymous.get(`/api/${vendorPath}/documents`)).status).toBe(401);
    expect((await anonymous.post(`/api/${vendorPath}/documents`).field('title', 'B').field('document_type', 'OTHER').attach('file', pdfBuffer(), 'b.pdf')).status).toBe(401);

    await prisma.staffUser.update({ where: { id: accountant.id }, data: { revokedAt: new Date() } });
    expect((await asAccountant.client.get(`/api/documents/${doc.body.id}/file`)).status).toBe(401);
    expect((await list(asAccountant, vendorPath)).status).toBe(401);
    expect((await upload(asAccountant, vendorPath, pdfBuffer(), 'c.pdf', { title: 'C', document_type: 'OTHER' })).status).toBe(401);
    expect(await prisma.document.count()).toBe(1);
  });

  it('refuses a mismatched, unaccepted, oversized, or untitled upload and stores nothing (US3-4, FR-013)', async () => {
    const { vendorPath, asOffice } = await setup();
    const valid = { title: 'Doc', document_type: 'OTHER' };
    const cases: [string, Buffer, string, Record<string, string>, ((body: Record<string, unknown>) => void)?][] = [
      ['setup.pdf', exeBuffer(), 'renamed executable', valid],
      ['sheet.doc', oleBuffer('Workbook'), 'Excel file named .doc', valid],
      ['notes.txt', Buffer.from('plain text'), 'unaccepted type', valid],
      [
        'huge.pdf',
        paddedBuffer(MAX_UPLOAD_BYTES + 1),
        'over 25 MB',
        valid,
        (body) => expect(body).toMatchObject({ code: 'FILE_TOO_LARGE', fields: { file: 'The file must be 25 MB or smaller.' } }),
      ],
      ['untitled.pdf', pdfBuffer(), 'missing title', { document_type: 'OTHER' }, (body) => expect((body.fields as Record<string, string>).title).toBeTruthy()],
      ['blank-title.pdf', pdfBuffer(), 'blank title', { title: '   ', document_type: 'OTHER' }, (body) => expect((body.fields as Record<string, string>).title).toBeTruthy()],
    ];
    for (const [name, bytes, label, fields, check] of cases) {
      const response = await upload(asOffice, vendorPath, bytes, name, fields);
      expect(response.status, label).toBe(400);
      check?.(response.body);
      expect(fs.readdirSync(storageDir), label).toEqual([]);
      expect(await prisma.document.count(), label).toBe(0);
    }
  });

  it('archives a document out of the default list, keeps it downloadable, and restores it (US3-5, FR-015)', async () => {
    const { vendorPath, asOffice } = await setup();
    const doc = await upload(asOffice, vendorPath, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'OTHER' });

    const archived = await asOffice.client.post(`/api/documents/${doc.body.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id: doc.body.id, archived: true });
    expect((await list(asOffice, vendorPath)).body).toEqual([]);
    const all = await list(asOffice, vendorPath, true);
    expect(all.body.map((d: { id: string; archived: boolean }) => [d.id, d.archived])).toEqual([[doc.body.id, true]]);
    expect((await download(asOffice, doc.body.id)).status).toBe(200);

    const again = await asOffice.client.post(`/api/documents/${doc.body.id}/archive`);
    expect(again.status).toBe(200);
    expect(again.body.archived).toBe(true);

    const restored = await asOffice.client.post(`/api/documents/${doc.body.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.archived).toBe(false);
    expect((await list(asOffice, vendorPath)).body.map((d: { id: string }) => d.id)).toEqual([doc.body.id]);
  });

  it('has no delete: DELETE gives 404 and the row and file remain (US3-6, FR-016)', async () => {
    const { vendorPath, asAdmin } = await setup();
    const doc = await upload(asAdmin, vendorPath, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'OTHER' });
    const filesBefore = fs.readdirSync(storageDir);
    expect(filesBefore).toHaveLength(1);
    expect((await asAdmin.client.delete(`/api/documents/${doc.body.id}`)).status).toBe(404);
    expect(await prisma.document.findUnique({ where: { id: doc.body.id } })).not.toBeNull();
    expect(fs.readdirSync(storageDir)).toEqual(filesBefore);
    expect((await download(asAdmin, doc.body.id)).status).toBe(200);
  });

  it('keeps an archived vendor or project’s documents readable but read-only (US3-7, FR-015)', async () => {
    const { vendorPath, projectPath, asAdmin } = await setup();
    for (const parent of [vendorPath, projectPath]) {
      const active = await upload(asAdmin, parent, pdfBuffer(), 'active.pdf', { title: 'Active', document_type: 'OTHER' });
      const earlier = await upload(asAdmin, parent, pdfBuffer(), 'earlier.pdf', { title: 'Archived first', document_type: 'OTHER' });
      await asAdmin.client.post(`/api/documents/${earlier.body.id}/archive`);
      expect((await asAdmin.client.post(`/api/${parent}/archive`)).status).toBe(200);

      const listed = await list(asAdmin, parent, true);
      expect(listed.status).toBe(200);
      expect(Object.fromEntries(listed.body.map((d: { id: string; archived: boolean }) => [d.id, d.archived]))).toEqual({
        [active.body.id]: false,
        [earlier.body.id]: true,
      });
      expect((await download(asAdmin, active.body.id)).status).toBe(200);
      expect((await download(asAdmin, earlier.body.id)).status).toBe(200);

      const refused = [
        await upload(asAdmin, parent, pdfBuffer(), 'new.pdf', { title: 'New', document_type: 'OTHER' }),
        await asAdmin.client.post(`/api/documents/${active.body.id}/archive`),
        await asAdmin.client.post(`/api/documents/${earlier.body.id}/restore`),
      ];
      for (const response of refused) {
        expect(response.status, parent).toBe(409);
        expect(response.body.code, parent).toBe('PARENT_ARCHIVED');
      }
      const stored = await prisma.document.findMany({ where: { id: { in: [active.body.id, earlier.body.id] } } });
      expect(Object.fromEntries(stored.map((d) => [d.id, d.archived]))).toEqual({ [active.body.id]: false, [earlier.body.id]: true });
    }
    expect(await prisma.document.count()).toBe(4);
  });

  it('gives 404 for an unknown parent or document and 400 for a bad document type', async () => {
    const { vendorPath, asAdmin } = await setup();
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await upload(asAdmin, `vendors/${missing}`, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'OTHER' })).status).toBe(404);
    expect((await upload(asAdmin, `projects/${missing}`, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'OTHER' })).status).toBe(404);
    expect((await asAdmin.client.get(`/api/documents/${missing}/file`)).status).toBe(404);
    expect((await asAdmin.client.post(`/api/documents/${missing}/archive`)).status).toBe(404);
    const badType = await upload(asAdmin, vendorPath, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'INVOICE' });
    expect(badType.status).toBe(400);
    expect(badType.body.fields.document_type).toBeTruthy();
    expect(fs.readdirSync(storageDir)).toEqual([]);
  });

  it('writes one history entry for each upload, archive, and restore (FR-027)', async () => {
    const { office, vendorPath, asOffice } = await setup();
    const doc = await upload(asOffice, vendorPath, pdfBuffer(), 'a.pdf', { title: 'A', document_type: 'OTHER' });
    await asOffice.client.post(`/api/documents/${doc.body.id}/archive`);
    await asOffice.client.post(`/api/documents/${doc.body.id}/restore`);
    const entries = await prisma.historyEntry.findMany({ where: { documentId: doc.body.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => e.action)).toEqual(['CREATED', 'ARCHIVED', 'RESTORED']);
    expect(entries.every((e) => e.createdById === office.id)).toBe(true);
  });
});
