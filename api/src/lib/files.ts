import path from 'node:path';
import { HttpError } from './http';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MEDIA: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
};

export function inspectUpload(originalName: string, bytes: Buffer): { ext: string; mediaType: string } {
  if (bytes.length === 0) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      fields: { file: 'The file is empty.' },
    });
  }
  if (bytes.length > MAX_FILE_BYTES) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      fields: { file: 'The file must be 10 MB or smaller.' },
    });
  }
  const ext = path.extname(originalName).toLowerCase();
  if (!MEDIA[ext] || !matchesMagic(ext, bytes)) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      fields: { file: 'The file must be a spreadsheet or PDF.' },
    });
  }
  return { ext, mediaType: MEDIA[ext] };
}

function matchesMagic(ext: string, bytes: Buffer): boolean {
  if (ext === '.pdf') return bytes.subarray(0, 4).toString('utf8') === '%PDF';
  if (ext === '.xlsx') return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (ext === '.xls') return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (ext === '.csv') return !bytes.subarray(0, Math.min(bytes.length, 512)).includes(0);
  return false;
}
