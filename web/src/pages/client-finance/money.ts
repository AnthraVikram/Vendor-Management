// Amounts exact to the paisa with Indian digit grouping (FR-045): "1840000.00" → "₹18,40,000.00".
export function inr(amount: string): string {
  const negative = amount.startsWith('-');
  const [whole, paise = '00'] = (negative ? amount.slice(1) : amount).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${negative ? '-' : ''}₹${grouped}.${paise.padEnd(2, '0')}`;
}

// Client finance amounts are GST-inclusive and labelled so (FR-009, FR-045, OQ-23).
export const inclGst = (amount: string) => `${inr(amount)} incl. GST`;

export const STATE_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting verification',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  VERIFIED: 'Verified',
  REVERSED: 'Reversed',
  CANCELLED: 'Cancelled',
};

export const RECEIPT_TYPES: Record<string, string> = {
  ADVANCE: 'Advance',
  STAGE_PAYMENT: 'Stage payment',
  FINAL_PAYMENT: 'Final payment',
  OTHER: 'Other',
};

export const METHODS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  OTHER: 'Other',
};

// A fresh one-time ID for each new receipt (research R13); crypto.randomUUID is available in every supported browser.
export function newSubmissionId(): string {
  return crypto.randomUUID();
}
