import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { phoneKey } from '../../src/lib/phone';
import { createCategory, createUser, resetDatabase, signIn } from '../helpers';
import { TEMPLATE_HEADINGS, VALID_GSTIN, csvBuffer, vendorRow, vendors1001 } from '../fixtures/files';

// Permanent regression tests for import confirmation (T038, T041, T045), replacing checks that were
// earlier proven only by temporary tests.

type Session = Awaited<ReturnType<typeof signIn>>;
type RunRow = { row_number: number; outcome: string; vendor_id: string | null; reasons: string[] };

function upload(session: Session, rows: string[][], fileName = 'vendors.csv') {
  return session.client.post('/api/vendor-imports/previews').attach('file', csvBuffer(TEMPLATE_HEADINGS, rows), fileName);
}

function confirm(session: Session, previewId: string, approved: number[] = []) {
  return session.client.post(`/api/vendor-imports/previews/${previewId}/confirm`).send({ approved_rows: approved });
}

async function setup() {
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', name: 'Omar Office', actorId: admin.id });
  const tiles = await createCategory(admin.id, 'Tiles');
  return { admin, tiles, asOffice: await signIn('office@example.com'), asAdmin: await signIn('admin@example.com') };
}

async function counts() {
  return {
    vendors: await prisma.vendor.count(),
    categories: await prisma.category.count(),
    runs: await prisma.vendorImportRun.count(),
    runRows: await prisma.vendorImportRow.count(),
    history: await prisma.historyEntry.count(),
  };
}

describe('vendor import confirmation regressions', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('saves every template field of an imported vendor, not only its categories (FR-005)', async () => {
    const { asOffice } = await setup();
    const preview = await upload(asOffice, [
      vendorRow({
        Name: 'Full Fields Interiors',
        Phone: '97000 11111',
        Categories: 'Tiles; Modular kitchens',
        'Contact person': 'Ravi Kumar',
        'Alternate phone': '97000-22222',
        Email: 'ravi@example.com',
        Address: '12 MG Road, Pune',
        'GST registered': 'Yes',
        GSTIN: VALID_GSTIN,
        'GST legal name': 'Full Fields Interiors LLP',
        'Team size': '14',
        Availability: 'limited',
        'Manpower note': 'Two crews from November',
        'Locations served': 'Pune; Mumbai',
        Services: 'Installation; Repair',
        Materials: 'Vitrified tiles; Adhesive',
      }),
    ]);
    expect(preview.status).toBe(201);
    expect(preview.body.rows[0].outcome).toBe('READY');
    const confirmed = await confirm(asOffice, preview.body.id);
    expect(confirmed.status).toBe(201);

    const vendorId = (confirmed.body.rows as RunRow[])[0].vendor_id!;
    const vendor = (await asOffice.client.get(`/api/vendors/${vendorId}`)).body;
    expect(vendor).toMatchObject({
      name: 'Full Fields Interiors',
      phone: '97000 11111',
      contact_person: 'Ravi Kumar',
      alternate_phone: '97000-22222',
      email: 'ravi@example.com',
      address: '12 MG Road, Pune',
      gst_registered: true,
      gstin: VALID_GSTIN,
      gst_legal_name: 'Full Fields Interiors LLP',
      team_size: 14,
      availability: 'LIMITED',
      manpower_note: 'Two crews from November',
      archived: false,
      import_run: { id: confirmed.body.run.id, file_name: 'vendors.csv' },
    });
    expect(vendor.categories.map((c: { name: string }) => c.name).sort()).toEqual(['Modular kitchens', 'Tiles']);
    expect([...vendor.locations].sort()).toEqual(['Mumbai', 'Pune']);
    expect([...vendor.services].sort()).toEqual(['Installation', 'Repair']);
    expect([...vendor.materials].sort()).toEqual(['Adhesive', 'Vitrified tiles']);
  });

  it('reuses one category for spellings that differ in letter case or spacing, across rows and against the directory (FR-008)', async () => {
    const { tiles, asOffice } = await setup();
    const preview = await upload(asOffice, [
      vendorRow({ Name: 'Row Two', Phone: '97100 00002', Categories: 'Marble; tiles' }),
      vendorRow({ Name: 'Row Three', Phone: '97100 00003', Categories: ' MARBLE ' }),
      vendorRow({ Name: 'Row Four', Phone: '97100 00004', Categories: 'Granite; TILES' }),
      vendorRow({ Name: 'Row Five', Phone: '97100 00005', Categories: 'granite' }),
    ]);
    const confirmed = await confirm(asOffice, preview.body.id);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.run.imported_count).toBe(4);

    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    expect(categories.map((c) => c.name)).toEqual(['Granite', 'Marble', 'Tiles']);
    expect(categories.find((c) => c.name === 'Tiles')!.id).toBe(tiles.id);
    const links = await prisma.vendorCategory.findMany({ include: { vendor: true, category: true } });
    const of = (name: string) => links.filter((l) => l.vendor.name === name).map((l) => l.category.name).sort();
    expect(of('Row Two')).toEqual(['Marble', 'Tiles']);
    expect(of('Row Three')).toEqual(['Marble']);
    expect(of('Row Four')).toEqual(['Granite', 'Tiles']);
    expect(of('Row Five')).toEqual(['Granite']);
  });

  it('lets only one of a confirmation and a simultaneous vendor-form save keep a phone number (FR-008b, FR-030)', async () => {
    const { tiles, asOffice, asAdmin } = await setup();
    for (let i = 1; i <= 4; i++) {
      const phone = `97200 0000${i}`;
      const preview = await upload(asOffice, [vendorRow({ Name: `Race Import ${i}`, Phone: phone, Categories: 'Tiles' })]);
      const [confirmed, form] = await Promise.all([
        confirm(asOffice, preview.body.id),
        asAdmin.client.post('/api/vendors').send({ name: `Race Form ${i}`, phone: phone.replace(' ', '-'), category_ids: [tiles.id] }),
      ]);
      expect(confirmed.status, `round ${i}`).toBe(201);
      const row = (confirmed.body.rows as RunRow[])[0];
      if (form.status === 201) {
        expect(row, `round ${i}: the form won, so the import must skip`).toMatchObject({ outcome: 'SKIPPED' });
      } else {
        expect(form.status, `round ${i}`).toBe(409);
        expect(form.body.code).toBe('PHONE_IN_USE');
        expect(row.outcome, `round ${i}: the import won`).toBe('IMPORTED');
      }
      const holders = (await prisma.vendor.findMany({ select: { phone: true } })).filter((v) => phoneKey(v.phone) === phoneKey(phone));
      expect(holders, `round ${i}`).toHaveLength(1);
    }
  });

  it('saves nothing when the last insert of a confirmation fails, and a retry then succeeds (FR-008a)', async () => {
    const { asOffice } = await setup();
    const preview = await upload(asOffice, [
      vendorRow({ Name: 'Late One', Phone: '97300 00001', Categories: 'Brand new category' }),
      vendorRow({ Name: 'Late Two', Phone: '97300 00002', Categories: 'Tiles' }),
    ]);
    const before = await counts();
    // vendor_import_rows is written after the categories, the run, the vendors, and their history.
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION t067_fail_rows() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER t067_fail_rows BEFORE INSERT ON vendor_import_rows FOR EACH ROW EXECUTE FUNCTION t067_fail_rows()`);
    try {
      const failed = await confirm(asOffice, preview.body.id);
      expect(failed.status).toBe(500);
      expect(failed.body).toMatchObject({ code: 'IMPORT_FAILED', message: 'The import did not happen. Nothing was saved.' });
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS t067_fail_rows ON vendor_import_rows');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS t067_fail_rows()');
    }
    expect(await counts()).toEqual(before);
    const stored = await prisma.vendorImportPreview.findUniqueOrThrow({ where: { id: preview.body.id } });
    expect(stored.status).toBe('OPEN');
    expect(stored.rows).toHaveLength(2);

    const retried = await confirm(asOffice, preview.body.id);
    expect(retried.status).toBe(201);
    expect(retried.body.run.imported_count).toBe(2);
    expect(await prisma.category.count()).toBe(before.categories + 1);
  });

  it('confirms the largest allowed file, 1,000 rows, in one step (FR-003, FR-008a)', async () => {
    const { asOffice } = await setup();
    const rows = vendors1001().rows.slice(0, 1000);
    const started = Date.now();
    const preview = await upload(asOffice, rows, 'vendors-1000.csv');
    const previewMs = Date.now() - started;
    expect(preview.status).toBe(201);
    expect(preview.body.counts).toEqual({ ready: 1000, rejected: 0, possible_duplicate: 0 });

    const confirmStarted = Date.now();
    const confirmed = await confirm(asOffice, preview.body.id);
    const confirmMs = Date.now() - confirmStarted;
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.run).toMatchObject({ imported_count: 1000, skipped_count: 0, rejected_count: 0 });
    expect(await prisma.vendor.count({ where: { importRunId: confirmed.body.run.id } })).toBe(1000);
    expect(await prisma.vendorImportRow.count({ where: { runId: confirmed.body.run.id } })).toBe(1000);
    expect(await prisma.historyEntry.count({ where: { action: 'CREATED', vendor: { importRunId: confirmed.body.run.id } } })).toBe(1000);
    // Recorded for T068; the plan's 5-second goal is for the preview, timed there on the local database.
    console.log(`T067 1,000-row timings: preview ${previewMs} ms, confirm ${confirmMs} ms`);
  }, 120_000);
});
