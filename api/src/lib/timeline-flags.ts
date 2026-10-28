import { addDays, daysBetween } from './india-date';

export type TimelineFlag =
  | { type: 'OVERDUE'; days_overdue: number }
  | { type: 'DUE_SOON' }
  | { type: 'MISSING_UPDATE'; last_update_on: string };

export interface FlagInput {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  archived: boolean;
  deadline: string;
  lastUpdateOn: string | null;
}

const DUE_SOON_DAYS = 7;
const MISSING_UPDATE_DAYS = 7;

export function flagsFor(item: FlagInput, today: string): TimelineFlag[] {
  if (item.archived) return [];
  const flags: TimelineFlag[] = [];
  if (item.status !== 'DONE') {
    if (item.deadline < today) {
      flags.push({ type: 'OVERDUE', days_overdue: daysBetween(item.deadline, today) });
    } else if (item.deadline <= addDays(today, DUE_SOON_DAYS)) {
      flags.push({ type: 'DUE_SOON' });
    }
  }
  if (
    item.status === 'IN_PROGRESS' &&
    item.lastUpdateOn !== null &&
    daysBetween(item.lastUpdateOn, today) > MISSING_UPDATE_DAYS
  ) {
    flags.push({ type: 'MISSING_UPDATE', last_update_on: item.lastUpdateOn });
  }
  return flags;
}
