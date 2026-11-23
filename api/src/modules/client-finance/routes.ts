import { Router } from 'express';
import { z } from 'zod';
import { fromDateColumn, todayInIndia, toDateColumn } from '../../lib/india-date';
import { HttpError } from '../../lib/http';
import { parsePositiveAmount } from '../../lib/money';
import { prisma } from '../../db';
import { asyncRoute } from '../async-route';
import { createPurchaseOrder, decidePurchaseOrder } from './purchase-orders';
import { addRevision, approveRevision, changeRevisionStatus, createQuotation } from './quotations';
import { decideReceipt, recordReceipt } from './receipts';
import { buildClientFinance } from './view';

// Feature 006 client finance routes (contracts/http-api.md). Every route is behind the session check in app.ts;
// every write checks its role on the server (FR-001, Constitution IV) and validates its body (NFR-004).
const idSchema = z.string().uuid('Not a valid id.');

export const pastDate = (label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD).`)
    .refine((value) => fromDateColumn(toDateColumn(value)) === value, `${label} must be a real calendar date.`)
    .refine((value) => value <= todayInIndia(), `${label} cannot be later than today.`);

const optionalText = z.string().trim().nullable().optional();
const blankToNull = (value: string | null | undefined) => (value ? value : null);

const receiptSchema = z
  .object({
    submission_id: z.string({ required_error: 'A submission ID is required.' }).uuid('The submission ID must be a UUID.'),
    receipt_type: z.enum(['ADVANCE', 'STAGE_PAYMENT', 'FINAL_PAYMENT', 'OTHER'], { errorMap: () => ({ message: 'Choose Advance, Stage payment, Final payment or Other.' }) }),
    amount: z.string({ required_error: 'Amount is required.', invalid_type_error: 'Amount must be text such as "50000.00".' }),
    received_on: pastDate('Date received'),
    payment_method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER']).nullable().optional(),
    reference: optionalText,
    note: optionalText,
    client_approval_id: idSchema.nullable().optional(),
    client_purchase_order_id: idSchema.nullable().optional(),
    document_ids: z.array(idSchema).optional(),
    confirm_overpayment: z.boolean().optional(),
  })
  .strict()
  .refine((body) => !(body.client_approval_id && body.client_purchase_order_id), {
    path: ['client_purchase_order_id'],
    message: 'Link a receipt to an approved quotation or a purchase order, not both.',
  });

const reasonSchema = z.string({ required_error: 'A reason is required.' }).trim().min(1, 'A reason is required.');
const verifySchema = z.object({ expected_state: z.string().optional(), confirm_overpayment: z.boolean().optional() }).strict();
const reasonedSchema = z.object({ reason: reasonSchema, expected_state: z.string().optional() }).strict();

export async function presentReceipt(projectId: string, receiptId: string) {
  const receipt = (await buildClientFinance(projectId)).receipts.find((row) => row.id === receiptId);
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  return receipt;
}

export const clientFinanceRouter = Router();

// Every role views every client financial record (FR-001).
clientFinanceRouter.get(
  '/projects/:id/client-finance',
  asyncRoute(async (req, res) => {
    res.json(await buildClientFinance(idSchema.parse(req.params.id)));
  }),
);

// Every role enters receipts: Office Team entries are Submitted, reviewer entries verified on entry (FR-016, FR-017).
clientFinanceRouter.post(
  '/projects/:id/receipts',
  asyncRoute(async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    const body = receiptSchema.parse(req.body ?? {});
    const saved = await recordReceipt(
      req.staff!,
      projectId,
      {
        receiptType: body.receipt_type,
        amount: parsePositiveAmount(body.amount),
        receivedOn: body.received_on,
        paymentMethod: body.payment_method ?? null,
        reference: blankToNull(body.reference),
        note: blankToNull(body.note),
        approvalId: body.client_approval_id ?? null,
        poId: body.client_purchase_order_id ?? null,
        documentIds: body.document_ids ?? [],
        confirmOverpayment: body.confirm_overpayment,
        submissionId: body.submission_id,
      },
      'RECEIPTS',
    );
    res.status(201).json(await presentReceipt(projectId, saved.id));
  }),
);

clientFinanceRouter.post(
  '/receipts/:id/verification',
  asyncRoute(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const body = verifySchema.parse(req.body ?? {});
    const { projectId } = await decideReceipt(req.staff!, id, 'VERIFIED', { expectedState: body.expected_state, confirmOverpayment: body.confirm_overpayment });
    res.json(await presentReceipt(projectId, id));
  }),
);

for (const [action, decision] of [
  ['rejection', 'REJECTED'],
  ['withdrawal', 'WITHDRAWN'],
] as const) {
  clientFinanceRouter.post(
    `/receipts/:id/${action}`,
    asyncRoute(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const body = reasonedSchema.parse(req.body ?? {});
      const { projectId } = await decideReceipt(req.staff!, id, decision, { reason: body.reason, expectedState: body.expected_state });
      res.json(await presentReceipt(projectId, id));
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Quotation and revisions (FR-022 to FR-025a): every role creates, revises and submits; reviewers review.
// ---------------------------------------------------------------------------------------------------------------

const anyDate = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD).`)
    .refine((value) => fromDateColumn(toDateColumn(value)) === value, `${label} must be a real calendar date.`);

const revisionFields = {
  amount: z.string({ required_error: 'Amount is required.', invalid_type_error: 'Amount must be text such as "1840000.00".' }),
  quotation_date: pastDate('Quotation date'),
  note: optionalText,
  validity_date: anyDate('Validity date').nullable().optional(),
};

const quotationSchema = z
  .object({ title: z.string({ required_error: 'Title is required.' }).trim().min(1, 'Title is required.').max(200, 'Title must be 200 characters or fewer.'), ...revisionFields })
  .strict();
const revisionSchema = z
  .object({ ...revisionFields, reason: reasonSchema, expected_newest_revision: z.number().int().nonnegative().optional() })
  .strict();
const statusSchema = z
  .object({
    to: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'], { errorMap: () => ({ message: 'Choose the new status.' }) }),
    expected_status: z.string().optional(),
    reason: z.string().trim().optional(),
    note: z.string().trim().optional(),
  })
  .strict();

export async function presentRevision(projectId: string, revisionId: string) {
  const revision = (await buildClientFinance(projectId)).quotation?.revisions.find((row) => row.id === revisionId);
  if (!revision) throw new HttpError(404, 'Quotation revision not found.');
  return revision;
}

const revisionInput = (body: { amount: string; quotation_date: string; note?: string | null; validity_date?: string | null }) => ({
  amount: parsePositiveAmount(body.amount),
  quotationDate: body.quotation_date,
  note: blankToNull(body.note),
  validityDate: body.validity_date ?? null,
});

clientFinanceRouter.post(
  '/projects/:id/quotation',
  asyncRoute(async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    const body = quotationSchema.parse(req.body ?? {});
    await createQuotation(req.staff!, projectId, body.title, revisionInput(body));
    res.status(201).json((await buildClientFinance(projectId)).quotation);
  }),
);

clientFinanceRouter.post(
  '/quotations/:id/revisions',
  asyncRoute(async (req, res) => {
    const quotationId = idSchema.parse(req.params.id);
    const body = revisionSchema.parse(req.body ?? {});
    const saved = await addRevision(req.staff!, quotationId, { ...revisionInput(body), reason: body.reason }, body.expected_newest_revision);
    res.status(201).json(await presentRevision(saved.projectId, saved.id));
  }),
);

clientFinanceRouter.post(
  '/quotation-revisions/:id/status',
  asyncRoute(async (req, res) => {
    const revisionId = idSchema.parse(req.params.id);
    const body = statusSchema.parse(req.body ?? {});
    const { projectId } = await changeRevisionStatus(req.staff!, revisionId, body.to, {
      expectedStatus: body.expected_status,
      reason: body.reason || undefined,
      note: body.note || undefined,
    });
    res.json(await presentRevision(projectId, revisionId));
  }),
);

// FR-026: reviewers approve an Under review revision at its exact amount, optionally with documents.
const approvalSchema = z
  .object({
    expected_status: z.string().optional(),
    amount: z.string({ required_error: 'Amount is required.' }),
    client_acceptance_date: anyDate('Client acceptance date').nullable().optional(),
    note: optionalText,
    document_ids: z.array(idSchema).optional(),
  })
  .strict();

clientFinanceRouter.post(
  '/quotation-revisions/:id/approval',
  asyncRoute(async (req, res) => {
    const revisionId = idSchema.parse(req.params.id);
    const body = approvalSchema.parse(req.body ?? {});
    const saved = await approveRevision(req.staff!, revisionId, {
      expectedStatus: body.expected_status,
      amount: parsePositiveAmount(body.amount),
      clientAcceptanceDate: body.client_acceptance_date ?? null,
      note: blankToNull(body.note),
      documentIds: body.document_ids ?? [],
    });
    const approval = (await buildClientFinance(saved.projectId)).approvals.find((row) => row.id === saved.approvalId);
    res.status(201).json(approval);
  }),
);

// ---------------------------------------------------------------------------------------------------------------
// Purchase orders (FR-029 to FR-033): every role enters; reviewers verify, reject and cancel.
// ---------------------------------------------------------------------------------------------------------------

const purchaseOrderSchema = z
  .object({
    client_approval_id: z.string({ required_error: 'Choose the approved quotation this PO is for.' }).uuid('Choose the approved quotation this PO is for.'),
    po_number: z.string({ required_error: 'PO number is required.' }).trim().min(1, 'PO number is required.').max(100, 'PO number must be 100 characters or fewer.'),
    po_date: pastDate('PO date'),
    amount: z.string({ required_error: 'Amount is required.', invalid_type_error: 'Amount must be text such as "1840000.00".' }),
    note: optionalText,
    document_ids: z.array(idSchema).optional(),
    confirm_duplicate: z.boolean().optional(),
    confirm_pending_revision: z.boolean().optional(),
  })
  .strict();

export async function presentPurchaseOrder(projectId: string, poId: string) {
  const po = (await buildClientFinance(projectId)).purchase_orders.find((row) => row.id === poId);
  if (!po) throw new HttpError(404, 'Purchase order not found.');
  return po;
}

clientFinanceRouter.post(
  '/projects/:id/purchase-orders',
  asyncRoute(async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    const body = purchaseOrderSchema.parse(req.body ?? {});
    const saved = await createPurchaseOrder(req.staff!, projectId, {
      approvalId: body.client_approval_id,
      poNumber: body.po_number,
      poDate: body.po_date,
      amount: parsePositiveAmount(body.amount),
      note: blankToNull(body.note),
      documentIds: body.document_ids ?? [],
      confirmDuplicate: body.confirm_duplicate === true,
      confirmPendingRevision: body.confirm_pending_revision === true,
    });
    res.status(201).json(await presentPurchaseOrder(projectId, saved.id));
  }),
);

const poVerifySchema = z.object({ expected_state: z.string().optional() }).strict();
const poReasonSchema = z.object({ reason: z.string().trim().optional(), expected_state: z.string().optional() }).strict();

for (const [action, decision] of [
  ['verification', 'VERIFIED'],
  ['rejection', 'REJECTED'],
  ['withdrawal', 'WITHDRAWN'],
  ['cancellation', 'CANCELLED'],
] as const) {
  clientFinanceRouter.post(
    `/purchase-orders/:id/${action}`,
    asyncRoute(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const body: { reason?: string; expected_state?: string } =
        decision === 'VERIFIED' ? poVerifySchema.parse(req.body ?? {}) : poReasonSchema.parse(req.body ?? {});
      const { projectId } = await decidePurchaseOrder(req.staff!, id, decision, { reason: body.reason || undefined, expectedState: body.expected_state });
      res.json(await presentPurchaseOrder(projectId, id));
    }),
  );
}

// FR-038: one chronological history of the project's quotation, POs and receipts. Each entry's state is the status it
// captured when written; a Feature 003 entry, which has none, reads Verified when created and Reversed when reversed
// (research R6). Nothing here writes to history.
clientFinanceRouter.get(
  '/projects/:id/client-finance/history',
  asyncRoute(async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new HttpError(404, 'Project not found.');
    const entries = await prisma.historyEntry.findMany({
      where: { OR: [{ clientQuotation: { projectId } }, { clientPurchaseOrder: { projectId } }, { clientAdvance: { projectId } }] },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({
      entries: entries.map((entry) => {
        const details = (entry.details ?? {}) as Record<string, unknown>;
        const fallback = entry.action === 'CREATED' ? 'VERIFIED' : entry.action === 'REVERSED' ? 'REVERSED' : null;
        const record = entry.clientQuotationId
          ? { kind: 'quotation', id: entry.clientQuotationId, revision_number: details.revision_number ?? null }
          : entry.clientPurchaseOrderId
            ? { kind: 'purchase_order', id: entry.clientPurchaseOrderId }
            : { kind: 'receipt', id: entry.clientAdvanceId };
        return {
          id: entry.id,
          action: entry.action,
          record,
          amount: typeof details.amount === 'string' ? details.amount : null,
          state: (details.record_status as string | undefined) ?? fallback,
          details,
          created_at: entry.createdAt.toISOString(),
          created_by: entry.createdBy,
        };
      }),
    });
  }),
);
