import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { loadConfig } from '../../config';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { checkDocumentContent } from '../../lib/document-content';
import { singleUpload } from '../../lib/files';
import { recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { asyncRoute } from '../async-route';

// Documents on vendors and projects (FR-012 to FR-016). There is no delete route: documents are
// archived, and both the row and the stored file are kept.

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const idSchema = z.string().uuid('Not a valid id.');

const uploadSchema = z.object({
  title: z.string({ required_error: 'Title is required.' }).trim().min(1, 'Title is required.'),
  document_type: z.enum(['AGREEMENT', 'DRAWING', 'REGISTRATION_CERTIFICATE', 'PHOTO', 'OTHER'], {
    errorMap: () => ({ message: 'Choose a document type.' }),
  }),
  note: z.string().trim().optional(),
});

type Parent = 'vendor' | 'project';

const documentInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.DocumentInclude;

type DocumentRecord = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

function presentDocument(document: DocumentRecord) {
  return {
    id: document.id,
    vendor_id: document.vendorId,
    project_id: document.projectId,
    title: document.title,
    document_type: document.documentType,
    note: document.note,
    original_filename: document.originalFilename,
    media_type: document.mediaType,
    byte_size: document.byteSize,
    archived: document.archived,
    created_at: document.createdAt.toISOString(),
    created_by: document.createdBy,
  };
}

function parentArchived(): HttpError {
  return new HttpError(409, 'This record is archived, so its documents are read-only. Restore it first.', { code: 'PARENT_ARCHIVED' });
}

// Reads the parent's archived flag under a share lock, so archiving the parent waits for this
// transaction and this transaction sees an archive that committed first.
async function lockParent(tx: Prisma.TransactionClient, parent: Parent, id: string): Promise<{ archived: boolean } | undefined> {
  const rows =
    parent === 'vendor'
      ? await tx.$queryRaw<{ archived: boolean }[]>`SELECT archived FROM vendors WHERE id = ${id}::uuid FOR SHARE`
      : await tx.$queryRaw<{ archived: boolean }[]>`SELECT archived FROM projects WHERE id = ${id}::uuid FOR SHARE`;
  return rows[0];
}

function notFound(parent: Parent): HttpError {
  return new HttpError(404, parent === 'vendor' ? 'Vendor not found.' : 'Project not found.');
}

async function loadDocument(id: string): Promise<DocumentRecord> {
  const document = await prisma.document.findUnique({ where: { id }, include: documentInclude });
  if (!document) throw new HttpError(404, 'Document not found.');
  return document;
}

// Checks the fields and the file together, so every problem is reported in one 400.
function readUpload(req: Request): { body: z.infer<typeof uploadSchema>; file: Express.Multer.File; ext: string; mediaType: string } {
  const parsed = uploadSchema.safeParse(req.body ?? {});
  const fields: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'body';
      if (!fields[key]) fields[key] = issue.message;
    }
  }
  let content: { ext: string; mediaType: string } | undefined;
  if (!req.file) {
    fields.file = 'Choose a file to upload.';
  } else {
    try {
      content = checkDocumentContent(req.file.originalname, req.file.buffer);
    } catch (error) {
      if (!(error instanceof HttpError) || !error.fields) throw error;
      Object.assign(fields, error.fields);
    }
  }
  if (!parsed.success || !content) throw new HttpError(400, 'Check the highlighted fields.', { fields });
  return { body: parsed.data, file: req.file!, ...content };
}

function uploadRoute(parent: Parent) {
  return asyncRoute(async (req, res) => {
    const parentId = idSchema.parse(req.params.id);
    const { body, file, ext, mediaType } = readUpload(req);
    const existing =
      parent === 'vendor'
        ? await prisma.vendor.findUnique({ where: { id: parentId }, select: { archived: true } })
        : await prisma.project.findUnique({ where: { id: parentId }, select: { archived: true } });
    if (!existing) throw notFound(parent);
    if (existing.archived) throw parentArchived();

    const actor = req.staff!.id;
    const directory = path.resolve(loadConfig().FILE_STORAGE_DIR);
    await fs.mkdir(directory, { recursive: true });
    const storageKey = `${randomUUID()}${ext}`;
    const fullPath = path.join(directory, storageKey);
    let created: { id: string };
    try {
      await fs.writeFile(fullPath, file.buffer);
      created = await prisma.$transaction(async (tx) => {
        const locked = await lockParent(tx, parent, parentId);
        if (!locked) throw notFound(parent);
        if (locked.archived) throw parentArchived();
        const document = await tx.document.create({
          data: {
            vendorId: parent === 'vendor' ? parentId : null,
            projectId: parent === 'project' ? parentId : null,
            title: body.title,
            documentType: body.document_type,
            note: body.note ? body.note : null,
            originalFilename: file.originalname,
            mediaType,
            byteSize: file.buffer.length,
            storageKey,
            ...stampCreate(actor),
          },
        });
        await recordHistory(tx, {
          target: { documentId: document.id },
          action: 'CREATED',
          actorId: actor,
          details: { title: body.title, original_filename: file.originalname },
        });
        return document;
      });
    } catch (error) {
      // No row was written, so the file must not stay behind.
      await fs.unlink(fullPath).catch(() => undefined);
      throw error;
    }
    res.status(201).json(presentDocument(await loadDocument(created.id)));
  });
}

function listRoute(parent: Parent) {
  return asyncRoute(async (req, res) => {
    const parentId = idSchema.parse(req.params.id);
    const includeArchived = req.query.include_archived === 'true';
    const existing =
      parent === 'vendor'
        ? await prisma.vendor.findUnique({ where: { id: parentId }, select: { id: true } })
        : await prisma.project.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!existing) throw notFound(parent);
    const documents = await prisma.document.findMany({
      where: {
        ...(parent === 'vendor' ? { vendorId: parentId } : { projectId: parentId }),
        ...(includeArchived ? {} : { archived: false }),
      },
      include: documentInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    res.json(documents.map(presentDocument));
  });
}

function setArchivedRoute(archived: boolean) {
  return asyncRoute(async (req, res) => {
    const documentId = idSchema.parse(req.params.id);
    const actor = req.staff!.id;
    await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ vendor_id: string | null; project_id: string | null; archived: boolean }[]>`
        SELECT vendor_id, project_id, archived FROM documents WHERE id = ${documentId}::uuid FOR UPDATE`;
      if (!row) throw new HttpError(404, 'Document not found.');
      const locked = row.vendor_id ? await lockParent(tx, 'vendor', row.vendor_id) : await lockParent(tx, 'project', row.project_id!);
      if (locked?.archived) throw parentArchived();
      // Repeating the same action changes nothing and writes no history.
      if (row.archived === archived) return;
      await tx.document.update({ where: { id: documentId }, data: { archived, ...stampUpdate(actor) } });
      await recordHistory(tx, { target: { documentId }, action: archived ? 'ARCHIVED' : 'RESTORED', actorId: actor });
    });
    res.json(presentDocument(await loadDocument(documentId)));
  });
}

export const documentRouter = Router();

const upload = singleUpload('file', MAX_DOCUMENT_BYTES, '25 MB');

documentRouter.post('/vendors/:id/documents', upload, uploadRoute('vendor'));
documentRouter.post('/projects/:id/documents', upload, uploadRoute('project'));
documentRouter.get('/vendors/:id/documents', listRoute('vendor'));
documentRouter.get('/projects/:id/documents', listRoute('project'));

documentRouter.get(
  '/documents/:id/file',
  asyncRoute(async (req, res, next) => {
    const document = await loadDocument(idSchema.parse(req.params.id));
    const directory = path.resolve(loadConfig().FILE_STORAGE_DIR);
    // As for costing sheets, the name loses quotes and line breaks before it reaches the header.
    res.attachment(document.originalFilename.replace(/["\r\n]/g, ''));
    res.setHeader('Content-Type', document.mediaType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(document.storageKey, { root: directory }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  }),
);

documentRouter.post('/documents/:id/archive', setArchivedRoute(true));
documentRouter.post('/documents/:id/restore', setArchivedRoute(false));
