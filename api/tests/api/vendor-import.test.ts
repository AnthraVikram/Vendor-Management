import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { prisma } from '../../src/db';
import { app, createUser, resetDatabase, signIn } from '../helpers';
import {
  TEMPLATE_HEADINGS,
  VALID_GSTIN,
  csvBuffer,
  oldXls,
  pdfBuffer,
  vendorRow,
  vendors1001,
  vendorsMixed,
  vendorsOver25mbCsv,
  vendorsRejectedThenValid,
  vendorsRepeatedHeading,
  vendorsValid,
  xlsxBuffer,
} from '../fixtures/files';

type Session = Awaited<ReturnType<typeof signIn>>;
type PreviewRow = { row_number: number; outcome: string; name: string; reasons: string[]; matches: unknown[]; cells: Record<string, string> };
type RunRow = { row_number: number; outcome: string; vendor_id: string | null; reasons: string[] };

const DIRECTORY_GSTIN = '29AAAAA0000A1Z5';

function upload(session: Session, bytes: Buffer, fileName: string) {
  return session.client.post('/api/vendor-imports/previews').attach('file', bytes, fileName);
}

function confirm(session: Session, previewId: string, approved: number[] = []) {
  return session.client.post(`/api/vendor-imports/previews/${previewId}/confirm`).send({ approved_rows: approved });
}

function byRow<T extends { row_number: number }>(rows: T[]): Record<number, T> {
  return Object.fromEntries(rows.map((row) => [row.row_number, row]));
}

// Reads a binary response body into a Buffer.
function binary(res: unknown, callback: (error: Error | null, body: Buffer) => void) {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const accountant = await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', name: 'Anil Accountant', actorId: admin.id });
  const tiles = await prisma.category.create({ data: { name: 'tiles', createdById: admin.id, updatedById: admin.id } });
  const vendor = (name: string, phone: string, extra: { alternatePhone?: string; gstin?: string } = {}) =>
    prisma.vendor.create({
      data: {
        name,
        phone,
        alternatePhone: extra.alternatePhone ?? null,
        gstRegistered: Boolean(extra.gstin),
        gstin: extra.gstin ?? null,
        createdById: admin.id,
        updatedById: admin.id,
        categories: { create: [{ categoryId: tiles.id, createdById: admin.id, updatedById: admin.id }] },
      },
    });
  const gupta = await vendor('Gupta & Sons', '90000 00009', { gstin: DIRECTORY_GSTIN });
  const mehta = await vendor('Mehta Tile Co', '98765 43210');
  const alternate = await vendor('Alternate Holder', '90000 07771', { alternatePhone: '91111 33333' });
  const plain = await vendor('Plain Phone', '93333 55555');
  return {
    admin,
    office,
    accountant,
    gupta,
    mehta,
    alternate,
    plain,
    asOffice: await signIn('office@example.com'),
    asAccountant: await signIn('accountant@example.com'),
  };
}

function mixedCsv() {
  const fixture = vendorsMixed({ gstin: DIRECTORY_GSTIN, phoneWithDashes: '98765-43210' });
  return csvBuffer(fixture.headings, fixture.rows);
}

describe('vendor import preview (US2-1 to US2-4, US2-7, US2-15)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('offers both templates with the 16 headings, the xlsx phone columns as text', async () => {
    const { asOffice } = await setup();
    const csv = await asOffice.client.get('/api/vendor-imports/template').query({ format: 'csv' }).buffer(true).parse(binary);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toMatch(/^attachment/);
    expect((csv.body as Buffer).toString('utf8').replace(/^﻿/, '').split(/\r?\n/)[0]).toBe(TEMPLATE_HEADINGS.join(','));

    const xlsx = await asOffice.client.get('/api/vendor-imports/template').query({ format: 'xlsx' }).buffer(true).parse(binary);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-disposition']).toMatch(/^attachment/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...TEMPLATE_HEADINGS]);
    expect(sheet.getColumn(TEMPLATE_HEADINGS.indexOf('Phone') + 1).numFmt).toBe('@');
    expect(sheet.getColumn(TEMPLATE_HEADINGS.indexOf('Alternate phone') + 1).numFmt).toBe('@');
  });

  it('previews the mixed file with an outcome, reasons, and named matches per row, creating nothing (US2-1 to US2-4)', async () => {
    const { asOffice, gupta, mehta } = await setup();
    const vendorsBefore = await prisma.vendor.count();
    const response = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ file_name: 'vendors-mixed.csv', status: 'OPEN', ignored_headings: [] });
    expect(Date.parse(response.body.expires_at) - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(Date.parse(response.body.expires_at) - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000);

    const rows = byRow(response.body.rows as PreviewRow[]);
    expect(Object.keys(rows).map(Number)).toEqual([2, 3, 4, 5, 6]);
    expect(rows[2]).toMatchObject({ outcome: 'READY', name: 'Fresh Tiles', reasons: [], matches: [] });
    expect(rows[3]).toMatchObject({ outcome: 'REJECTED', reasons: ['Phone is required.'] });
    expect(rows[4]).toMatchObject({
      outcome: 'REJECTED',
      reasons: ['This GSTIN already belongs to Gupta & Sons.'],
      matches: [{ kind: 'VENDOR', vendor_id: gupta.id, vendor_name: 'Gupta & Sons' }],
    });
    expect(rows[5]).toMatchObject({
      outcome: 'POSSIBLE_DUPLICATE',
      reasons: ['Phone matches an existing vendor.'],
      matches: [{ kind: 'VENDOR', vendor_id: mehta.id, vendor_name: 'Mehta Tile Co' }],
    });
    expect(rows[6]).toMatchObject({ outcome: 'POSSIBLE_DUPLICATE', reasons: ['Phone matches row 2.'], matches: [{ kind: 'ROW', row_number: 2 }] });
    expect(response.body.counts).toEqual({ ready: 1, rejected: 2, possible_duplicate: 2 });
    expect(await prisma.vendor.count()).toBe(vendorsBefore);
  });

  it('reads an xlsx file with headings in any order and letter case (US2-1)', async () => {
    const { asOffice } = await setup();
    const fixture = vendorsValid();
    const response = await upload(asOffice, await xlsxBuffer(fixture.headings, fixture.rows), 'vendors-valid.xlsx');
    expect(response.status).toBe(201);
    expect((response.body.rows as PreviewRow[]).map((row) => row.outcome)).toEqual(['READY', 'READY', 'READY', 'READY', 'READY']);
    expect((response.body.rows as PreviewRow[])[0]).toMatchObject({ row_number: 2, name: 'Valid Vendor 1' });
  });

  it('never lets a rejected row block a later row (US2-15)', async () => {
    const { asOffice } = await setup();
    const fixture = vendorsRejectedThenValid();
    const response = await upload(asOffice, csvBuffer(fixture.headings, fixture.rows), 'vendors-rejected-then-valid.csv');
    const rows = byRow(response.body.rows as PreviewRow[]);
    expect(rows[2]).toMatchObject({ outcome: 'REJECTED', reasons: ['Name is required.'] });
    expect(rows[3]).toMatchObject({ outcome: 'READY', reasons: [], matches: [] });
    expect(rows[4]).toMatchObject({ outcome: 'REJECTED', matches: [{ kind: 'ROW', row_number: 3 }] });
  });

  it('lists an extra heading once and keeps a leading zero in cells', async () => {
    const { asOffice } = await setup();
    const headings = ['Name', 'Phone', 'Categories', 'Rate'];
    const bytes = csvBuffer(headings, [['Zero Lead', '09876543210', 'Tiles', '500'], ['Second', '09876500000', 'Tiles', '600']]);
    const response = await upload(asOffice, bytes, 'extra.csv');
    expect(response.status).toBe(201);
    expect(response.body.ignored_headings).toEqual(['Rate']);
    expect((response.body.rows as PreviewRow[])[0].cells.Phone).toBe('09876543210');
  });

  it('refuses a whole file with a reason and creates no preview (US2-7, FR-003)', async () => {
    const { asOffice } = await setup();
    const csv = (fixture: { headings: string[]; rows: string[][] }) => csvBuffer(fixture.headings, fixture.rows);
    const cases: [string, Buffer, string, string?][] = [
      ['vendors-over-25mb.csv', vendorsOver25mbCsv(), 'FILE_TOO_LARGE', 'The file must be 25 MB or smaller.'],
      ['vendors-1001.csv', csv(vendors1001()), 'TOO_MANY_ROWS'],
      ['vendors-repeated-heading.csv', csv(vendorsRepeatedHeading()), 'REPEATED_HEADING'],
      ['no-phone.csv', csvBuffer(['Name', 'Categories'], [['A', 'Tiles']]), 'MISSING_HEADING'],
      ['headings-only.csv', csvBuffer(TEMPLATE_HEADINGS, []), 'EMPTY_FILE'],
      ['old.xls', oldXls(), 'UNSUPPORTED_FORMAT'],
      ['pretend.xlsx', pdfBuffer(), 'UNSUPPORTED_FORMAT'],
      ['latin1.csv', Buffer.concat([Buffer.from('Name,Phone,Categories\r\nCaf'), Buffer.from([0xe9]), Buffer.from(',1,Tiles\r\n')]), 'UNSUPPORTED_FORMAT'],
    ];
    for (const [name, bytes, code, message] of cases) {
      const response = await upload(asOffice, bytes, name);
      expect(response.status, name).toBe(400);
      expect(response.body.code, name).toBe(code);
      if (message) expect(response.body.fields?.file, name).toBe(message);
    }
    expect(await prisma.vendorImportPreview.count()).toBe(0);
  });

  it('flags the same phone pairs as the vendor form (SC-011)', async () => {
    const { asOffice, mehta, alternate, plain } = await setup();
    const rows = [
      vendorRow({ Name: 'Dashed', Phone: '98765-43210', Categories: 'Tiles' }),
      vendorRow({ Name: 'Phone is their alternate', Phone: '91111-33333', Categories: 'Tiles' }),
      vendorRow({ Name: 'Alternate is their phone', Phone: '95555 00000', 'Alternate phone': '93333-55555', Categories: 'Tiles' }),
    ];
    const response = await upload(asOffice, csvBuffer(TEMPLATE_HEADINGS, rows), 'pairs.csv');
    const preview = byRow(response.body.rows as PreviewRow[]);
    expect(preview[2]).toMatchObject({ outcome: 'POSSIBLE_DUPLICATE', matches: [{ kind: 'VENDOR', vendor_id: mehta.id }] });
    expect(preview[3]).toMatchObject({ outcome: 'POSSIBLE_DUPLICATE', matches: [{ kind: 'VENDOR', vendor_id: alternate.id }] });
    expect(preview[4]).toMatchObject({ outcome: 'POSSIBLE_DUPLICATE', matches: [{ kind: 'VENDOR', vendor_id: plain.id }] });
  });
});

describe('vendor import confirmation (US2-5, US2-6, US2-8, US2-9, US2-10, US2-12)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('imports ready rows and approved duplicates, skips the rest, and records the run (US2-5, US2-8, FR-010)', async () => {
    const { asOffice, office, gupta, mehta } = await setup();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const mehtaBefore = await prisma.vendor.findUniqueOrThrow({ where: { id: mehta.id } });

    const response = await confirm(asOffice, preview.body.id, [5]);
    expect(response.status).toBe(201);
    expect(response.body.run).toMatchObject({
      file_name: 'vendors-mixed.csv',
      created_by: { id: office.id, name: 'Omar Office' },
      imported_count: 2,
      skipped_count: 1,
      rejected_count: 2,
    });
    const rows = byRow(response.body.rows as RunRow[]);
    expect(rows[2]).toMatchObject({ outcome: 'IMPORTED', reasons: [] });
    expect(rows[5]).toMatchObject({ outcome: 'IMPORTED', reasons: [] });
    expect(rows[6]).toMatchObject({ outcome: 'SKIPPED', vendor_id: null, reasons: ['Phone matches row 2. Not approved.'] });
    expect(rows[3]).toMatchObject({ outcome: 'REJECTED', vendor_id: null, reasons: ['Phone is required.'] });
    expect(rows[4]).toMatchObject({ outcome: 'REJECTED', vendor_id: null, reasons: ['This GSTIN already belongs to Gupta & Sons.'] });

    const runId = response.body.run.id as string;
    const imported = await prisma.vendor.findMany({ where: { importRunId: runId }, include: { categories: { include: { category: true } } } });
    expect(imported.map((v) => v.id).sort()).toEqual([rows[2].vendor_id, rows[5].vendor_id].sort());
    expect(imported.find((v) => v.id === rows[2].vendor_id)?.categories.map((c) => c.category.name)).toEqual(['tiles']);

    const categories = await prisma.category.findMany();
    const named = (name: string) => categories.filter((c) => c.name.trim().toLowerCase() === name).length;
    expect(named('tiles')).toBe(1);
    expect(named('paint')).toBe(1);

    const vendorView = await asOffice.client.get(`/api/vendors/${rows[2].vendor_id}`);
    expect(vendorView.body.import_run).toMatchObject({ id: runId, file_name: 'vendors-mixed.csv' });

    for (const vendorId of [rows[2].vendor_id, rows[5].vendor_id]) {
      const entries = await prisma.historyEntry.findMany({ where: { vendorId: vendorId! } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ action: 'CREATED', details: { import_run_id: runId } });
    }
    const runEntries = await prisma.historyEntry.findMany({ where: { vendorImportRunId: runId } });
    expect(runEntries.map((e) => e.action)).toEqual(['CREATED']);

    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: mehta.id } })).toEqual(mehtaBefore);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: gupta.id } })).importRunId).toBeNull();
  });

  it('confirms at most once, sequentially or in parallel (US2-10, FR-008b)', async () => {
    const { asOffice } = await setup();
    const first = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const once = await confirm(asOffice, first.body.id, [5]);
    expect(once.status).toBe(201);
    const twice = await confirm(asOffice, first.body.id, []);
    expect(twice.status).toBe(200);
    expect(twice.body).toEqual(once.body);

    const second = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const vendorsBefore = await prisma.vendor.count();
    const parallel = await Promise.all([confirm(asOffice, second.body.id, [5]), confirm(asOffice, second.body.id, [5])]);
    expect(parallel.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(parallel[0].body.run.id).toBe(parallel[1].body.run.id);
    expect(await prisma.vendorImportRun.count({ where: { previewId: second.body.id } })).toBe(1);
    expect(await prisma.vendor.count()).toBe(vendorsBefore + parallel[0].body.run.imported_count);
  });

  it('rechecks rows against the directory at confirmation (FR-008)', async () => {
    const { asOffice } = await setup();
    const rows = [
      vendorRow({ Name: 'Later GST', Phone: '96000 00001', Categories: 'Tiles', 'GST registered': 'Yes', GSTIN: VALID_GSTIN }),
      vendorRow({ Name: 'Later Phone', Phone: '96000 00002', Categories: 'Tiles' }),
      vendorRow({ Name: 'Still Fine', Phone: '96000 00003', Categories: 'Tiles' }),
    ];
    const preview = await upload(asOffice, csvBuffer(TEMPLATE_HEADINGS, rows), 'recheck.csv');
    expect((preview.body.rows as PreviewRow[]).map((r) => r.outcome)).toEqual(['READY', 'READY', 'READY']);

    const category = await asOffice.client.post('/api/categories').send({ name: 'Glass' });
    const gstVendor = await asOffice.client
      .post('/api/vendors')
      .send({ name: 'Form GST', phone: '97000 00001', category_ids: [category.body.id], gst_registered: true, gstin: VALID_GSTIN });
    expect(gstVendor.status).toBe(201);
    const phoneVendor = await asOffice.client.post('/api/vendors').send({ name: 'Form Phone', phone: '96000-00002', category_ids: [category.body.id] });
    expect(phoneVendor.status).toBe(201);

    const response = await confirm(asOffice, preview.body.id, []);
    const outcome = byRow(response.body.rows as RunRow[]);
    expect(outcome[2]).toMatchObject({ outcome: 'REJECTED', reasons: ['This GSTIN already belongs to Form GST.'] });
    expect(outcome[3]).toMatchObject({ outcome: 'SKIPPED', reasons: ['Phone matches an existing vendor. Not approved.'] });
    expect(outcome[4]).toMatchObject({ outcome: 'IMPORTED' });
  });

  it('saves nothing when the database fails part way through (US2-12, FR-008a)', async () => {
    const { asOffice } = await setup();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const vendorsBefore = await prisma.vendor.count();
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION t038_fail_run() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER t038_fail_run BEFORE INSERT ON vendor_import_runs FOR EACH ROW EXECUTE FUNCTION t038_fail_run()`);
    try {
      const response = await confirm(asOffice, preview.body.id, [5]);
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ code: 'IMPORT_FAILED', message: 'The import did not happen. Nothing was saved.' });
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS t038_fail_run ON vendor_import_runs');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS t038_fail_run()');
    }
    expect(await prisma.vendor.count()).toBe(vendorsBefore);
    expect(await prisma.vendorImportRun.count()).toBe(0);
    const stored = await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: preview.body.id } });
    expect(stored.status).toBe('OPEN');
    expect(stored.rows).toHaveLength(5);
  });

  it('lists runs with who, when, file name, and counts, and shows a run with its rows (US2-9)', async () => {
    const { asOffice, asAccountant, office } = await setup();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const confirmed = await confirm(asOffice, preview.body.id, [5]);

    const list = await asAccountant.client.get('/api/vendor-imports');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      id: confirmed.body.run.id,
      file_name: 'vendors-mixed.csv',
      created_by: { id: office.id, name: 'Omar Office' },
      imported_count: 2,
      skipped_count: 1,
      rejected_count: 2,
    });
    expect(Number.isNaN(Date.parse(list.body[0].created_at))).toBe(false);

    const detail = await asAccountant.client.get(`/api/vendor-imports/${confirmed.body.run.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(confirmed.body);
  });
});

describe('vendor import preview lifecycle (US2-6, US2-11, US2-14, US2-16)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function expire(previewId: string) {
    await prisma.vendorImportPreview.update({ where: { id: previewId }, data: { expiresAt: new Date(Date.now() - 31 * 60 * 1000) } });
  }

  async function storedRows(previewId: string) {
    return (await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: previewId } })).rows;
  }

  it('cancels a preview, clears its rows, and refuses it afterwards (US2-6, US2-11, US2-16)', async () => {
    const { asOffice } = await setup();
    const vendorsBefore = await prisma.vendor.count();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const cancelled = await asOffice.client.post(`/api/vendor-imports/previews/${preview.body.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({ status: 'CANCELLED' });
    expect(await storedRows(preview.body.id)).toEqual([]);

    const viewed = await asOffice.client.get(`/api/vendor-imports/previews/${preview.body.id}`);
    expect(viewed.status).toBe(409);
    expect(viewed.body.code).toBe('PREVIEW_CANCELLED');
    const confirmed = await confirm(asOffice, preview.body.id, [5]);
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.code).toBe('PREVIEW_CANCELLED');
    expect(await prisma.vendor.count()).toBe(vendorsBefore);
  });

  it('refuses view, confirm, and cancel of an expired preview, with no rows, and clears it (US2-11, US2-16, FR-008c)', async () => {
    const { asOffice } = await setup();
    const vendorsBefore = await prisma.vendor.count();
    const requests = [
      (id: string) => asOffice.client.get(`/api/vendor-imports/previews/${id}`),
      (id: string) => confirm(asOffice, id, [5]),
      (id: string) => asOffice.client.post(`/api/vendor-imports/previews/${id}/cancel`),
    ];
    for (const send of requests) {
      const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
      await expire(preview.body.id);
      expect(await storedRows(preview.body.id)).toHaveLength(5);
      const response = await send(preview.body.id);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PREVIEW_EXPIRED');
      expect(response.body.rows).toBeUndefined();
      expect(await storedRows(preview.body.id)).toEqual([]);
      expect((await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: preview.body.id } })).status).toBe('OPEN');
    }
    expect(await prisma.vendor.count()).toBe(vendorsBefore);
  });

  it("clears another person's expired preview when a new file is uploaded (FR-008e)", async () => {
    const { asOffice, asAccountant, accountant } = await setup();
    const old = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    await expire(old.body.id);
    const fresh = await upload(asAccountant, mixedCsv(), 'vendors-mixed.csv');
    expect(fresh.status).toBe(201);
    const stored = await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: old.body.id } });
    expect(stored.rows).toEqual([]);
    expect(stored.updatedById).toBe(accountant.id);
    expect(await storedRows(fresh.body.id)).toHaveLength(5);
  });

  it('clears the stored rows on confirmation and keeps the run as the audit record (US2-16)', async () => {
    const { asOffice } = await setup();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const confirmed = await confirm(asOffice, preview.body.id, [5]);
    expect(await storedRows(preview.body.id)).toEqual([]);
    const viewed = await asOffice.client.get(`/api/vendor-imports/previews/${preview.body.id}`);
    expect(viewed.body).toEqual({ status: 'CONFIRMED', run_id: confirmed.body.run.id });
    const run = await prisma.vendorImportRun.findUniqueOrThrow({ where: { id: confirmed.body.run.id }, include: { rows: true } });
    expect([run.importedCount, run.skippedCount, run.rejectedCount]).toEqual([2, 1, 2]);
    expect(run.rows.map((r) => [r.rowNumber, r.outcome]).sort()).toEqual([
      [2, 'IMPORTED'],
      [3, 'REJECTED'],
      [4, 'REJECTED'],
      [5, 'IMPORTED'],
      [6, 'SKIPPED'],
    ]);
    expect(run.rows.find((r) => r.rowNumber === 3)?.reasons).toEqual(['Phone is required.']);
  });

  it("refuses anyone but the uploader and leaves the preview unchanged (US2-14, FR-008d)", async () => {
    const { asOffice, asAccountant } = await setup();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const before = await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: preview.body.id } });
    const attempts = [
      asAccountant.client.get(`/api/vendor-imports/previews/${preview.body.id}`),
      confirm(asAccountant, preview.body.id, [5]),
      asAccountant.client.post(`/api/vendor-imports/previews/${preview.body.id}/cancel`),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PREVIEW_NOT_YOURS');
    }
    expect(await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: preview.body.id } })).toEqual(before);
    expect(await prisma.vendorImportRun.count()).toBe(0);
  });

  it('refuses a signed-out caller on every import route', async () => {
    const { asOffice } = await setup();
    const preview = await upload(asOffice, mixedCsv(), 'vendors-mixed.csv');
    const id = preview.body.id as string;
    const anonymous = request(app);
    const responses = await Promise.all([
      anonymous.get('/api/vendor-imports/template?format=csv'),
      anonymous.post('/api/vendor-imports/previews').attach('file', mixedCsv(), 'vendors-mixed.csv'),
      anonymous.get(`/api/vendor-imports/previews/${id}`),
      anonymous.post(`/api/vendor-imports/previews/${id}/confirm`).send({ approved_rows: [] }),
      anonymous.post(`/api/vendor-imports/previews/${id}/cancel`),
      anonymous.get('/api/vendor-imports'),
      anonymous.get(`/api/vendor-imports/${id}`),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
  });
});
