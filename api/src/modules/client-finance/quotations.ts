import { Prisma, type RevisionStatus } from '@prisma/client';
import { prisma } from '../../db';
import { stampCreate } from '../../lib/audit';
import { isActiveRevision, revisionStatus } from '../../lib/finance-state';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { toDateColumn } from '../../lib/india-date';
import { moneyString } from '../../lib/money';
import { assertExpected, assertWritable, invalidTransition, isReviewer, lockProject } from './lock';
import { attachDocuments } from './attachments';
import { loadRecord, loadRevision } from './records';
import type { Staff } from './receipts';

// One client quotation per project with strictly sequential revisions, each with its own status (FR-022 to FR-025a).
// A revision is never edited; its status lives in append-only status-change rows (research R2).

const STATUS_WORDS: Record<RevisionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export type RevisionInput = { amount: string; quotationDate: string; reason?: string | null; note?: string | null; validityDate?: string | null };

async function newestRevision(tx: Prisma.TransactionClient, quotationId: string) {
  const revisions = await tx.quotationRevision.findMany({ where: { clientQuotationId: quotationId }, include: { statusChanges: true }, orderBy: { number: 'desc' } });
  return revisions.length ? { revision: revisions[0], status: revisionStatus(revisions[0].statusChanges) } : null;
}

async function insertRevision(tx: Prisma.TransactionClient, staff: Staff, quotationId: string, number: number, input: RevisionInput, previousAmount: string | null) {
  const revision = await tx.quotationRevision.create({
    data: {
      clientQuotationId: quotationId,
      number,
      amount: input.amount,
      quotationDate: toDateColumn(input.quotationDate),
      reason: input.reason ?? null,
      note: input.note ?? null,
      validityDate: input.validityDate ? toDateColumn(input.validityDate) : null,
      ...stampCreate(staff.id),
    },
  });
  await recordHistory(tx, {
    target: { clientQuotationId: quotationId },
    action: 'REVISION_ADDED',
    actorId: staff.id,
    details: { revision_id: revision.id, revision_number: number, previous_amount: previousAmount, amount: input.amount, ...(input.reason ? { reason: input.reason } : {}), record_status: 'DRAFT' },
  });
  return revision;
}

// FR-022, OQ-7: the project's one quotation, with a system reference (research R7) and revision 1 in Draft.
export async function createQuotation(staff: Staff, projectId: string, title: string, input: RevisionInput): Promise<{ id: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      assertWritable(await lockProject(tx, projectId));
      if (await tx.clientQuotation.findUnique({ where: { projectId } })) throw quotationExists();
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`SELECT nextval('client_quotation_reference_seq') AS next`;
      const quotation = await tx.clientQuotation.create({
        data: { projectId, reference: `Q-${String(next).padStart(6, '0')}`, title, ...stampCreate(staff.id) },
      });
      await recordHistory(tx, {
        target: { clientQuotationId: quotation.id },
        action: 'CREATED',
        actorId: staff.id,
        details: { reference: quotation.reference, title, amount: input.amount, revision_number: 1, record_status: 'DRAFT' },
      });
      await insertRevision(tx, staff, quotation.id, 1, { ...input, reason: null }, null);
      return { id: quotation.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw quotationExists();
    throw error;
  }
}

function quotationExists(): HttpError {
  return new HttpError(409, 'This project already has a client quotation. Add a revision to it instead.', { code: 'QUOTATION_EXISTS' });
}

// FR-023, FR-023a: a new revision only when the newest is final; numbered highest + 1 under the project lock.
export async function addRevision(staff: Staff, quotationId: string, input: RevisionInput, expectedNewest?: number): Promise<{ id: string; projectId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const quotation = await tx.clientQuotation.findUnique({ where: { id: quotationId } });
      if (!quotation) throw new HttpError(404, 'Client quotation not found.');
      assertWritable(await lockProject(tx, quotation.projectId));
      const newest = await newestRevision(tx, quotationId);
      if (newest && isActiveRevision(newest.status)) {
        throw new HttpError(409, `Revision ${newest.revision.number} is ${STATUS_WORDS[newest.status]}. A new revision can be added once it is approved, rejected or withdrawn.`, {
          code: 'REVISION_ACTIVE',
          extra: { active_revision: newest.revision.number, status: newest.status },
        });
      }
      const newestNumber = newest?.revision.number ?? 0;
      if (expectedNewest !== undefined && expectedNewest !== newestNumber) {
        throw new HttpError(409, `This quotation changed since you opened it. Its newest revision is now ${newestNumber}.`, {
          code: 'STALE',
          extra: { newest_revision: newestNumber },
        });
      }
      const revision = await insertRevision(tx, staff, quotationId, newestNumber + 1, input, newest ? moneyString(newest.revision.amount) : null);
      return { id: revision.id, projectId: quotation.projectId };
    });
  } catch (error) {
    // The unique (quotation, number) is the last guard against two simultaneous revisions (FR-023a).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Another revision was added at the same time.', { code: 'REVISION_ACTIVE' });
    }
    throw error;
  }
}

// FR-025: the only status changes; Approved happens only through the approval (FR-026).
const ALLOWED: Record<string, { reviewerOnly: boolean }> = {
  'DRAFT>SUBMITTED': { reviewerOnly: false },
  'DRAFT>WITHDRAWN': { reviewerOnly: false },
  'SUBMITTED>UNDER_REVIEW': { reviewerOnly: true },
  'SUBMITTED>WITHDRAWN': { reviewerOnly: true },
  'UNDER_REVIEW>REJECTED': { reviewerOnly: true },
};

export async function changeRevisionStatus(
  staff: Staff,
  revisionId: string,
  to: RevisionStatus,
  input: { expectedStatus?: string; reason?: string; note?: string },
): Promise<{ projectId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const projectId = (await loadRevision(tx, revisionId)).revision.clientQuotation.projectId;
      const project = await lockProject(tx, projectId);
      const { revision, state } = await loadRevision(tx, revisionId);
      assertExpected(state, input.expectedStatus);
      const rule = ALLOWED[`${state}>${to}`];
      if (!rule) {
        throw invalidTransition(
          state,
          to === 'APPROVED' && state === 'UNDER_REVIEW'
            ? 'Approve a revision with the approval action.'
            : `A revision that is ${STATUS_WORDS[state].toLowerCase()} cannot become ${STATUS_WORDS[to].toLowerCase()}.`,
        );
      }
      const reviewer = isReviewer(staff.role);
      // OQ-13: Office Team withdraws only a Draft they created, and takes no review step.
      if ((rule.reviewerOnly && !reviewer) || (to === 'WITHDRAWN' && state === 'DRAFT' && !reviewer && revision.createdById !== staff.id)) {
        throw new HttpError(403, 'You are not allowed to make this change to the revision.', { code: 'ROLE_NOT_ALLOWED' });
      }
      assertWritable(project);
      if ((to === 'REJECTED' || to === 'WITHDRAWN') && !input.reason) {
        throw new HttpError(400, 'Check the highlighted fields.', { fields: { reason: 'A reason is required.' } });
      }
      await tx.quotationStatusChange.create({
        data: { quotationRevisionId: revisionId, fromStatus: state, toStatus: to, reason: input.reason ?? null, note: input.note ?? null, ...stampCreate(staff.id) },
      });
      await recordHistory(tx, {
        target: { clientQuotationId: revision.clientQuotationId },
        action: 'STATUS_CHANGED',
        actorId: staff.id,
        details: {
          revision_id: revisionId,
          revision_number: revision.number,
          from: state,
          to,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.note ? { note: input.note } : {}),
          record_status: to,
        },
      });
      return { projectId };
    });
  } catch (error) {
    // Each status is reached at most once per revision; a simultaneous duplicate is stale.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'This revision changed since you opened it.', { code: 'STALE' });
    }
    throw error;
  }
}

// FR-026 to FR-028: Under review → Approved, with the approval record at the revision's exact amount, any documents
// supplied with it and every history entry, in one transaction (FR-008). A Quotation document must be attached to
// the revision or supplied with the approval (OQ-25, decision 2026-11-18).
export async function approveRevision(
  staff: Staff,
  revisionId: string,
  input: { expectedStatus?: string; amount: string; clientAcceptanceDate?: string | null; note?: string | null; documentIds: string[] },
): Promise<{ projectId: string; approvalId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const projectId = (await loadRevision(tx, revisionId)).revision.clientQuotation.projectId;
      const project = await lockProject(tx, projectId);
      const { revision, state } = await loadRevision(tx, revisionId);
      if (!isReviewer(staff.role)) throw new HttpError(403, 'Only an Administrator or an Accountant can approve a revision.', { code: 'ROLE_NOT_ALLOWED' });
      assertWritable(project);
      assertExpected(state, input.expectedStatus);
      if (state !== 'UNDER_REVIEW') throw invalidTransition(state, `Only a revision under review can be approved. Revision ${revision.number} is ${STATUS_WORDS[state].toLowerCase()}.`);
      const newest = await newestRevision(tx, revision.clientQuotationId);
      if (newest && newest.revision.id !== revisionId) throw invalidTransition(state, 'A newer revision of this quotation exists.');
      if (moneyString(input.amount) !== moneyString(revision.amount)) {
        throw new HttpError(409, `The approved amount must equal the revision amount, ₹${moneyString(revision.amount)}.`, {
          code: 'AMOUNT_MISMATCH',
          extra: { approved_amount: moneyString(revision.amount) },
        });
      }
      const onRevision = await tx.financialAttachment.count({ where: { quotationRevisionId: revisionId, removal: { is: null }, document: { documentType: 'QUOTATION' } } });
      const supplied = input.documentIds.length
        ? await tx.document.count({ where: { id: { in: input.documentIds }, documentType: 'QUOTATION' } })
        : 0;
      if (onRevision === 0 && supplied === 0) {
        throw new HttpError(409, 'Attach the Quotation document before approving this revision.', { code: 'QUOTATION_DOCUMENT_REQUIRED' });
      }
      await tx.quotationStatusChange.create({
        data: { quotationRevisionId: revisionId, fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED', note: input.note ?? null, ...stampCreate(staff.id) },
      });
      const approval = await tx.clientApproval.create({
        data: {
          quotationRevisionId: revisionId,
          amount: revision.amount,
          clientAcceptanceDate: input.clientAcceptanceDate ? toDateColumn(input.clientAcceptanceDate) : null,
          note: input.note ?? null,
          ...stampCreate(staff.id),
        },
      });
      await recordHistory(tx, {
        target: { clientQuotationId: revision.clientQuotationId },
        action: 'APPROVED',
        actorId: staff.id,
        details: { revision_id: revisionId, approval_id: approval.id, revision_number: revision.number, amount: moneyString(revision.amount), record_status: 'APPROVED' },
      });
      if (input.documentIds.length) {
        const record = await loadRecord(tx, 'approval', approval.id);
        await attachDocuments(tx, record, input.documentIds, staff);
      }
      return { projectId, approvalId: approval.id };
    });
  } catch (error) {
    // One approval per revision, one Approved status change per revision: a simultaneous second approval is stale.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'This revision changed since you opened it.', { code: 'STALE' });
    }
    throw error;
  }
}
