import { describe, expect, it } from 'vitest';
import {
  attachmentState,
  authoritativeApproval,
  balance,
  isActiveRevision,
  isCurrentPo,
  overpayment,
  poState,
  receiptState,
  revisionStatus,
  supersededLabel,
} from '../../src/lib/finance-state';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 18, 10, minute));

describe('revision status (FR-025, derived from status-change rows)', () => {
  it('is Draft when no status change exists', () => {
    expect(revisionStatus([])).toBe('DRAFT');
  });

  it('is the latest status reached', () => {
    expect(
      revisionStatus([
        { toStatus: 'SUBMITTED', createdAt: at(1) },
        { toStatus: 'UNDER_REVIEW', createdAt: at(2) },
        { toStatus: 'APPROVED', createdAt: at(3) },
      ]),
    ).toBe('APPROVED');
  });

  it('breaks a same-instant tie by workflow order', () => {
    expect(revisionStatus([{ toStatus: 'APPROVED', createdAt: at(1) }, { toStatus: 'UNDER_REVIEW', createdAt: at(1) }])).toBe('APPROVED');
  });

  it('treats Draft, Submitted and Under review as active', () => {
    expect(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'].every((s) => isActiveRevision(s as never))).toBe(true);
    expect(['APPROVED', 'REJECTED', 'WITHDRAWN'].some((s) => isActiveRevision(s as never))).toBe(false);
  });
});

describe('authoritative approval (FR-028)', () => {
  it('is the approval of the highest-numbered Approved revision', () => {
    const approval = authoritativeApproval([
      { number: 1, status: 'APPROVED', approval: { id: 'a1' } },
      { number: 2, status: 'APPROVED', approval: { id: 'a2' } },
      { number: 3, status: 'REJECTED', approval: null },
    ]);
    expect(approval?.id).toBe('a2');
  });

  it('is null when no revision is Approved', () => {
    expect(authoritativeApproval([{ number: 1, status: 'WITHDRAWN', approval: null }])).toBeNull();
  });
});

describe('receipt state (FR-017 to FR-020)', () => {
  it('derives each state in priority order', () => {
    expect(receiptState({ entryStatus: 'VERIFIED_ON_ENTRY', decision: null, reversed: false })).toBe('VERIFIED');
    expect(receiptState({ entryStatus: 'SUBMITTED', decision: null, reversed: false })).toBe('SUBMITTED');
    expect(receiptState({ entryStatus: 'SUBMITTED', decision: 'VERIFIED', reversed: false })).toBe('VERIFIED');
    expect(receiptState({ entryStatus: 'SUBMITTED', decision: 'REJECTED', reversed: false })).toBe('REJECTED');
    expect(receiptState({ entryStatus: 'SUBMITTED', decision: 'WITHDRAWN', reversed: false })).toBe('WITHDRAWN');
    expect(receiptState({ entryStatus: 'SUBMITTED', decision: 'VERIFIED', reversed: true })).toBe('REVERSED');
    expect(receiptState({ entryStatus: 'VERIFIED_ON_ENTRY', decision: null, reversed: true })).toBe('REVERSED');
  });
});

describe('purchase order state (FR-030 to FR-032b)', () => {
  it('derives each state and whether it is current', () => {
    expect(poState({ entryStatus: 'VERIFIED_ON_ENTRY', decision: null, cancelled: false })).toBe('VERIFIED');
    expect(poState({ entryStatus: 'SUBMITTED', decision: null, cancelled: false })).toBe('SUBMITTED');
    expect(poState({ entryStatus: 'SUBMITTED', decision: 'REJECTED', cancelled: false })).toBe('REJECTED');
    expect(poState({ entryStatus: 'SUBMITTED', decision: 'VERIFIED', cancelled: true })).toBe('CANCELLED');
    expect(isCurrentPo('SUBMITTED')).toBe(true);
    expect(isCurrentPo('VERIFIED')).toBe(true);
    expect(['REJECTED', 'WITHDRAWN', 'CANCELLED'].some((s) => isCurrentPo(s as never))).toBe(false);
  });

  it('labels a PO whose approval is no longer authoritative', () => {
    expect(supersededLabel({ approvalId: 'a2', revisionNumber: 2 }, 'a3')).toBe('Matches superseded approval (revision 2)');
    expect(supersededLabel({ approvalId: 'a3', revisionNumber: 3 }, 'a3')).toBeNull();
  });
});

describe('attachment state (FR-042d, FR-042e)', () => {
  it('is current unless removed, and notes a supersede', () => {
    expect(attachmentState({ removed: false, supersededBy: null })).toEqual({ current: true, superseded: false });
    expect(attachmentState({ removed: true, supersededBy: null })).toEqual({ current: false, superseded: false });
    expect(attachmentState({ removed: false, supersededBy: 'b' })).toEqual({ current: true, superseded: true });
  });
});

describe('balance (FR-034 to FR-036)', () => {
  it('is the approved amount less verified, unreversed receipts, exact to the paisa', () => {
    expect(balance('1840000.00', ['650000.00', '0.01'])).toEqual({
      approvedAmount: '1840000.00',
      verifiedReceipts: '650000.01',
      outstanding: '1189999.99',
      overpaid: null,
      notAvailableReason: null,
    });
  });

  it('shows ₹0.00 outstanding and the overpayment, never a negative balance', () => {
    expect(balance('1840000.00', ['1800000.00', '100000.00'])).toMatchObject({ outstanding: '0.00', overpaid: '60000.00' });
  });

  it('is Not available without an approval', () => {
    expect(balance(null, ['5000.00'])).toEqual({
      approvedAmount: null,
      verifiedReceipts: '5000.00',
      outstanding: null,
      overpaid: null,
      notAvailableReason: 'Not available: no approved amount',
    });
  });
});

describe('overpayment check (FR-036)', () => {
  it('returns the four figures when the receipt would exceed the approved amount', () => {
    expect(overpayment('1840000.00', '1800000.00', '100000.00')).toEqual({
      approved_amount: '1840000.00',
      verified_receipts: '1800000.00',
      receipt_amount: '100000.00',
      excess: '60000.00',
    });
  });

  it('is null when the total stays within the approved amount, or with no approval', () => {
    expect(overpayment('1840000.00', '1800000.00', '40000.00')).toBeNull();
    expect(overpayment(null, '1800000.00', '100000.00')).toBeNull();
  });
});
