import { Prisma, type PaymentMethod, type ReceiptType, type StaffRole, type SubmissionRoute } from '@prisma/client';
import { prisma } from '../../db';
import { stampCreate } from '../../lib/audit';
import { authoritativeApproval, overpayment, poState, revisionStatus, verifiedReceiptWhere } from '../../lib/finance-state';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { fromDateColumn, toDateColumn } from '../../lib/india-date';
import { moneyString } from '../../lib/money';
import { attachDocuments } from './attachments';
import { assertExpected, assertOwnerOrReviewer, assertReviewer, assertWritable, invalidTransition, isReviewer, lockProject } from './lock';
import { loadRecord, loadReceipt } from './records';

// The one implementation of client receipt rules (research R1), shared by the Feature 003 advance routes and the
// Feature 006 receipt routes. Every receipt is a client_advances row (research R3); its state is derived from its
// decision and reversal rows (research R2). Every write holds the project lock (research R4).

export type Staff = { id: string; role: StaffRole };

export type ReceiptInput = {
  receiptType: ReceiptType;
  amount: string;
  receivedOn: string;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  note: string | null;
  approvalId?: string | null;
  poId?: string | null;
  documentIds?: string[];
  confirmOverpayment?: boolean;
  submissionId?: string | null;
};

// Feature 003 advance entries keep their exact details; every Feature 006 entry carries the record status (research R6).
function feature003Advance(route: SubmissionRoute, type: ReceiptType): boolean {
  return route === 'CLIENT_ADVANCES' && type === 'ADVANCE';
}

// The authoritative approved amount and the verified, unreversed receipts total, read under the project lock.
export async function projectFigures(tx: Prisma.TransactionClient, projectId: string) {
  const [quotation, verified] = await Promise.all([
    tx.clientQuotation.findUnique({ where: { projectId }, include: { revisions: { include: { statusChanges: true, approval: true } } } }),
    tx.clientAdvance.aggregate({ where: { projectId, ...verifiedReceiptWhere }, _sum: { amount: true } }),
  ]);
  const approval = authoritativeApproval(
    (quotation?.revisions ?? []).map((revision) => ({ number: revision.number, status: revisionStatus(revision.statusChanges), approval: revision.approval })),
  );
  return { approved: approval ? approval.amount : null, verified: verified._sum.amount ?? new Prisma.Decimal(0) };
}

// FR-036: returns the figures to record when the person confirmed, throws the warning when they did not.
async function checkOverpayment(tx: Prisma.TransactionClient, projectId: string, amount: Prisma.Decimal.Value, confirmed: boolean) {
  const { approved, verified } = await projectFigures(tx, projectId);
  const figures = overpayment(approved, verified, amount);
  if (figures && !confirmed) {
    throw new HttpError(409, `Saving this receipt would make the verified receipts exceed the approved amount by ₹${figures.excess}. Confirm to continue.`, {
      code: 'OVERPAYMENT_CONFIRMATION_REQUIRED',
      extra: figures,
    });
  }
  return figures;
}

async function checkLinks(tx: Prisma.TransactionClient, projectId: string, input: ReceiptInput): Promise<void> {
  if (input.approvalId) {
    // Any approval of the project, a superseded one included (FR-021).
    const approval = await tx.clientApproval.findUnique({ where: { id: input.approvalId }, include: { quotationRevision: { include: { clientQuotation: true } } } });
    if (!approval || approval.quotationRevision.clientQuotation.projectId !== projectId) {
      throw new HttpError(409, 'A receipt can reference only an approved quotation of this project.', { code: 'INVALID_LINK' });
    }
  }
  if (input.poId) {
    // A PO of the project that is Verified, and not Cancelled, now (FR-021); never re-checked later.
    const po = await tx.clientPurchaseOrder.findUnique({ where: { id: input.poId }, include: { decision: true, cancellation: true } });
    const state = po ? poState({ entryStatus: po.entryStatus, decision: po.decision?.decision ?? null, cancelled: po.cancellation !== null }) : null;
    if (!po || po.projectId !== projectId || state !== 'VERIFIED') {
      throw new HttpError(409, 'A receipt can reference only a verified purchase order of this project.', { code: 'INVALID_LINK' });
    }
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

// research R13: a repeat with the same submission ID and the same details returns the original receipt.
async function findRepeat(tx: Prisma.TransactionClient, staff: Staff, projectId: string, input: ReceiptInput, route: SubmissionRoute): Promise<string | null> {
  if (!input.submissionId) return null;
  const existing = await tx.clientAdvance.findUnique({ where: { submissionId: input.submissionId } });
  if (!existing) return null;
  const created = await tx.historyEntry.findFirst({ where: { clientAdvanceId: existing.id, action: 'CREATED' } });
  const savedDocuments = ((created?.details as { document_ids?: string[] } | null)?.document_ids ?? []) as string[];
  const same =
    existing.submissionRoute === route &&
    existing.projectId === projectId &&
    existing.createdById === staff.id &&
    existing.receiptType === input.receiptType &&
    moneyString(existing.amount) === moneyString(input.amount) &&
    fromDateColumn(existing.receivedOn) === input.receivedOn &&
    existing.paymentMethod === (input.paymentMethod ?? null) &&
    existing.reference === (input.reference ?? null) &&
    existing.note === (input.note ?? null) &&
    existing.clientApprovalId === (input.approvalId ?? null) &&
    existing.clientPurchaseOrderId === (input.poId ?? null) &&
    sameSet(savedDocuments, input.documentIds ?? []);
  if (!same) {
    throw new HttpError(409, 'This submission ID was already used for a different receipt. Start a new receipt.', { code: 'SUBMISSION_ID_REUSED' });
  }
  return existing.id;
}

export async function recordReceipt(
  staff: Staff,
  projectId: string,
  input: ReceiptInput,
  route: SubmissionRoute,
): Promise<{ id: string; projectId: string; replay: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      const repeat = await findRepeat(tx, staff, projectId, input, route);
      if (repeat) return { id: repeat, projectId, replay: true };
      if (project.archived) {
        throw new HttpError(409, 'This project is archived. Restore it before recording an advance.', { code: 'PROJECT_ARCHIVED' });
      }
      await checkLinks(tx, projectId, input);
      const verifiedOnEntry = isReviewer(staff.role);
      const figures = verifiedOnEntry ? await checkOverpayment(tx, projectId, input.amount, input.confirmOverpayment === true) : null;

      const receipt = await tx.clientAdvance.create({
        data: {
          projectId,
          receiptType: input.receiptType,
          amount: input.amount,
          receivedOn: toDateColumn(input.receivedOn),
          paymentMethod: input.paymentMethod,
          reference: input.reference,
          note: input.note,
          entryStatus: verifiedOnEntry ? 'VERIFIED_ON_ENTRY' : 'SUBMITTED',
          clientApprovalId: input.approvalId ?? null,
          clientPurchaseOrderId: input.poId ?? null,
          submissionId: input.submissionId ?? null,
          submissionRoute: input.submissionId ? route : null,
          ...stampCreate(staff.id),
        },
      });
      const status = verifiedOnEntry ? 'VERIFIED' : 'SUBMITTED';
      const details: Record<string, unknown> = { amount: input.amount, received_on: input.receivedOn };
      if (!feature003Advance(route, input.receiptType)) {
        Object.assign(details, { receipt_type: input.receiptType, document_ids: input.documentIds ?? [], record_status: status });
      }
      await recordHistory(tx, { target: { clientAdvanceId: receipt.id }, action: 'CREATED', actorId: staff.id, details });
      if (input.documentIds?.length) await attachDocuments(tx, await loadRecord(tx, 'receipt', receipt.id), input.documentIds, staff);
      if (figures) {
        await recordHistory(tx, { target: { clientAdvanceId: receipt.id }, action: 'WARNING_CONFIRMED', actorId: staff.id, details: { warning: 'OVERPAYMENT', ...figures, record_status: status } });
      }
      return { id: receipt.id, projectId, replay: false };
    });
  } catch (error) {
    // Two identical requests at once: the unique submission ID lets one insert through; the other returns it.
    if (input.submissionId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return recordReceipt(staff, projectId, input, route);
    }
    throw error;
  }
}

type Decision = 'VERIFIED' | 'REJECTED' | 'WITHDRAWN';

// FR-017, FR-018, FR-036: one decision row per Submitted receipt, with its history entry, under the project lock.
export async function decideReceipt(
  staff: Staff,
  receiptId: string,
  decision: Decision,
  input: { reason?: string; expectedState?: string; confirmOverpayment?: boolean },
): Promise<{ projectId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const projectId = (await loadReceipt(tx, receiptId)).receipt.projectId;
      const project = await lockProject(tx, projectId);
      const { receipt, state } = await loadReceipt(tx, receiptId);
      if (decision === 'WITHDRAWN') {
        assertOwnerOrReviewer(staff, receipt.createdById, 'Only the person who entered this receipt, an Administrator or an Accountant can withdraw it.');
      } else {
        assertReviewer(staff, 'Only an Administrator or an Accountant can verify or reject a receipt.');
      }
      assertWritable(project, decision === 'REJECTED' ? 'REJECT_RECEIPT' : 'OTHER');
      assertExpected(state, input.expectedState);
      if (state !== 'SUBMITTED') throw invalidTransition(state, `Only a receipt awaiting verification can be ${decision.toLowerCase()}. This one is ${state.toLowerCase()}.`);
      const figures = decision === 'VERIFIED' ? await checkOverpayment(tx, projectId, receipt.amount, input.confirmOverpayment === true) : null;
      await tx.clientReceiptDecision.create({ data: { clientAdvanceId: receipt.id, decision, reason: input.reason ?? null, ...stampCreate(staff.id) } });
      await recordHistory(tx, {
        target: { clientAdvanceId: receipt.id },
        action: decision,
        actorId: staff.id,
        details: { ...(input.reason ? { reason: input.reason } : {}), receipt_type: receipt.receiptType, record_status: decision },
      });
      if (figures) {
        await recordHistory(tx, { target: { clientAdvanceId: receipt.id }, action: 'WARNING_CONFIRMED', actorId: staff.id, details: { warning: 'OVERPAYMENT', ...figures, record_status: 'VERIFIED' } });
      }
      return { projectId };
    });
  } catch (error) {
    // The unique decision per receipt lets only one of two simultaneous decisions through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'This receipt changed since you opened it.', { code: 'STALE' });
    }
    throw error;
  }
}

// Full amount, once, with a reason; allowed on an archived project; any verified receipt type (FR-020, Feature 003 FR-020).
export async function reverseReceipt(staff: Staff, receiptId: string, reason: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const projectId = (await loadReceipt(tx, receiptId)).receipt.projectId;
      assertWritable(await lockProject(tx, projectId), 'REVERSE_RECEIPT');
      const { receipt, state } = await loadReceipt(tx, receiptId);
      if (state === 'REVERSED') throw alreadyReversed();
      if (state !== 'VERIFIED') throw invalidTransition(state, `Only a verified receipt can be reversed. This one is ${state.toLowerCase()}.`);
      const amount = moneyString(receipt.amount);
      await tx.clientAdvanceReversal.create({ data: { clientAdvanceId: receipt.id, amount: receipt.amount, reason, ...stampCreate(staff.id) } });
      const details: Record<string, unknown> = { amount, reason };
      if (receipt.receiptType !== 'ADVANCE') Object.assign(details, { receipt_type: receipt.receiptType, record_status: 'REVERSED' });
      await recordHistory(tx, { target: { clientAdvanceId: receipt.id }, action: 'REVERSED', actorId: staff.id, details });
    });
  } catch (error) {
    // The unique client_advance_id lets only one of two simultaneous reversals through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw alreadyReversed();
    throw error;
  }
}

export function alreadyReversed(): HttpError {
  return new HttpError(409, 'This advance has already been reversed.', { code: 'ALREADY_REVERSED' });
}
