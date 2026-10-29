import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http';

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : 'body';
      if (!fields[key]) fields[key] = issue.message;
    }
    res.status(400).json({ message: 'Check the highlighted fields.', fields });
    return;
  }
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = { message: err.message };
    if (err.code) body.code = err.code;
    if (err.fields) body.fields = err.fields;
    if (err.extra) Object.assign(body, err.extra);
    res.status(err.status).json(body);
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ message: 'That value is already in use.', code: 'CONFLICT' });
    return;
  }
  console.error(err instanceof Error ? err.message : 'Unknown error');
  res.status(500).json({ message: 'Something went wrong.' });
}
