import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

async function workbookBuffer(): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vendors');
  sheet.getColumn(2).numFmt = '@';
  sheet.addRow(['Name', 'Phone']);
  sheet.addRow(['A', '09876543210']);
  sheet.addRow(['B', '98765 43210']);
  return workbook.xlsx.writeBuffer();
}

describe('exceljs under Node 24', () => {
  it('loads a generated workbook and keeps a text phone with its leading zero', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await workbookBuffer());

    const rows: unknown[][] = [];
    workbook.worksheets[0].eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1));
    });

    expect(rows).toEqual([
      ['Name', 'Phone'],
      ['A', '09876543210'],
      ['B', '98765 43210'],
    ]);
    expect(typeof rows[1][1]).toBe('string');
  });
});
