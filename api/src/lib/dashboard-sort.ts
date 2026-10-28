interface Named {
  project: { name: string };
  item: { name: string };
}

function byNames(a: Named, b: Named): number {
  return a.project.name.localeCompare(b.project.name) || a.item.name.localeCompare(b.item.name);
}

export function sortOverdue<T extends Named & { days_overdue: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.days_overdue - a.days_overdue || byNames(a, b));
}

export function sortDueSoon<T extends Named & { deadline: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.deadline.localeCompare(b.deadline) || byNames(a, b));
}

export function sortMissingUpdate<T extends Named & { last_update_on: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.last_update_on.localeCompare(b.last_update_on) || byNames(a, b));
}

export function recentDelaysAndIssues<T extends { created_at: Date }>(delays: T[], issues: T[], limit = 10): T[] {
  return [...delays, ...issues]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limit);
}
