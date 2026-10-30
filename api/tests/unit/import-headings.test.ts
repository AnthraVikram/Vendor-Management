import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/lib/http';
import { IMPORT_HEADINGS, matchHeadings } from '../../src/lib/import-headings';
import { TEMPLATE_HEADINGS } from '../fixtures/files';

function refusal(row: string[]): HttpError {
  try {
    matchHeadings(row);
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected matchHeadings to refuse the row');
}

describe('import template headings (FR-002)', () => {
  it('publishes exactly the 16 headings of FR-002 in template order', () => {
    expect([...IMPORT_HEADINGS]).toEqual([...TEMPLATE_HEADINGS]);
  });

  it('finds each heading in any column order', () => {
    const { index } = matchHeadings(['Categories', 'Phone', 'Name']);
    expect(index).toMatchObject({ Name: 2, Phone: 1, Categories: 0 });
  });

  it('ignores letter case and surrounding spaces', () => {
    const { index } = matchHeadings([' phone ', 'NAME', 'categories', 'GST Registered']);
    expect(index).toMatchObject({ Phone: 0, Name: 1, Categories: 2, 'GST registered': 3 });
  });

  it('collects unknown headings once and skips blank heading cells', () => {
    const { ignored } = matchHeadings(['Name', 'Phone', 'Categories', 'Rate', '', '  ']);
    expect(ignored).toEqual(['Rate']);
  });

  it('refuses a file missing Name, Phone, or Categories', () => {
    const error = refusal(['Email', 'Name']);
    expect(error).toMatchObject({ status: 400, code: 'MISSING_HEADING' });
    expect(error.extra?.headings).toEqual(['Phone', 'Categories']);
  });

  it('refuses a repeated heading, even when written differently', () => {
    const error = refusal(['Name', 'Phone', 'Categories', ' phone ']);
    expect(error).toMatchObject({ status: 400, code: 'REPEATED_HEADING' });
    expect(error.extra?.headings).toEqual(['Phone']);
  });
});
