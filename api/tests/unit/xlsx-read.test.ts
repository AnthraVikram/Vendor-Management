import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/lib/http';
import { readImportFile } from '../../src/lib/xlsx-read';
import {
  MAX_UPLOAD_BYTES,
  TEMPLATE_HEADINGS,
  csvBuffer,
  oldXls,
  paddedBuffer,
  pdfBuffer,
  vendorRow,
  vendorsMixed,
  vendorsValid,
  xlsxBuffer,
  zipWithEntry,
} from '../fixtures/files';

async function refusal(name: string, bytes: Buffer): Promise<HttpError> {
  try {
    await readImportFile(name, bytes);
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error(`expected ${name} to be refused`);
}

function rowsOf(count: number): string[][] {
  return Array.from({ length: count }, (_, i) => vendorRow({ Name: `Vendor ${i + 1}`, Phone: `8${String(i + 1).padStart(9, '0')}`, Categories: 'Bulk' }));
}

async function workbookOf(rows: ExcelJS.CellValue[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vendors');
  rows.forEach((row, index) => {
    if (row.length > 0) sheet.getRow(index + 1).values = row;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('import file reader (FR-001, FR-003)', () => {
  it('reads a CSV: heading row, numbered data rows, blank rows left out, values kept as text', async () => {
    const fixture = vendorsMixed({ gstin: '29AAAAA0000A1Z5', phoneWithDashes: '98765-43210' });
    const result = await readImportFile('vendors-mixed.csv', csvBuffer(fixture.headings, fixture.rows));
    expect(result.format).toBe('CSV');
    expect(result.headingRow).toEqual([...TEMPLATE_HEADINGS]);
    expect(result.rows.map((row) => row.row_number)).toEqual([2, 3, 4, 5, 6]);
    expect(result.rows[0].cells.slice(0, 3)).toEqual(['Fresh Tiles', '91111 22222', 'Tiles']);
  });

  it('keeps a CSV phone with a leading zero, and accepts the extension in any letter case', async () => {
    const result = await readImportFile('VENDORS.CSV', csvBuffer(['Name', 'Phone', 'Categories'], [['Zero', '09876543210', 'Tiles']]));
    expect(result.rows[0].cells).toEqual(['Zero', '09876543210', 'Tiles']);
  });

  it('reads the first worksheet of an xlsx file, with headings as written', async () => {
    const fixture = vendorsValid();
    const result = await readImportFile('vendors-valid.xlsx', await xlsxBuffer(fixture.headings, fixture.rows));
    expect(result.format).toBe('XLSX');
    expect(result.headingRow).toEqual(['phone', 'NAME', ' Categories ', 'Locations served', 'Availability']);
    expect(result.rows.map((row) => row.row_number)).toEqual([2, 3, 4, 5, 6]);
    expect(result.rows[0].cells).toEqual(['90000 00001', 'Valid Vendor 1', 'Tiles; Marble', 'Pune', 'Available']);
  });

  it('keeps an xlsx text phone with a leading zero', async () => {
    const result = await readImportFile('zero.xlsx', await xlsxBuffer(['Name', 'Phone', 'Categories'], [['Zero', '09876543210', 'Tiles']]));
    expect(result.rows[0].cells).toEqual(['Zero', '09876543210', 'Tiles']);
  });

  it('turns numeric xlsx cells into text, a whole number into its integer text', async () => {
    const bytes = await workbookOf([
      ['Name', 'Phone', 'Categories', 'Team size'],
      ['Numbers', 9876543210, 'Tiles', 4],
      ['Fraction', 9876543211, 'Tiles', 2.5],
    ]);
    const result = await readImportFile('numbers.xlsx', bytes);
    expect(result.rows[0].cells).toEqual(['Numbers', '9876543210', 'Tiles', '4']);
    expect(result.rows[1].cells[3]).toBe('2.5');
  });

  it('reads only the first worksheet and fills empty cells with blank text', async () => {
    const workbook = new ExcelJS.Workbook();
    const first = workbook.addWorksheet('Vendors');
    first.getRow(1).values = ['Name', 'Phone', 'Categories', 'Email'];
    first.getRow(2).values = ['Gap', '', 'Tiles'];
    first.getRow(4).values = ['After blank', '90000 00004', 'Tiles', 'a@b.com'];
    workbook.addWorksheet('Other').getRow(1).values = ['Ignored'];
    const result = await readImportFile('two-sheets.xlsx', Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(result.headingRow).toEqual(['Name', 'Phone', 'Categories', 'Email']);
    expect(result.rows).toEqual([
      { row_number: 2, cells: ['Gap', '', 'Tiles', ''] },
      { row_number: 4, cells: ['After blank', '90000 00004', 'Tiles', 'a@b.com'] },
    ]);
  });

  it('accepts exactly 1,000 non-blank data rows, with blank rows not counted', async () => {
    const csv = await readImportFile('1000.csv', csvBuffer(TEMPLATE_HEADINGS, rowsOf(1000)));
    expect(csv.rows).toHaveLength(1000);
    const withBlanks = [...rowsOf(500), vendorRow({}), vendorRow({}), ...rowsOf(500)];
    expect((await readImportFile('1000-with-blanks.csv', csvBuffer(TEMPLATE_HEADINGS, withBlanks))).rows).toHaveLength(1000);
    const xlsx = await readImportFile('1000.xlsx', await xlsxBuffer(TEMPLATE_HEADINGS, rowsOf(1000)));
    expect(xlsx.rows).toHaveLength(1000);
  });

  it('refuses 1,001 non-blank data rows as a whole, for CSV and xlsx alike', async () => {
    for (const [name, bytes] of [
      ['1001.csv', csvBuffer(TEMPLATE_HEADINGS, rowsOf(1001))],
      ['1001.xlsx', await xlsxBuffer(TEMPLATE_HEADINGS, rowsOf(1001))],
    ] as [string, Buffer][]) {
      const error = await refusal(name, bytes);
      expect(error.status, name).toBe(400);
      expect(error.code, name).toBe('TOO_MANY_ROWS');
    }
  });

  it('refuses a file with no heading row or no data rows', async () => {
    const cases: [string, Buffer][] = [
      ['empty.csv', Buffer.alloc(0)],
      ['headings-only.csv', csvBuffer(TEMPLATE_HEADINGS, [])],
      ['blank-rows-only.csv', csvBuffer(TEMPLATE_HEADINGS, [vendorRow({}), vendorRow({})])],
      ['blank-heading.csv', Buffer.from('\r\nA,1,Tiles\r\n')],
      ['headings-only.xlsx', await xlsxBuffer(TEMPLATE_HEADINGS, [])],
      ['no-heading-row.xlsx', await workbookOf([[], ['A', '1', 'Tiles']])],
    ];
    for (const [name, bytes] of cases) {
      const error = await refusal(name, bytes);
      expect(error.status, name).toBe(400);
      expect(error.code, name).toBe('EMPTY_FILE');
    }
  });

  it('refuses unsupported or mismatched files as UNSUPPORTED_FORMAT', async () => {
    const cases: [string, Buffer][] = [
      ['old.xls', oldXls()],
      ['vendors.txt', Buffer.from('Name,Phone,Categories\r\nA,1,Tiles\r\n')],
      ['no-extension', Buffer.from('Name,Phone,Categories\r\nA,1,Tiles\r\n')],
      ['pretend.xlsx', pdfBuffer()],
      ['word.xlsx', zipWithEntry('word/document.xml')],
      ['corrupt.xlsx', zipWithEntry('xl/workbook.xml')],
      ['latin1.csv', Buffer.concat([Buffer.from('Name,Phone,Categories\r\nCaf'), Buffer.from([0xe9]), Buffer.from(',1,Tiles\r\n')])],
    ];
    for (const [name, bytes] of cases) {
      const error = await refusal(name, bytes);
      expect(error.status, name).toBe(400);
      expect(error.code, name).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('refuses a file over 25 MB with the import limit message', async () => {
    const error = await refusal('big.csv', paddedBuffer(MAX_UPLOAD_BYTES + 1));
    expect(error).toMatchObject({ status: 400, code: 'FILE_TOO_LARGE', fields: { file: 'The file must be 25 MB or smaller.' } });
  });
});
