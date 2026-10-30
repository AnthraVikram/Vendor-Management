import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/lib/csv';
import { HttpError } from '../../src/lib/http';

const csv = (text: string) => Buffer.from(text, 'utf8');

describe('CSV parsing (FR-001)', () => {
  it('keeps a quoted comma inside one cell', () => {
    expect(parseCsv(csv('Name,Phone\r\n"Rao, Sons",1\r\n'))).toEqual([
      ['Name', 'Phone'],
      ['Rao, Sons', '1'],
    ]);
  });

  it('turns a doubled quote inside quotes into one quote', () => {
    expect(parseCsv(csv('Note\r\n"say ""hi"""\r\n'))).toEqual([['Note'], ['say "hi"']]);
  });

  it('accepts CRLF and LF line ends', () => {
    expect(parseCsv(csv('a,b\r\n1,2\r\n'))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv(csv('a,b\n1,2\n'))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('drops a leading UTF-8 byte-order mark', () => {
    expect(parseCsv(csv('﻿Name\r\nA\r\n'))).toEqual([['Name'], ['A']]);
  });

  it('returns a blank line as an empty row for the caller to skip', () => {
    const rows = parseCsv(csv('Name\r\nA\r\n\r\nB\r\n'));
    expect(rows).toHaveLength(4);
    expect(rows[2].every((cell: string) => cell === '')).toBe(true);
    expect(rows[3]).toEqual(['B']);
  });

  it('keeps every value as text', () => {
    expect(parseCsv(csv('Phone,Team size\r\n09876543210,4\r\n'))[1]).toEqual(['09876543210', '4']);
  });

  it('refuses bytes that are not UTF-8', () => {
    const bytes = Buffer.concat([csv('Name\r\n'), Buffer.from([0xc3, 0x28, 0x0d, 0x0a])]);
    let error: unknown;
    try {
      parseCsv(bytes);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 400, code: 'UNSUPPORTED_FORMAT', message: 'Save the CSV as CSV UTF-8 and upload it again.' });
  });
});
