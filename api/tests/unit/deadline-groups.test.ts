import { describe, expect, it } from 'vitest';
import { deadlineGroup } from '../../src/lib/deadline-groups';

const today = '2026-11-08';

describe('deadline groups (FR-018)', () => {
  it('puts a deadline before today in Overdue', () => {
    expect(deadlineGroup('2026-11-07', today)).toBe('OVERDUE');
  });

  it('puts a deadline of today in Due today', () => {
    expect(deadlineGroup('2026-11-08', today)).toBe('DUE_TODAY');
  });

  it('puts deadlines 1 to 7 days ahead in Coming soon', () => {
    expect(deadlineGroup('2026-11-09', today)).toBe('COMING_SOON');
    expect(deadlineGroup('2026-11-15', today)).toBe('COMING_SOON');
  });

  it('puts deadlines 8 to 30 days ahead in Upcoming', () => {
    expect(deadlineGroup('2026-11-16', today)).toBe('UPCOMING');
    expect(deadlineGroup('2026-12-08', today)).toBe('UPCOMING');
  });

  it('puts deadlines more than 30 days ahead in no dated group', () => {
    expect(deadlineGroup('2026-12-09', today)).toBeNull();
  });

  it('counts days across month and year ends', () => {
    expect(deadlineGroup('2027-01-04', '2026-12-28')).toBe('COMING_SOON');
    expect(deadlineGroup('2027-01-05', '2026-12-28')).toBe('UPCOMING');
  });
});
