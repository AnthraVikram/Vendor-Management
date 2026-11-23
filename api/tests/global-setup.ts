import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { claimTestDatabase, EMBEDDED_TEST_URL, resolveTestDatabaseUrl } from './test-db-guard';

const envFile = path.join(__dirname, '.test-env.json');

export default async function setup(): Promise<() => Promise<void>> {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'test-session-secret-value';
  process.env.WEB_ORIGIN ??= 'http://localhost:5173';
  process.env.FILE_STORAGE_DIR ??= path.join(os.tmpdir(), 'vendor-management-files');
  process.env.API_PORT ??= '4000';
  fs.mkdirSync(process.env.FILE_STORAGE_DIR, { recursive: true });

  // A file left by an earlier run must never be read by this run's workers.
  fs.rmSync(envFile, { force: true });
  // Never DATABASE_URL: only TEST_DATABASE_URL or the embedded cluster, and only on an allowed server.
  const databaseUrl = resolveTestDatabaseUrl(process.env);

  let embedded: { stop: () => Promise<void> } | undefined;
  if (databaseUrl === EMBEDDED_TEST_URL) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dataDir = path.join(__dirname, '..', '.pgdata');
    const postgres = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'vendor',
      password: 'vendor',
      port: 54329,
      persistent: true,
    });
    if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
      await postgres.initialise();
    }
    try {
      await postgres.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already') && !message.includes('in use')) throw error;
    }
    try {
      await postgres.createDatabase('vendor_test');
    } catch {
      // The cluster may already contain the database from a previous run.
    }
    embedded = postgres;
  }
  process.env.DATABASE_URL = databaseUrl;

  try {
    // Check the live connection and mark the database before the first write to it.
    const client = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      await claimTestDatabase(client, databaseUrl);
    } finally {
      await client.$disconnect();
    }
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
  } catch (error) {
    await embedded?.stop();
    throw error;
  }

  // Workers take the database URL from this file only (see setup-env.ts).
  fs.writeFileSync(
    envFile,
    JSON.stringify({
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: process.env.SESSION_SECRET,
      WEB_ORIGIN: process.env.WEB_ORIGIN,
      FILE_STORAGE_DIR: process.env.FILE_STORAGE_DIR,
      API_PORT: process.env.API_PORT,
      NODE_ENV: 'test',
    }),
  );

  return async () => {
    await embedded?.stop();
  };
}
