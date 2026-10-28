import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  FILE_STORAGE_DIR: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  API_PORT: z.coerce.number().default(4000),
  WEB_PORT: z.coerce.number().default(5173),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_OFFICE_PASSWORD: z.string().min(8).optional(),
  SEED_ACCOUNTANT_PASSWORD: z.string().min(8).optional(),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
