import { Router } from 'express';
import type { Prisma, StaffRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate } from '../../lib/audit';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { asyncRoute } from '../async-route';
import { assertWritable, isReviewer, lockProject } from './lock';
import { loadRecord, type RecordContext, type RecordKind } from './records';

// Attaching Feature 003 project documents to financial records (FR-041 to FR-042f). Attaching is never an edit of
// the record; every attach, removal and supersede writes one entry on the record and one on each document
// involved, all with the record's status at that moment (FR-042c F4, research R6), in the caller's transaction.

type Staff = { id: string; role: StaffRole };

const RECORD_COLUMN: Record<RecordKind, 'quotationRevisionId' | 'clientApprovalId' | 'clientPurchaseOrderId' | 'clientAdvanceId'> = {
  revision: 'quotationRevisionId',
  approval: 'clientApprovalId',
  purchase_order: 'clientPurchaseOrderId',
  receipt: 'clientAdvanceId',
};

function recordWhere(record: RecordContext): Prisma.FinancialAttachmentWhereInput {
  return { [RECORD_COLUMN[record.kind]]: record.id };
}

// FR-042b: Draft, Submitted and Under review records take attachments from every role; final records, Cancelled
// POs and approvals only from Administrators and Accountants.
function assertMayAttach(staff: Staff, record: RecordContext): void {
  if (!record.active && !isReviewer(staff.role)) {
    throw new HttpError(403, 'Only an Administrator or an Accountant can attach a document to this record now.', { code: 'ROLE_NOT_ALLOWED' });
  }
}

async function documentFor(tx: Prisma.TransactionClient, record: RecordContext, documentId: string) {
  const document = await tx.document.findUnique({ where: { id: documentId } });
  if (!document || document.projectId !== record.projectId) {
    throw new HttpError(400, 'Check the highlighted fields.', { fields: { document_id: 'Choose a document of this project.' } });
  }
  if (document.archived) {
    throw new HttpError(409, 'This document is archived. Restore it before attaching it.', { code: 'DOCUMENT_ARCHIVED' });
  }
  return document;
}

// Inside a transaction that already holds the project lock. Used by the attach route and when a record is created
// or approved with documents (FR-026, FR-029, FR-016).
export async function attachDocuments(
  tx: Prisma.TransactionClient,
  record: RecordContext,
  documentIds: string[],
  staff: Staff,
  supersede?: { attachmentId: string; reason: string },
) {
  if (new Set(documentIds).size !== documentIds.length) {
    throw new HttpError(409, 'The same document is listed twice.', { code: 'ALREADY_ATTACHED' });
  }
  const created = [];
  for (const documentId of documentIds) {
    const document = await documentFor(tx, record, documentId);
    const existing = await tx.financialAttachment.findFirst({ where: { ...recordWhere(record), documentId, removal: { is: null } } });
    if (existing) throw new HttpError(409, 'This document is already attached to this record.', { code: 'ALREADY_ATTACHED' });

    let superseded: { id: string; documentId: string } | null = null;
    if (supersede) {
      superseded = await tx.financialAttachment.findFirst({
        where: { id: supersede.attachmentId, ...recordWhere(record), removal: { is: null }, supersededBy: { is: null } },
      });
      if (!superseded) {
        throw new HttpError(409, 'Only a current attachment of this record that is not already superseded can be superseded.', {
          code: 'INVALID_SUPERSEDE',
        });
      }
    }

    const attachment = await tx.financialAttachment.create({
      data: {
        documentId,
        [RECORD_COLUMN[record.kind]]: record.id,
        supersedesAttachmentId: superseded?.id ?? null,
        supersedeReason: superseded ? supersede!.reason : null,
        ...stampCreate(staff.id),
      },
      include: { document: true, createdBy: { select: { id: true, name: true } } },
    });
    const action = superseded ? 'SUPERSEDED' : 'ATTACHED';
    const details = {
      ...record.details,
      attachment_id: attachment.id,
      document_id: documentId,
      document_title: document.title,
      ...(superseded ? { supersedes_attachment_id: superseded.id, superseded_document_id: superseded.documentId, reason: supersede!.reason } : {}),
      record_status: record.state,
    };
    await recordHistory(tx, { target: record.target, action, actorId: staff.id, details });
    await recordHistory(tx, { target: { documentId }, action, actorId: staff.id, details });
    if (superseded) await recordHistory(tx, { target: { documentId: superseded.documentId }, action, actorId: staff.id, details });
    created.push(attachment);
  }
  return created;
}

export function presentAttachment(attachment: {
  id: string;
  supersedesAttachmentId: string | null;
  supersedeReason: string | null;
  createdAt: Date;
  document: { id: string; title: string; documentType: string; archived: boolean; originalFilename: string };
  createdBy: { id: string; name: string };
  removal?: { reason: string; createdAt: Date; createdBy: { id: string; name: string } } | null;
  supersededBy?: { id: string; document: { id: string; title: string } } | null;
}) {
  return {
    id: attachment.id,
    document: {
      id: attachment.document.id,
      title: attachment.document.title,
      document_type: attachment.document.documentType,
      original_filename: attachment.document.originalFilename,
      archived: attachment.document.archived,
    },
    current: !attachment.removal,
    supersedes_attachment_id: attachment.supersedesAttachmentId,
    supersede_reason: attachment.supersedeReason,
    superseded_by: attachment.supersededBy ? { attachment_id: attachment.supersededBy.id, document: attachment.supersededBy.document } : null,
    removal: attachment.removal
      ? { reason: attachment.removal.reason, created_at: attachment.removal.createdAt.toISOString(), created_by: attachment.removal.createdBy }
      : null,
    created_at: attachment.createdAt.toISOString(),
    created_by: attachment.createdBy,
  };
}

export const attachmentInclude = {
  document: true,
  createdBy: { select: { id: true, name: true } },
  removal: { include: { createdBy: { select: { id: true, name: true } } } },
  supersededBy: { include: { document: { select: { id: true, title: true } } } },
} satisfies Prisma.FinancialAttachmentInclude;

const attachSchema = z
  .object({
    record: z.object({ kind: z.enum(['revision', 'approval', 'purchase_order', 'receipt']), id: z.string().uuid('Not a valid id.') }).strict(),
    document_id: z.string({ required_error: 'Choose a document.' }).uuid('Choose a document.'),
    supersedes_attachment_id: z.string().uuid('Not a valid id.').optional(),
    supersede_reason: z.string().trim().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.supersedes_attachment_id && !body.supersede_reason) {
      ctx.addIssue({ code: 'custom', path: ['supersede_reason'], message: 'Give a reason for the correction.' });
    }
  });

const removalSchema = z.object({ reason: z.string({ required_error: 'Give a reason.' }).trim().min(1, 'Give a reason.') }).strict();

export const attachmentRouter = Router();

attachmentRouter.post(
  '/financial-attachments',
  asyncRoute(async (req, res) => {
    const body = attachSchema.parse(req.body ?? {});
    const staff = req.staff!;
    const [attachment] = await prisma.$transaction(async (tx) => {
      const projectId = (await loadRecord(tx, body.record.kind, body.record.id)).projectId;
      assertWritable(await lockProject(tx, projectId));
      const record = await loadRecord(tx, body.record.kind, body.record.id);
      assertMayAttach(staff, record);
      return attachDocuments(
        tx,
        record,
        [body.document_id],
        staff,
        body.supersedes_attachment_id ? { attachmentId: body.supersedes_attachment_id, reason: body.supersede_reason! } : undefined,
      );
    });
    const stored = await prisma.financialAttachment.findUniqueOrThrow({ where: { id: attachment.id }, include: attachmentInclude });
    res.status(201).json(presentAttachment(stored));
  }),
);

attachmentRouter.post(
  '/financial-attachments/:id/removal',
  asyncRoute(async (req, res) => {
    const id = z.string().uuid('Not a valid id.').parse(req.params.id);
    const { reason } = removalSchema.parse(req.body ?? {});
    const staff = req.staff!;
    await prisma.$transaction(async (tx) => {
      const found = await tx.financialAttachment.findUnique({ where: { id } });
      if (!found) throw new HttpError(404, 'Attachment not found.');
      const kind: RecordKind = found.quotationRevisionId ? 'revision' : found.clientApprovalId ? 'approval' : found.clientPurchaseOrderId ? 'purchase_order' : 'receipt';
      const recordId = (found.quotationRevisionId ?? found.clientApprovalId ?? found.clientPurchaseOrderId ?? found.clientAdvanceId)!;
      const projectId = (await loadRecord(tx, kind, recordId)).projectId;
      assertWritable(await lockProject(tx, projectId));
      const record = await loadRecord(tx, kind, recordId);
      const attachment = await tx.financialAttachment.findUniqueOrThrow({ where: { id }, include: { removal: true, supersededBy: true, document: true } });
      if (attachment.removal) throw new HttpError(409, 'This attachment has already been removed.', { code: 'INVALID_TRANSITION' });
      if (attachment.supersedesAttachmentId) {
        throw new HttpError(409, 'This attachment supersedes another attachment, so it cannot be removed. Correct it with a new document.', { code: 'IN_SUPERSEDE_CHAIN' });
      }
      if (attachment.supersededBy) {
        throw new HttpError(409, 'This attachment has been superseded, so it cannot be removed.', { code: 'IN_SUPERSEDE_CHAIN' });
      }
      if (!record.active) {
        throw new HttpError(409, 'Attachments can be removed only while the record is in an active status.', {
          code: 'INVALID_TRANSITION',
          extra: { current_state: record.state },
        });
      }
      if (!isReviewer(staff.role) && attachment.createdById !== staff.id) {
        throw new HttpError(403, 'You can remove only the attachments you added.', { code: 'ROLE_NOT_ALLOWED' });
      }
      await tx.financialAttachmentRemoval.create({ data: { financialAttachmentId: id, reason, ...stampCreate(staff.id) } });
      const details = { ...record.details, attachment_id: id, document_id: attachment.documentId, document_title: attachment.document.title, reason, record_status: record.state };
      await recordHistory(tx, { target: record.target, action: 'ATTACHMENT_REMOVED', actorId: staff.id, details });
      await recordHistory(tx, { target: { documentId: attachment.documentId }, action: 'ATTACHMENT_REMOVED', actorId: staff.id, details });
    });
    const stored = await prisma.financialAttachment.findUniqueOrThrow({ where: { id }, include: attachmentInclude });
    res.status(201).json(presentAttachment(stored));
  }),
);
