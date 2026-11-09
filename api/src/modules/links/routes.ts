import { Prisma, type HistoryAction } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { diffFields, recordHistory } from '../../lib/history';
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

// The fields compared for an ASSIGNMENT_EDITED entry (data-model.md).
const EDITED_FIELDS = ['role_on_project', 'scope_of_work', 'note'];

type LinkRow = { id: string; vendorId: string; projectId: string; roleOnProject: string | null; scopeOfWork: string | null; note: string | null };
type Named = { id: string; name: string };

function linkExists(): HttpError {
  return new HttpError(409, 'That vendor is already linked to this project.', { code: 'LINK_EXISTS' });
}

function snapshot(link: LinkRow) {
  return { role_on_project: link.roleOnProject, scope_of_work: link.scopeOfWork, note: link.note };
}

function presentLink(link: LinkRow) {
  return { id: link.id, vendor_id: link.vendorId, project_id: link.projectId, ...snapshot(link) };
}

async function activePair(vendorId: string, projectId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!vendor || !project) throw new HttpError(404, 'Vendor or project not found.');
  if (vendor.archived || project.archived) {
    throw new HttpError(409, 'An archived vendor or project cannot receive a new link.', { code: 'ARCHIVED' });
  }
  return { vendor, project };
}

// Locks the assignment row, so concurrent edits and removals of one assignment run one at a time.
async function lockLink(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM vendor_project_links WHERE id = ${id}::uuid FOR UPDATE`;
  const link = await tx.vendorProjectLink.findUnique({
    where: { id },
    include: { vendor: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
  });
  if (!link) throw new HttpError(404, 'Link not found.');
  return link;
}

// One entry on the vendor and one on the project, since a history entry has exactly one target (FR-013d).
async function recordOnBoth(
  tx: Prisma.TransactionClient,
  entry: { action: HistoryAction; actorId: string; vendor: Named; project: Named; assignmentId: string; changes?: Record<string, unknown>; extra?: Record<string, unknown> },
) {
  const details = { assignment_id: entry.assignmentId, vendor: entry.vendor, project: entry.project, ...entry.extra };
  for (const target of [{ vendorId: entry.vendor.id }, { projectId: entry.project.id }]) {
    await recordHistory(tx, { target, action: entry.action, actorId: entry.actorId, changes: entry.changes, details });
  }
}

export const linkRouter = Router();

linkRouter.post(
  '/projects/:projectId/links',
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { vendor, project } = await activePair(body.vendor_id, req.params.projectId);
    const actor = req.staff!.id;
    const link = await prisma
      .$transaction(async (tx) => {
        // A past assignment does not block a new one; only a current assignment for the pair does (FR-013b).
        const existing = await tx.vendorProjectLink.findFirst({ where: { vendorId: vendor.id, projectId: project.id, removedAt: null } });
        if (existing) throw linkExists();
        const created = await tx.vendorProjectLink.create({
          data: {
            vendorId: vendor.id,
            projectId: project.id,
            roleOnProject: body.role_on_project,
            scopeOfWork: body.scope_of_work,
            note: body.note,
            ...stampCreate(actor),
          },
        });
        await recordOnBoth(tx, {
          action: 'ASSIGNED',
          actorId: actor,
          vendor: { id: vendor.id, name: vendor.name },
          project: { id: project.id, name: project.name },
          assignmentId: created.id,
          extra: snapshot(created),
        });
        return created;
      })
      .catch((error: unknown) => {
        // A parallel request won the race for vendor_project_links_current_key.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw linkExists();
        throw error;
      });
    res.status(201).json(presentLink(link));
  }),
);

linkRouter.patch(
  '/links/:id',
  asyncRoute(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const actor = req.staff!.id;
    const link = await prisma.$transaction(async (tx) => {
      const existing = await lockLink(tx, req.params.id);
      if (existing.removedAt) {
        throw new HttpError(409, 'This vendor was removed from the project. A past assignment cannot be changed.', { code: 'ASSIGNMENT_REMOVED' });
      }
      const updated = await tx.vendorProjectLink.update({
        where: { id: existing.id },
        data: {
          roleOnProject: body.role_on_project === undefined ? existing.roleOnProject : body.role_on_project,
          scopeOfWork: body.scope_of_work === undefined ? existing.scopeOfWork : body.scope_of_work,
          note: body.note === undefined ? existing.note : body.note,
          ...stampUpdate(actor),
        },
      });
      const changes = diffFields(snapshot(existing), snapshot(updated), EDITED_FIELDS);
      if (Object.keys(changes).length > 0) {
        await recordOnBoth(tx, { action: 'ASSIGNMENT_EDITED', actorId: actor, vendor: existing.vendor, project: existing.project, assignmentId: existing.id, changes });
      }
      return updated;
    });
    res.json(presentLink(link));
  }),
);

// Removing a vendor from a project keeps the assignment as a read-only past assignment (FR-013); it is never deleted.
linkRouter.delete(
  '/links/:id',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const result = await prisma.$transaction(async (tx) => {
      const existing = await lockLink(tx, req.params.id);
      if (existing.removedAt) {
        throw new HttpError(409, 'This vendor has already been removed from the project.', { code: 'ALREADY_REMOVED' });
      }
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
      // Feature 002 FR-005: clear the vendor as responsible party, even on an archived project.
      const items = await tx.timelineItem.findMany({
        where: { projectId: existing.projectId, responsibleVendorId: existing.vendorId },
        select: { id: true },
      });
      if (items.length > 0) {
        await tx.timelineItem.updateMany({
          where: { id: { in: items.map((row) => row.id) } },
          data: { responsibleKind: 'NONE', responsibleVendorId: null, updatedById: actor },
        });
        await tx.timelineResponsibleChange.createMany({
          data: items.map((row) => ({
            timelineItemId: row.id,
            oldKind: 'VENDOR' as const,
            oldVendorId: existing.vendorId,
            newKind: 'NONE' as const,
            newVendorId: null,
            cause: 'LINK_REMOVED' as const,
            ...stampCreate(actor),
          })),
        });
      }
      const removed = await tx.vendorProjectLink.update({
        where: { id: existing.id },
        data: { removedAt: new Date(), removedById: actor, ...stampUpdate(actor) },
        include: { removedBy: { select: { id: true, name: true } } },
      });
      await recordOnBoth(tx, {
        action: 'UNASSIGNED',
        actorId: actor,
        vendor: existing.vendor,
        project: existing.project,
        assignmentId: existing.id,
        extra: snapshot(existing),
      });
      return { removed, archivedIds: schedules.map((row) => row.id), clearedItemIds: items.map((row) => row.id) };
    });
    res.json({
      id: result.removed.id,
      vendor_id: result.removed.vendorId,
      project_id: result.removed.projectId,
      archived_schedule_ids: result.archivedIds,
      cleared_timeline_item_ids: result.clearedItemIds,
      removed_at: result.removed.removedAt!.toISOString(),
      removed_by: result.removed.removedBy,
    });
  }),
);
