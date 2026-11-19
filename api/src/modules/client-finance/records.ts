import type { Prisma } from '@prisma/client';
import { HttpError } from '../../lib/http';
import { poState, receiptState, revisionStatus, type PoState, type ReceiptState } from '../../lib/finance-state';
import type { HistoryTarget } from '../../lib/history';
import type { RevisionStatus } from '@prisma/client';

// Loads a client financial record with what its current state is derived from (research R2).

export type RecordKind = 'revision' | 'approval' | 'purchase_order' | 'receipt';
export type RecordState = RevisionStatus | ReceiptState | PoState;

export type RecordContext = {
  kind: RecordKind;
  id: string;
  projectId: string;
  state: RecordState;
  // Draft, Submitted or Under review revisions; Submitted receipts and POs (FR-042b, FR-042d).
  active: boolean;
  createdById: string;
  target: HistoryTarget;
  details: Record<string, unknown>;
};

export async function loadReceipt(tx: Prisma.TransactionClient, id: string) {
  const receipt = await tx.clientAdvance.findUnique({ where: { id }, include: { decision: true, reversal: true } });
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  const state = receiptState({ entryStatus: receipt.entryStatus, decision: receipt.decision?.decision ?? null, reversed: receipt.reversal !== null });
  return { receipt, state };
}

export async function loadRevision(tx: Prisma.TransactionClient, id: string) {
  const revision = await tx.quotationRevision.findUnique({
    where: { id },
    include: { statusChanges: true, clientQuotation: true, approval: true },
  });
  if (!revision) throw new HttpError(404, 'Quotation revision not found.');
  return { revision, state: revisionStatus(revision.statusChanges) };
}

export async function loadPurchaseOrder(tx: Prisma.TransactionClient, id: string) {
  const po = await tx.clientPurchaseOrder.findUnique({
    where: { id },
    include: { decision: true, cancellation: true, clientApproval: { include: { quotationRevision: true } } },
  });
  if (!po) throw new HttpError(404, 'Purchase order not found.');
  const state = poState({ entryStatus: po.entryStatus, decision: po.decision?.decision ?? null, cancelled: po.cancellation !== null });
  return { po, state };
}

export async function loadApproval(tx: Prisma.TransactionClient, id: string) {
  const approval = await tx.clientApproval.findUnique({
    where: { id },
    include: { quotationRevision: { include: { clientQuotation: true } } },
  });
  if (!approval) throw new HttpError(404, 'Approval not found.');
  return approval;
}

export async function loadRecord(tx: Prisma.TransactionClient, kind: RecordKind, id: string): Promise<RecordContext> {
  switch (kind) {
    case 'receipt': {
      const { receipt, state } = await loadReceipt(tx, id);
      return { kind, id, projectId: receipt.projectId, state, active: state === 'SUBMITTED', createdById: receipt.createdById, target: { clientAdvanceId: id }, details: { receipt_id: id } };
    }
    case 'purchase_order': {
      const { po, state } = await loadPurchaseOrder(tx, id);
      return { kind, id, projectId: po.projectId, state, active: state === 'SUBMITTED', createdById: po.createdById, target: { clientPurchaseOrderId: id }, details: { purchase_order_id: id, po_number: po.poNumber } };
    }
    case 'revision': {
      const { revision, state } = await loadRevision(tx, id);
      return {
        kind,
        id,
        projectId: revision.clientQuotation.projectId,
        state,
        active: state === 'DRAFT' || state === 'SUBMITTED' || state === 'UNDER_REVIEW',
        createdById: revision.createdById,
        target: { clientQuotationId: revision.clientQuotationId },
        details: { revision_id: id, revision_number: revision.number },
      };
    }
    case 'approval': {
      const approval = await loadApproval(tx, id);
      // An approval is final from the moment it exists (FR-042b approval row, FR-042d).
      return {
        kind,
        id,
        projectId: approval.quotationRevision.clientQuotation.projectId,
        state: 'APPROVED',
        active: false,
        createdById: approval.createdById,
        target: { clientQuotationId: approval.quotationRevision.clientQuotationId },
        details: { approval_id: id, revision_number: approval.quotationRevision.number },
      };
    }
  }
}

export async function projectOfRecord(kind: RecordKind, id: string, tx: Prisma.TransactionClient): Promise<string> {
  return (await loadRecord(tx, kind, id)).projectId;
}
