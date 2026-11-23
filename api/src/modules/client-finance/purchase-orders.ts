import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { stampCreate } from '../../lib/audit';
import { NORMALISED_CLIENT_NAME_SQL, normaliseClientName } from '../../lib/client-name';
import { authoritativeApproval, isActiveRevision, isCurrentPo, poState, revisionStatus } from '../../lib/finance-state';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { toDateColumn } from '../../lib/india-date';
import { moneyString } from '../../lib/money';
import { attachDocuments } from './attachments';
import { assertExpected, assertOwnerOrReviewer, assertReviewer, assertWritable, invalidTransition, isReviewer, lockProject } from './lock';
import { loadPurchaseOrder, loadRecord } from './records';
import type { Staff } from './receipts';

// Client purchase orders (FR-029 to FR-033): each references the authoritative approval at its exact amount, at most
// one is current per approval, and every decision or cancellation is a new row (research R2).

export type PurchaseOrderInput = {
  approvalId: string;
  poNumber: string;
  poDate: string;
  amount: string;
  note: string | null;
  documentIds: string[];
  confirmDuplicate: boolean;
  confirmPendingRevision: boolean;
};

// The project's quotation state under the lock: its authoritative approval and its newest revision.
async function quotationState(tx: Prisma.TransactionClient, projectId: string) {
  const quotation = await tx.clientQuotation.findUnique({
    where: { projectId },
    include: { revisions: { include: { statusChanges: true, approval: true }, orderBy: { number: 'asc' } } },
  });
  const revisions = (quotation?.revisions ?? []).map((revision) => ({ revision, status: revisionStatus(revision.statusChanges) }));
  const authoritative = authoritativeApproval(revisions.map(({ revision, status }) => ({ number: revision.number, status, approval: revision.approval })));
  const authoritativeNumber = authoritative ? revisions.find(({ revision }) => revision.approval?.id === authoritative.id)!.revision.number : null;
  return { revisions, authoritative, authoritativeNumber, newest: revisions[revisions.length - 1] ?? null };
}

async function hasPoDocument(tx: Prisma.TransactionClient, poId: string): Promise<boolean> {
  return (await tx.financialAttachment.count({ where: { clientPurchaseOrderId: poId, removal: { is: null }, document: { documentType: 'PURCHASE_ORDER' } } })) > 0;
}

function poDocumentRequired(): HttpError {
  return new HttpError(409, 'Attach the Purchase order document first.', { code: 'PO_DOCUMENT_REQUIRED' });
}

// FR-029a, OQ-41: the same PO number, compared exactly, on this project or on a project whose client name matches.
async function duplicateOf(tx: Prisma.TransactionClient, projectId: string, clientName: string | null, poNumber: string) {
  const normalised = normaliseClientName(clientName);
  const rows = normalised
    ? await tx.$queryRawUnsafe<{ id: string; po_number: string; project_id: string; project_name: string }[]>(
        `SELECT po.id, po.po_number, p.id AS project_id, p.name AS project_name FROM client_purchase_orders po JOIN projects p ON p.id = po.project_id
          WHERE po.po_number = $1 AND (p.id = $2::uuid OR ${NORMALISED_CLIENT_NAME_SQL.replace('client_name', 'p.client_name')} = $3)
          ORDER BY po.created_at LIMIT 1`,
        poNumber,
        projectId,
        normalised,
      )
    : await tx.$queryRawUnsafe<{ id: string; po_number: string; project_id: string; project_name: string }[]>(
        `SELECT po.id, po.po_number, p.id AS project_id, p.name AS project_name FROM client_purchase_orders po JOIN projects p ON p.id = po.project_id
          WHERE po.po_number = $1 AND p.id = $2::uuid ORDER BY po.created_at LIMIT 1`,
        poNumber,
        projectId,
      );
  return rows[0] ?? null;
}

export async function createPurchaseOrder(staff: Staff, projectId: string, input: PurchaseOrderInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    assertWritable(project);
    const state = await quotationState(tx, projectId);
    if (!state.authoritative) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { client_approval_id: 'The client quotation must be approved before a purchase order can be entered.' } });
    }
    const approval = state.revisions.find(({ revision }) => revision.approval?.id === input.approvalId)?.revision.approval;
    if (!approval) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { client_approval_id: 'Choose an approved quotation revision of this project.' } });
    }
    if (approval.id !== state.authoritative.id) {
      throw new HttpError(409, `Only the current approval (revision ${state.authoritativeNumber}) may be referenced by a new purchase order.`, { code: 'APPROVAL_SUPERSEDED' });
    }
    if (moneyString(input.amount) !== moneyString(approval.amount)) {
      throw new HttpError(409, `The PO amount must equal the approved amount, ₹${moneyString(approval.amount)}.`, {
        code: 'AMOUNT_MISMATCH',
        extra: { approved_amount: moneyString(approval.amount) },
      });
    }
    const existing = await tx.clientPurchaseOrder.findMany({ where: { clientApprovalId: approval.id }, include: { decision: true, cancellation: true } });
    const current = existing.find((po) => isCurrentPo(poState({ entryStatus: po.entryStatus, decision: po.decision?.decision ?? null, cancelled: po.cancellation !== null })));
    if (current) {
      throw new HttpError(409, `PO ${current.poNumber} is already current for this approval. Cancel, reject or withdraw it first.`, {
        code: 'CURRENT_PO_EXISTS',
        extra: { current_po: { id: current.id, po_number: current.poNumber } },
      });
    }
    const verifiedOnEntry = isReviewer(staff.role);
    if (verifiedOnEntry) {
      const poDocuments = input.documentIds.length ? await tx.document.count({ where: { id: { in: input.documentIds }, documentType: 'PURCHASE_ORDER' } }) : 0;
      if (poDocuments === 0) throw poDocumentRequired();
    }

    // Warnings that need explicit confirmation (FR-029a, FR-032a); the confirmation is recorded below.
    const confirmations: Record<string, unknown>[] = [];
    const duplicate = await duplicateOf(tx, projectId, project.client_name, input.poNumber);
    if (duplicate) {
      const figures = { po_number: duplicate.po_number, project: { id: duplicate.project_id, name: duplicate.project_name } };
      if (!input.confirmDuplicate) {
        throw new HttpError(409, `PO number ${duplicate.po_number} is already recorded on ${duplicate.project_name}. Confirm if this is a different PO.`, {
          code: 'DUPLICATE_PO_NUMBER',
          extra: figures,
        });
      }
      confirmations.push({ warning: 'DUPLICATE_PO_NUMBER', ...figures, acknowledged: true });
    }
    if (state.newest && isActiveRevision(state.newest.status) && state.newest.revision.number > state.authoritativeNumber!) {
      const figures = {
        authoritative_revision: state.authoritativeNumber,
        authoritative_amount: moneyString(approval.amount),
        pending_revision: state.newest.revision.number,
        pending_status: state.newest.status,
        pending_amount: moneyString(state.newest.revision.amount),
      };
      if (!input.confirmPendingRevision) {
        throw new HttpError(409, `Revision ${figures.pending_revision} (${figures.pending_status.toLowerCase().replace('_', ' ')}, ₹${figures.pending_amount}) is pending. Confirm to record this PO against revision ${figures.authoritative_revision}.`, {
          code: 'PENDING_REVISION',
          extra: figures,
        });
      }
      confirmations.push({ warning: 'PENDING_REVISION', ...figures, acknowledged: true });
    }

    const status = verifiedOnEntry ? 'VERIFIED' : 'SUBMITTED';
    const po = await tx.clientPurchaseOrder.create({
      data: {
        projectId,
        clientApprovalId: approval.id,
        poNumber: input.poNumber,
        poDate: toDateColumn(input.poDate),
        amount: input.amount,
        entryStatus: verifiedOnEntry ? 'VERIFIED_ON_ENTRY' : 'SUBMITTED',
        note: input.note,
        ...stampCreate(staff.id),
      },
    });
    await recordHistory(tx, {
      target: { clientPurchaseOrderId: po.id },
      action: 'CREATED',
      actorId: staff.id,
      details: { po_number: input.poNumber, po_date: input.poDate, amount: input.amount, revision_number: state.authoritativeNumber, record_status: status },
    });
    for (const confirmation of confirmations) {
      await recordHistory(tx, { target: { clientPurchaseOrderId: po.id }, action: 'WARNING_CONFIRMED', actorId: staff.id, details: { ...confirmation, record_status: status } });
    }
    if (input.documentIds.length) await attachDocuments(tx, await loadRecord(tx, 'purchase_order', po.id), input.documentIds, staff);
    return { id: po.id };
  });
}

type Action = 'VERIFIED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED';

// FR-030, FR-031, FR-032b: one decision per Submitted PO, one cancellation per Verified PO, under the project lock.
export async function decidePurchaseOrder(staff: Staff, poId: string, action: Action, input: { reason?: string; expectedState?: string }): Promise<{ projectId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const projectId = (await loadPurchaseOrder(tx, poId)).po.projectId;
      const project = await lockProject(tx, projectId);
      const { po, state } = await loadPurchaseOrder(tx, poId);
      if (action === 'WITHDRAWN') assertOwnerOrReviewer(staff, po.createdById, 'Only the person who entered this PO, an Administrator or an Accountant can withdraw it.');
      else assertReviewer(staff, 'Only an Administrator or an Accountant can verify, reject or cancel a purchase order.');
      assertWritable(project, action === 'REJECTED' ? 'REJECT_PO' : action === 'CANCELLED' ? 'CANCEL_PO' : 'OTHER');
      assertExpected(state, input.expectedState);
      const from = action === 'CANCELLED' ? 'VERIFIED' : 'SUBMITTED';
      if (state !== from) throw invalidTransition(state, `Only a ${from === 'VERIFIED' ? 'verified' : 'submitted'} purchase order can be ${action.toLowerCase()}. This one is ${state.toLowerCase()}.`);
      if ((action === 'REJECTED' || action === 'WITHDRAWN' || action === 'CANCELLED') && !input.reason) {
        throw new HttpError(400, 'Check the highlighted fields.', { fields: { reason: 'A reason is required.' } });
      }
      if (action === 'VERIFIED') {
        const { authoritative, authoritativeNumber } = await quotationState(tx, projectId);
        if (authoritative?.id !== po.clientApprovalId) {
          throw new HttpError(409, `This PO matches a superseded approval; only the current approval (revision ${authoritativeNumber}) can be verified against. Reject it instead.`, {
            code: 'APPROVAL_SUPERSEDED',
          });
        }
        if (!(await hasPoDocument(tx, poId))) throw poDocumentRequired();
      }
      if (action === 'CANCELLED') {
        await tx.purchaseOrderCancellation.create({ data: { clientPurchaseOrderId: poId, reason: input.reason!, ...stampCreate(staff.id) } });
      } else {
        await tx.purchaseOrderDecision.create({ data: { clientPurchaseOrderId: poId, decision: action, reason: input.reason ?? null, ...stampCreate(staff.id) } });
      }
      await recordHistory(tx, {
        target: { clientPurchaseOrderId: poId },
        action,
        actorId: staff.id,
        details: { po_number: po.poNumber, ...(input.reason ? { reason: input.reason } : {}), record_status: action },
      });
      return { projectId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'This purchase order changed since you opened it.', { code: 'STALE' });
    }
    throw error;
  }
}
