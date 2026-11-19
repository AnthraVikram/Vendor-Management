import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';

// Migration rehearsal (T006, SC-001): apply the Feature 006 migration with `prisma migrate deploy` to a scratch copy
// of the Feature 005 schema holding Feature 003 data, and prove every existing row is unchanged. Runs only against
// the embedded test cluster.
const REHEARSAL_DB = 'vendor_migration_rehearsal';
const apiRoot = path.join(__dirname, '..', '..');
const migrationsDir = path.join(apiRoot, 'prisma', 'migrations');
const NEW_MIGRATION = '20261118120000_client_financial_management';

const testUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;
const onEmbeddedTestCluster =
  testUrl !== undefined && testUrl.hostname === '127.0.0.1' && testUrl.port === '54329' && testUrl.pathname === '/vendor_test';

function rehearsalUrl(): string {
  const url = new URL(testUrl!.toString());
  url.pathname = `/${REHEARSAL_DB}`;
  return url.toString();
}

// The exact name check that precedes every create, drop and execute.
function assertRehearsalTarget(target: string): void {
  const name = target.startsWith('postgres') ? new URL(target).pathname.slice(1) : target;
  if (name !== REHEARSAL_DB) throw new Error(`Refusing to touch database "${name}"; only ${REHEARSAL_DB} is allowed.`);
}

// CREATE DATABASE and DROP DATABASE refuse to run inside a transaction block. Each is sent here as one standalone
// statement through the test connection to vendor_test (no $transaction), so a wrapping transaction would fail loudly.
async function dropIfPresent(): Promise<void> {
  assertRehearsalTarget(REHEARSAL_DB);
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${REHEARSAL_DB}"`);
}

async function create(): Promise<void> {
  assertRehearsalTarget(REHEARSAL_DB);
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${REHEARSAL_DB}"`);
}

function prismaCli(args: string[]): void {
  const url = rehearsalUrl();
  assertRehearsalTarget(url);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['prisma', ...args], {
    cwd: apiRoot,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
}

// The rehearsal applies migrations exactly as T075 will: `prisma migrate deploy`, here on a temporary copy of the
// migrations folder so the new migration can be added after the Feature 003 data is in place.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-migration-rehearsal-'));
const workSchema = path.join(workDir, 'prisma', 'schema.prisma');
function stageMigrations(names: string[]): void {
  const target = path.join(workDir, 'prisma', 'migrations');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(apiRoot, 'prisma', 'schema.prisma'), workSchema);
  fs.copyFileSync(path.join(migrationsDir, 'migration_lock.toml'), path.join(target, 'migration_lock.toml'));
  for (const name of names) fs.cpSync(path.join(migrationsDir, name), path.join(target, name), { recursive: true });
}
const deploy = () => prismaCli(['migrate', 'deploy', '--schema', workSchema]);
const markRolledBack = () => prismaCli(['migrate', 'resolve', '--rolled-back', NEW_MIGRATION, '--schema', workSchema]);

const ADVANCE_COLUMNS = 'id, project_id, amount, received_on, payment_method, reference, note, created_at, created_by, updated_at, updated_by';
const HISTORY_COLUMNS = 'id, vendor_id, project_id, document_id, vendor_import_run_id, client_advance_id, action, changes, details, created_at, created_by, updated_at, updated_by';

async function snapshot(db: PrismaClient) {
  const tables: Record<string, string> = {
    client_advances: ADVANCE_COLUMNS,
    client_advance_reversals: '*',
    history_entries: HISTORY_COLUMNS,
    documents: '*',
  };
  const result: Record<string, { count: number; checksum: string }> = {};
  for (const [table, columns] of Object.entries(tables)) {
    const rows = await db.$queryRawUnsafe<{ count: bigint; checksum: string | null }[]>(
      `SELECT count(*) AS count, md5(string_agg(t::text, '|' ORDER BY t.id)) AS checksum FROM (SELECT ${columns} FROM "${table}") t`,
    );
    result[table] = { count: Number(rows[0].count), checksum: rows[0].checksum ?? '' };
  }
  return result;
}

// Feature 003 data as it exists before the migration: two projects, three advances, one reversal, history, a document.
async function seedFeature003(db: PrismaClient) {
  const staff = randomUUID();
  const projects = [randomUUID(), randomUUID()];
  const advances = [randomUUID(), randomUUID(), randomUUID()];
  await db.$executeRawUnsafe(
    `INSERT INTO staff_users (id, name, email, role, password_hash, created_by, updated_at, updated_by)
     VALUES ('${staff}', 'Asha Accountant', 'asha@example.com', 'ACCOUNTANT', 'x', '${staff}', now(), '${staff}')`,
  );
  for (const [i, id] of projects.entries()) {
    await db.$executeRawUnsafe(
      `INSERT INTO projects (id, name, client_name, status, created_by, updated_at, updated_by)
       VALUES ('${id}', 'Project ${i}', 'Mehta Interiors', 'ACTIVE', '${staff}', now(), '${staff}')`,
    );
  }
  for (const [i, id] of advances.entries()) {
    await db.$executeRawUnsafe(
      `INSERT INTO client_advances (id, project_id, amount, received_on, payment_method, reference, note, created_by, updated_at, updated_by)
       VALUES ('${id}', '${projects[i % 2]}', ${100000 + i}.50, DATE '2026-10-0${i + 1}', 'UPI', 'R${i}', 'note ${i}', '${staff}', now(), '${staff}')`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO history_entries (id, client_advance_id, action, details, created_by, updated_at, updated_by)
       VALUES ('${randomUUID()}', '${id}', 'CREATED', '{"amount":"${100000 + i}.50"}', '${staff}', now(), '${staff}')`,
    );
  }
  await db.$executeRawUnsafe(
    `INSERT INTO client_advance_reversals (id, client_advance_id, amount, reason, created_by, updated_at, updated_by)
     VALUES ('${randomUUID()}', '${advances[0]}', 100000.50, 'Cheque bounced', '${staff}', now(), '${staff}')`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO history_entries (id, client_advance_id, action, details, created_by, updated_at, updated_by)
     VALUES ('${randomUUID()}', '${advances[0]}', 'REVERSED', '{"reason":"Cheque bounced"}', '${staff}', now(), '${staff}')`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO documents (id, project_id, title, document_type, original_filename, media_type, byte_size, storage_key, created_by, updated_at, updated_by)
     VALUES ('${randomUUID()}', '${projects[0]}', 'Agreement', 'AGREEMENT', 'a.pdf', 'application/pdf', 10, '${randomUUID()}', '${staff}', now(), '${staff}')`,
  );
  return { staff, projects };
}

const targetCheck = async (db: PrismaClient) =>
  (await db.$queryRawUnsafe<{ def: string }[]>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'history_entries_target_ck'`))[0].def;

describe.skipIf(!onEmbeddedTestCluster)('Feature 006 migration rehearsal on Feature 003 data', () => {
  let db: PrismaClient;
  let seeded: Awaited<ReturnType<typeof seedFeature003>>;

  beforeAll(async () => {
    await dropIfPresent();
    await create();
    const earlier = fs.readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name) && name < NEW_MIGRATION).sort();
    stageMigrations(earlier);
    deploy();
    db = new PrismaClient({ datasourceUrl: rehearsalUrl() });
    seeded = await seedFeature003(db);
  }, 300000);

  afterAll(async () => {
    await db?.$disconnect();
    await dropIfPresent();
    fs.rmSync(workDir, { recursive: true, force: true });
  }, 120000);

  // Owner decision 2026-11-18: the migration is one transaction. A failure late in the file (here a clash on
  // client_advances_link_ck, injected before running it) must leave the database exactly as it was.
  it('applies nothing when any statement fails: enums, sequence, columns, tables and the history target check are untouched', async () => {
    await db.$executeRawUnsafe(`ALTER TABLE client_advances ADD CONSTRAINT client_advances_link_ck CHECK (true)`);
    const before = await snapshot(db);
    const checkBefore = await targetCheck(db);
    stageMigrations([NEW_MIGRATION]);
    expect(() => deploy()).toThrow();
    expect(await snapshot(db)).toEqual(before);
    expect(await targetCheck(db)).toBe(checkBefore);
    expect(checkBefore).not.toContain('client_quotation_id');
    const leftovers = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'client_advances' AND column_name = 'receipt_type')
            + (SELECT count(*) FROM information_schema.tables WHERE table_name = 'client_quotations')
            + (SELECT count(*) FROM pg_type WHERE typname = 'RevisionStatus')
            + (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'DocumentType' AND e.enumlabel = 'QUOTATION')
            + (SELECT count(*) FROM pg_class WHERE relname = 'client_quotation_reference_seq') AS n`,
    );
    expect(Number(leftovers[0].n)).toBe(0);
    await db.$executeRawUnsafe(`ALTER TABLE client_advances DROP CONSTRAINT client_advances_link_ck`);
    // Prisma records the failed attempt; after the cause is fixed it is marked rolled back and deployed again.
    markRolledBack();
  }, 300000);

  it('keeps every existing advance, reversal, history entry and document, and marks advances as Feature 003 receipts', async () => {
    const before = await snapshot(db);
    deploy();
    const after = await snapshot(db);

    expect(after).toEqual(before);
    expect(before.client_advances.count).toBe(3);
    expect(before.history_entries.count).toBe(4);
    expect(await targetCheck(db)).toContain('client_purchase_order_id');

    const marked = await db.$queryRawUnsafe<Record<string, string | null>[]>(
      `SELECT receipt_type::text, entry_status::text, recorded_under::text, client_approval_id::text, client_purchase_order_id::text,
              submission_id::text, submission_route::text FROM client_advances`,
    );
    expect(marked).toHaveLength(3);
    for (const row of marked) {
      expect(row).toEqual({
        receipt_type: 'ADVANCE',
        entry_status: 'VERIFIED_ON_ENTRY',
        recorded_under: 'FEATURE_003',
        client_approval_id: null,
        client_purchase_order_id: null,
        submission_id: null,
        submission_route: null,
      });
    }

    const later = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO client_advances (id, project_id, amount, received_on, created_by, updated_at, updated_by)
       VALUES ('${later}', '${seeded.projects[1]}', 5000.00, DATE '2026-11-01', '${seeded.staff}', now(), '${seeded.staff}')`,
    );
    const [fresh] = await db.$queryRawUnsafe<{ recorded_under: string }[]>(`SELECT recorded_under::text FROM client_advances WHERE id = '${later}'`);
    expect(fresh.recorded_under).toBe('FEATURE_006');
  }, 300000);

  // Owner decision 2026-11-18: the database itself allows only the six FR-025 status changes.
  it('accepts exactly the six allowed status changes and refuses every other one and NULLs at database level', async () => {
    const quotation = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO client_quotations (id, project_id, reference, title, created_by, updated_at, updated_by)
       VALUES ('${quotation}', '${seeded.projects[0]}', 'Q-900001', 'Works', '${seeded.staff}', now(), '${seeded.staff}')`,
    );
    let number = 0;
    const revision = async () => {
      number += 1;
      const id = randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO quotation_revisions (id, client_quotation_id, number, amount, quotation_date, reason, created_by, updated_at, updated_by)
         VALUES ('${id}', '${quotation}', ${number}, 1000.00, DATE '2026-11-01', 'r', '${seeded.staff}', now(), '${seeded.staff}')`,
      );
      return id;
    };
    const change = async (from: string | null, to: string | null) => {
      const value = (s: string | null) => (s === null ? 'NULL' : `'${s}'`);
      await db.$executeRawUnsafe(
        `INSERT INTO quotation_status_changes (id, quotation_revision_id, from_status, to_status, reason, created_by, updated_at, updated_by)
         VALUES ('${randomUUID()}', '${await revision()}', ${value(from)}, ${value(to)}, 'reason', '${seeded.staff}', now(), '${seeded.staff}')`,
      );
    };
    const allowed = [
      ['DRAFT', 'SUBMITTED'],
      ['DRAFT', 'WITHDRAWN'],
      ['SUBMITTED', 'UNDER_REVIEW'],
      ['SUBMITTED', 'WITHDRAWN'],
      ['UNDER_REVIEW', 'APPROVED'],
      ['UNDER_REVIEW', 'REJECTED'],
    ];
    for (const [from, to] of allowed) await expect(change(from, to), `${from}>${to}`).resolves.toBeUndefined();

    const statuses = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
    const refused = statuses.flatMap((from) => statuses.map((to) => [from, to])).filter(([from, to]) => !allowed.some(([f, t]) => f === from && t === to));
    expect(refused).toHaveLength(30);
    for (const [from, to] of refused) await expect(change(from, to), `${from}>${to}`).rejects.toThrow(/quotation_status_changes_transition_ck/);
    for (const [from, to] of [[null, 'SUBMITTED'], ['DRAFT', null], [null, null]] as const) {
      await expect(change(from, to), `${from}>${to}`).rejects.toThrow(/null value|not-null|23502/i);
    }
    const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM quotation_status_changes`);
    expect(Number(n)).toBe(6);
  }, 300000);
});
