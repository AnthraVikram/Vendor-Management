import path from 'node:path';
import ExcelJS from 'exceljs';
import { parseCsv } from './csv';
import { HttpError } from './http';

// Reads an uploaded vendor spreadsheet (FR-001, FR-003): the heading row and every non-blank data row,
// all as text. Blank rows are left out but keep their place in the numbering; the heading row is row 1.

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

export type ImportFile = {
  format: 'XLSX' | 'CSV';
  headingRow: string[];
  rows: { row_number: number; cells: string[] }[];
};

function refuse(code: string, message: string): HttpError {
  return new HttpError(400, message, { code });
}

const unsupported = () => refuse('UNSUPPORTED_FORMAT', 'Upload the vendor list as an .xlsx or .csv file.');

const isBlank = (cells: string[]) => cells.every((cell) => cell.trim() === '');

// One spreadsheet cell as text. A whole number keeps its integer text, so 9876543210 stays "9876543210".
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  return '';
}

async function readXlsx(bytes: Buffer): Promise<string[][]> {
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!isZip || !bytes.includes('xl/workbook.xml')) throw unsupported();
  // The whole workbook is loaded, not streamed: the streaming reader fails on files whose workbook part
  // comes after the sheets, including files exceljs itself writes (research.md).
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw unsupported();
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const width = sheet.columnCount;
  const lines: string[][] = [];
  for (let number = 1; number <= sheet.rowCount; number++) {
    const values = sheet.getRow(number).values as ExcelJS.CellValue[];
    lines.push(Array.from({ length: width }, (_, column) => cellText(values[column + 1])));
  }
  return lines;
}

export async function readImportFile(originalName: string, bytes: Buffer): Promise<ImportFile> {
  // The upload route refuses larger files first; this keeps the limit for any other caller.
  if (bytes.length > MAX_IMPORT_BYTES) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      code: 'FILE_TOO_LARGE',
      fields: { file: 'The file must be 25 MB or smaller.' },
    });
  }
  const ext = path.extname(originalName).toLowerCase();
  let format: ImportFile['format'];
  let lines: string[][];
  if (ext === '.xlsx') {
    format = 'XLSX';
    lines = await readXlsx(bytes);
  } else if (ext === '.csv') {
    format = 'CSV';
    lines = parseCsv(bytes);
  } else {
    throw unsupported();
  }

  const headingRow = lines[0] ?? [];
  const rows = lines
    .map((cells, index) => ({ row_number: index + 1, cells }))
    .slice(1)
    .filter((row) => !isBlank(row.cells));
  if (isBlank(headingRow) || rows.length === 0) {
    throw refuse('EMPTY_FILE', 'The file needs a heading row and at least one vendor row.');
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw refuse('TOO_MANY_ROWS', `The file has ${rows.length} vendor rows. Upload at most 1,000 rows at a time.`);
  }
  return { format, headingRow, rows };
}
