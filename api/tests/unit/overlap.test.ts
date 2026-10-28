import { describe, expect, it } from 'vitest';
import { conflictingBookings, type Booking } from '../../src/lib/overlap';

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: 'a',
    vendorId: 'vendor-1',
    projectId: 'project-1',
    workDate: '2026-11-02',
    start: '09:00',
    end: '10:00',
    archived: false,
    ...overrides,
  };
}

describe('overlap', () => {
  it('treats intervals as half-open so a booking that starts when another ends is not a conflict', () => {
    const hits = conflictingBookings(booking({ id: 'b', start: '10:00', end: '11:00' }), [booking({})]);
    expect(hits).toHaveLength(0);
  });

  it('flags a cross-project overlap for the same vendor', () => {
    const hits = conflictingBookings(
      booking({ id: 'b', projectId: 'project-2', start: '09:30', end: '11:00' }),
      [booking({})],
    );
    expect(hits.map((row) => row.id)).toEqual(['a']);
  });

  it('does not flag different vendors in the same window', () => {
    const hits = conflictingBookings(booking({ id: 'b', vendorId: 'vendor-2', start: '09:00', end: '10:00' }), [booking({})]);
    expect(hits).toHaveLength(0);
  });

  it('ignores availability and archived rows', () => {
    const hits = conflictingBookings(booking({ id: 'b', start: '09:30', end: '10:30' }), [booking({ archived: true })]);
    expect(hits).toHaveLength(0);
  });
});
