import fs from 'node:fs';
import path from 'node:path';

const file = path.join(__dirname, '.test-env.json');
if (fs.existsSync(file)) {
  const values = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  for (const [key, value] of Object.entries(values)) {
    if (value) process.env[key] = value;
  }
}
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-value';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';
process.env.FILE_STORAGE_DIR ??= path.join(__dirname, '.files');
process.env.API_PORT ??= '4000';
process.env.WEB_PORT ??= '5173';
