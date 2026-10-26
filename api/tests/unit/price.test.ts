import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/lib/http';
import { openCharge, planFixedPrice } from '../../src/lib/price';

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
});
