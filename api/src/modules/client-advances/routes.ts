import { Prisma } from '@prisma/client';
import type { StaffRole } from '@prisma/client';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate } from '../../lib/audit';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { fromDateColumn, todayInIndia, toDateColumn } from '../../lib/india-date';
import { moneyString, parsePositiveAmount } from '../../lib/money';
import { ADVANCE_RECORDERS, ADVANCE_VIEWERS } from '../../lib/permissions';
import { asyncRoute } from '../async-route';

// Client advances (FR-017 to FR-022). Advances and reversals are only ever inserted: there is no
// update or delete route, and "reversed" is read from the existence of a reversal row.

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
});

const reverseSchema = z.object({
  reason: z.string({ required_error: 'A reason is required.' }).trim().min(1, 'A reason is required.'),
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

function alreadyReversed(): HttpError {
  return new HttpError(409, 'This advance has already been reversed.', { code: 'ALREADY_REVERSED' });
}

async function loadAdvance(id: string): Promise<AdvanceRecord> {
  const advance = await prisma.clientAdvance.findUnique({ where: { id }, include: advanceInclude });
  if (!advance) throw new HttpError(404, 'Client advance not found.');
  return advance;
}

export const clientAdvanceRouter = Router();

clientAdvanceRouter.get(
  '/projects/:id/client-advances',
  asyncRoute(async (req, res) => {
    assertRole(req, ADVANCE_VIEWERS);
    const projectId = idSchema.parse(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new HttpError(404, 'Project not found.');
    const [advances, standing] = await Promise.all([
      prisma.clientAdvance.findMany({
        where: { projectId },
        include: advanceInclude,
        orderBy: [{ receivedOn: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.clientAdvance.aggregate({ where: { projectId, reversal: { is: null } }, _sum: { amount: true } }),
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
    const actor = req.staff!.id;
    const created = await prisma.$transaction(async (tx) => {
      const advance = await tx.clientAdvance.create({
        data: {
          projectId,
          amount,
          receivedOn: toDateColumn(body.received_on),
          paymentMethod: body.payment_method ?? null,
          reference: blankToNull(body.reference),
          note: blankToNull(body.note),
          ...stampCreate(actor),
        },
      });
      await recordHistory(tx, {
        target: { clientAdvanceId: advance.id },
        action: 'CREATED',
        actorId: actor,
        details: { amount, received_on: body.received_on },
      });
      return advance;
    });
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
    const actor = req.staff!.id;
    const amount = moneyString(advance.amount);
    try {
      // Allowed on an archived project, so a wrong entry can still be corrected (FR-020).
      await prisma.$transaction(async (tx) => {
        await tx.clientAdvanceReversal.create({
          data: { clientAdvanceId: advance.id, amount: advance.amount, reason: body.reason, ...stampCreate(actor) },
        });
        await recordHistory(tx, {
          target: { clientAdvanceId: advance.id },
          action: 'REVERSED',
          actorId: actor,
          details: { amount, reason: body.reason },
        });
      });
    } catch (error) {
      // The unique client_advance_id lets only one of two simultaneous reversals through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw alreadyReversed();
      throw error;
    }
    res.status(201).json(presentAdvance(await loadAdvance(advance.id)));
  }),
);
