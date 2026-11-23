import { prisma } from '../../db';
import {
  authoritativeApproval,
  balance,
  isCurrentPo,
  poState,
  receiptState,
  revisionStatus,
  supersededLabel,
} from '../../lib/finance-state';
import { HttpError } from '../../lib/http';
import { fromDateColumn } from '../../lib/india-date';
import { moneyString } from '../../lib/money';
import { attachmentInclude, presentAttachment } from './attachments';

// The project's Client finance area in one response (contract: GET /projects/:id/client-finance), in a fixed number
// of queries (research R12). Every state is derived here from the append-only rows (research R2).

const person = { select: { id: true, name: true } } as const;

// Indian digit grouping for the balance basis text (FR-045): 1840000.00 → 18,40,000.00.
export function inr(amount: string): string {
  const [whole, paise] = amount.split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `₹${grouped}.${paise}`;
}

export async function buildClientFinance(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, clientName: true, archived: true } });
  if (!project) throw new HttpError(404, 'Project not found.');

  const [quotation, purchaseOrders, receipts] = await Promise.all([
    prisma.clientQuotation.findUnique({
      where: { projectId },
      include: {
        createdBy: person,
        revisions: {
          orderBy: { number: 'asc' },
          include: {
            createdBy: person,
            statusChanges: { include: { createdBy: person }, orderBy: { createdAt: 'asc' } },
            attachments: { include: attachmentInclude, orderBy: { createdAt: 'asc' } },
            approval: { include: { createdBy: person, attachments: { include: attachmentInclude, orderBy: { createdAt: 'asc' } } } },
          },
        },
      },
    }),
    prisma.clientPurchaseOrder.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: person,
        decision: { include: { createdBy: person } },
        cancellation: { include: { createdBy: person } },
        clientApproval: { include: { quotationRevision: { select: { number: true } } } },
        attachments: { include: attachmentInclude, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.clientAdvance.findMany({
      where: { projectId },
      orderBy: [{ receivedOn: 'asc' }, { createdAt: 'asc' }],
      include: {
        createdBy: person,
        decision: { include: { createdBy: person } },
        reversal: { include: { createdBy: person } },
        clientApproval: { include: { quotationRevision: { select: { number: true } } } },
        clientPurchaseOrder: { select: { id: true, poNumber: true } },
        attachments: { include: attachmentInclude, orderBy: { createdAt: 'asc' } },
      },
    }),
  ]);

  const revisions = (quotation?.revisions ?? []).map((revision) => ({ revision, status: revisionStatus(revision.statusChanges) }));
  const authoritative = authoritativeApproval(revisions.map(({ revision, status }) => ({ number: revision.number, status, approval: revision.approval })));
  const newestNumber = revisions.length ? revisions[revisions.length - 1].revision.number : null;
  const approvals = revisions.filter(({ revision }) => revision.approval).map(({ revision }) => ({ approval: revision.approval!, number: revision.number }));

  const presentedApprovals = approvals.map(({ approval, number }) => {
    const later = approvals.filter((other) => other.number > number).sort((a, b) => a.number - b.number)[0];
    return {
      id: approval.id,
      revision_id: approval.quotationRevisionId,
      revision_number: number,
      amount: moneyString(approval.amount),
      client_acceptance_date: approval.clientAcceptanceDate ? fromDateColumn(approval.clientAcceptanceDate) : null,
      note: approval.note,
      authoritative: approval.id === authoritative?.id,
      superseded_by: later ? { approval_id: later.approval.id, revision_number: later.number } : null,
      attachments: approval.attachments.map(presentAttachment),
      created_at: approval.createdAt.toISOString(),
      created_by: approval.createdBy,
    };
  });

  const presentedPos = purchaseOrders.map((po) => {
    const state = poState({ entryStatus: po.entryStatus, decision: po.decision?.decision ?? null, cancelled: po.cancellation !== null });
    return {
      id: po.id,
      po_number: po.poNumber,
      po_date: fromDateColumn(po.poDate),
      amount: moneyString(po.amount),
      note: po.note,
      state,
      entry_status: po.entryStatus,
      approval: { id: po.clientApprovalId, revision_number: po.clientApproval.quotationRevision.number },
      label: supersededLabel({ approvalId: po.clientApprovalId, revisionNumber: po.clientApproval.quotationRevision.number }, authoritative?.id ?? null),
      decision: po.decision ? { decision: po.decision.decision, reason: po.decision.reason, created_at: po.decision.createdAt.toISOString(), created_by: po.decision.createdBy } : null,
      cancellation: po.cancellation ? { reason: po.cancellation.reason, created_at: po.cancellation.createdAt.toISOString(), created_by: po.cancellation.createdBy } : null,
      attachments: po.attachments.map(presentAttachment),
      created_at: po.createdAt.toISOString(),
      created_by: po.createdBy,
    };
  });
  const currentPo = authoritative ? (presentedPos.find((po) => po.approval.id === authoritative.id && isCurrentPo(po.state)) ?? null) : null;

  const presentedReceipts = receipts.map((receipt) => {
    const state = receiptState({ entryStatus: receipt.entryStatus, decision: receipt.decision?.decision ?? null, reversed: receipt.reversal !== null });
    return {
      id: receipt.id,
      receipt_type: receipt.receiptType,
      amount: moneyString(receipt.amount),
      received_on: fromDateColumn(receipt.receivedOn),
      payment_method: receipt.paymentMethod,
      reference: receipt.reference,
      note: receipt.note,
      state,
      entry_status: receipt.entryStatus,
      recorded_under: receipt.recordedUnder,
      counted: state === 'VERIFIED',
      link: receipt.clientApproval
        ? { kind: 'approval', id: receipt.clientApproval.id, revision_number: receipt.clientApproval.quotationRevision.number }
        : receipt.clientPurchaseOrder
          ? { kind: 'purchase_order', id: receipt.clientPurchaseOrder.id, po_number: receipt.clientPurchaseOrder.poNumber }
          : null,
      decision: receipt.decision
        ? { decision: receipt.decision.decision, reason: receipt.decision.reason, created_at: receipt.decision.createdAt.toISOString(), created_by: receipt.decision.createdBy }
        : null,
      reversal: receipt.reversal
        ? { amount: moneyString(receipt.reversal.amount), reason: receipt.reversal.reason, created_at: receipt.reversal.createdAt.toISOString(), created_by: receipt.reversal.createdBy }
        : null,
      attachments: receipt.attachments.map(presentAttachment),
      created_at: receipt.createdAt.toISOString(),
      created_by: receipt.createdBy,
    };
  });

  const counted = presentedReceipts.filter((receipt) => receipt.counted);
  const figures = balance(authoritative ? authoritative.amount : null, counted.map((receipt) => receipt.amount));
  const approvedRevision = authoritative ? approvals.find(({ approval }) => approval.id === authoritative.id)!.number : null;

  return {
    project: { id: project.id, name: project.name, client_name: project.clientName, archived: project.archived },
    quotation: quotation
      ? {
          id: quotation.id,
          reference: quotation.reference,
          title: quotation.title,
          created_at: quotation.createdAt.toISOString(),
          created_by: quotation.createdBy,
          newest_revision_number: newestNumber,
          revisions: revisions.map(({ revision, status }, index) => ({
            id: revision.id,
            number: revision.number,
            amount: moneyString(revision.amount),
            previous_amount: index > 0 ? moneyString(revisions[index - 1].revision.amount) : null,
            quotation_date: fromDateColumn(revision.quotationDate),
            validity_date: revision.validityDate ? fromDateColumn(revision.validityDate) : null,
            submitted_at: revision.statusChanges.find((change) => change.toStatus === 'SUBMITTED')?.createdAt.toISOString() ?? null,
            reason: revision.reason,
            note: revision.note,
            status,
            newest: revision.number === newestNumber,
            status_changes: revision.statusChanges.map((change) => ({
              from: change.fromStatus,
              to: change.toStatus,
              reason: change.reason,
              note: change.note,
              created_at: change.createdAt.toISOString(),
              created_by: change.createdBy,
            })),
            attachments: revision.attachments.map(presentAttachment),
            created_at: revision.createdAt.toISOString(),
            created_by: revision.createdBy,
          })),
        }
      : null,
    approvals: presentedApprovals,
    purchase_orders: presentedPos,
    current_po: currentPo,
    current_po_text: authoritative && !currentPo ? 'No PO for the current approved amount' : null,
    receipts: presentedReceipts,
    summary: {
      approved_amount: figures.approvedAmount,
      approved_revision_number: approvedRevision,
      verified_receipts: figures.verifiedReceipts,
      outstanding: figures.outstanding,
      overpaid: figures.overpaid,
      basis_text: figures.approvedAmount
        ? `Approved client amount ${inr(figures.approvedAmount)} less verified receipts ${inr(figures.verifiedReceipts)}`
        : null,
      not_available_reason: figures.notAvailableReason,
      counted_receipt_ids: counted.map((receipt) => receipt.id),
    },
    pending_verification: [
      ...presentedReceipts
        .filter((receipt) => receipt.state === 'SUBMITTED')
        .map((receipt) => ({ kind: 'receipt', id: receipt.id, amount: receipt.amount, label: `Receipt of ${inr(receipt.amount)}`, created_at: receipt.created_at, created_by: receipt.created_by })),
      ...presentedPos
        .filter((po) => po.state === 'SUBMITTED')
        .map((po) => ({ kind: 'purchase_order', id: po.id, amount: po.amount, label: `PO ${po.po_number}`, created_at: po.created_at, created_by: po.created_by })),
    ],
  };
}

export type ClientFinanceView = Awaited<ReturnType<typeof buildClientFinance>>;
