import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { HttpError } from '../../lib/http';
import { asyncRoute } from '../async-route';

const createSchema = z.object({
  vendor_id: z.string().uuid(),
  role_on_project: z.string().optional(),
  scope_of_work: z.string().optional(),
  note: z.string().optional(),
});

const patchSchema = z
  .object({
    role_on_project: z.string().nullable().optional(),
    scope_of_work: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

async function activePair(vendorId: string, projectId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!vendor || !project) throw new HttpError(404, 'Vendor or project not found.');
  if (vendor.archived || project.archived) {
    throw new HttpError(409, 'An archived vendor or project cannot receive a new link.', { code: 'ARCHIVED' });
  }
  return { vendor, project };
}

export const linkRouter = Router();

linkRouter.post(
  '/projects/:projectId/links',
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    await activePair(body.vendor_id, req.params.projectId);
    const existing = await prisma.vendorProjectLink.findUnique({
      where: { vendorId_projectId: { vendorId: body.vendor_id, projectId: req.params.projectId } },
    });
    if (existing) throw new HttpError(409, 'That vendor is already linked to this project.', { code: 'LINK_EXISTS' });
    const link = await prisma.vendorProjectLink.create({
      data: {
        vendorId: body.vendor_id,
        projectId: req.params.projectId,
        roleOnProject: body.role_on_project,
        scopeOfWork: body.scope_of_work,
        note: body.note,
        ...stampCreate(req.staff!.id),
      },
    });
    res.status(201).json({
      id: link.id,
      vendor_id: link.vendorId,
      project_id: link.projectId,
      role_on_project: link.roleOnProject,
      scope_of_work: link.scopeOfWork,
      note: link.note,
    });
  }),
);

linkRouter.patch(
  '/links/:id',
  asyncRoute(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const existing = await prisma.vendorProjectLink.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Link not found.');
    const link = await prisma.vendorProjectLink.update({
      where: { id: existing.id },
      data: {
        roleOnProject: body.role_on_project === undefined ? existing.roleOnProject : body.role_on_project,
        scopeOfWork: body.scope_of_work === undefined ? existing.scopeOfWork : body.scope_of_work,
        note: body.note === undefined ? existing.note : body.note,
        ...stampUpdate(req.staff!.id),
      },
    });
    res.json({
      id: link.id,
      vendor_id: link.vendorId,
      project_id: link.projectId,
      role_on_project: link.roleOnProject,
      scope_of_work: link.scopeOfWork,
      note: link.note,
    });
  }),
);

linkRouter.delete(
  '/links/:id',
  asyncRoute(async (req, res) => {
    const existing = await prisma.vendorProjectLink.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Link not found.');
    const actor = req.staff!.id;
    const archivedIds = await prisma.$transaction(async (tx) => {
      const schedules = await tx.workSchedule.findMany({
        where: { vendorId: existing.vendorId, projectId: existing.projectId, archived: false },
        select: { id: true },
      });
      if (schedules.length > 0) {
        await tx.workSchedule.updateMany({
          where: { id: { in: schedules.map((row) => row.id) } },
          data: { archived: true, updatedById: actor },
        });
      }
      await tx.vendorProjectLink.delete({ where: { id: existing.id } });
      return schedules.map((row) => row.id);
    });
    res.json({
      id: existing.id,
      vendor_id: existing.vendorId,
      project_id: existing.projectId,
      archived_schedule_ids: archivedIds,
    });
  }),
);
