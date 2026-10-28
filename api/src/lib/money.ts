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

export function moneyString(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}
