import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../../db';
import { loadConfig } from '../../config';
import { stampCreate } from '../../lib/audit';
import { HttpError } from '../../lib/http';
import { hashPassword, verifyPassword } from '../../lib/passwords';
import { signInRefusal } from '../../lib/sign-in-message';
import { asyncRoute } from '../async-route';
import { sessionCookie, signSession } from '../../middleware/session';

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string(),
  })
  .strict();

export const publicAuthRouter = Router();
export const authRouter = Router();

publicAuthRouter.post(
  '/login',
  asyncRoute(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const user = await prisma.staffUser.findUnique({ where: { email } });
    const hash = user?.passwordHash ?? (await bcrypt.hash('not-a-real-password', 4));
    const passwordOk = await verifyPassword(body.password, hash);
    if (!user || user.revokedAt || !passwordOk) {
      const reason = !user ? 'unknown' : user.revokedAt ? 'revoked' : 'wrong-password';
      throw new HttpError(401, signInRefusal(reason));
    }
    const config = loadConfig();
    const session = await prisma.session.create({
      data: {
        id: randomUUID(),
        staffUserId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ...stampCreate(user.id),
      },
    });
    res.setHeader('Set-Cookie', sessionCookie(signSession(session.id, config.SESSION_SECRET)));
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

authRouter.post(
  '/logout',
  asyncRoute(async (req, res) => {
    if (req.sessionId && req.staff) {
      await prisma.session.update({
        where: { id: req.sessionId },
        data: { revokedAt: new Date(), updatedById: req.staff.id },
      });
    }
    res.setHeader('Set-Cookie', sessionCookie('', true));
    res.json({ status: 'signed-out' });
  }),
);

authRouter.get(
  '/me',
  asyncRoute(async (req, res) => {
    res.json(req.staff);
  }),
);

authRouter.post(
  '/password',
  asyncRoute(async (req, res) => {
    const body = passwordSchema.parse(req.body);
    const user = await prisma.staffUser.findUniqueOrThrow({ where: { id: req.staff!.id } });
    const ok = await verifyPassword(body.current_password, user.passwordHash);
    if (!ok) throw new HttpError(400, 'Check the highlighted fields.', { fields: { current_password: 'Current password is not valid.' } });
    const passwordHash = await hashPassword(body.new_password);
    await prisma.staffUser.update({
      where: { id: user.id },
      data: { passwordHash, updatedById: user.id },
    });
    res.json({ status: 'password-changed' });
  }),
);
