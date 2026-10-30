import { z } from 'zod';
import type { ImportHeading } from './import-headings';
import { gstinProblem, normalizeGstin } from './vendor-rules';

export type ImportCells = Partial<Record<ImportHeading, string | number | null | undefined>>;

export type VendorDraft = {
  name: string;
  phone: string;
  contactPerson: string | null;
  alternatePhone: string | null;
  email: string | null;
  address: string | null;
  gstRegistered: boolean;
  gstin: string | null;
  gstLegalName: string | null;
  teamSize: number | null;
  availability: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' | null;
  manpowerNote: string | null;
  categories: string[];
  locations: string[];
  services: string[];
  materials: string[];
};

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
const optionalText = z.preprocess(text, z.string()).transform((value) => (value === '' ? null : value));

// Splits on semicolons, trims, drops empty parts, and keeps the first spelling of names equal ignoring case.
function splitList(value: unknown): string[] {
  const parts: string[] = [];
  for (const part of text(value).split(';').map((item) => item.trim())) {
    if (part !== '' && !parts.some((kept) => kept.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  return parts;
}
const list = z.preprocess(splitList, z.array(z.string()));

// Each cell's Zod schema, in the order reasons are reported. Messages match the Feature 001 vendor form.
const cellSchemas = {
  name: z.preprocess(text, z.string().min(1, 'Name is required.')),
  phone: z.preprocess(text, z.string().min(1, 'Phone is required.')),
  categories: list.pipe(z.array(z.string()).min(1, 'A category is required.')),
  contactPerson: optionalText,
  alternatePhone: optionalText,
  email: optionalText,
  address: optionalText,
  gstRegistered: z
    .preprocess((value) => text(value).toLowerCase(), z.enum(['', 'yes', 'no'], { errorMap: () => ({ message: 'GST registered must be Yes, No, or blank.' }) }))
    .transform((value) => value === 'yes'),
  gstLegalName: optionalText,
  teamSize: z
    .preprocess(text, z.string().regex(/^\d*$/, 'Team size must be a whole number of zero or greater.'))
    .transform((value) => (value === '' ? null : Number(value))),
  availability: z
    .preprocess(
      (value) => text(value).toUpperCase(),
      z.enum(['', 'AVAILABLE', 'LIMITED', 'UNAVAILABLE'], {
        errorMap: () => ({ message: 'Availability must be Available, Limited, Unavailable, or blank.' }),
      }),
    )
    .transform((value) => (value === '' ? null : value)),
  manpowerNote: optionalText,
  locations: list,
  services: list,
  materials: list,
} satisfies Record<Exclude<keyof VendorDraft, 'gstin'>, z.ZodTypeAny>;

const cellOf: Record<keyof typeof cellSchemas, ImportHeading> = {
  name: 'Name',
  phone: 'Phone',
  categories: 'Categories',
  contactPerson: 'Contact person',
  alternatePhone: 'Alternate phone',
  email: 'Email',
  address: 'Address',
  gstRegistered: 'GST registered',
  gstLegalName: 'GST legal name',
  teamSize: 'Team size',
  availability: 'Availability',
  manpowerNote: 'Manpower note',
  locations: 'Locations served',
  services: 'Services',
  materials: 'Materials',
};

const fallback: VendorDraft = {
  name: '',
  phone: '',
  contactPerson: null,
  alternatePhone: null,
  email: null,
  address: null,
  gstRegistered: false,
  gstin: null,
  gstLegalName: null,
  teamSize: null,
  availability: null,
  manpowerNote: null,
  categories: [],
  locations: [],
  services: [],
  materials: [],
};

// Validates one spreadsheet row as the vendor form would (FR-005). The draft is always returned, with
// defaults for fields that failed, so duplicate checks can still read a rejected row's values.
export function validateRow(cells: ImportCells): { draft: VendorDraft; reasons: string[] } {
  const draft: VendorDraft = { ...fallback };
  const reasons: string[] = [];
  let gstKnown = true;
  for (const key of Object.keys(cellSchemas) as (keyof typeof cellSchemas)[]) {
    const result = cellSchemas[key].safeParse(cells[cellOf[key]]);
    if (result.success) {
      (draft as Record<string, unknown>)[key] = result.data;
    } else {
      reasons.push(...result.error.issues.map((issue) => issue.message));
      if (key === 'gstRegistered') gstKnown = false;
    }
  }
  const gstin = text(cells.GSTIN);
  if (gstKnown) {
    const problem = gstinProblem(draft.gstRegistered, gstin);
    if (problem) reasons.push(problem);
    else draft.gstin = normalizeGstin(draft.gstRegistered, gstin);
  } else {
    draft.gstin = gstin === '' ? null : gstin.toUpperCase();
  }
  return { draft, reasons };
}
