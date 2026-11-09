import type { Prisma } from '@prisma/client';
import { addDays, fromDateColumn } from '../../lib/india-date';
import { attentionReasons, isAfterCompletion, projectHealth, projectProgress } from '../../lib/project-health';
import { currentState, flagsOf, itemInclude } from '../timeline/present';

// One place that turns a project and its timeline items into the figures the project list, the project page and
// the dashboard show, so the three always agree (FR-008, FR-009a, FR-023a). Nothing here is stored.

type ItemRow = Prisma.TimelineItemGetPayload<{ include: typeof itemInclude }>;

interface ProjectRow {
  status: string;
  archived: boolean;
  expectedCompletionDate: Date | null;
}

function openItems(items: ItemRow[]): ItemRow[] {
  return items.filter((item) => !item.archived && currentState(item).status !== 'DONE');
}

export function projectFigures(project: ProjectRow, items: ItemRow[], today: string) {
  const expected = project.expectedCompletionDate ? fromDateColumn(project.expectedCompletionDate) : null;
  const open = openItems(items);
  const overdueCount = open.filter((item) => flagsOf(item, today).some((flag) => flag.type === 'OVERDUE')).length;
  const health = projectHealth({ status: project.status, expectedCompletionDate: expected, today });
  const deadlines = open.map((item) => fromDateColumn(item.deadline)).sort();
  return {
    progress: projectProgress(items.map((item) => ({ status: currentState(item).status, archived: item.archived }))),
    overdue_count: overdueCount,
    next_deadline: deadlines[0] ?? null,
    health,
    after_completion_count: items.filter((item) =>
      isAfterCompletion({ status: currentState(item).status, archived: item.archived, deadline: fromDateColumn(item.deadline) }, expected),
    ).length,
    reasons: attentionReasons({ health, overdueCount, archived: project.archived }),
  };
}

// For the "Has items due in the next 7 days" filter (FR-009): an open item due today or within the next 7 days.
export function hasItemDueWithinWeek(items: ItemRow[], today: string): boolean {
  const last = addDays(today, 7);
  return openItems(items).some((item) => {
    const deadline = fromDateColumn(item.deadline);
    return deadline >= today && deadline <= last;
  });
}

// The overview's next steps (FR-009a, decision D3): up to 5 open items, earliest deadline first, then by name.
export function upcomingItems(items: ItemRow[], today: string, limit = 5) {
  return openItems(items)
    .sort((a, b) => fromDateColumn(a.deadline).localeCompare(fromDateColumn(b.deadline)) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      name: item.name,
      item_type: item.itemType,
      deadline: fromDateColumn(item.deadline),
      status: currentState(item).status,
      flags: flagsOf(item, today),
    }));
}
