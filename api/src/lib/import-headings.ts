import { HttpError } from './http';

// The FR-002 template headings, in template order.
export const IMPORT_HEADINGS = [
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

export type ImportHeading = (typeof IMPORT_HEADINGS)[number];

const REQUIRED: ImportHeading[] = ['Name', 'Phone', 'Categories'];
const byKey = new Map(IMPORT_HEADINGS.map((heading) => [heading.toLowerCase(), heading]));

// Finds each template heading's column, ignoring order, letter case, and surrounding spaces.
export function matchHeadings(row: unknown[]): { index: Partial<Record<ImportHeading, number>>; ignored: string[] } {
  const index: Partial<Record<ImportHeading, number>> = {};
  const ignored: string[] = [];
  const repeated: ImportHeading[] = [];
  row.forEach((cell, column) => {
    const text = String(cell ?? '').trim();
    if (text === '') return;
    const heading = byKey.get(text.toLowerCase());
    if (!heading) {
      if (!ignored.includes(text)) ignored.push(text);
    } else if (index[heading] !== undefined) {
      if (!repeated.includes(heading)) repeated.push(heading);
    } else {
      index[heading] = column;
    }
  });
  if (repeated.length > 0) {
    throw new HttpError(400, `Each heading may appear once. Repeated: ${repeated.join(', ')}.`, {
      code: 'REPEATED_HEADING',
      extra: { headings: repeated },
    });
  }
  const missing = REQUIRED.filter((heading) => index[heading] === undefined);
  if (missing.length > 0) {
    throw new HttpError(400, `The file is missing these headings: ${missing.join(', ')}.`, {
      code: 'MISSING_HEADING',
      extra: { headings: missing },
    });
  }
  return { index, ignored };
}
