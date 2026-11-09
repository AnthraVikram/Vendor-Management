// Assignment status (FR-010): worked out from the vendor's non-archived items on the project, never stored.

export type AssignmentStatus = 'NO_ACTIVITIES' | 'NOT_STARTED' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED';

export interface AssignmentItem {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  overdue: boolean;
}

// The first rule that matches decides.
export function assignmentStatus(items: AssignmentItem[]): AssignmentStatus {
  if (items.length === 0) return 'NO_ACTIVITIES';
  if (items.some((item) => item.overdue)) return 'DELAYED';
  if (items.every((item) => item.status === 'DONE')) return 'COMPLETED';
  if (items.some((item) => item.status !== 'NOT_STARTED')) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}
