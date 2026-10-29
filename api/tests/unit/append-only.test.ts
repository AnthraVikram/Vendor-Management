import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.join(__dirname, '..', '..', 'src');
const appendOnlyModels = [
  'timelineProgressUpdate',
  'timelineDateChange',
  'timelineResponsibleChange',
  'delay',
  'coordinationIssue',
  'coordinationIssueVendor',
  'historyEntry',
  'clientAdvance',
  'clientAdvanceReversal',
  'vendorImportRun',
  'vendorImportRow',
];
const writeMethods = ['update', 'updateMany', 'upsert', 'delete', 'deleteMany'];
// Documents may be archived and restored (an update), but never deleted (FR-015, FR-016).
const neverDeletedModels = ['document'];
const deleteMethods = ['delete', 'deleteMany'];

const appendOnlyPattern = new RegExp(`\\.(${appendOnlyModels.join('|')})\\s*\\.\\s*(${writeMethods.join('|')})\\s*\\(`);
const neverDeletedPattern = new RegExp(`\\.(${neverDeletedModels.join('|')})\\s*\\.\\s*(${deleteMethods.join('|')})\\s*\\(`);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function offenders(pattern: RegExp): string[] {
  return sourceFiles(sourceRoot).flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ line, at: `${path.relative(sourceRoot, file)}:${index + 1}` }))
      .filter(({ line }) => pattern.test(line))
      .map(({ at, line }) => `${at} ${line.trim()}`),
  );
}

describe('append-only history and financial records', () => {
  it('never updates or deletes timeline history, history entries, client advances, reversals, or import runs and rows', () => {
    expect(offenders(appendOnlyPattern)).toEqual([]);
  });

  it('never deletes a document', () => {
    expect(offenders(neverDeletedPattern)).toEqual([]);
  });

  it('finds a write when one is present, so the checks above can fail', () => {
    expect(appendOnlyPattern.test('await tx.delay.deleteMany({})')).toBe(true);
    expect(appendOnlyPattern.test('await tx.clientAdvance.update({})')).toBe(true);
    expect(appendOnlyPattern.test('await prisma.historyEntry.delete({})')).toBe(true);
    expect(appendOnlyPattern.test('await tx.delay.create({})')).toBe(false);
    expect(appendOnlyPattern.test('await tx.clientAdvance.create({})')).toBe(false);
    expect(neverDeletedPattern.test('await prisma.document.delete({ where })')).toBe(true);
    expect(neverDeletedPattern.test('await tx.document.deleteMany({})')).toBe(true);
    expect(neverDeletedPattern.test('await tx.document.update({ data: { archived: true } })')).toBe(false);
  });
});
