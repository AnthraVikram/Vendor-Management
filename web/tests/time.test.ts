import { formatDate, formatDateTime } from '../src/time';

// Feature 005 FR-042: one date format everywhere, in India Standard Time.
describe('date formatting', () => {
  it('shows a calendar date as day, short month and year, with no time-zone shift', () => {
    expect(formatDate('2026-11-09')).toBe('9 Nov 2026');
    expect(formatDate('2026-01-31')).toBe('31 Jan 2026');
  });

  it('shows a recorded time in IST with 24-hour time', () => {
    expect(formatDateTime('2026-11-09T08:35:00.000Z')).toBe('9 Nov 2026, 14:05');
    // 20:00 UTC is already the next day in India.
    expect(formatDateTime('2026-11-09T20:00:00.000Z')).toBe('10 Nov 2026, 01:30');
  });

  it('formats the IST calendar day of a recorded time', () => {
    expect(formatDate('2026-11-09T20:00:00.000Z')).toBe('10 Nov 2026');
  });
});
