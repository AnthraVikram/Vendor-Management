import { describe, expect, it } from 'vitest';
import { validateRow } from '../../src/lib/import-rows';

const base = { Name: 'Sharma Interiors', Phone: '98765 43210', Categories: 'Tiles' };

describe('import row validation (FR-005)', () => {
  it('accepts a minimal valid row and turns it into a vendor draft', () => {
    const { draft, reasons } = validateRow(base);
    expect(reasons).toEqual([]);
    expect(draft).toMatchObject({ name: 'Sharma Interiors', phone: '98765 43210', categories: ['Tiles'], gstRegistered: false, gstin: null });
  });

  it('uses the Feature 001 messages for the required fields, and lists every reason', () => {
    expect(validateRow({ Categories: 'Tiles' }).reasons).toEqual(['Name is required.', 'Phone is required.']);
    expect(validateRow({ Name: '  ', Phone: '1', Categories: ' ; ; ' }).reasons).toEqual(['Name is required.', 'A category is required.']);
  });

  it('accepts a whole team size of zero or more, as text or as a number', () => {
    expect(validateRow({ ...base, 'Team size': '4' }).draft).toMatchObject({ teamSize: 4 });
    expect(validateRow({ ...base, 'Team size': 4 }).draft).toMatchObject({ teamSize: 4 });
    expect(validateRow({ ...base, 'Team size': '0' }).draft).toMatchObject({ teamSize: 0 });
    expect(validateRow({ ...base, 'Team size': '' }).draft).toMatchObject({ teamSize: null });
  });

  it('refuses a negative or fractional team size with the Feature 001 message', () => {
    for (const value of ['-1', '2.5', 2.5]) {
      expect(validateRow({ ...base, 'Team size': value }).reasons).toEqual(['Team size must be a whole number of zero or greater.']);
    }
  });

  it('accepts availability in any letter case and refuses other values', () => {
    expect(validateRow({ ...base, Availability: 'limited' }).draft).toMatchObject({ availability: 'LIMITED' });
    expect(validateRow({ ...base, Availability: '' }).draft).toMatchObject({ availability: null });
    const { reasons } = validateRow({ ...base, Availability: 'Busy' });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/availability/i);
  });

  it('reads GST registered as Yes, No, or blank in any letter case, and refuses other values', () => {
    const gstin = '27ABCDE1234F1Z5';
    expect(validateRow({ ...base, 'GST registered': 'yes', GSTIN: gstin }).draft).toMatchObject({ gstRegistered: true });
    expect(validateRow({ ...base, 'GST registered': 'NO' }).draft).toMatchObject({ gstRegistered: false });
    expect(validateRow({ ...base, 'GST registered': '' }).draft).toMatchObject({ gstRegistered: false });
    const { reasons } = validateRow({ ...base, 'GST registered': 'Maybe' });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/GST registered/i);
  });

  it('applies the Feature 001 GSTIN rules', () => {
    expect(validateRow({ ...base, GSTIN: '27ABCDE1234F1Z5' }).reasons).toEqual(['A vendor who is not GST registered is saved without a GSTIN.']);
    expect(validateRow({ ...base, 'GST registered': 'Yes' }).reasons).toEqual(['GSTIN is required.']);
    expect(validateRow({ ...base, 'GST registered': 'Yes', GSTIN: 'NOT-A-GSTIN' }).reasons).toEqual(['GSTIN must be 15 characters.']);
    expect(validateRow({ ...base, 'GST registered': 'Yes', GSTIN: ' 27abcde1234f1z5 ' }).draft).toMatchObject({ gstin: '27ABCDE1234F1Z5' });
  });

  it('splits list cells on semicolons, trims them, drops empty parts, and removes duplicates ignoring case', () => {
    const { draft } = validateRow({ ...base, Categories: 'Tiles; tiles ;;Marble', 'Locations served': 'Pune; ;PUNE', Services: '', Materials: 'Teak' });
    expect(draft).toMatchObject({ categories: ['Tiles', 'Marble'], locations: ['Pune'], services: [], materials: ['Teak'] });
  });

  it('adds no rule the vendor form lacks', () => {
    expect(validateRow({ ...base, Email: 'a@b', Address: 'x', 'Contact person': 'y', 'Manpower note': 'z' }).reasons).toEqual([]);
  });
});
