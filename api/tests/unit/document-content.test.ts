import { describe, expect, it } from 'vitest';
import { checkDocumentContent } from '../../src/lib/document-content';
import { HttpError } from '../../src/lib/http';
import { exeBuffer, jpegBuffer, oleBuffer, pdfBuffer, pngBuffer, zipWithEntry } from '../fixtures/files';

const MISMATCH = "The file's content does not match its type.";

function refusal(name: string, bytes: Buffer): HttpError {
  try {
    checkDocumentContent(name, bytes);
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error(`expected ${name} to be refused`);
}

describe('document content check (FR-013)', () => {
  it('accepts each of the seven kinds when the content matches the extension', () => {
    expect(checkDocumentContent('a.pdf', pdfBuffer())).toEqual({ ext: '.pdf', mediaType: 'application/pdf' });
    expect(checkDocumentContent('a.jpg', jpegBuffer())).toEqual({ ext: '.jpg', mediaType: 'image/jpeg' });
    expect(checkDocumentContent('a.jpeg', jpegBuffer())).toEqual({ ext: '.jpeg', mediaType: 'image/jpeg' });
    expect(checkDocumentContent('a.png', pngBuffer())).toEqual({ ext: '.png', mediaType: 'image/png' });
    expect(checkDocumentContent('a.docx', zipWithEntry('word/document.xml'))).toEqual({
      ext: '.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(checkDocumentContent('a.xlsx', zipWithEntry('xl/workbook.xml'))).toEqual({
      ext: '.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(checkDocumentContent('a.doc', oleBuffer('WordDocument'))).toEqual({ ext: '.doc', mediaType: 'application/msword' });
    expect(checkDocumentContent('a.xls', oleBuffer('Workbook'))).toEqual({ ext: '.xls', mediaType: 'application/vnd.ms-excel' });
    expect(checkDocumentContent('a.xls', oleBuffer('Book'))).toEqual({ ext: '.xls', mediaType: 'application/vnd.ms-excel' });
  });

  it('reads the extension without regard to letter case', () => {
    expect(checkDocumentContent('SCAN.PDF', pdfBuffer())).toEqual({ ext: '.pdf', mediaType: 'application/pdf' });
  });

  it('refuses content that does not match the extension', () => {
    const cases: [string, Buffer][] = [
      ['setup.pdf', exeBuffer()],
      ['sheet.doc', oleBuffer('Workbook')],
      ['sheet.docx', zipWithEntry('xl/workbook.xml')],
      ['photo.png', jpegBuffer()],
    ];
    for (const [name, bytes] of cases) {
      const error = refusal(name, bytes);
      expect(error.status).toBe(400);
      expect(error.fields?.file).toBe(MISMATCH);
    }
  });

  it('refuses a type that is not accepted', () => {
    const error = refusal('notes.txt', Buffer.from('hello'));
    expect(error.status).toBe(400);
    expect(error.fields?.file).toBeTruthy();
    expect(error.fields?.file).not.toBe(MISMATCH);
  });

  it('refuses an empty file', () => {
    const error = refusal('empty.pdf', Buffer.alloc(0));
    expect(error.status).toBe(400);
    expect(error.fields?.file).toBe('The file is empty.');
  });
});
