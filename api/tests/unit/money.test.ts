import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/lib/http';
import { parsePositiveAmount } from '../../src/lib/money';

const MESSAGE = 'Amount must be greater than zero with at most two decimal places.';

function refusal(input: string, field?: string): HttpError {
  try {
    parsePositiveAmount(input, field);
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error(`expected ${JSON.stringify(input)} to be refused`);
}

describe('positive amounts for client advances (FR-018)', () => {
  it('accepts the smallest and largest amounts DECIMAL(15,2) can hold above zero', () => {
    expect(parsePositiveAmount('0.01')).toBe('0.01');
    expect(parsePositiveAmount('9999999999999.99')).toBe('9999999999999.99');
  });

  it('returns two decimals and ignores surrounding spaces', () => {
    expect(parsePositiveAmount(' 50000 ')).toBe('50000.00');
    expect(parsePositiveAmount('12.5')).toBe('12.50');
  });

  it('refuses zero, negatives, a third decimal place, too large an amount, and an empty value', () => {
    for (const input of ['0', '0.00', '-5', '10.123', '1.005', '10000000000000.00', '']) {
      const error = refusal(input);
      expect(error.status).toBe(400);
      expect(error.fields).toEqual({ amount: MESSAGE });
    }
  });

  it('reports the problem on the named field', () => {
    expect(refusal('0', 'advance_amount').fields).toEqual({ advance_amount: MESSAGE });
  });
});
