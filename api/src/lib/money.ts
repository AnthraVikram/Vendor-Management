import { Prisma } from '@prisma/client';
import { HttpError } from './http';

export function parseChargeAmount(input: string, field = 'amount'): string {
  const value = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      fields: {
        [field]: 'Amount must be zero or greater with at most two decimal places.',
      },
    });
  }
  return new Prisma.Decimal(value).toFixed(2);
}

const MAX_AMOUNT = new Prisma.Decimal('9999999999999.99');

// A client advance amount (FR-018): greater than zero, at most two decimals, and within DECIMAL(15,2).
export function parsePositiveAmount(input: string, field = 'amount'): string {
  const value = input.trim();
  const valid = /^\d+(\.\d{1,2})?$/.test(value) && new Prisma.Decimal(value).gt(0) && new Prisma.Decimal(value).lte(MAX_AMOUNT);
  if (!valid) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      fields: { [field]: 'Amount must be greater than zero with at most two decimal places.' },
    });
  }
  return new Prisma.Decimal(value).toFixed(2);
}

export function moneyString(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}
