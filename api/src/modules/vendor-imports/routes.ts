import ExcelJS from 'exceljs';
import type { Prisma, VendorImportPreview } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate } from '../../lib/audit';
import { singleUpload } from '../../lib/files';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { confirmOutcomes, previewOutcomes, type PreviewRow as OutcomeRow, type RowMatch } from '../../lib/import-duplicates';
import { IMPORT_HEADINGS, matchHeadings, type ImportHeading } from '../../lib/import-headings';
import { validateRow, type VendorDraft } from '../../lib/import-rows';
import { vendorIdentityLock } from '../../lib/vendor-lock';
import { reuseCategory } from '../../lib/vendor-rules';
import { MAX_IMPORT_BYTES, readImportFile } from '../../lib/xlsx-read';
import { asyncRoute } from '../async-route';

// Vendor import (FR-001 to FR-011). A preview stores each non-blank row's cells and outcome; nothing
// reaches the vendor directory until the uploader confirms.

const PREVIEW_MINUTES = 30;
const PHONE_COLUMNS: ImportHeading[] = ['Phone', 'Alternate phone'];

type Cells = Partial<Record<ImportHeading, string>>;

type MatchJson = { kind: 'VENDOR'; vendor_id: string; vendor_name: string } | { kind: 'ROW'; row_number: number };

// One stored and returned preview row (data-model.md, vendor_import_previews.rows).
export type StoredPreviewRow = {
  row_number: number;
  outcome: OutcomeRow<VendorDraft>['outcome'];
  name: string;
  reasons: string[];
  matches: MatchJson[];
  cells: Cells;
};

function matchJson(match: RowMatch): MatchJson {
  return match.kind === 'VENDOR'
    ? { kind: 'VENDOR', vendor_id: match.vendorId, vendor_name: match.vendorName }
    : { kind: 'ROW', row_number: match.rowNumber };
}

function matchFromJson(match: MatchJson): RowMatch {
  return match.kind === 'VENDOR'
    ? { kind: 'VENDOR', vendorId: match.vendor_id, vendorName: match.vendor_name }
    : { kind: 'ROW', rowNumber: match.row_number };
}

function countOutcomes(rows: StoredPreviewRow[]) {
  return {
    ready: rows.filter((row) => row.outcome === 'READY').length,
    rejected: rows.filter((row) => row.outcome === 'REJECTED').length,
    possible_duplicate: rows.filter((row) => row.outcome === 'POSSIBLE_DUPLICATE').length,
  };
}

function presentPreview(preview: VendorImportPreview) {
  const rows = preview.rows as unknown as StoredPreviewRow[];
  return {
    id: preview.id,
    file_name: preview.fileName,
    expires_at: preview.expiresAt.toISOString(),
    status: preview.status,
    ignored_headings: preview.ignoredHeadings,
    counts: countOutcomes(rows),
    rows,
  };
}

const idSchema = z.string().uuid('Not a valid id.');

const isExpired = (preview: VendorImportPreview) => preview.status === 'OPEN' && preview.expiresAt.getTime() <= Date.now();
const hasRows = (preview: VendorImportPreview) => (preview.rows as unknown[]).length > 0;

const expired = () => new HttpError(409, 'This preview has expired. Upload the file again.', { code: 'PREVIEW_EXPIRED' });
const cancelled = () => new HttpError(409, 'This preview was cancelled. Upload the file again.', { code: 'PREVIEW_CANCELLED' });

// FR-008e: an expired or finished preview keeps only its id, owner, status, and expiry.
function clearRows(db: Prisma.TransactionClient, previewId: string, actorId: string) {
  return db.vendorImportPreview.update({ where: { id: previewId }, data: { rows: [], ignoredHeadings: [], updatedById: actorId } });
}

// Only the uploader may view, confirm, or cancel a preview (FR-008d). Refused before any write.
async function loadOwnPreview(id: string, actorId: string): Promise<VendorImportPreview> {
  const preview = await prisma.vendorImportPreview.findUnique({ where: { id: idSchema.parse(id) } });
  if (!preview) throw new HttpError(404, 'Import preview not found.');
  if (preview.createdById !== actorId) {
    throw new HttpError(403, 'Only the person who uploaded this file can use its preview.', { code: 'PREVIEW_NOT_YOURS' });
  }
  return preview;
}

const runAuthor = { createdBy: { select: { id: true, name: true } } } satisfies Prisma.VendorImportRunInclude;

// One run in the contract's `run` shape, used by the run list, the run detail, and confirmation.
function presentRunSummary(run: Prisma.VendorImportRunGetPayload<{ include: typeof runAuthor }>) {
  return {
    id: run.id,
    file_name: run.fileName,
    created_at: run.createdAt.toISOString(),
    created_by: run.createdBy,
    imported_count: run.importedCount,
    skipped_count: run.skippedCount,
    rejected_count: run.rejectedCount,
  };
}

// A run with its row outcomes in row order (contract: `{ run, rows }`).
async function presentRun(db: Prisma.TransactionClient, runId: string) {
  const run = await db.vendorImportRun.findUnique({
    where: { id: runId },
    include: { ...runAuthor, rows: { orderBy: { rowNumber: 'asc' } } },
  });
  if (!run) throw new HttpError(404, 'Import run not found.');
  return {
    run: presentRunSummary(run),
    rows: run.rows.map((row) => ({ row_number: row.rowNumber, outcome: row.outcome, vendor_id: row.vendorId, reasons: row.reasons })),
  };
}

const confirmSchema = z.object({
  approved_rows: z.array(z.number().int().positive(), { required_error: 'approved_rows is required.' }),
});

const templateQuery = z.object({ format: z.enum(['xlsx', 'csv'], { errorMap: () => ({ message: 'Choose format xlsx or csv.' }) }) });

export const vendorImportRouter = Router();

vendorImportRouter.get(
  '/vendor-imports/template',
  asyncRoute(async (req, res) => {
    const { format } = templateQuery.parse(req.query);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="vendor-import-template.csv"');
      res.send(`${IMPORT_HEADINGS.join(',')}\r\n`);
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Vendors');
    sheet.addRow([...IMPORT_HEADINGS]);
    // Phone columns are text so Excel keeps leading zeros.
    for (const heading of PHONE_COLUMNS) sheet.getColumn(IMPORT_HEADINGS.indexOf(heading) + 1).numFmt = '@';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vendor-import-template.xlsx"');
    res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
  }),
);

vendorImportRouter.post(
  '/vendor-imports/previews',
  singleUpload('file', MAX_IMPORT_BYTES, '25 MB'),
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { file: 'Choose an .xlsx or .csv file.' } });
    }
    const actor = req.staff!.id;
    const now = new Date();

    // FR-008e: every upload clears the cell values of any expired, still-open preview, so no job is needed.
    await prisma.vendorImportPreview.updateMany({
      where: { status: 'OPEN', expiresAt: { lt: now }, NOT: { rows: { equals: [] } } },
      data: { rows: [], ignoredHeadings: [], updatedById: actor },
    });

    const imported = await readImportFile(file.originalname, file.buffer);
    const { index, ignored } = matchHeadings(imported.headingRow);
    const parsed = imported.rows.map((row) => {
      const cells: Cells = {};
      for (const heading of IMPORT_HEADINGS) {
        const column = index[heading];
        if (column !== undefined) cells[heading] = (row.cells[column] ?? '').trim();
      }
      return { rowNumber: row.row_number, cells, ...validateRow(cells) };
    });

    const directory = await prisma.vendor.findMany({ select: { id: true, name: true, phone: true, alternatePhone: true, gstin: true } });
    const outcomes = previewOutcomes(parsed, directory);
    const rows: StoredPreviewRow[] = outcomes.map((outcome, i) => ({
      row_number: outcome.rowNumber,
      outcome: outcome.outcome,
      name: outcome.draft.name,
      reasons: outcome.reasons,
      matches: outcome.matches.map(matchJson),
      cells: parsed[i].cells,
    }));

    const preview = await prisma.vendorImportPreview.create({
      data: {
        fileName: file.originalname,
        fileFormat: imported.format,
        expiresAt: new Date(now.getTime() + PREVIEW_MINUTES * 60 * 1000),
        rows: rows as unknown as Prisma.InputJsonValue,
        ignoredHeadings: ignored,
        ...stampCreate(actor),
      },
    });
    res.status(201).json(presentPreview(preview));
  }),
);

vendorImportRouter.get(
  '/vendor-imports/previews/:id',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const preview = await loadOwnPreview(req.params.id, actor);
    if (preview.status === 'CANCELLED') throw cancelled();
    if (preview.status === 'CONFIRMED') {
      const run = await prisma.vendorImportRun.findUnique({ where: { previewId: preview.id }, select: { id: true } });
      res.json({ status: 'CONFIRMED', run_id: run?.id ?? null });
      return;
    }
    if (isExpired(preview)) {
      // The clearing is awaited and committed on its own before the 409 is sent.
      if (hasRows(preview)) await clearRows(prisma, preview.id, actor);
      throw expired();
    }
    res.json(presentPreview(preview));
  }),
);

vendorImportRouter.post(
  '/vendor-imports/previews/:id/cancel',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const { id } = await loadOwnPreview(req.params.id, actor);
    // The transaction returns its result instead of throwing for an expired preview, so the clearing
    // commits; the 409 is sent only afterwards.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vendor_import_previews WHERE id = ${id}::uuid FOR UPDATE`;
      const locked = await tx.vendorImportPreview.findUniqueOrThrow({ where: { id } });
      if (locked.status === 'CONFIRMED') {
        throw new HttpError(409, 'This preview has already been confirmed.', { code: 'PREVIEW_CONFIRMED' });
      }
      if (locked.status === 'CANCELLED') return 'CANCELLED' as const;
      if (isExpired(locked)) {
        if (hasRows(locked)) await clearRows(tx, id, actor);
        return 'EXPIRED' as const;
      }
      await tx.vendorImportPreview.update({
        where: { id },
        data: { status: 'CANCELLED', rows: [], ignoredHeadings: [], updatedById: actor },
      });
      return 'CANCELLED' as const;
    });
    if (result === 'EXPIRED') throw expired();
    res.json({ status: 'CANCELLED' });
  }),
);

type ConfirmResult = { kind: 'CONFIRMED' | 'ALREADY_CONFIRMED'; runId: string } | { kind: 'EXPIRED' };

// Creates the confirmed rows' vendors and their run in one transaction (FR-008 to FR-008b, FR-010, FR-011).
async function confirmPreview(previewId: string, approvedRows: number[], actor: string): Promise<ConfirmResult> {
  return prisma.$transaction(
    async (tx): Promise<ConfirmResult> => {
      // A second confirmation waits here, then sees CONFIRMED and returns the same run (FR-008b).
      await tx.$queryRaw`SELECT id FROM vendor_import_previews WHERE id = ${previewId}::uuid FOR UPDATE`;
      const preview = await tx.vendorImportPreview.findUniqueOrThrow({ where: { id: previewId }, include: { run: { select: { id: true } } } });
      if (preview.status === 'CONFIRMED' && preview.run) return { kind: 'ALREADY_CONFIRMED', runId: preview.run.id };
      if (preview.status === 'CANCELLED') throw cancelled();
      if (isExpired(preview)) {
        // Returned, not thrown, so the clearing commits before the 409 is sent (FR-008e).
        if (hasRows(preview)) await clearRows(tx, preview.id, actor);
        return { kind: 'EXPIRED' };
      }

      // Vendor create and edit take the same lock, so the directory cannot change while rows are rechecked.
      await vendorIdentityLock(tx);
      const directory = await tx.vendor.findMany({ select: { id: true, name: true, phone: true, alternatePhone: true, gstin: true } });
      const stored = preview.rows as unknown as StoredPreviewRow[];
      const outcomes = confirmOutcomes(
        stored.map((row) => ({
          rowNumber: row.row_number,
          outcome: row.outcome,
          reasons: row.reasons,
          matches: row.matches.map(matchFromJson),
          draft: validateRow(row.cells).draft,
        })),
        approvedRows,
        directory,
      );
      const imported = outcomes.filter((row) => row.outcome === 'IMPORTED');

      // Categories are matched ignoring letter case and surrounding spaces; a new name is created once.
      const categories = await tx.category.findMany();
      const categoryIdFor = new Map<string, string>();
      for (const name of imported.flatMap((row) => row.draft.categories)) {
        const key = name.trim().toLowerCase();
        if (categoryIdFor.has(key)) continue;
        let category = categories.find((existing) => reuseCategory(existing.name, name).matches);
        if (!category) {
          category = await tx.category.create({ data: { name: name.trim(), ...stampCreate(actor) } });
          categories.push(category);
        }
        categoryIdFor.set(key, category.id);
      }

      // The run is created first because each imported vendor refers to it.
      const counts = {
        imported_count: imported.length,
        skipped_count: outcomes.filter((row) => row.outcome === 'SKIPPED').length,
        rejected_count: outcomes.filter((row) => row.outcome === 'REJECTED').length,
      };
      const run = await tx.vendorImportRun.create({
        data: {
          previewId: preview.id,
          fileName: preview.fileName,
          importedCount: counts.imported_count,
          skippedCount: counts.skipped_count,
          rejectedCount: counts.rejected_count,
          ...stampCreate(actor),
        },
      });

      const vendorIdFor = new Map<number, string>();
      for (const row of imported) {
        const draft = row.draft;
        const labels = (values: string[]) => ({ create: values.map((label) => ({ label, ...stampCreate(actor) })) });
        const vendor = await tx.vendor.create({
          data: {
            name: draft.name,
            phone: draft.phone,
            contactPerson: draft.contactPerson,
            alternatePhone: draft.alternatePhone,
            email: draft.email,
            address: draft.address,
            gstRegistered: draft.gstRegistered,
            gstin: draft.gstin,
            gstLegalName: draft.gstLegalName,
            teamSize: draft.teamSize,
            availability: draft.availability,
            manpowerNote: draft.manpowerNote,
            importRunId: run.id,
            ...stampCreate(actor),
            categories: {
              create: draft.categories.map((name) => ({ categoryId: categoryIdFor.get(name.trim().toLowerCase())!, ...stampCreate(actor) })),
            },
            locations: labels(draft.locations),
            services: labels(draft.services),
            materials: labels(draft.materials),
          },
        });
        vendorIdFor.set(row.rowNumber, vendor.id);
        await recordHistory(tx, { target: { vendorId: vendor.id }, action: 'CREATED', actorId: actor, details: { import_run_id: run.id } });
      }

      await tx.vendorImportRow.createMany({
        data: outcomes.map((row) => ({
          runId: run.id,
          rowNumber: row.rowNumber,
          outcome: row.outcome,
          reasons: row.reasons,
          matches: row.matches.map(matchJson) as unknown as Prisma.InputJsonValue,
          vendorId: vendorIdFor.get(row.rowNumber) ?? null,
          ...stampCreate(actor),
        })),
      });
      await recordHistory(tx, { target: { importRunId: run.id }, action: 'CREATED', actorId: actor, details: { ...counts } });

      // FR-008e: the run and its row outcomes are now the audit record, so the cell values are cleared.
      await tx.vendorImportPreview.update({
        where: { id: preview.id },
        data: { status: 'CONFIRMED', rows: [], ignoredHeadings: [], updatedById: actor },
      });
      return { kind: 'CONFIRMED', runId: run.id };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

vendorImportRouter.post(
  '/vendor-imports/previews/:id/confirm',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const preview = await loadOwnPreview(req.params.id, actor);
    const { approved_rows: approvedRows } = confirmSchema.parse(req.body);
    let result: ConfirmResult;
    try {
      result = await confirmPreview(preview.id, approvedRows, actor);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // The transaction rolled back, so no vendor, run, row outcome, or history entry was saved (FR-008a).
      throw new HttpError(500, 'The import did not happen. Nothing was saved.', { code: 'IMPORT_FAILED' });
    }
    if (result.kind === 'EXPIRED') throw expired();
    res.status(result.kind === 'CONFIRMED' ? 201 : 200).json(await presentRun(prisma, result.runId));
  }),
);

// Import history (FR-010, US2-9): every staff member may read every run.
vendorImportRouter.get(
  '/vendor-imports',
  asyncRoute(async (_req, res) => {
    const runs = await prisma.vendorImportRun.findMany({ include: runAuthor, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    res.json(runs.map(presentRunSummary));
  }),
);

vendorImportRouter.get(
  '/vendor-imports/:runId',
  asyncRoute(async (req, res) => {
    res.json(await presentRun(prisma, idSchema.parse(req.params.runId)));
  }),
);
