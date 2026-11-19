import fs from 'node:fs';
import path from 'node:path';
import { checkTestDatabaseUrl } from './test-db-guard';

// Global setup writes the one database URL every worker must use. Without it, refuse rather than fall back to
// whatever DATABASE_URL the shell happens to hold.
const file = path.join(__dirname, '.test-env.json');
if (!fs.existsSync(file)) {
  throw new Error('tests/.test-env.json is missing: run the tests through vitest so global setup can choose the test database.');
}
const values = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
checkTestDatabaseUrl(values.DATABASE_URL);
for (const [key, value] of Object.entries(values)) {
  if (value) process.env[key] = value;
}
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-value';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';
process.env.FILE_STORAGE_DIR ??= path.join(__dirname, '.files');
process.env.API_PORT ??= '4000';
process.env.WEB_PORT ??= '5173';
