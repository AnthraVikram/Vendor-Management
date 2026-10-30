import { describe, expect, it } from 'vitest';
import { confirmOutcomes, previewOutcomes } from '../../src/lib/import-duplicates';

const X = '27ABCDE1234F1Z5';

type Draft = { name: string; phone: string; alternatePhone: string | null; gstin: string | null };
const draft = (d: Partial<Draft>): Draft => ({ name: 'Vendor', phone: '', alternatePhone: null, gstin: null, ...d });
// A valid row, and a row validation already rejected. A rejected row still carries its values, so an
// implementation that wrongly indexes every row would be caught.
const ok = (rowNumber: number, d: Partial<Draft>) => ({ rowNumber, reasons: [] as string[], draft: draft(d) });
const bad = (rowNumber: number, d: Partial<Draft>) => ({ rowNumber, reasons: ['Name is required.'], draft: draft(d) });

const directory = [
  { id: 'v1', name: 'Gupta & Sons', phone: '90000 00001', alternatePhone: null, gstin: '29AAAAA0000A1Z5' },
  { id: 'v2', name: 'Mehta Tile Co', phone: '90000 00002', alternatePhone: '98765 43210', gstin: null },
];

type Outcome = { rowNumber: number; outcome: string; reasons: string[]; matches: unknown[] };
const byRow = (rows: Outcome[]): Record<number, Outcome> => Object.fromEntries(rows.map((r) => [r.rowNumber, r]));

describe('import duplicate rules in the preview (FR-006, FR-007)', () => {
  it('rejects a GSTIN that already belongs to a directory vendor, naming the vendor', () => {
    const [row]: Outcome[] = previewOutcomes([ok(2, { phone: '91111 11111', gstin: '29AAAAA0000A1Z5' })], directory);
    expect(row.outcome).toBe('REJECTED');
    expect(row.reasons).toEqual(['This GSTIN already belongs to Gupta & Sons.']);
    expect(row.matches).toEqual([{ kind: 'VENDOR', vendorId: 'v1', vendorName: 'Gupta & Sons' }]);
  });

  it("marks a phone that matches a directory vendor's alternate phone as a possible duplicate, naming the vendor", () => {
    const [row]: Outcome[] = previewOutcomes([ok(2, { phone: '98765-43210' })], directory);
    expect(row.outcome).toBe('POSSIBLE_DUPLICATE');
    expect(row.reasons).toEqual(['Phone matches an existing vendor.']);
    expect(row.matches).toEqual([{ kind: 'VENDOR', vendorId: 'v2', vendorName: 'Mehta Tile Co' }]);
  });

  it('rejects a GSTIN already on an earlier READY or POSSIBLE_DUPLICATE row, naming the row', () => {
    const rows = byRow(
      previewOutcomes(
        [
          ok(2, { phone: '91111 00001', gstin: X }),
          ok(3, { phone: '91111 00002', gstin: X }),
          ok(4, { phone: '98765 43210', gstin: '33BBBBB1111B1Z5' }),
          ok(5, { phone: '91111 00005', gstin: '33BBBBB1111B1Z5' }),
        ],
        directory,
      ),
    );
    expect(rows[2].outcome).toBe('READY');
    expect(rows[3]).toMatchObject({ outcome: 'REJECTED', matches: [{ kind: 'ROW', rowNumber: 2 }] });
    expect(rows[3].reasons[0]).toMatch(/GSTIN.*row 2/);
    expect(rows[4].outcome).toBe('POSSIBLE_DUPLICATE');
    expect(rows[5]).toMatchObject({ outcome: 'REJECTED', matches: [{ kind: 'ROW', rowNumber: 4 }] });
  });

  it('marks a phone equal to an earlier READY row as a possible duplicate, naming the row', () => {
    const rows = byRow(previewOutcomes([ok(2, { phone: '91111 22222' }), ok(3, { phone: '91111-22222' })], directory));
    expect(rows[2].outcome).toBe('READY');
    expect(rows[3]).toMatchObject({ outcome: 'POSSIBLE_DUPLICATE', reasons: ['Phone matches row 2.'], matches: [{ kind: 'ROW', rowNumber: 2 }] });
  });

  it('never lets a rejected row block a later row (US2-15)', () => {
    const rows = byRow(
      previewOutcomes(
        [bad(2, { name: '', phone: '95555 66666', gstin: X }), ok(3, { phone: '95555 66666', gstin: X }), ok(4, { phone: '97777 88888', gstin: X })],
        directory,
      ),
    );
    expect(rows[2]).toMatchObject({ outcome: 'REJECTED', reasons: ['Name is required.'] });
    expect(rows[3]).toMatchObject({ outcome: 'READY', reasons: [], matches: [] });
    expect(rows[4]).toMatchObject({ outcome: 'REJECTED', matches: [{ kind: 'ROW', rowNumber: 3 }] });
  });
});

describe('import outcomes at confirmation (FR-008)', () => {
  const preview = previewOutcomes(
    [
      ok(2, { phone: '91111 00002' }),
      ok(3, { phone: '98765 43210' }),
      ok(4, { phone: '98765-43210', gstin: X }),
      ok(5, { phone: '91111 00005', gstin: X }),
      ok(6, { phone: '91111 00006', gstin: '33BBBBB1111B1Z5' }),
      ok(7, { phone: '91111 00007' }),
    ],
    directory,
  );

  it('starts from the expected preview', () => {
    expect(preview.map((r: Outcome) => r.outcome)).toEqual(['READY', 'POSSIBLE_DUPLICATE', 'POSSIBLE_DUPLICATE', 'REJECTED', 'READY', 'READY']);
  });

  it('imports READY rows and approved possible duplicates, and skips unapproved ones', () => {
    const rows = byRow(confirmOutcomes(preview, [3], directory));
    expect(rows[2].outcome).toBe('IMPORTED');
    expect(rows[3].outcome).toBe('IMPORTED');
    expect(rows[4].outcome).toBe('SKIPPED');
  });

  it('keeps a preview-rejected row rejected even when the row it matched is not approved', () => {
    const rows = byRow(confirmOutcomes(preview, [3], directory));
    expect(rows[4].outcome).toBe('SKIPPED');
    expect(rows[5].outcome).toBe('REJECTED');
  });

  it('ignores approval of a row that is not a possible duplicate', () => {
    const rows = byRow(confirmOutcomes(preview, [5], directory));
    expect(rows[5].outcome).toBe('REJECTED');
  });

  it('rejects a READY row whose GSTIN now belongs to a directory vendor, and skips one whose phone now matches', () => {
    const now = [
      ...directory,
      { id: 'v3', name: 'Late GST', phone: '90000 00003', alternatePhone: null, gstin: '33BBBBB1111B1Z5' },
      { id: 'v4', name: 'Late Phone', phone: '91111-00007', alternatePhone: null, gstin: null },
    ];
    const rows = byRow(confirmOutcomes(preview, [], now));
    expect(rows[6]).toMatchObject({ outcome: 'REJECTED', reasons: ['This GSTIN already belongs to Late GST.'] });
    expect(rows[7]).toMatchObject({ outcome: 'SKIPPED', reasons: ['Phone matches an existing vendor. Not approved.'] });
    expect(rows[2].outcome).toBe('IMPORTED');
  });
});
