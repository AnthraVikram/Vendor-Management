import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { diffFields, recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { conflictingBookings } from '../../lib/overlap';
import { asyncRoute } from '../async-route';

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  client_name: z.string().trim().optional(),
  site_location: z.string().trim().optional(),
  description: z.string().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED']).optional(),
});

function presentProject(project: {
  id: string;
  name: string;
  clientName: string | null;
  siteLocation: string | null;
  description: string | null;
  status: string;
  archived: boolean;
}) {
  return {
    id: project.id,
    name: project.name,
    client_name: project.clientName,
    site_location: project.siteLocation,
    description: project.description,
    status: project.status,
    archived: project.archived,
  };
}

// The fields compared for a project EDITED entry (data-model.md).
const EDITED_FIELDS = ['name', 'client_name', 'site_location', 'description', 'status'];

function projectSnapshot(project: { name: string; clientName: string | null; siteLocation: string | null; description: string | null; status: string }) {
  return {
    name: project.name,
    client_name: project.clientName,
    site_location: project.siteLocation,
    description: project.description,
    status: project.status,
  };
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
});

export const projectRouter = Router();

projectRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const includeArchived = req.query.include_archived === 'true';
    // An optional status narrows the list for the dashboard project tiles (US4-6).
    const { status } = listQuerySchema.parse(req.query);
    const projects = await prisma.project.findMany({
      where: { ...(includeArchived ? {} : { archived: false }), ...(status ? { status } : {}) },
      orderBy: { name: 'asc' },
    });
    res.json(projects.map(presentProject));
  }),
);

projectRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = projectSchema.parse(req.body);
    const actor = req.staff!.id;
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: body.name,
          clientName: body.client_name,
          siteLocation: body.site_location,
          description: body.description,
          status: body.status ?? 'PLANNED',
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
          include: {
            vendor: { select: { id: true, name: true, archived: true } },
          },
        },
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
    res.json({
      ...presentProject(project),
      links: project.links.map((link) => ({
        id: link.id,
        vendor_id: link.vendor.id,
        vendor_name: link.vendor.name,
        vendor_archived: link.vendor.archived,
        role_on_project: link.roleOnProject,
        scope_of_work: link.scopeOfWork,
        note: link.note,
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
      const updated = await tx.project.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          clientName: body.client_name,
          siteLocation: body.site_location,
          description: body.description,
          status: body.status ?? before.status,
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
