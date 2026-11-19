import type { Prisma, StaffRole } from '@prisma/client';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { listedAdvanceWhere, verifiedAdvanceWhere } from '../../lib/finance-state';
import { HttpError } from '../../lib/http';
import { currentMonthInIndia, fromDateColumn, todayInIndia, toDateColumn } from '../../lib/india-date';
import { moneyString, parsePositiveAmount } from '../../lib/money';
import { ADVANCE_RECORDERS, ADVANCE_VIEWERS } from '../../lib/permissions';
import { asyncRoute } from '../async-route';
import { alreadyReversed, recordReceipt, reverseReceipt } from '../client-finance/receipts';

// Client advances (FR-017 to FR-022). Advances and reversals are only ever inserted: there is no
// update or delete route, and "reversed" is read from the existence of a reversal row.
// Feature 006: paths, roles and responses are unchanged; recording and reversing go through the shared receipt
// service, and the lists and totals count verified Advances only (FR-015, FR-049, research R1).

const idSchema = z.string().uuid('Not a valid id.');

const recordSchema = z.object({
  amount: z.string({ required_error: 'Amount is required.', invalid_type_error: 'Amount must be text such as "50000.00".' }),
  received_on: z
    .string({ required_error: 'Date received is required.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date received must be a date (YYYY-MM-DD).')
    .refine((value) => fromDateColumn(toDateColumn(value)) === value, 'Date received must be a real calendar date.')
    .refine((value) => value <= todayInIndia(), 'Date received cannot be later than today.'),
  payment_method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER']).nullable().optional(),
  reference: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  // Feature 006 additions, both optional: the overpayment confirmation (FR-036) and the repeat guard (research R13).
  confirm_overpayment: z.boolean().optional(),
  submission_id: z.string().uuid('The submission ID must be a UUID.').optional(),
});

const reverseSchema = z.object({
  reason: z.string({ required_error: 'A reason is required.' }).trim().min(1, 'A reason is required.'),
  // Only the full amount can be reversed (FR-020); a different amount is refused rather than ignored.
  amount: z.string().optional(),
});

const scopeSchema = z.object({
  scope: z.enum(['all', 'month'], { errorMap: () => ({ message: 'Scope must be "all" or "month".' }) }),
});

const advanceInclude = {
  createdBy: { select: { id: true, name: true } },
  reversal: { include: { createdBy: { select: { id: true, name: true } } } },
} satisfies Prisma.ClientAdvanceInclude;

type AdvanceRecord = Prisma.ClientAdvanceGetPayload<{ include: typeof advanceInclude }>;

function presentAdvance(advance: AdvanceRecord) {
  return {
    id: advance.id,
    amount: moneyString(advance.amount),
    received_on: fromDateColumn(advance.receivedOn),
    payment_method: advance.paymentMethod,
    reference: advance.reference,
    note: advance.note,
    created_at: advance.createdAt.toISOString(),
    created_by: advance.createdBy,
    reversal: advance.reversal
      ? {
          id: advance.reversal.id,
          amount: moneyString(advance.reversal.amount),
          reason: advance.reversal.reason,
          created_at: advance.reversal.createdAt.toISOString(),
          created_by: advance.reversal.createdBy,
        }
      : null,
  };
}

function assertRole(req: Request, roles: StaffRole[]): void {
  if (!roles.includes(req.staff!.role)) {
    throw new HttpError(403, 'Only an Administrator or an Accountant can record or reverse a client advance.', { code: 'ROLE_NOT_ALLOWED' });
  }
}

function blankToNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

async function loadAdvance(id: string): Promise<AdvanceRecord> {
  const advance = await prisma.clientAdvance.findUnique({ where: { id }, include: advanceInclude });
  if (!advance) throw new HttpError(404, 'Client advance not found.');
  return advance;
}

export const clientAdvanceRouter = Router();

// The standing advances behind a dashboard money tile, on every project, archived included (US4-6).
clientAdvanceRouter.get(
  '/client-advances',
  asyncRoute(async (req, res) => {
    assertRole(req, ADVANCE_VIEWERS);
    const { scope } = scopeSchema.parse(req.query);
    const month = currentMonthInIndia();
    const advances = await prisma.clientAdvance.findMany({
      where: {
        ...verifiedAdvanceWhere,
        ...(scope === 'month' ? { receivedOn: { gte: toDateColumn(month.start), lt: toDateColumn(month.end) } } : {}),
      },
      include: { ...advanceInclude, project: { select: { id: true, name: true, clientName: true, archived: true } } },
      orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(
      advances.map((advance) => ({
        ...presentAdvance(advance),
        project: { id: advance.project.id, name: advance.project.name, client_name: advance.project.clientName, archived: advance.project.archived },
      })),
    );
  }),
);

clientAdvanceRouter.get(
  '/projects/:id/client-advances',
  asyncRoute(async (req, res) => {
    assertRole(req, ADVANCE_VIEWERS);
    const projectId = idSchema.parse(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new HttpError(404, 'Project not found.');
    const [advances, standing] = await Promise.all([
      prisma.clientAdvance.findMany({
        where: { projectId, ...listedAdvanceWhere },
        include: advanceInclude,
        orderBy: [{ receivedOn: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.clientAdvance.aggregate({ where: { projectId, ...verifiedAdvanceWhere }, _sum: { amount: true } }),
    ]);
    res.json({
      project: { id: project.id, name: project.name, client_name: project.clientName, archived: project.archived },
      net_amount: moneyString(standing._sum.amount ?? 0),
      advances: advances.map(presentAdvance),
    });
  }),
);

clientAdvanceRouter.post(
  '/projects/:id/client-advances',
  asyncRoute(async (req, res) => {
    assertRole(req, ADVANCE_RECORDERS);
    const projectId = idSchema.parse(req.params.id);
    const body = recordSchema.parse(req.body);
    const amount = parsePositiveAmount(body.amount);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new HttpError(404, 'Project not found.');
    if (project.archived) {
      throw new HttpError(409, 'This project is archived. Restore it before recording an advance.', { code: 'PROJECT_ARCHIVED' });
    }
    const created = await recordReceipt(
      req.staff!,
      projectId,
      {
        receiptType: 'ADVANCE',
        amount,
        receivedOn: body.received_on,
        paymentMethod: body.payment_method ?? null,
        reference: blankToNull(body.reference),
        note: blankToNull(body.note),
        confirmOverpayment: body.confirm_overpayment,
        submissionId: body.submission_id ?? null,
      },
      'CLIENT_ADVANCES',
    );
    res.status(201).json(presentAdvance(await loadAdvance(created.id)));
  }),
);

clientAdvanceRouter.post(
  '/client-advances/:id/reversal',
  asyncRoute(async (req, res) => {
    assertRole(req, ADVANCE_RECORDERS);
    const advanceId = idSchema.parse(req.params.id);
    const body = reverseSchema.parse(req.body);
    const advance = await loadAdvance(advanceId);
    if (advance.reversal) throw alreadyReversed();
    const offered = body.amount?.trim();
    if (offered !== undefined && (!/^\d+(\.\d{1,2})?$/.test(offered) || moneyString(offered) !== moneyString(advance.amount))) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { amount: 'Only the full amount can be reversed.' } });
    }
    // Allowed on an archived project, so a wrong entry can still be corrected (FR-020).
    await reverseReceipt(req.staff!, advance.id, body.reason);
    res.status(201).json(presentAdvance(await loadAdvance(advance.id)));
  }),
);
