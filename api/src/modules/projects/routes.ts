import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { diffFields, recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { fromDateColumn, indiaDateOf, toDateColumn, todayInIndia } from '../../lib/india-date';
import { conflictingBookings } from '../../lib/overlap';
import { asyncRoute } from '../async-route';
import { assignmentStatuses } from '../links/statuses';
import { itemInclude } from '../timeline/present';
import { hasItemDueWithinWeek, projectFigures, upcomingItems } from './figures';

const DATE_MESSAGE = 'Enter a date as YYYY-MM-DD.';
const ORDER_MESSAGE = 'The expected completion date cannot be before the start date.';

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Optional project dates (FR-014): absent leaves the stored date, null clears it.
const projectDate = z
  .string({ invalid_type_error: DATE_MESSAGE })
  .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)
  .refine(isCalendarDate, DATE_MESSAGE)
  .nullable()
  .optional();

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  client_name: z.string().trim().optional(),
  site_location: z.string().trim().optional(),
  description: z.string().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED']).optional(),
  start_date: projectDate,
  expected_completion_date: projectDate,
});

type ProjectRecord = {
  id: string;
  name: string;
  clientName: string | null;
  siteLocation: string | null;
  description: string | null;
  status: string;
  startDate: Date | null;
  expectedCompletionDate: Date | null;
  archived: boolean;
};

function dateOrNull(value: Date | null): string | null {
  return value ? fromDateColumn(value) : null;
}

function presentProject(project: ProjectRecord) {
  return {
    id: project.id,
    name: project.name,
    client_name: project.clientName,
    site_location: project.siteLocation,
    description: project.description,
    status: project.status,
    start_date: dateOrNull(project.startDate),
    expected_completion_date: dateOrNull(project.expectedCompletionDate),
    archived: project.archived,
  };
}

// The fields compared for a project EDITED entry (data-model.md).
const EDITED_FIELDS = ['name', 'client_name', 'site_location', 'description', 'status', 'start_date', 'expected_completion_date'];

function projectSnapshot(project: Omit<ProjectRecord, 'id' | 'archived'>) {
  return {
    name: project.name,
    client_name: project.clientName,
    site_location: project.siteLocation,
    description: project.description,
    status: project.status,
    start_date: dateOrNull(project.startDate),
    expected_completion_date: dateOrNull(project.expectedCompletionDate),
  };
}

// The date a body asks for: undefined keeps `stored`, null clears it (FR-014).
function effectiveDate(sent: string | null | undefined, stored: Date | null): string | null {
  return sent === undefined ? dateOrNull(stored) : sent;
}

function dateColumn(sent: string | null | undefined): Date | null | undefined {
  return sent === undefined || sent === null ? sent : toDateColumn(sent);
}

// FR-015a: checked against the effective dates, so changing one date is checked against the stored other.
function assertDateOrder(start: string | null, end: string | null): void {
  if (start !== null && end !== null && end < start) {
    throw new HttpError(400, 'Check the highlighted fields.', { fields: { start_date: ORDER_MESSAGE, expected_completion_date: ORDER_MESSAGE } });
  }
}

// Locks the project row and returns it, so a change and its history entry start from the same state.
async function lockProject(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id}::uuid FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id } });
  if (!project) throw new HttpError(404, 'Project not found.');
  return project;
}

async function setProjectArchived(id: string, archived: boolean, actor: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await lockProject(tx, id);
    const project = await tx.project.update({ where: { id }, data: { archived, ...stampUpdate(actor) } });
    if (existing.archived !== archived) {
      await recordHistory(tx, { target: { projectId: id }, action: archived ? 'ARCHIVED' : 'RESTORED', actorId: actor });
    }
    return project;
  });
}

const listQuerySchema = z.object({
  status: z.enum(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED']).optional(),
  q: z.string().trim().optional(),
  has_overdue: z.enum(['true'], { message: 'Use has_overdue=true or leave it out.' }).optional(),
  due_within_7: z.enum(['true'], { message: 'Use due_within_7=true or leave it out.' }).optional(),
});

export const projectRouter = Router();

projectRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const includeArchived = req.query.include_archived === 'true';
    // An optional status narrows the list for the dashboard project tiles (US4-6).
    const { status, q, has_overdue: hasOverdue, due_within_7: dueWithinWeek } = listQuerySchema.parse(req.query);
    const projects = await prisma.project.findMany({
      where: {
        ...(includeArchived ? {} : { archived: false }),
        ...(status ? { status } : {}),
        // Search name, client and site, ignoring letter case (FR-009).
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { clientName: { contains: q, mode: 'insensitive' as const } },
                { siteLocation: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        timelineItems: { where: { archived: false }, include: itemInclude },
        _count: { select: { links: { where: { removedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
    const today = todayInIndia();
    const rows = projects
      .map((project) => ({ project, figures: projectFigures(project, project.timelineItems, today) }))
      .filter(({ figures }) => !hasOverdue || figures.overdue_count > 0)
      .filter(({ project }) => !dueWithinWeek || hasItemDueWithinWeek(project.timelineItems, today));
    res.json(
      rows.map(({ project, figures }) => ({
        ...presentProject(project),
        vendor_count: project._count.links,
        progress: figures.progress,
        overdue_count: figures.overdue_count,
        next_deadline: figures.next_deadline,
        health: figures.health,
      })),
    );
  }),
);

projectRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = projectSchema.parse(req.body);
    assertDateOrder(body.start_date ?? null, body.expected_completion_date ?? null);
    const actor = req.staff!.id;
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: body.name,
          clientName: body.client_name,
          siteLocation: body.site_location,
          description: body.description,
          status: body.status ?? 'PLANNED',
          startDate: dateColumn(body.start_date),
          expectedCompletionDate: dateColumn(body.expected_completion_date),
          ...stampCreate(actor),
        },
      });
      await recordHistory(tx, { target: { projectId: created.id }, action: 'CREATED', actorId: actor });
      return created;
    });
    res.status(201).json(presentProject(project));
  }),
);

projectRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        links: {
          where: { removedAt: null },
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                archived: true,
                phone: true,
                contactPerson: true,
                categories: { include: { category: { select: { id: true, name: true } } } },
              },
            },
          },
        },
        timelineItems: { where: { archived: false }, include: itemInclude },
        schedules: {
          where: { archived: false },
          orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
    if (!project) throw new HttpError(404, 'Project not found.');
    const vendorIds = [...new Set(project.schedules.map((schedule) => schedule.vendorId))];
    const related = vendorIds.length
      ? await prisma.workSchedule.findMany({
          where: { vendorId: { in: vendorIds }, archived: false },
          include: { project: { select: { name: true } } },
        })
      : [];
    const today = todayInIndia();
    const figures = projectFigures(project, project.timelineItems, today);
    const [statusOf, past, completion] = await Promise.all([
      assignmentStatuses({ projectId: project.id }),
      // Removed assignments, kept as read-only past assignments (FR-013a). They have no status and are not counted.
      prisma.vendorProjectLink.findMany({
        where: { projectId: project.id, removedAt: { not: null } },
        include: { vendor: { select: { id: true, name: true, archived: true } }, removedBy: { select: { id: true, name: true } } },
        orderBy: [{ removedAt: 'desc' }, { id: 'desc' }],
      }),
      // FR-014a: no completion date is stored; it is when the status was last set to Completed, from history.
      project.status === 'COMPLETED'
        ? prisma.historyEntry.findFirst({
            where: { projectId: project.id, action: 'EDITED', changes: { path: ['status', 'to'], equals: 'COMPLETED' } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { createdAt: true },
          })
        : null,
    ]);
    res.json({
      ...presentProject(project),
      health: figures.health,
      progress: figures.progress,
      overdue_count: figures.overdue_count,
      after_completion_count: figures.after_completion_count,
      upcoming: upcomingItems(project.timelineItems, today),
      completed_on: completion ? indiaDateOf(completion.createdAt) : null,
      links: project.links.map((link) => ({
        assignment_status: statusOf(link.vendor.id, project.id),
        id: link.id,
        vendor_id: link.vendor.id,
        vendor_name: link.vendor.name,
        vendor_archived: link.vendor.archived,
        // Read from the vendor record on every request; nothing is copied onto the link (FR-007).
        vendor_phone: link.vendor.phone,
        vendor_contact_person: link.vendor.contactPerson,
        vendor_categories: link.vendor.categories.map((row) => ({ id: row.category.id, name: row.category.name })),
        role_on_project: link.roleOnProject,
        scope_of_work: link.scopeOfWork,
        note: link.note,
      })),
      past_links: past.map((link) => ({
        id: link.id,
        vendor_id: link.vendor.id,
        vendor_name: link.vendor.name,
        vendor_archived: link.vendor.archived,
        role_on_project: link.roleOnProject,
        scope_of_work: link.scopeOfWork,
        note: link.note,
        removed_at: link.removedAt!.toISOString(),
        removed_by: link.removedBy,
      })),
      schedules: project.schedules.map((schedule) => {
        const workDate = schedule.workDate.toISOString().slice(0, 10);
        const conflicts = conflictingBookings(
          {
            id: schedule.id,
            vendorId: schedule.vendorId,
            projectId: schedule.projectId,
            workDate,
            start: schedule.startTime,
            end: schedule.endTime,
            archived: false,
          },
          related.map((row) => ({
            id: row.id,
            vendorId: row.vendorId,
            projectId: row.projectId,
            workDate: row.workDate.toISOString().slice(0, 10),
            start: row.startTime,
            end: row.endTime,
            archived: row.archived,
          })),
        );
        return {
          id: schedule.id,
          vendor_id: schedule.vendorId,
          task: schedule.task,
          work_date: workDate,
          start_time: schedule.startTime,
          end_time: schedule.endTime,
          required_team_size: schedule.requiredTeamSize,
          pricing_mode: schedule.pricingMode,
          archived: schedule.archived,
          conflicts: conflicts.map((hit) => {
            const row = related.find((item) => item.id === hit.id)!;
            return { id: row.id, task: row.task, project_name: row.project.name };
          }),
        };
      }),
    });
  }),
);

projectRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Project not found.');
    const body = projectSchema.parse(req.body);
    const actor = req.staff!.id;
    const project = await prisma.$transaction(async (tx) => {
      const before = await lockProject(tx, existing.id);
      assertDateOrder(effectiveDate(body.start_date, before.startDate), effectiveDate(body.expected_completion_date, before.expectedCompletionDate));
      const updated = await tx.project.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          clientName: body.client_name,
          siteLocation: body.site_location,
          description: body.description,
          status: body.status ?? before.status,
          startDate: dateColumn(body.start_date),
          expectedCompletionDate: dateColumn(body.expected_completion_date),
          ...stampUpdate(actor),
        },
      });
      const changes = diffFields(projectSnapshot(before), projectSnapshot(updated), EDITED_FIELDS);
      if (Object.keys(changes).length > 0) {
        await recordHistory(tx, { target: { projectId: existing.id }, action: 'EDITED', actorId: actor, changes });
      }
      return updated;
    });
    res.json(presentProject(project));
  }),
);

projectRouter.post(
  '/:id/archive',
  asyncRoute(async (req, res) => {
    res.json(presentProject(await setProjectArchived(req.params.id, true, req.staff!.id)));
  }),
);

projectRouter.post(
  '/:id/restore',
  asyncRoute(async (req, res) => {
    res.json(presentProject(await setProjectArchived(req.params.id, false, req.staff!.id)));
  }),
);
