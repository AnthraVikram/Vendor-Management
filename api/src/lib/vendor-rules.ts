const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstinProblem(registered: boolean, gstin: string | null | undefined): string | null {
  if (!registered) {
    if (gstin && gstin.trim() !== '') {
      return 'A vendor who is not GST registered is saved without a GSTIN.';
    }
    return null;
  }
  if (!gstin || gstin.trim() === '') return 'GSTIN is required.';
  if (!GSTIN.test(gstin.trim().toUpperCase())) return 'GSTIN must be 15 characters.';
  return null;
}

export function normalizeGstin(registered: boolean, gstin: string | null | undefined): string | null {
  if (!registered) return null;
  return gstin!.trim().toUpperCase();
}

export function ratingProblem(score: number): string | null {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return 'Rating must be a whole number from 1 to 5.';
  }
  return null;
}

export function listedWhenArchived(includeArchived: boolean, archived: boolean): boolean {
  return includeArchived || !archived;
}

export function reuseCategory(
  storedName: string,
  submittedName: string,
): { matches: boolean; name: string } {
  const submitted = submittedName.trim();
  const matches = storedName.toLowerCase() === submitted.toLowerCase();
  return { matches, name: matches ? storedName : submitted };
}
