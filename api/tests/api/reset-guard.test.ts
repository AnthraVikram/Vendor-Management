import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { resetDatabase } from '../helpers';
import { assertConnectedTestDatabase } from '../test-db-guard';

// Each case connects to the same allowed server as the suite, but to a database that is not the marked test one.
const PROBE_DB = 'guard_probe_test';

function sameServer(database: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

describe('test database guard on a live connection', () => {
  let maintenance: PrismaClient;
  let probe: PrismaClient;

  beforeAll(async () => {
    maintenance = new PrismaClient({ datasourceUrl: sameServer('postgres') });
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${PROBE_DB}`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE ${PROBE_DB}`);
    probe = new PrismaClient({ datasourceUrl: sameServer(PROBE_DB) });
  });

  afterAll(async () => {
    await probe?.$disconnect();
    await maintenance?.$disconnect();
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
  });

  it('accepts the suite database, which global setup marked', async () => {
    await expect(assertConnectedTestDatabase(prisma, process.env.DATABASE_URL)).resolves.toBeUndefined();
  });

  it('refuses to reset a database other than the one the suite was given', async () => {
    // "postgres" has none of the app tables, so a delete that slipped past the guard would fail differently.
    await expect(resetDatabase(maintenance)).rejects.toThrow(/Refusing to reset database "postgres"/);
  });

  it('refuses an allowed, correctly named database that global setup never marked', async () => {
    await expect(assertConnectedTestDatabase(probe, sameServer(PROBE_DB))).rejects.toThrow(
      /Refusing to reset database "guard_probe_test".*not the marked test database/,
    );
  });

  it('refuses when the connection does not match the URL it was checked against', async () => {
    await expect(assertConnectedTestDatabase(prisma, sameServer(PROBE_DB))).rejects.toThrow(/Refusing to reset database "vendor_test"/);
  });
});
