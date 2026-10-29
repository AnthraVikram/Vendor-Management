import path from 'node:path';
import { HttpError } from './http';

// Accepted document kinds (FR-013). Each extension must agree with the file's own bytes.
const KINDS: Record<string, { mediaType: string; matches: (bytes: Buffer) => boolean }> = {
  '.pdf': { mediaType: 'application/pdf', matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  '.jpg': { mediaType: 'image/jpeg', matches: isJpeg },
  '.jpeg': { mediaType: 'image/jpeg', matches: isJpeg },
  '.png': { mediaType: 'image/png', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  '.docx': {
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    matches: (b) => isZip(b) && b.includes('word/document.xml'),
  },
  '.xlsx': {
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    matches: (b) => isZip(b) && b.includes('xl/workbook.xml'),
  },
  '.doc': { mediaType: 'application/msword', matches: (b) => isOle(b) && hasStream(b, 'WordDocument') },
  '.xls': { mediaType: 'application/vnd.ms-excel', matches: (b) => isOle(b) && (hasStream(b, 'Workbook') || hasStream(b, 'Book')) },
};

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

function isJpeg(bytes: Buffer): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isZip(bytes: Buffer): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

function isOle(bytes: Buffer): boolean {
  return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

// Stream names in an OLE compound file are stored as UTF-16LE.
function hasStream(bytes: Buffer, name: string): boolean {
  return bytes.includes(Buffer.from(name, 'utf16le'));
}

function refuse(message: string): HttpError {
  return new HttpError(400, 'Check the highlighted fields.', { fields: { file: message } });
}

export function checkDocumentContent(originalName: string, bytes: Buffer): { ext: string; mediaType: string } {
  if (bytes.length === 0) throw refuse('The file is empty.');
  const ext = path.extname(originalName).toLowerCase();
  const kind = KINDS[ext];
  if (!kind) throw refuse('The file must be a PDF, JPG, PNG, Word, or Excel file.');
  if (!kind.matches(bytes)) throw refuse("The file's content does not match its type.");
  return { ext, mediaType: kind.mediaType };
}
