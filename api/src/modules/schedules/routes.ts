import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { HttpError } from '../../lib/http';
import { moneyString } from '../../lib/money';
import { conflictingBookings, timeProblem, type Booking } from '../../lib/overlap';
import { planFixedPrice, type StoredPrice } from '../../lib/price';
import { asyncRoute } from '../async-route';

const scheduleSchema = z.object({
  vendor_id: z.string().uuid(),
  task: z.string().trim().min(1, 'Task is required.'),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required.'),
  start_time: z.string(),
  end_time: z.string(),
  required_team_size: z.number().int().min(1, 'Required team size must be a whole number of 1 or greater.'),
});

const patchSchema = scheduleSchema.omit({ vendor_id: true });
const priceSchema = z.object({ amount: z.string() });

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function asDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function presentSchedule(id: string) {
  const schedule = await prisma.workSchedule.findUnique({
    where: { id },
    include: {
      prices: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      files: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!schedule) throw new HttpError(404, 'Schedule not found.');
  const prices = schedule.prices.map((entry) => ({
    id: entry.id,
    amount: moneyString(entry.amount),
    kind: entry.kind,
    reverses_entry_id: entry.reversesEntryId,
    created_at: entry.createdAt.toISOString(),
    author: entry.createdBy,
  }));
  const files = schedule.files.map((file) => ({
    id: file.id,
    original_filename: file.originalFilename,
    media_type: file.mediaType,
    byte_size: file.byteSize,
    archived: file.archived,
    created_at: file.createdAt.toISOString(),
    author: file.createdBy,
  }));
  const open = [...schedule.prices].reverse().find((entry) => entry.kind === 'CHARGE' && !schedule.prices.some((other) => other.reversesEntryId === entry.id));
  return {
    id: schedule.id,
    vendor_id: schedule.vendorId,
    project_id: schedule.projectId,
    task: schedule.task,
    work_date: asDate(schedule.workDate),
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    required_team_size: schedule.requiredTeamSize,
    pricing_mode: schedule.pricingMode,
    archived: schedule.archived,
    current_price: open
      ? { id: open.id, amount: moneyString(open.amount), created_at: open.createdAt.toISOString() }
      : null,
    price_history: prices,
    current_file: files.find((file) => !file.archived) ?? null,
    file_history: files,
  };
}

async function conflictsFor(candidate: Booking) {
  const rows = await prisma.workSchedule.findMany({
    where: { vendorId: candidate.vendorId, workDate: dateOnly(candidate.workDate), archived: false },
    include: { project: { select: { name: true } } },
  });
  const hits = conflictingBookings(
    candidate,
    rows.map((row) => ({
      id: row.id,
      vendorId: row.vendorId,
      projectId: row.projectId,
      workDate: asDate(row.workDate),
      start: row.startTime,
      end: row.endTime,
      archived: row.archived,
    })),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return hits.map((hit) => {
    const row = byId.get(hit.id)!;
    return {
      id: row.id,
      project_id: row.projectId,
      project_name: row.project.name,
      task: row.task,
      start_time: row.startTime,
      end_time: row.endTime,
    };
  });
}

async function requireLinked(vendorId: string, projectId: string) {
  const link = await prisma.vendorProjectLink.findUnique({
    where: { vendorId_projectId: { vendorId, projectId } },
    include: { vendor: true, project: true },
  });
  if (!link) throw new HttpError(409, 'The vendor is not linked to this project.', { code: 'NOT_LINKED' });
  if (link.vendor.archived || link.project.archived) {
    throw new HttpError(409, 'The vendor or the project is archived.', { code: 'ARCHIVED' });
  }
}

export const scheduleRouter = Router();

scheduleRouter.post(
  '/projects/:projectId/schedules',
  asyncRoute(async (req, res) => {
    const body = scheduleSchema.parse(req.body);
    const problem = timeProblem(body.start_time, body.end_time);
    if (problem) throw new HttpError(400, 'Check the highlighted fields.', { fields: { end_time: problem } });
    await requireLinked(body.vendor_id, req.params.projectId);
    const id = randomUUID();
    const conflicts = await conflictsFor({
      id,
      vendorId: body.vendor_id,
      projectId: req.params.projectId,
      workDate: body.work_date,
      start: body.start_time,
      end: body.end_time,
      archived: false,
    });
    await prisma.workSchedule.create({
      data: {
        id,
        vendorId: body.vendor_id,
        projectId: req.params.projectId,
        task: body.task,
        workDate: dateOnly(body.work_date),
        startTime: body.start_time,
        endTime: body.end_time,
        requiredTeamSize: body.required_team_size,
        ...stampCreate(req.staff!.id),
      },
    });
    const schedule = await presentSchedule(id);
    res.status(201).json({ ...schedule, conflicts });
  }),
);

scheduleRouter.get(
  '/schedules/:id',
  asyncRoute(async (req, res) => {
    res.json(await presentSchedule(req.params.id));
  }),
);

scheduleRouter.patch(
  '/schedules/:id',
  asyncRoute(async (req, res) => {
    const existing = await prisma.workSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Schedule not found.');
    const body = patchSchema.parse(req.body);
    const problem = timeProblem(body.start_time, body.end_time);
    if (problem) throw new HttpError(400, 'Check the highlighted fields.', { fields: { end_time: problem } });
    await requireLinked(existing.vendorId, existing.projectId);
    const conflicts = await conflictsFor({
      id: existing.id,
      vendorId: existing.vendorId,
      projectId: existing.projectId,
      workDate: body.work_date,
      start: body.start_time,
      end: body.end_time,
      archived: false,
    });
    await prisma.workSchedule.update({
      where: { id: existing.id },
      data: {
        task: body.task,
        workDate: dateOnly(body.work_date),
        startTime: body.start_time,
        endTime: body.end_time,
        requiredTeamSize: body.required_team_size,
        ...stampUpdate(req.staff!.id),
      },
    });
    res.json({ ...(await presentSchedule(existing.id)), conflicts });
  }),
);

scheduleRouter.post(
  '/schedules/:id/archive',
  asyncRoute(async (req, res) => {
    const existing = await prisma.workSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Schedule not found.');
    await prisma.workSchedule.update({
      where: { id: existing.id },
      data: { archived: true, ...stampUpdate(req.staff!.id) },
    });
    res.json(await presentSchedule(existing.id));
  }),
);

scheduleRouter.put(
  '/schedules/:id/price',
  asyncRoute(async (req, res) => {
    const body = priceSchema.parse(req.body);
    const actor = req.staff!.id;
    await prisma.$transaction(async (tx) => {
      const schedule = await tx.workSchedule.findUnique({
        where: { id: req.params.id },
        include: { prices: { orderBy: { createdAt: 'asc' } } },
      });
      if (!schedule) throw new HttpError(404, 'Schedule not found.');
      const stored: StoredPrice[] = schedule.prices.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        amount: moneyString(entry.amount),
        reversesEntryId: entry.reversesEntryId,
      }));
      const plan = planFixedPrice(schedule.pricingMode, stored, body.amount);
      if (plan.reversal) {
        await tx.taskPriceEntry.create({
          data: {
            scheduleId: schedule.id,
            amount: plan.reversal.amount,
            kind: 'REVERSAL',
            reversesEntryId: plan.reversal.reversesEntryId,
            ...stampCreate(actor),
          },
        });
      }
      await tx.taskPriceEntry.create({
        data: {
          scheduleId: schedule.id,
          amount: plan.chargeAmount,
          kind: 'CHARGE',
          ...stampCreate(actor),
        },
      });
      await tx.workSchedule.update({
        where: { id: schedule.id },
        data: { pricingMode: 'FIXED', ...stampUpdate(actor) },
      });
    });
    res.json(await presentSchedule(req.params.id));
  }),
);
