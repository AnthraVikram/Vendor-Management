import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { HttpError } from '../../lib/http';
import { asyncRoute } from '../async-route';

// Read-only change history (FR-027, FR-028). There are no write routes: entries are written only by the
// routes that make each change, in the same transaction.

const TARGETS = ['vendor_id', 'project_id', 'document_id', 'import_run_id', 'client_advance_id'] as const;
type Target = (typeof TARGETS)[number];

const querySchema = z
  .object(Object.fromEntries(TARGETS.map((key) => [key, z.string().uuid('Not a valid id.').optional()])) as Record<Target, z.ZodOptional<z.ZodString>>)
  .strict('Ask for one of vendor_id, project_id, document_id, import_run_id, or client_advance_id.')
  .refine((query) => TARGETS.filter((key) => query[key] !== undefined).length === 1, {
    message: 'Ask for exactly one of vendor_id, project_id, document_id, import_run_id, or client_advance_id.',
  });

type Stamps = { createdAt: Date; createdById: string; updatedAt: Date; updatedById: string };

const stampSelect = { createdAt: true, createdById: true, updatedAt: true, updatedById: true } as const;

const NOT_FOUND: Record<Target, string> = {
  vendor_id: 'Vendor not found.',
  project_id: 'Project not found.',
  document_id: 'Document not found.',
  import_run_id: 'Import run not found.',
  client_advance_id: 'Client advance not found.',
};

function loadStamps(target: Target, id: string): Promise<Stamps | null> {
  switch (target) {
    case 'vendor_id':
      return prisma.vendor.findUnique({ where: { id }, select: stampSelect });
    case 'project_id':
      return prisma.project.findUnique({ where: { id }, select: stampSelect });
    case 'document_id':
      return prisma.document.findUnique({ where: { id }, select: stampSelect });
    case 'import_run_id':
      return prisma.vendorImportRun.findUnique({ where: { id }, select: stampSelect });
    case 'client_advance_id':
      return prisma.clientAdvance.findUnique({ where: { id }, select: stampSelect });
  }
}

const ENTRY_COLUMN = {
  vendor_id: 'vendorId',
  project_id: 'projectId',
  document_id: 'documentId',
  import_run_id: 'vendorImportRunId',
  client_advance_id: 'clientAdvanceId',
} as const;

export const historyRouter = Router();

historyRouter.get(
  '/history',
  asyncRoute(async (req, res) => {
    const query = querySchema.parse(req.query);
    const target = TARGETS.find((key) => query[key] !== undefined)!;
    const id = query[target]!;

    const stamps = await loadStamps(target, id);
    if (!stamps) throw new HttpError(404, NOT_FOUND[target]);
    const [people, entries] = await Promise.all([
      prisma.staffUser.findMany({ where: { id: { in: [stamps.createdById, stamps.updatedById] } }, select: { id: true, name: true } }),
      prisma.historyEntry.findMany({
        where: { [ENTRY_COLUMN[target]]: id },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const person = (personId: string) => people.find((row) => row.id === personId) ?? { id: personId, name: 'Unknown' };

    res.json({
      // The record's own stamps, so a record from before deployment still shows who created and last updated it (US5-6).
      record: {
        created_at: stamps.createdAt.toISOString(),
        created_by: person(stamps.createdById),
        updated_at: stamps.updatedAt.toISOString(),
        updated_by: person(stamps.updatedById),
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        changes: entry.changes,
        details: entry.details,
        created_at: entry.createdAt.toISOString(),
        created_by: entry.createdBy,
      })),
    });
  }),
);
