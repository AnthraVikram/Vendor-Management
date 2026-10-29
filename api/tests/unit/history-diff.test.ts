import { describe, expect, it } from 'vitest';
import { diffFields } from '../../src/lib/history';

describe('history diff for edits (FR-027)', () => {
  it('records a changed scalar as from and to', () => {
    expect(diffFields({ phone: '98765 43210', name: 'A' }, { phone: '98765-43211', name: 'A' }, ['phone', 'name'])).toEqual({
      phone: { from: '98765 43210', to: '98765-43211' },
    });
  });

  it('records a value set or cleared, using null for empty', () => {
    expect(diffFields({ email: null, teamSize: 4 }, { email: 'a@b.com', teamSize: null }, ['email', 'teamSize'])).toEqual({
      email: { from: null, to: 'a@b.com' },
      teamSize: { from: 4, to: null },
    });
  });

  it('compares list fields ignoring order and reports them sorted', () => {
    const fields = ['categories', 'locations'];
    expect(diffFields({ categories: ['Tiles', 'Marble'], locations: ['Pune'] }, { categories: ['Marble', 'Tiles'], locations: ['Pune'] }, fields)).toEqual({});
    expect(diffFields({ categories: ['Tiles', 'Marble'], locations: [] }, { categories: ['Tiles', 'Glass'], locations: [] }, fields)).toEqual({
      categories: { from: ['Marble', 'Tiles'], to: ['Glass', 'Tiles'] },
    });
  });

  it('compares indicative rates as sorted "label amount unit" strings', () => {
    const before = { rates: ['Labour 450.00 day', 'Tiling 85.00 sq ft'] };
    expect(diffFields(before, { rates: ['Tiling 85.00 sq ft', 'Labour 450.00 day'] }, ['rates'])).toEqual({});
    expect(diffFields(before, { rates: ['Labour 500.00 day', 'Tiling 85.00 sq ft'] }, ['rates'])).toEqual({
      rates: { from: ['Labour 450.00 day', 'Tiling 85.00 sq ft'], to: ['Labour 500.00 day', 'Tiling 85.00 sq ft'] },
    });
  });

  it('looks only at the named fields', () => {
    expect(diffFields({ name: 'A', updatedAt: 1 }, { name: 'A', updatedAt: 2 }, ['name'])).toEqual({});
  });

  it('returns an empty object for an edit that changes nothing', () => {
    const vendor = { name: 'A', phone: '1', categories: ['Tiles'], gstRegistered: false };
    expect(diffFields(vendor, { ...vendor, categories: ['Tiles'] }, Object.keys(vendor))).toEqual({});
  });
});
