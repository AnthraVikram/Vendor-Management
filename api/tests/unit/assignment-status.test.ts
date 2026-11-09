import { describe, expect, it } from 'vitest';
import { assignmentStatus, type AssignmentItem } from '../../src/lib/assignment-status';

function item(status: AssignmentItem['status'], overdue = false): AssignmentItem {
  return { status, overdue };
}

describe('assignment status (FR-010)', () => {
  it('is No activities when the vendor has no items on the project', () => {
    expect(assignmentStatus([])).toBe('NO_ACTIVITIES');
  });

  it('is Not started when every item is Not started and none is overdue', () => {
    expect(assignmentStatus([item('NOT_STARTED'), item('NOT_STARTED')])).toBe('NOT_STARTED');
  });

  it('is In progress when any item is In progress and none is overdue', () => {
    expect(assignmentStatus([item('NOT_STARTED'), item('IN_PROGRESS')])).toBe('IN_PROGRESS');
  });

  it('is In progress when some items are Done and the rest Not started', () => {
    expect(assignmentStatus([item('DONE'), item('NOT_STARTED')])).toBe('IN_PROGRESS');
  });

  it('is Delayed when any open item is overdue, whatever the others are', () => {
    expect(assignmentStatus([item('DONE'), item('IN_PROGRESS'), item('NOT_STARTED', true)])).toBe('DELAYED');
    expect(assignmentStatus([item('IN_PROGRESS', true)])).toBe('DELAYED');
  });

  it('is Completed when every item is Done, including one finished after its deadline', () => {
    expect(assignmentStatus([item('DONE'), item('DONE')])).toBe('COMPLETED');
  });
});
