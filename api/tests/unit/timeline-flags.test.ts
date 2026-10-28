import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/india-date';
import { flagsFor, type FlagInput } from '../../src/lib/timeline-flags';

const today = '2026-10-28';

function item(overrides: Partial<FlagInput>): FlagInput {
  return { status: 'NOT_STARTED', archived: false, deadline: '2026-12-31', lastUpdateOn: null, ...overrides };
}

describe('timeline flags', () => {
  it('flags an unfinished item Overdue from the day after its deadline', () => {
    expect(flagsFor(item({ deadline: '2026-10-27' }), today)).toEqual([{ type: 'OVERDUE', days_overdue: 1 }]);
  });

  it('flags Due soon from the deadline day through 7 days ahead', () => {
    for (const deadline of ['2026-10-28', '2026-10-31', '2026-11-04']) {
      expect(flagsFor(item({ deadline }), today)).toEqual([{ type: 'DUE_SOON' }]);
    }
    expect(flagsFor(item({ deadline: '2026-11-05' }), today)).toEqual([]);
  });

  it('never flags a Done or archived item', () => {
    expect(flagsFor(item({ status: 'DONE', deadline: '2026-10-21', lastUpdateOn: '2026-10-01' }), today)).toEqual([]);
    expect(flagsFor(item({ status: 'DONE', deadline: '2026-10-30' }), today)).toEqual([]);
    expect(flagsFor(item({ archived: true, deadline: '2026-10-20' }), today)).toEqual([]);
    expect(flagsFor(item({ archived: true, status: 'IN_PROGRESS', lastUpdateOn: '2026-10-01' }), today)).toEqual([]);
  });

  it('flags Missing update only for In progress items with no update for more than 7 days', () => {
    expect(flagsFor(item({ status: 'IN_PROGRESS', lastUpdateOn: '2026-10-20' }), today)).toEqual([
      { type: 'MISSING_UPDATE', last_update_on: '2026-10-20' },
    ]);
    expect(flagsFor(item({ status: 'IN_PROGRESS', lastUpdateOn: '2026-10-21' }), today)).toEqual([]);
    expect(flagsFor(item({ status: 'NOT_STARTED', lastUpdateOn: null }), today)).toEqual([]);
    expect(flagsFor(item({ status: 'NOT_STARTED', lastUpdateOn: '2026-09-01' }), today)).toEqual([]);
  });

  it('returns every flag that applies', () => {
    expect(flagsFor(item({ status: 'IN_PROGRESS', deadline: '2026-10-26', lastUpdateOn: '2026-10-20' }), today)).toEqual([
      { type: 'OVERDUE', days_overdue: 2 },
      { type: 'MISSING_UPDATE', last_update_on: '2026-10-20' },
    ]);
    expect(flagsFor(item({ status: 'IN_PROGRESS', deadline: '2026-10-31', lastUpdateOn: '2026-10-20' }), today)).toEqual([
      { type: 'DUE_SOON' },
      { type: 'MISSING_UPDATE', last_update_on: '2026-10-20' },
    ]);
  });

  it('never returns Overdue and Due soon together', () => {
    for (let offset = -27; offset <= 33; offset += 1) {
      const types = flagsFor(item({ deadline: addDays(today, offset) }), today).map((flag) => flag.type);
      expect(types.includes('OVERDUE') && types.includes('DUE_SOON')).toBe(false);
    }
  });
});
