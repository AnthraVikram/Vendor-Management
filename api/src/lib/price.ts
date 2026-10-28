import { Prisma } from '@prisma/client';
import { HttpError } from './http';
import { parseChargeAmount } from './money';

export type PriceKindName = 'CHARGE' | 'REVERSAL';
export type PricingModeName = 'NONE' | 'FIXED' | 'FILE';

export interface StoredPrice {
  id: string;
  kind: PriceKindName;
  amount: string;
  reversesEntryId: string | null;
}

export function openCharge(entries: StoredPrice[]): StoredPrice | null {
  const reversed = new Set(
    entries
      .filter((entry) => entry.kind === 'REVERSAL' && entry.reversesEntryId)
      .map((entry) => entry.reversesEntryId as string),
  );
  const open = entries.filter((entry) => entry.kind === 'CHARGE' && !reversed.has(entry.id));
  return open.length > 0 ? open[open.length - 1] : null;
}

export function planFixedPrice(
  mode: PricingModeName,
  entries: StoredPrice[],
  amountInput: string,
): { reversal: { amount: string; reversesEntryId: string } | null; chargeAmount: string } {
  if (mode === 'FILE') {
    throw new HttpError(409, 'This task uses a costing sheet.', { code: 'PRICE_AND_FILE' });
  }
  const chargeAmount = parseChargeAmount(amountInput);
  const current = openCharge(entries);
  return {
    reversal: current
      ? {
          amount: new Prisma.Decimal(current.amount).negated().toFixed(2),
          reversesEntryId: current.id,
        }
      : null,
    chargeAmount,
  };
}

export function planClearPrice(
  mode: PricingModeName,
  entries: StoredPrice[],
): { amount: string; reversesEntryId: string } {
  const current = openCharge(entries);
  if (mode !== 'FIXED' || !current) {
    throw new HttpError(409, 'This task has no fixed price to clear.', { code: 'NOT_FIXED' });
  }
  return { amount: new Prisma.Decimal(current.amount).negated().toFixed(2), reversesEntryId: current.id };
}
