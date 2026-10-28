import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, indiaDateOf, todayInIndia } from '../../src/lib/india-date';

describe('india date', () => {
  it('rolls over to the next date at midnight India Standard Time', () => {
    expect(todayInIndia(new Date('2026-10-27T18:29:00Z'))).toBe('2026-10-27');
    expect(todayInIndia(new Date('2026-10-27T18:31:00Z'))).toBe('2026-10-28');
  });

  it('applies the same zone to a stored timestamp', () => {
    expect(indiaDateOf(new Date('2026-10-20T20:00:00Z'))).toBe('2026-10-21');
    expect(indiaDateOf(new Date('2026-10-20T10:00:00Z'))).toBe('2026-10-20');
  });

  it('adds and counts whole days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -3)).toBe('2026-10-30');
    expect(daysBetween('2026-10-25', '2026-10-28')).toBe(3);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3);
  });
});
