// Response types for GET /api/projects/:id/client-finance (Feature 006 contract).

export interface Person {
  id: string;
  name: string;
}

export interface Attachment {
  id: string;
  document: { id: string; title: string; document_type: string; original_filename: string; archived: boolean };
  current: boolean;
  supersedes_attachment_id: string | null;
  supersede_reason: string | null;
  superseded_by: { attachment_id: string; document: { id: string; title: string } } | null;
  removal: { reason: string; created_at: string; created_by: Person } | null;
  created_at: string;
  created_by: Person;
}

export type RevisionStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type ReceiptState = 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WITHDRAWN' | 'REVERSED';
export type PoState = 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED';
export type ReceiptType = 'ADVANCE' | 'STAGE_PAYMENT' | 'FINAL_PAYMENT' | 'OTHER';

export interface Decision {
  decision: 'VERIFIED' | 'REJECTED' | 'WITHDRAWN';
  reason: string | null;
  created_at: string;
  created_by: Person;
}

export interface Revision {
  id: string;
  number: number;
  amount: string;
  previous_amount: string | null;
  quotation_date: string;
  validity_date: string | null;
  submitted_at: string | null;
  reason: string | null;
  note: string | null;
  status: RevisionStatus;
  newest: boolean;
  status_changes: { from: RevisionStatus; to: RevisionStatus; reason: string | null; note: string | null; created_at: string; created_by: Person }[];
  attachments: Attachment[];
  created_at: string;
  created_by: Person;
}

export interface Approval {
  id: string;
  revision_id: string;
  revision_number: number;
  amount: string;
  client_acceptance_date: string | null;
  note: string | null;
  authoritative: boolean;
  superseded_by: { approval_id: string; revision_number: number } | null;
  attachments: Attachment[];
  created_at: string;
  created_by: Person;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string;
  amount: string;
  note: string | null;
  state: PoState;
  entry_status: 'SUBMITTED' | 'VERIFIED_ON_ENTRY';
  approval: { id: string; revision_number: number };
  label: string | null;
  decision: Decision | null;
  cancellation: { reason: string; created_at: string; created_by: Person } | null;
  attachments: Attachment[];
  created_at: string;
  created_by: Person;
}

export interface Receipt {
  id: string;
  receipt_type: ReceiptType;
  amount: string;
  received_on: string;
  payment_method: string | null;
  reference: string | null;
  note: string | null;
  state: ReceiptState;
  entry_status: 'SUBMITTED' | 'VERIFIED_ON_ENTRY';
  recorded_under: 'FEATURE_003' | 'FEATURE_006';
  counted: boolean;
  link: { kind: 'approval'; id: string; revision_number: number } | { kind: 'purchase_order'; id: string; po_number: string } | null;
  decision: Decision | null;
  reversal: { amount: string; reason: string; created_at: string; created_by: Person } | null;
  attachments: Attachment[];
  created_at: string;
  created_by: Person;
}

export interface ClientFinance {
  project: { id: string; name: string; client_name: string | null; archived: boolean };
  quotation: {
    id: string;
    reference: string;
    title: string;
    created_at: string;
    created_by: Person;
    newest_revision_number: number | null;
    revisions: Revision[];
  } | null;
  approvals: Approval[];
  purchase_orders: PurchaseOrder[];
  current_po: PurchaseOrder | null;
  current_po_text: string | null;
  receipts: Receipt[];
  summary: {
    approved_amount: string | null;
    approved_revision_number: number | null;
    verified_receipts: string;
    outstanding: string | null;
    overpaid: string | null;
    basis_text: string | null;
    not_available_reason: string | null;
    counted_receipt_ids: string[];
  };
  pending_verification: { kind: 'receipt' | 'purchase_order'; id: string; amount: string; label: string; created_at: string; created_by: Person }[];
}

export type Role = 'ADMINISTRATOR' | 'ACCOUNTANT' | 'OFFICE_TEAM';

export const isReviewer = (role: Role | undefined) => role === 'ADMINISTRATOR' || role === 'ACCOUNTANT';
