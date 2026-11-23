import type { PrismaClient } from '@prisma/client';

// The only database servers tests may touch: the local embedded cluster and the CI service container.
// localhost:5432, where docker-compose serves the development database, is deliberately not on this list.
export const ALLOWED_TEST_SERVERS = ['127.0.0.1:54329', 'postgres:5432'];

export const EMBEDDED_TEST_URL = 'postgresql://vendor:vendor@127.0.0.1:54329/vendor_test';

// Global setup writes this comment on the test database after checking it; a development database never carries it.
export const TEST_DATABASE_MARKER = 'studioflow-disposable-test-database';

export interface TestDatabaseTarget {
  host: string;
  port: number;
  database: string;
}

type RawClient = Pick<PrismaClient, '$queryRaw' | '$executeRawUnsafe'>;

function describe(target: { host: string; port: number | string; database: string }): string {
  return `${target.host}:${target.port}/${target.database}`;
}

// Checks a URL without connecting. Messages name the server and database only, never the credentials.
export function checkTestDatabaseUrl(url: string | undefined): TestDatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(url ?? '');
  } catch {
    throw new Error('Refusing to use the test database: its URL is missing or cannot be read.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('Refusing to use the test database: only postgresql:// URLs are allowed.');
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const where = describe({ host: parsed.hostname, port: parsed.port || '(no port)', database });
  // A host query parameter (for example a socket path) would override the host checked below.
  if (parsed.searchParams.has('host')) {
    throw new Error(`Refusing to use database ${where}: the URL must not carry a host parameter.`);
  }
  if (!ALLOWED_TEST_SERVERS.includes(`${parsed.hostname}:${parsed.port}`)) {
    throw new Error(`Refusing to use database ${where}: tests may only use ${ALLOWED_TEST_SERVERS.join(' or ')}.`);
  }
  if (!/^[a-z0-9_]+_test$/.test(database)) {
    throw new Error(`Refusing to use database ${where}: a test database name must end in _test.`);
  }
  return { host: parsed.hostname, port: Number(parsed.port), database };
}

// The URL tests will use. DATABASE_URL is never read, so a development URL in the shell cannot leak in.
export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.TEST_DATABASE_URL || EMBEDDED_TEST_URL;
  checkTestDatabaseUrl(url);
  return url;
}

async function connectedIdentity(client: RawClient) {
  const [row] = await client.$queryRaw<{ name: string; port: number | null; marker: string | null }[]>`
    SELECT current_database() AS name,
           inet_server_port() AS port,
           shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') AS marker`;
  return row;
}

function sameServer(actual: { name: string; port: number | null }, expected: TestDatabaseTarget): boolean {
  return actual.name === expected.database && actual.port === expected.port;
}

// Global setup only: after checking the URL and the live connection, marks the database as disposable.
export async function claimTestDatabase(client: RawClient, url: string): Promise<void> {
  const expected = checkTestDatabaseUrl(url);
  const actual = await connectedIdentity(client);
  if (!sameServer(actual, expected)) {
    throw new Error(`Refusing to claim database "${actual.name}" on port ${actual.port}: expected ${describe(expected)}.`);
  }
  await client.$executeRawUnsafe(
    `DO $$ BEGIN EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), '${TEST_DATABASE_MARKER}'); END $$`,
  );
}

// Run before anything destructive: the live connection must be the expected, marked test database.
export async function assertConnectedTestDatabase(client: RawClient, url: string | undefined): Promise<void> {
  const expected = checkTestDatabaseUrl(url);
  const actual = await connectedIdentity(client);
  if (!sameServer(actual, expected) || actual.marker !== TEST_DATABASE_MARKER) {
    throw new Error(
      `Refusing to reset database "${actual.name}" on port ${actual.port}: it is not the marked test database ${describe(expected)}.`,
    );
  }
}
