import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/lib/http';
import {
  assertItemWritable,
  assertProjectWritable,
  checkPlannedDate,
  checkResponsibleShape,
} from '../../src/lib/timeline-rules';

const vendorId = 'b1f4f1b6-5f0e-4c2a-9a59-1f1d6c1e0a01';

function thrown(run: () => void): HttpError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('Expected an HttpError');
}

describe('timeline rules', () => {
  it('refuses a planned date later than the deadline and allows equal or absent', () => {
    expect(checkPlannedDate('2026-10-26', '2026-10-25')).toEqual({
      planned_date: 'Planned date cannot be later than the deadline.',
    });
    expect(checkPlannedDate('2026-10-25', '2026-10-25')).toEqual({});
    expect(checkPlannedDate(null, '2026-10-25')).toEqual({});
    expect(checkPlannedDate(undefined, '2026-10-25')).toEqual({});
  });

  it('requires a vendor id exactly when the responsible party is a vendor', () => {
    expect(checkResponsibleShape({ kind: 'VENDOR' })).toHaveProperty(['responsible.vendor_id']);
    expect(checkResponsibleShape({ kind: 'VENDOR', vendor_id: null })).toHaveProperty(['responsible.vendor_id']);
    expect(checkResponsibleShape({ kind: 'NONE', vendor_id: vendorId })).toHaveProperty(['responsible.vendor_id']);
    expect(checkResponsibleShape({ kind: 'FIRM_TEAM', vendor_id: vendorId })).toHaveProperty(['responsible.vendor_id']);
    expect(checkResponsibleShape({ kind: 'VENDOR', vendor_id: vendorId })).toEqual({});
    expect(checkResponsibleShape({ kind: 'FIRM_TEAM' })).toEqual({});
    expect(checkResponsibleShape({ kind: 'NONE', vendor_id: null })).toEqual({});
  });

  it('refuses writes on an archived project or item with stable codes', () => {
    const project = thrown(() => assertProjectWritable({ archived: true }));
    expect(project.status).toBe(409);
    expect(project.code).toBe('PROJECT_ARCHIVED');
    const item = thrown(() => assertItemWritable({ archived: true }));
    expect(item.status).toBe(409);
    expect(item.code).toBe('ITEM_ARCHIVED');
    expect(item.message).toMatch(/restore/i);
    expect(() => assertProjectWritable({ archived: false })).not.toThrow();
    expect(() => assertItemWritable({ archived: false })).not.toThrow();
  });
});
