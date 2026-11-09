import { addDays } from './india-date';

// Dashboard deadline groups for open items (FR-018). The groups never overlap.

export type DeadlineGroup = 'OVERDUE' | 'DUE_TODAY' | 'COMING_SOON' | 'UPCOMING';

const COMING_SOON_DAYS = 7;
const UPCOMING_DAYS = 30;

// Returns null for a deadline more than 30 days ahead: such an item is listed only under All.
export function deadlineGroup(deadline: string, today: string): DeadlineGroup | null {
  if (deadline < today) return 'OVERDUE';
  if (deadline === today) return 'DUE_TODAY';
  if (deadline <= addDays(today, COMING_SOON_DAYS)) return 'COMING_SOON';
  if (deadline <= addDays(today, UPCOMING_DAYS)) return 'UPCOMING';
  return null;
}
