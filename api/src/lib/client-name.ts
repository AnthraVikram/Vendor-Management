// FR-029a, OQ-41: a client is the project's client name, compared after trimming, collapsing repeated whitespace
// and ignoring letter case (research R8). Blank names match nothing.
export function normaliseClientName(name: string | null | undefined): string | null {
  const value = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return value === '' ? null : value;
}

// The same rule in SQL, for the duplicate PO-number lookup across projects.
export const NORMALISED_CLIENT_NAME_SQL = `lower(regexp_replace(btrim(client_name), '\\s+', ' ', 'g'))`;
