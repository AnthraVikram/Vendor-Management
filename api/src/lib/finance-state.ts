import { Prisma, type EntryStatus, type RecordDecision, type RevisionStatus } from '@prisma/client';

// Feature 006: a financial record's current state is derived from append-only rows, never stored (research R2).

const ORDER: Record<RevisionStatus, number> = { DRAFT: 0, SUBMITTED: 1, UNDER_REVIEW: 2, APPROVED: 3, REJECTED: 3, WITHDRAWN: 3 };

export function revisionStatus(changes: { toStatus: RevisionStatus; createdAt: Date }[]): RevisionStatus {
  let current: { toStatus: RevisionStatus; createdAt: Date } | undefined;
  for (const change of changes) {
    if (
      !current ||
      change.createdAt > current.createdAt ||
      (change.createdAt.getTime() === current.createdAt.getTime() && ORDER[change.toStatus] > ORDER[current.toStatus])
    ) {
      current = change;
    }
  }
  return current?.toStatus ?? 'DRAFT';
}

export function isActiveRevision(status: RevisionStatus): boolean {
  return status === 'DRAFT' || status === 'SUBMITTED' || status === 'UNDER_REVIEW';
}

// The approval of the highest-numbered Approved revision (FR-028).
export function authoritativeApproval<A>(revisions: { number: number; status: RevisionStatus; approval: A | null }[]): A | null {
  const approved = revisions.filter((r) => r.status === 'APPROVED' && r.approval).sort((a, b) => b.number - a.number);
  return approved[0]?.approval ?? null;
}

export type ReceiptState = 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WITHDRAWN' | 'REVERSED';

export function receiptState(input: { entryStatus: EntryStatus; decision: RecordDecision | null; reversed: boolean }): ReceiptState {
  if (input.reversed) return 'REVERSED';
  if (input.decision) return input.decision;
  return input.entryStatus === 'VERIFIED_ON_ENTRY' ? 'VERIFIED' : 'SUBMITTED';
}

export type PoState = 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED';

export function poState(input: { entryStatus: EntryStatus; decision: RecordDecision | null; cancelled: boolean }): PoState {
  if (input.cancelled) return 'CANCELLED';
  if (input.decision) return input.decision;
  return input.entryStatus === 'VERIFIED_ON_ENTRY' ? 'VERIFIED' : 'SUBMITTED';
}

export function isCurrentPo(state: PoState): boolean {
  return state === 'SUBMITTED' || state === 'VERIFIED';
}

export function supersededLabel(po: { approvalId: string; revisionNumber: number }, authoritativeApprovalId: string | null): string | null {
  return po.approvalId === authoritativeApprovalId ? null : `Matches superseded approval (revision ${po.revisionNumber})`;
}

export function attachmentState(input: { removed: boolean; supersededBy: string | null }): { current: boolean; superseded: boolean } {
  return { current: !input.removed, superseded: input.supersededBy !== null };
}

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const sum = (values: Prisma.Decimal.Value[]) => values.reduce<Prisma.Decimal>((total, value) => total.plus(D(value)), D(0));

export type Balance = {
  approvedAmount: string | null;
  verifiedReceipts: string;
  outstanding: string | null;
  overpaid: string | null;
  notAvailableReason: string | null;
};

// Authoritative approved amount less every verified, unreversed receipt (FR-034); never negative (FR-036).
export function balance(approved: Prisma.Decimal.Value | null, verifiedReceipts: Prisma.Decimal.Value[]): Balance {
  const received = sum(verifiedReceipts);
  if (approved === null) {
    return {
      approvedAmount: null,
      verifiedReceipts: received.toFixed(2),
      outstanding: null,
      overpaid: null,
      notAvailableReason: 'Not available: no approved amount',
    };
  }
  const difference = D(approved).minus(received);
  return {
    approvedAmount: D(approved).toFixed(2),
    verifiedReceipts: received.toFixed(2),
    outstanding: (difference.isNegative() ? D(0) : difference).toFixed(2),
    overpaid: difference.isNegative() ? difference.negated().toFixed(2) : null,
    notAvailableReason: null,
  };
}

// The warning figures when saving or verifying this receipt would exceed the approved amount (FR-036).
export function overpayment(
  approved: Prisma.Decimal.Value | null,
  currentVerified: Prisma.Decimal.Value,
  receiptAmount: Prisma.Decimal.Value,
): { approved_amount: string; verified_receipts: string; receipt_amount: string; excess: string } | null {
  if (approved === null) return null;
  const excess = D(currentVerified).plus(D(receiptAmount)).minus(D(approved));
  if (!excess.gt(0)) return null;
  return {
    approved_amount: D(approved).toFixed(2),
    verified_receipts: D(currentVerified).toFixed(2),
    receipt_amount: D(receiptAmount).toFixed(2),
    excess: excess.toFixed(2),
  };
}

// Verified, unreversed receipts of any type (FR-019) and, for the Feature 003 figures, of type Advance only (FR-015).
export const verifiedReceiptWhere: Prisma.ClientAdvanceWhereInput = {
  reversal: { is: null },
  OR: [{ entryStatus: 'VERIFIED_ON_ENTRY' }, { decision: { is: { decision: 'VERIFIED' } } }],
};
export const verifiedAdvanceWhere: Prisma.ClientAdvanceWhereInput = { receiptType: 'ADVANCE', ...verifiedReceiptWhere };
// Verified Advances, reversed ones included: the Feature 003 project list (Feature 003 FR-021).
export const listedAdvanceWhere: Prisma.ClientAdvanceWhereInput = {
  receiptType: 'ADVANCE',
  OR: [{ entryStatus: 'VERIFIED_ON_ENTRY' }, { decision: { is: { decision: 'VERIFIED' } } }],
};
