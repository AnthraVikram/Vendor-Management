import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../../db';
import { loadConfig } from '../../config';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { inspectUpload, MAX_FILE_BYTES } from '../../lib/files';
import { HttpError } from '../../lib/http';
import { asyncRoute } from '../async-route';
import { presentSchedule } from '../schedules/routes';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

export const fileRouter = Router();

fileRouter.post(
  '/schedules/:id/costing-sheet',
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new HttpError(400, 'Check the highlighted fields.', {
        fields: { file: 'A spreadsheet or PDF is required.' },
      });
    }
    const inspected = inspectUpload(file.originalname, file.buffer);
    const schedule = await prisma.workSchedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) throw new HttpError(404, 'Schedule not found.');
    if (schedule.pricingMode === 'FIXED') {
      throw new HttpError(409, 'This task uses a fixed price.', { code: 'PRICE_AND_FILE' });
    }
    const actor = req.staff!.id;
    const config = loadConfig();
    const directory = path.resolve(config.FILE_STORAGE_DIR);
    await fs.mkdir(directory, { recursive: true });
    const storageKey = `${randomUUID()}${inspected.ext}`;
    await fs.writeFile(path.join(directory, storageKey), file.buffer);
    await prisma.$transaction(async (tx) => {
      await tx.costingSheetFile.updateMany({
        where: { scheduleId: schedule.id, archived: false },
        data: { archived: true, updatedById: actor },
      });
      await tx.costingSheetFile.create({
        data: {
          scheduleId: schedule.id,
          storageKey,
          originalFilename: file.originalname,
          mediaType: inspected.mediaType,
          byteSize: file.buffer.length,
          ...stampCreate(actor),
        },
      });
      await tx.workSchedule.update({
        where: { id: schedule.id },
        data: { pricingMode: 'FILE', ...stampUpdate(actor) },
      });
    });
    res.status(201).json(await presentSchedule(req.params.id));
  }),
);

fileRouter.get(
  '/schedules/:scheduleId/costing-sheets/:fileId',
  asyncRoute(async (req, res) => {
    const file = await prisma.costingSheetFile.findFirst({
      where: { id: req.params.fileId, scheduleId: req.params.scheduleId },
    });
    if (!file) throw new HttpError(404, 'File not found.');
    const config = loadConfig();
    const fullPath = path.resolve(config.FILE_STORAGE_DIR, file.storageKey);
    res.setHeader('Content-Type', file.mediaType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename.replace(/"/g, '')}"`);
    res.sendFile(fullPath);
  }),
);
