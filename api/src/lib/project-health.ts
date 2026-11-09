// Project progress, health, the after-completion marker and attention reasons (FR-015b, FR-016, FR-017, FR-023a).
// Each is worked out from saved data whenever it is shown; none is stored.

export type ProjectHealth = 'COMPLETED' | 'DELAYED' | 'ONGOING';

export type AttentionReason = { type: 'PAST_EXPECTED_COMPLETION' } | { type: 'OVERDUE_ITEMS'; count: number };

type ItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

// Overdue items never change health: one late activity is shown by the overdue count, not as Delayed.
export function projectHealth(project: { status: string; expectedCompletionDate: string | null; today: string }): ProjectHealth {
  if (project.status === 'COMPLETED') return 'COMPLETED';
  if (project.expectedCompletionDate !== null && project.expectedCompletionDate < project.today) return 'DELAYED';
  return 'ONGOING';
}

export function projectProgress(items: { status: ItemStatus; archived: boolean }[]): { done: number; total: number } {
  const counted = items.filter((item) => !item.archived);
  return { done: counted.filter((item) => item.status === 'DONE').length, total: counted.length };
}

export function isAfterCompletion(
  item: { status: ItemStatus; archived: boolean; deadline: string },
  expectedCompletionDate: string | null,
): boolean {
  if (expectedCompletionDate === null || item.archived || item.status === 'DONE') return false;
  return item.deadline > expectedCompletionDate;
}

export function attentionReasons(project: { health: ProjectHealth; overdueCount: number; archived: boolean }): AttentionReason[] {
  if (project.archived || project.health === 'COMPLETED') return [];
  const reasons: AttentionReason[] = [];
  if (project.health === 'DELAYED') reasons.push({ type: 'PAST_EXPECTED_COMPLETION' });
  if (project.overdueCount > 0) reasons.push({ type: 'OVERDUE_ITEMS', count: project.overdueCount });
  return reasons;
}
