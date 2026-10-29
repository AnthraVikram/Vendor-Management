import { phoneKey, phoneMatches } from './phone';

// Duplicate rules for the import preview and confirmation (FR-006, FR-007, FR-008).

export type DirectoryVendor = { id: string; name: string; phone: string; alternatePhone: string | null; gstin: string | null };
export type DuplicateDraft = { phone: string; alternatePhone: string | null; gstin: string | null };
export type RowMatch = { kind: 'VENDOR'; vendorId: string; vendorName: string } | { kind: 'ROW'; rowNumber: number };

export type PreviewRow<D extends DuplicateDraft> = {
  rowNumber: number;
  outcome: 'READY' | 'REJECTED' | 'POSSIBLE_DUPLICATE';
  reasons: string[];
  matches: RowMatch[];
  draft: D;
};

export type ConfirmRow<D extends DuplicateDraft> = {
  rowNumber: number;
  outcome: 'IMPORTED' | 'SKIPPED' | 'REJECTED';
  reasons: string[];
  matches: RowMatch[];
  draft: D;
};

const vendorMatch = (vendor: { id: string; name: string }): RowMatch => ({ kind: 'VENDOR', vendorId: vendor.id, vendorName: vendor.name });

function phoneKeys(draft: DuplicateDraft): string[] {
  return [phoneKey(draft.phone), phoneKey(draft.alternatePhone)].filter((key) => key !== '');
}

// One pass in file order. Rows compare against the directory and against earlier rows that are not
// rejected; a rejected row is added to no index, so it never blocks a later row.
export function previewOutcomes<D extends DuplicateDraft>(
  rows: { rowNumber: number; reasons: string[]; draft: D }[],
  directory: DirectoryVendor[],
): PreviewRow<D>[] {
  const gstinRow = new Map<string, number>();
  const phoneRow = new Map<string, number>();
  return rows.map(({ rowNumber, reasons, draft }) => {
    if (reasons.length > 0) return { rowNumber, outcome: 'REJECTED', reasons, matches: [], draft };

    if (draft.gstin) {
      const owner = directory.find((vendor) => vendor.gstin === draft.gstin);
      if (owner) {
        return { rowNumber, outcome: 'REJECTED', reasons: [`This GSTIN already belongs to ${owner.name}.`], matches: [vendorMatch(owner)], draft };
      }
      const earlier = gstinRow.get(draft.gstin);
      if (earlier !== undefined) {
        return { rowNumber, outcome: 'REJECTED', reasons: [`This GSTIN is already on row ${earlier}.`], matches: [{ kind: 'ROW', rowNumber: earlier }], draft };
      }
    }

    // From here the row may be imported, so later rows compare against it.
    const keys = phoneKeys(draft);
    const earlier = keys.map((key) => phoneRow.get(key)).find((row) => row !== undefined);
    for (const key of keys) if (!phoneRow.has(key)) phoneRow.set(key, rowNumber);
    if (draft.gstin) gstinRow.set(draft.gstin, rowNumber);

    const owners = phoneMatches(draft, directory);
    if (owners.length > 0) {
      return { rowNumber, outcome: 'POSSIBLE_DUPLICATE', reasons: ['Phone matches an existing vendor.'], matches: owners.map(vendorMatch), draft };
    }
    if (earlier !== undefined) {
      return { rowNumber, outcome: 'POSSIBLE_DUPLICATE', reasons: [`Phone matches row ${earlier}.`], matches: [{ kind: 'ROW', rowNumber: earlier }], draft };
    }
    return { rowNumber, outcome: 'READY', reasons: [], matches: [], draft };
  });
}

// Rechecks the preview against the directory as it is now. A row rejected in the preview stays rejected.
export function confirmOutcomes<D extends DuplicateDraft>(
  previewRows: PreviewRow<D>[],
  approvedRows: number[],
  directoryNow: DirectoryVendor[],
): ConfirmRow<D>[] {
  return previewRows.map((row) => {
    const { rowNumber, draft } = row;
    if (row.outcome === 'REJECTED') return { rowNumber, outcome: 'REJECTED', reasons: row.reasons, matches: row.matches, draft };

    if (draft.gstin) {
      const owner = directoryNow.find((vendor) => vendor.gstin === draft.gstin);
      if (owner) {
        return { rowNumber, outcome: 'REJECTED', reasons: [`This GSTIN already belongs to ${owner.name}.`], matches: [vendorMatch(owner)], draft };
      }
    }

    const approved = row.outcome === 'POSSIBLE_DUPLICATE' && approvedRows.includes(rowNumber);
    if (approved) return { rowNumber, outcome: 'IMPORTED', reasons: [], matches: row.matches, draft };

    const owners = phoneMatches(draft, directoryNow);
    if (owners.length > 0) {
      return { rowNumber, outcome: 'SKIPPED', reasons: ['Phone matches an existing vendor. Not approved.'], matches: owners.map(vendorMatch), draft };
    }
    if (row.outcome === 'POSSIBLE_DUPLICATE') {
      return { rowNumber, outcome: 'SKIPPED', reasons: row.reasons.map((reason) => `${reason} Not approved.`), matches: row.matches, draft };
    }
    return { rowNumber, outcome: 'IMPORTED', reasons: [], matches: [], draft };
  });
}
