import { describe, expect, it } from 'vitest';
import { checkTestDatabaseUrl, EMBEDDED_TEST_URL, resolveTestDatabaseUrl } from '../test-db-guard';

const url = (hostPort: string, database: string, query = '') => `postgresql://vendor:s3cret-pass@${hostPort}/${database}${query}`;

describe('checkTestDatabaseUrl', () => {
  it('accepts the embedded test cluster and the CI service', () => {
    expect(checkTestDatabaseUrl(EMBEDDED_TEST_URL)).toEqual({ host: '127.0.0.1', port: 54329, database: 'vendor_test' });
    expect(checkTestDatabaseUrl(url('postgres:5432', 'vendor_test'))).toEqual({ host: 'postgres', port: 5432, database: 'vendor_test' });
    expect(checkTestDatabaseUrl(url('127.0.0.1:54329', 'other_test', '?schema=public')).database).toBe('other_test');
  });

  it.each([
    ['the docker-compose development database', url('localhost:5432', 'vendor')],
    ['a _test name on the development server', url('localhost:5432', 'vendor_test')],
    ['a _test name on 127.0.0.1:5432', url('127.0.0.1:5432', 'vendor_test')],
    ['localhost instead of 127.0.0.1 for the embedded port', url('localhost:54329', 'vendor_test')],
    ['the CI host on another port', url('postgres:5433', 'vendor_test')],
    ['a remote host', url('db.example.com:5432', 'vendor_test')],
    ['no port', url('postgres', 'vendor_test')],
  ])('refuses a server that is not allowed: %s', (_label, target) => {
    expect(() => checkTestDatabaseUrl(target)).toThrow(/tests may only use 127\.0\.0\.1:54329 or postgres:5432/);
  });

  it.each(['vendor', 'vendor_testing', 'vendor_test_backup', 'test', '_test', ''])(
    'refuses the database name "%s" on an allowed server',
    (name) => {
      expect(() => checkTestDatabaseUrl(url('127.0.0.1:54329', name))).toThrow(/must end in _test/);
    },
  );

  it('refuses a host query parameter that would override the checked host', () => {
    expect(() => checkTestDatabaseUrl(url('127.0.0.1:54329', 'vendor_test', '?host=/var/run/postgresql'))).toThrow(/host parameter/);
  });

  it('refuses a missing, unreadable or non-PostgreSQL URL', () => {
    expect(() => checkTestDatabaseUrl(undefined)).toThrow(/missing or cannot be read/);
    expect(() => checkTestDatabaseUrl('not a url')).toThrow(/missing or cannot be read/);
    expect(() => checkTestDatabaseUrl('mysql://vendor@127.0.0.1:54329/vendor_test')).toThrow(/only postgresql/);
  });

  it('never puts the password in a refusal message', () => {
    expect(() => checkTestDatabaseUrl(url('localhost:5432', 'vendor'))).toThrow(expect.objectContaining({ message: expect.not.stringContaining('s3cret-pass') }));
  });
});

describe('resolveTestDatabaseUrl', () => {
  it('ignores DATABASE_URL and uses the embedded cluster', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: url('localhost:5432', 'vendor') })).toBe(EMBEDDED_TEST_URL);
  });

  it('uses TEST_DATABASE_URL when it names an allowed test database', () => {
    const ci = url('postgres:5432', 'vendor_test');
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: ci, DATABASE_URL: url('localhost:5432', 'vendor') })).toBe(ci);
  });

  it('refuses a TEST_DATABASE_URL that points at the development database', () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: url('localhost:5432', 'vendor') })).toThrow(/Refusing/);
  });
});
