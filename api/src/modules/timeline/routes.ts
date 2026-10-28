import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, ResponsibleKind } from '@prisma/client';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { HttpError } from '../../lib/http';
import { fromDateColumn, toDateColumn } from '../../lib/india-date';
import {
  assertItemWritable,
  assertProjectWritable,
  checkPlannedDate,
  checkResponsibleShape,
} from '../../lib/timeline-rules';
import { asyncRoute } from '../async-route';
import {
  delayInclude,
  issueInclude,
  itemDetailInclude,
  itemInclude,
  newestFirst,
  presentDateChange,
  presentDelay,
  presentIssue,
  presentItem,
  presentProgressUpdate,
  presentResponsibleChange,
} from './present';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateField(label: string) {
  return z
    .string({ required_error: `${label} is required.`, invalid_type_error: `${label} must be a date.` })
    .regex(DATE_PATTERN, `${label} must be a date (YYYY-MM-DD).`)
    .refine(isCalendarDate, `${label} must be a real calendar date.`);
}

const responsibleSchema = z
  .object({
    kind: z.enum(['NONE', 'VENDOR', 'FIRM_TEAM'], {
      errorMap: () => ({ message: 'Choose No responsible party, Firm team, or a vendor.' }),
    }),
    vendor_id: z.string().uuid('Choose a vendor.').nullable().optional(),
  })
  .strict();

const itemFields = {
  item_type: z.enum(['MILESTONE', 'ACTIVITY'], {
    errorMap: (_issue, ctx) => ({
      message: ctx.data === undefined ? 'Type is required.' : 'Type must be Milestone or Activity.',
    }),
  }),
  name: z.string({ required_error: 'Name is required.' }).trim().min(1, 'Name is required.'),
  description: z.string().nullable().optional(),
  planned_date: dateField('Planned date').nullable().optional(),
  deadline: dateField('Deadline'),
  responsible: responsibleSchema.optional(),
};

const createSchema = z.object(itemFields).strict();
const patchSchema = z.object(itemFields).partial().strict();

type ResponsibleInput = z.infer<typeof responsibleSchema>;

const optionalItemId = z.string().uuid('Choose a timeline item from this project.').nullable().optional();

const delaySchema = z
  .object({
    reason: z.string({ required_error: 'Reason is required.' }).trim().min(1, 'Reason is required.'),
    timeline_item_id: optionalItemId,
  })
  .strict();

const issueSchema = z
  .object({
    description: z.string({ required_error: 'Description is required.' }).trim().min(1, 'Description is required.'),
    timeline_item_id: optionalItemId,
    vendor_ids: z.array(z.string().uuid('Choose vendors linked to this project.')).optional(),
  })
  .strict();

const progressSchema = z
  .object({
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE'], {
      errorMap: (_issue, ctx) => ({
        message: ctx.data === undefined ? 'Status is required.' : 'Status must be Not started, In progress, or Done.',
      }),
    }),
    note: z.string().trim().optional(),
  })
  .strict();

function issueFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function validDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && DATE_PATTERN.test(value) && isCalendarDate(value) ? value : undefined;
}

function rejectIfAny(fields: Record<string, string>): void {
  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'Check the highlighted fields.', { fields });
  }
}

function parseItem<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  current?: { plannedDate: string | null; deadline: string },
): z.infer<T> {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const result = schema.safeParse(raw);
  const fields = result.success ? {} : issueFields(result.error);
  const planned = 'planned_date' in raw ? validDate(raw.planned_date) : current?.plannedDate;
  const deadline = 'deadline' in raw ? validDate(raw.deadline) : current?.deadline;
  Object.assign(fields, { ...checkPlannedDate(planned, deadline), ...fields });
  const responsible = raw.responsible as ResponsibleInput | undefined;
  if (responsible && typeof responsible === 'object' && ['NONE', 'VENDOR', 'FIRM_TEAM'].includes(responsible.kind)) {
    Object.assign(fields, { ...checkResponsibleShape(responsible), ...fields });
  }
  rejectIfAny(fields);
  return (result as { data: z.infer<T> }).data;
}

async function loadProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, 'Project not found.');
  return project;
}

async function loadItem(itemId: string) {
  const item = await prisma.timelineItem.findUnique({ where: { id: itemId }, include: { project: true } });
  if (!item) throw new HttpError(404, 'Timeline item not found.');
  return item;
}

async function assertVendorCanBeResponsible(projectId: string, vendorId: string): Promise<void> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new HttpError(404, 'Vendor not found.');
  if (vendor.archived) {
    throw new HttpError(409, 'That vendor is archived and cannot be named as responsible.', { code: 'VENDOR_ARCHIVED' });
  }
  const link = await prisma.vendorProjectLink.findUnique({ where: { vendorId_projectId: { vendorId, projectId } } });
  if (!link) {
    throw new HttpError(409, 'That vendor is not linked to this project.', { code: 'VENDOR_NOT_LINKED' });
  }
}

async function attachableItemId(projectId: string, itemId: string | null | undefined): Promise<string | null> {
  if (!itemId) return null;
  const item = await prisma.timelineItem.findUnique({ where: { id: itemId } });
  if (!item) throw new HttpError(404, 'Timeline item not found.');
  if (item.projectId !== projectId) {
    throw new HttpError(409, 'That timeline item belongs to another project.', { code: 'ITEM_NOT_ON_PROJECT' });
  }
  assertItemWritable(item);
  return item.id;
}

async function assertVendorsLinked(projectId: string, vendorIds: string[]): Promise<void> {
  if (vendorIds.length === 0) return;
  const links = await prisma.vendorProjectLink.findMany({
    where: { projectId, vendorId: { in: vendorIds } },
    select: { vendorId: true },
  });
  const linked = new Set(links.map((link) => link.vendorId));
  const missing = vendorIds.filter((id) => !linked.has(id));
  if (missing.length > 0) {
    throw new HttpError(409, 'Every named vendor must be linked to this project.', {
      code: 'VENDOR_NOT_LINKED',
      extra: { vendor_ids: missing },
    });
  }
}

function responsibleColumns(responsible: ResponsibleInput | undefined): {
  responsibleKind: ResponsibleKind;
  responsibleVendorId: string | null;
} {
  const kind = responsible?.kind ?? 'NONE';
  return { responsibleKind: kind, responsibleVendorId: kind === 'VENDOR' ? (responsible?.vendor_id ?? null) : null };
}

async function presentItemById(itemId: string) {
  const item = await prisma.timelineItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
  return presentItem(item);
}

export const timelineRouter = Router();

timelineRouter.get(
  '/projects/:projectId/timeline',
  asyncRoute(async (req, res) => {
    const project = await loadProject(req.params.projectId);
    const items = await prisma.timelineItem.findMany({
      where: { projectId: project.id },
      include: itemInclude,
      orderBy: [{ deadline: 'asc' }, { name: 'asc' }],
    });
    res.json({
      project: { id: project.id, name: project.name, archived: project.archived },
      items: items.filter((item) => !item.archived).map(presentItem),
      archived_items: items.filter((item) => item.archived).map(presentItem),
      delays: (
        await prisma.delay.findMany({ where: { projectId: project.id }, include: delayInclude, orderBy: [...newestFirst] })
      ).map(presentDelay),
      coordination_issues: (
        await prisma.coordinationIssue.findMany({ where: { projectId: project.id }, include: issueInclude, orderBy: [...newestFirst] })
      ).map(presentIssue),
    });
  }),
);

timelineRouter.post(
  '/projects/:projectId/timeline-items',
  asyncRoute(async (req, res) => {
    const project = await loadProject(req.params.projectId);
    assertProjectWritable(project);
    const body = parseItem(createSchema, req.body);
    const responsible = responsibleColumns(body.responsible);
    if (responsible.responsibleVendorId) {
      await assertVendorCanBeResponsible(project.id, responsible.responsibleVendorId);
    }
    const item = await prisma.timelineItem.create({
      data: {
        projectId: project.id,
        itemType: body.item_type,
        name: body.name,
        description: body.description ?? null,
        plannedDate: body.planned_date ? toDateColumn(body.planned_date) : null,
        deadline: toDateColumn(body.deadline),
        ...responsible,
        ...stampCreate(req.staff!.id),
      },
      include: itemInclude,
    });
    res.status(201).json(presentItem(item));
  }),
);

timelineRouter.get(
  '/timeline-items/:id',
  asyncRoute(async (req, res) => {
    const found = await prisma.timelineItem.findUnique({ where: { id: req.params.id }, include: itemDetailInclude });
    if (!found) throw new HttpError(404, 'Timeline item not found.');
    res.json({
      ...presentItem(found),
      progress_updates: found.progressUpdates.map(presentProgressUpdate),
      date_changes: found.dateChanges.map(presentDateChange),
      responsible_changes: found.responsibleChanges.map(presentResponsibleChange),
      delays: (
        await prisma.delay.findMany({ where: { timelineItemId: found.id }, include: delayInclude, orderBy: [...newestFirst] })
      ).map(presentDelay),
      coordination_issues: (
        await prisma.coordinationIssue.findMany({ where: { timelineItemId: found.id }, include: issueInclude, orderBy: [...newestFirst] })
      ).map(presentIssue),
    });
  }),
);

timelineRouter.patch(
  '/timeline-items/:id',
  asyncRoute(async (req, res) => {
    const existing = await loadItem(req.params.id);
    assertProjectWritable(existing.project);
    assertItemWritable(existing);
    const currentPlanned = existing.plannedDate ? fromDateColumn(existing.plannedDate) : null;
    const currentDeadline = fromDateColumn(existing.deadline);
    const body = parseItem(patchSchema, req.body, { plannedDate: currentPlanned, deadline: currentDeadline });

    const actor = req.staff!.id;
    const data: Prisma.TimelineItemUncheckedUpdateInput = { ...stampUpdate(actor) };
    const dateChanges: Prisma.TimelineDateChangeCreateManyInput[] = [];
    if (body.item_type !== undefined) data.itemType = body.item_type;
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.planned_date !== undefined && body.planned_date !== currentPlanned) {
      data.plannedDate = body.planned_date ? toDateColumn(body.planned_date) : null;
      dateChanges.push({
        timelineItemId: existing.id,
        field: 'PLANNED_DATE',
        oldValue: existing.plannedDate,
        newValue: body.planned_date ? toDateColumn(body.planned_date) : null,
        ...stampCreate(actor),
      });
    }
    if (body.deadline !== undefined && body.deadline !== currentDeadline) {
      data.deadline = toDateColumn(body.deadline);
      dateChanges.push({
        timelineItemId: existing.id,
        field: 'DEADLINE',
        oldValue: existing.deadline,
        newValue: toDateColumn(body.deadline),
        ...stampCreate(actor),
      });
    }
    let responsibleChange: Prisma.TimelineResponsibleChangeUncheckedCreateInput | null = null;
    if (body.responsible !== undefined) {
      const next = responsibleColumns(body.responsible);
      const changed =
        next.responsibleKind !== existing.responsibleKind || next.responsibleVendorId !== existing.responsibleVendorId;
      if (changed) {
        if (next.responsibleVendorId) await assertVendorCanBeResponsible(existing.projectId, next.responsibleVendorId);
        Object.assign(data, next);
        responsibleChange = {
          timelineItemId: existing.id,
          oldKind: existing.responsibleKind,
          oldVendorId: existing.responsibleVendorId,
          newKind: next.responsibleKind,
          newVendorId: next.responsibleVendorId,
          cause: 'EDIT',
          ...stampCreate(actor),
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.timelineItem.update({ where: { id: existing.id }, data });
      if (dateChanges.length > 0) await tx.timelineDateChange.createMany({ data: dateChanges });
      if (responsibleChange) await tx.timelineResponsibleChange.create({ data: responsibleChange });
    });
    res.json(await presentItemById(existing.id));
  }),
);

for (const [action, archived] of [
  ['archive', true],
  ['restore', false],
] as const) {
  timelineRouter.post(
    `/timeline-items/:id/${action}`,
    asyncRoute(async (req, res) => {
      const existing = await loadItem(req.params.id);
      assertProjectWritable(existing.project);
      await prisma.timelineItem.update({
        where: { id: existing.id },
        data: { archived, ...stampUpdate(req.staff!.id) },
      });
      res.json(await presentItemById(existing.id));
    }),
  );
}

timelineRouter.post(
  '/timeline-items/:id/progress-updates',
  asyncRoute(async (req, res) => {
    const existing = await loadItem(req.params.id);
    assertProjectWritable(existing.project);
    assertItemWritable(existing);
    const body = progressSchema.parse(req.body);
    await prisma.timelineProgressUpdate.create({
      data: {
        timelineItemId: existing.id,
        status: body.status,
        note: body.note || null,
        ...stampCreate(req.staff!.id),
      },
    });
    res.status(201).json(await presentItemById(existing.id));
  }),
);

timelineRouter.post(
  '/projects/:projectId/delays',
  asyncRoute(async (req, res) => {
    const project = await loadProject(req.params.projectId);
    assertProjectWritable(project);
    const body = delaySchema.parse(req.body);
    const timelineItemId = await attachableItemId(project.id, body.timeline_item_id);
    const delay = await prisma.delay.create({
      data: { projectId: project.id, timelineItemId, reason: body.reason, ...stampCreate(req.staff!.id) },
      include: delayInclude,
    });
    res.status(201).json(presentDelay(delay));
  }),
);

timelineRouter.post(
  '/projects/:projectId/coordination-issues',
  asyncRoute(async (req, res) => {
    const project = await loadProject(req.params.projectId);
    assertProjectWritable(project);
    const body = issueSchema.parse(req.body);
    const timelineItemId = await attachableItemId(project.id, body.timeline_item_id);
    const vendorIds = [...new Set(body.vendor_ids ?? [])];
    await assertVendorsLinked(project.id, vendorIds);
    const actor = req.staff!.id;
    const issue = await prisma.coordinationIssue.create({
      data: {
        projectId: project.id,
        timelineItemId,
        description: body.description,
        ...stampCreate(actor),
        vendors: { create: vendorIds.map((vendorId) => ({ vendorId, ...stampCreate(actor) })) },
      },
      include: issueInclude,
    });
    res.status(201).json(presentIssue(issue));
  }),
);
