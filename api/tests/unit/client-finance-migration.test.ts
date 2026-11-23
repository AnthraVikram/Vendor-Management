import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Feature 006 migration safety (T005): the migration only adds; it rewrites no existing row (FR-012, plan.md).
const file = path.join(__dirname, '..', '..', 'prisma', 'migrations', '20261118120000_client_financial_management', 'migration.sql');
const sql = fs.readFileSync(file, 'utf8');
// Statements only: comments removed, so "ON DELETE RESTRICT" in a foreign key is not mistaken for a statement.
const statements = sql
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

describe('client financial management migration', () => {
  it('contains no statement that changes or removes existing rows or tables', () => {
    const forbidden = statements.filter((s) => /^(UPDATE|DELETE|INSERT|TRUNCATE)\b/i.test(s) || /\bDROP (TABLE|COLUMN|INDEX|TYPE)\b/i.test(s));
    expect(forbidden).toEqual([]);
  });

  it('drops exactly one constraint, the history target check, and adds its seven-target replacement', () => {
    const drops = statements.filter((s) => /\bDROP CONSTRAINT\b/i.test(s));
    expect(drops).toEqual(['ALTER TABLE "history_entries" DROP CONSTRAINT "history_entries_target_ck"']);
    const replacement = statements.find((s) => s.includes('ADD CONSTRAINT "history_entries_target_ck"'));
    for (const target of ['vendor_id', 'project_id', 'document_id', 'vendor_import_run_id', 'client_advance_id', 'client_quotation_id', 'client_purchase_order_id']) {
      expect(replacement).toContain(`"${target}"`);
    }
    expect(replacement).toContain(') = 1');
  });

  it('marks existing advances FEATURE_003 before new rows default to FEATURE_006', () => {
    const add = sql.indexOf(`"recorded_under" "RecordedUnder" NOT NULL DEFAULT 'FEATURE_003'`);
    const later = sql.indexOf(`ALTER COLUMN "recorded_under" SET DEFAULT 'FEATURE_006'`);
    expect(add).toBeGreaterThan(-1);
    expect(later).toBeGreaterThan(add);
  });

  it('creates the quotation reference sequence', () => {
    expect(statements).toContain('CREATE SEQUENCE "client_quotation_reference_seq"');
  });
  // Owner decision 2026-11-18: the migration is one explicit transaction, so the history target check is replaced
  // atomically and a failure anywhere applies nothing.
  it('runs as one explicit transaction: BEGIN first, COMMIT last, and no other transaction control', () => {
    expect(statements[0]).toBe('BEGIN');
    expect(statements[statements.length - 1]).toBe('COMMIT');
    expect(statements.filter((s) => /^(BEGIN|COMMIT|ROLLBACK|START TRANSACTION|END)\b/i.test(s))).toEqual(['BEGIN', 'COMMIT']);
    expect(statements.some((s) => /\bCONCURRENTLY\b/i.test(s))).toBe(false);
  });

  it('allows exactly the six FR-025 status changes in quotation_status_changes', () => {
    const check = statements.find((s) => s.includes('"quotation_status_changes_transition_ck"'))!;
    const pairs = [...check.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    expect(pairs).toEqual(['DRAFT>SUBMITTED', 'DRAFT>WITHDRAWN', 'SUBMITTED>UNDER_REVIEW', 'SUBMITTED>WITHDRAWN', 'UNDER_REVIEW>APPROVED', 'UNDER_REVIEW>REJECTED']);
    // Both columns are NOT NULL, so the check cannot be bypassed with a NULL.
    const table = statements.find((s) => s.startsWith('CREATE TABLE "quotation_status_changes"'))!;
    expect(table).toContain('"from_status" "RevisionStatus" NOT NULL');
    expect(table).toContain('"to_status" "RevisionStatus" NOT NULL');
  });
});
