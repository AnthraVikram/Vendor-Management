import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { StaffRole } from '@prisma/client';
import { loadConfig } from '../config';
import { prisma } from '../db';
import { HttpError } from '../lib/http';

export const SESSION_COOKIE = 'sid';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function signSession(id: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(id).digest('base64url');
  return `${id}.${mac}`;
}

export function readSessionId(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(id).digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return id;
}

export function sessionCookie(token: string, clear = false): string {
  const config = loadConfig();
  const parts = [`${SESSION_COOKIE}=${clear ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  parts.push(clear ? 'Max-Age=0' : `Max-Age=${MAX_AGE_SECONDS}`);
  const local = /localhost|127\.0\.0\.1/.test(config.WEB_ORIGIN);
  if (!local) parts.push('Secure');
  return parts.join('; ');
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const config = loadConfig();
    const token = cookieValue(req.headers.cookie, SESSION_COOKIE);
    if (!token) throw new HttpError(401, 'Sign in required.');
    const sessionId = readSessionId(token, config.SESSION_SECRET);
    if (!sessionId) throw new HttpError(401, 'Sign in required.');
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { staffUser: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.staffUser.revokedAt) {
      throw new HttpError(401, 'Sign in required.');
    }
    req.staff = {
      id: session.staffUser.id,
      name: session.staffUser.name,
      email: session.staffUser.email,
      role: session.staffUser.role,
    };
    req.sessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.staff) {
      next(new HttpError(401, 'Sign in required.'));
      return;
    }
    if (roles.length > 0 && !roles.includes(req.staff.role)) {
      next(new HttpError(403, 'You cannot manage staff accounts.'));
      return;
    }
    next();
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    staff?: { id: string; name: string; email: string; role: StaffRole };
    sessionId?: string;
  }
}
