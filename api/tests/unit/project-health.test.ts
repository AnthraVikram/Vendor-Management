import { describe, expect, it } from 'vitest';
import { attentionReasons, isAfterCompletion, projectHealth, projectProgress } from '../../src/lib/project-health';

const today = '2026-11-08';

describe('project health (FR-017)', () => {
  it('is Completed when the status is Completed, even with a past date', () => {
    expect(projectHealth({ status: 'COMPLETED', expectedCompletionDate: '2026-10-01', today })).toBe('COMPLETED');
  });

  it('is Delayed when the expected completion date is before today', () => {
    expect(projectHealth({ status: 'ACTIVE', expectedCompletionDate: '2026-11-07', today })).toBe('DELAYED');
    expect(projectHealth({ status: 'ON_HOLD', expectedCompletionDate: '2026-11-07', today })).toBe('DELAYED');
  });

  it('is Ongoing when the date is today, in the future, or not set', () => {
    expect(projectHealth({ status: 'ACTIVE', expectedCompletionDate: '2026-11-08', today })).toBe('ONGOING');
    expect(projectHealth({ status: 'ACTIVE', expectedCompletionDate: '2026-12-01', today })).toBe('ONGOING');
    expect(projectHealth({ status: 'PLANNED', expectedCompletionDate: null, today })).toBe('ONGOING');
  });
});

describe('project progress (FR-016)', () => {
  it('counts Done items out of non-archived items, milestones and activities alike', () => {
    expect(
      projectProgress([
        { status: 'DONE', archived: false },
        { status: 'IN_PROGRESS', archived: false },
        { status: 'NOT_STARTED', archived: false },
        { status: 'DONE', archived: true },
      ]),
    ).toEqual({ done: 1, total: 3 });
  });

  it('is zero of zero when there are no items', () => {
    expect(projectProgress([])).toEqual({ done: 0, total: 0 });
    expect(projectProgress([{ status: 'DONE', archived: true }])).toEqual({ done: 0, total: 0 });
  });
});

describe('after project completion date (FR-015b)', () => {
  const open = { status: 'NOT_STARTED' as const, archived: false };

  it('is false when the deadline equals the expected completion date', () => {
    expect(isAfterCompletion({ ...open, deadline: '2026-12-20' }, '2026-12-20')).toBe(false);
  });

  it('is true one day later', () => {
    expect(isAfterCompletion({ ...open, deadline: '2026-12-21' }, '2026-12-20')).toBe(true);
  });

  it('is false for Done or archived items and when the project has no date', () => {
    expect(isAfterCompletion({ status: 'DONE', archived: false, deadline: '2027-01-05' }, '2026-12-20')).toBe(false);
    expect(isAfterCompletion({ ...open, archived: true, deadline: '2027-01-05' }, '2026-12-20')).toBe(false);
    expect(isAfterCompletion({ ...open, deadline: '2027-01-05' }, null)).toBe(false);
  });
});

describe('attention reasons (FR-023a)', () => {
  it('lists both reasons for a Delayed project with overdue items', () => {
    expect(attentionReasons({ health: 'DELAYED', overdueCount: 2, archived: false })).toEqual([
      { type: 'PAST_EXPECTED_COMPLETION' },
      { type: 'OVERDUE_ITEMS', count: 2 },
    ]);
  });

  it('lists overdue items for an Ongoing project', () => {
    expect(attentionReasons({ health: 'ONGOING', overdueCount: 1, archived: false })).toEqual([{ type: 'OVERDUE_ITEMS', count: 1 }]);
  });

  it('lists nothing for an Ongoing project with no overdue items', () => {
    expect(attentionReasons({ health: 'ONGOING', overdueCount: 0, archived: false })).toEqual([]);
  });

  it('never lists a Completed or archived project', () => {
    expect(attentionReasons({ health: 'COMPLETED', overdueCount: 3, archived: false })).toEqual([]);
    expect(attentionReasons({ health: 'DELAYED', overdueCount: 3, archived: true })).toEqual([]);
  });
});
