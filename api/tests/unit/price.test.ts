import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/lib/http';
import { openCharge, planClearPrice, planFixedPrice } from '../../src/lib/price';

describe('price', () => {
  it('refuses a fixed price while the task is file-priced', () => {
    expect(() => planFixedPrice('FILE', [], '10.00')).toThrow(HttpError);
  });

  it('plans a reversal of the open charge and a new charge', () => {
    const entries = [
      { id: 'c1', kind: 'CHARGE' as const, amount: '1000.00', reversesEntryId: null },
      { id: 'r1', kind: 'REVERSAL' as const, amount: '-1000.00', reversesEntryId: 'c1' },
      { id: 'c2', kind: 'CHARGE' as const, amount: '1200.00', reversesEntryId: null },
    ];
    expect(openCharge(entries)?.id).toBe('c2');
    const plan = planFixedPrice('FIXED', entries, '1500.00');
    expect(plan.reversal).toEqual({ amount: '-1200.00', reversesEntryId: 'c2' });
    expect(plan.chargeAmount).toBe('1500.00');
    expect(entries.find((entry) => entry.id === 'c2')?.amount).toBe('1200.00');
  });

  it('rejects a negative amount and a third decimal place', () => {
    expect(() => planFixedPrice('NONE', [], '-1.00')).toThrow(HttpError);
    expect(() => planFixedPrice('NONE', [], '1.001')).toThrow(HttpError);
  });

  it('plans a reversal of the open charge when a fixed price is cleared', () => {
    const entries = [{ id: 'c1', kind: 'CHARGE' as const, amount: '1000.00', reversesEntryId: null }];
    expect(planClearPrice('FIXED', entries)).toEqual({ amount: '-1000.00', reversesEntryId: 'c1' });
  });

  it('refuses to clear a price the task does not have', () => {
    for (const mode of ['NONE', 'FILE'] as const) {
      let caught: unknown;
      try {
        planClearPrice(mode, []);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HttpError);
      expect((caught as HttpError).status).toBe(409);
      expect((caught as HttpError).code).toBe('NOT_FIXED');
    }
  });
});
