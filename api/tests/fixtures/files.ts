// In-memory test files. No binary fixture is checked in; every buffer is built here.
import ExcelJS from 'exceljs';

// The 16 template headings of FR-002, in template order. Kept separate from the
// application's own list so tests check the importer against the spec.
export const TEMPLATE_HEADINGS = [
  'Name',
  'Phone',
  'Categories',
  'Contact person',
  'Alternate phone',
  'Email',
  'Address',
  'GST registered',
  'GSTIN',
  'GST legal name',
  'Team size',
  'Availability',
  'Manpower note',
  'Locations served',
  'Services',
  'Materials',
] as const;

export type Heading = (typeof TEMPLATE_HEADINGS)[number];
export type ImportFixture = { headings: string[]; rows: string[][] };

// One row in template order; headings not given are left blank.
export function vendorRow(cells: Partial<Record<Heading, string>>): string[] {
  return TEMPLATE_HEADINGS.map((heading) => cells[heading] ?? '');
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvBuffer(headings: readonly string[], rows: string[][], options: { bom?: boolean } = {}): Buffer {
  const text = [headings, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return Buffer.from((options.bom ? '﻿' : '') + text, 'utf8');
}

export async function xlsxBuffer(headings: readonly string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vendors');
  headings.forEach((heading, index) => {
    if (/^\s*(alternate )?phone\s*$/i.test(heading)) sheet.getColumn(index + 1).numFmt = '@';
  });
  sheet.addRow([...headings]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function pdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
}

export function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
}

export function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
}

// An OLE compound file header followed by one stream name in UTF-16LE, enough for the content check.
export function oleBuffer(streamName: string): Buffer {
  const header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return Buffer.concat([header, Buffer.alloc(504), Buffer.from(streamName, 'utf16le'), Buffer.alloc(64)]);
}

// A ZIP local file header signature followed by one entry name, enough for the content check.
export function zipWithEntry(name: string): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from(name, 'utf8'), Buffer.alloc(32)]);
}

export function exeBuffer(): Buffer {
  return Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62)]);
}

export function paddedBuffer(bytes: number): Buffer {
  return Buffer.alloc(bytes, 0x20);
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const VALID_GSTIN = '27ABCDE1234F1Z5';

// quickstart.md "Fixtures". Values that must match the seeded directory are passed in.

// 5 valid rows, headings in a different order and mixed letter case.
export function vendorsValid(): ImportFixture {
  const headings = ['phone', 'NAME', ' Categories ', 'Locations served', 'Availability'];
  const rows = [1, 2, 3, 4, 5].map((n) => [`90000 0000${n}`, `Valid Vendor ${n}`, 'Tiles; Marble', 'Pune', 'Available']);
  return { headings, rows };
}

// Row 2 valid, row 3 no phone, row 4 GSTIN already in the directory, row 5 phone of a directory
// vendor written with dashes, row 6 repeats row 2's phone, then one blank row.
export function vendorsMixed(directory: { gstin: string; phoneWithDashes: string }): ImportFixture {
  const rows = [
    vendorRow({ Name: 'Fresh Tiles', Phone: '91111 22222', Categories: 'Tiles' }),
    vendorRow({ Name: 'No Phone Glass', Categories: 'Glass' }),
    vendorRow({ Name: 'Known GST Steel', Phone: '93333 44444', Categories: 'Steel', 'GST registered': 'Yes', GSTIN: directory.gstin }),
    vendorRow({ Name: 'Dashed Phone Paints', Phone: directory.phoneWithDashes, Categories: 'Paint' }),
    vendorRow({ Name: 'Repeat Phone Tiles', Phone: '91111-22222', Categories: 'Tiles' }),
    vendorRow({}),
  ];
  return { headings: [...TEMPLATE_HEADINGS], rows };
}

// Row 2 rejected (no name) with GSTIN X and phone P; row 3 valid with the same GSTIN and phone; row 4 valid with GSTIN X.
export function vendorsRejectedThenValid(): ImportFixture {
  const gst = { 'GST registered': 'Yes', GSTIN: VALID_GSTIN };
  const rows = [
    vendorRow({ Phone: '95555 66666', Categories: 'Wood', ...gst }),
    vendorRow({ Name: 'Valid Wood', Phone: '95555 66666', Categories: 'Wood', ...gst }),
    vendorRow({ Name: 'Second Wood', Phone: '97777 88888', Categories: 'Wood', ...gst }),
  ];
  return { headings: [...TEMPLATE_HEADINGS], rows };
}

// 1,001 non-blank data rows.
export function vendors1001(): ImportFixture {
  const rows = Array.from({ length: 1001 }, (_, i) =>
    vendorRow({ Name: `Bulk Vendor ${i + 1}`, Phone: `8${String(i + 1).padStart(9, '0')}`, Categories: 'Bulk' }),
  );
  return { headings: [...TEMPLATE_HEADINGS], rows };
}

// Two Phone headings.
export function vendorsRepeatedHeading(): ImportFixture {
  return { headings: ['Name', 'Phone', 'Categories', 'Phone'], rows: [['Twice', '90000 11111', 'Tiles', '90000 22222']] };
}

// A valid CSV padded through Manpower note to exactly 25 MB plus 1 byte.
export function vendorsOver25mbCsv(): Buffer {
  const base = csvBuffer(TEMPLATE_HEADINGS, [vendorRow({ Name: 'Big', Phone: '90000 33333', Categories: 'Tiles' })]);
  const padding = 'x'.repeat(MAX_UPLOAD_BYTES + 1 - base.length);
  const file = csvBuffer(TEMPLATE_HEADINGS, [
    vendorRow({ Name: 'Big', Phone: '90000 33333', Categories: 'Tiles', 'Manpower note': padding }),
  ]);
  if (file.length !== MAX_UPLOAD_BYTES + 1) throw new Error(`vendors-over-25mb is ${file.length} bytes`);
  return file;
}

// Any legacy Excel file: refused as UNSUPPORTED_FORMAT by the import.
export function oldXls(): Buffer {
  return oleBuffer('Workbook');
}
