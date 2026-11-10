import type { Response } from 'express';
import { z } from 'zod';

// Feature 005 list parameters shared by the Vendors and Projects lists (FR-004, FR-006, FR-026). Paging applies only
// when a page is asked for, so existing callers that list everything (for example the assign-a-vendor choices) still
// get every match.
export const listViewSchema = z.object({
  view: z.enum(['active', 'archived'], { message: 'Use view=active or view=archived.' }).optional(),
  limit: z.coerce.number({ message: 'Use a whole number from 1 to 200.' }).int().min(1).max(200, 'Use a whole number from 1 to 200.').optional(),
  offset: z.coerce.number({ message: 'Use a whole number from 0.' }).int().min(0, 'Use a whole number from 0.').optional(),
});

export type ListView = z.infer<typeof listViewSchema>;

// Splits matching rows into the requested view, sets the count headers and returns the requested page.
export function viewAndPage<T extends { archived: boolean }>(
  res: Response,
  rows: T[],
  options: ListView & { includeArchived: boolean },
): T[] {
  const active = rows.filter((row) => !row.archived);
  const archived = rows.filter((row) => row.archived);
  const shown = options.includeArchived ? rows : options.view === 'archived' ? archived : active;
  res.setHeader('X-Total-Count', String(shown.length));
  res.setHeader('X-Active-Count', String(active.length));
  res.setHeader('X-Archived-Count', String(archived.length));
  if (options.limit === undefined && options.offset === undefined) return shown;
  const start = options.offset ?? 0;
  return shown.slice(start, start + (options.limit ?? 50));
}

// Sorts by the given key, keeping the incoming (name) order for ties; empty values go last.
export function sortBy<T>(rows: T[], key: (row: T) => string | number | null): T[] {
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : 1;
  });
}
