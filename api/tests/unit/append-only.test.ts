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
];
const writeMethods = ['update', 'updateMany', 'upsert', 'delete', 'deleteMany'];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('append-only timeline history', () => {
  it('never updates or deletes progress updates, date changes, responsible changes, delays, or issues', () => {
    const pattern = new RegExp(`\\.(${appendOnlyModels.join('|')})\\s*\\.\\s*(${writeMethods.join('|')})\\s*\\(`);
    const offenders = sourceFiles(sourceRoot).flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, at: `${path.relative(sourceRoot, file)}:${index + 1}` }))
        .filter(({ line }) => pattern.test(line))
        .map(({ at, line }) => `${at} ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('finds a write when one is present, so the check above can fail', () => {
    const pattern = new RegExp(`\\.(${appendOnlyModels.join('|')})\\s*\\.\\s*(${writeMethods.join('|')})\\s*\\(`);
    expect(pattern.test('await tx.delay.deleteMany({})')).toBe(true);
    expect(pattern.test('await tx.delay.create({})')).toBe(false);
  });
});
