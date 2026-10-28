export interface Booking {
  id: string;
  vendorId: string;
  projectId: string;
  workDate: string;
  start: string;
  end: string;
  archived: boolean;
}

export function intervalsOverlap(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
): boolean {
  return start < otherEnd && end > otherStart;
}

export function conflictingBookings(candidate: Booking, existing: Booking[]): Booking[] {
  return existing.filter(
    (row) =>
      !row.archived &&
      row.id !== candidate.id &&
      row.vendorId === candidate.vendorId &&
      row.workDate === candidate.workDate &&
      intervalsOverlap(candidate.start, candidate.end, row.start, row.end),
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeProblem(start: string, end: string): string | null {
  if (!TIME.test(start) || !TIME.test(end)) {
    return 'Start and end must be times on that date.';
  }
  if (end <= start) return 'End time must be later than the start time.';
  return null;
}
