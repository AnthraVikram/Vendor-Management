import { describe, expect, it } from 'vitest';
import { recentDelaysAndIssues, sortDueSoon, sortMissingUpdate, sortOverdue } from '../../src/lib/dashboard-sort';

function row<T extends object>(project: string, item: string, extra: T) {
  return { project: { name: project }, item: { name: item }, ...extra };
}

function names(rows: { project: { name: string }; item: { name: string } }[]): string[] {
  return rows.map((entry) => `${entry.project.name}/${entry.item.name}`);
}

describe('dashboard sort', () => {
  it('sorts overdue by days overdue, most first, then project and item name', () => {
    const rows = [
      row('B', 'x', { days_overdue: 2 }),
      row('A', 'z', { days_overdue: 5 }),
      row('A', 'b', { days_overdue: 2 }),
      row('A', 'a', { days_overdue: 2 }),
    ];
    expect(names(sortOverdue(rows))).toEqual(['A/z', 'A/a', 'A/b', 'B/x']);
  });

  it('sorts due soon by earliest deadline, then project and item name', () => {
    const rows = [
      row('B', 'x', { deadline: '2026-10-30' }),
      row('A', 'y', { deadline: '2026-11-02' }),
      row('A', 'x', { deadline: '2026-10-30' }),
    ];
    expect(names(sortDueSoon(rows))).toEqual(['A/x', 'B/x', 'A/y']);
  });

  it('sorts missing update by oldest last update, then project and item name', () => {
    const rows = [
      row('A', 'x', { last_update_on: '2026-10-19' }),
      row('B', 'x', { last_update_on: '2026-10-10' }),
      row('A', 'a', { last_update_on: '2026-10-19' }),
    ];
    expect(names(sortMissingUpdate(rows))).toEqual(['B/x', 'A/a', 'A/x']);
  });

  it('merges delays and issues newest first and keeps at most 10', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 10, minute));
    const delays = Array.from({ length: 7 }, (_, index) => ({ id: `d${index}`, created_at: at(index * 2) }));
    const issues = Array.from({ length: 5 }, (_, index) => ({ id: `i${index}`, created_at: at(index * 2 + 1) }));
    const recent = recentDelaysAndIssues(delays, issues);
    expect(recent).toHaveLength(10);
    expect(recent.map((entry) => entry.id)).toEqual(['d6', 'd5', 'i4', 'd4', 'i3', 'd3', 'i2', 'd2', 'i1', 'd1']);
    expect(recentDelaysAndIssues(delays, issues, 3)).toHaveLength(3);
  });
});
