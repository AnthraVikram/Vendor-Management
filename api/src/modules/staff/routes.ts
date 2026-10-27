import { Router } from 'express';
import { z } from 'zod';
import type { StaffRole } from '@prisma/client';
import { prisma } from '../../db';
import { HttpError } from '../../lib/http';
import { hashPassword } from '../../lib/passwords';
import { leavesNoActiveAdministrator } from '../../lib/last-admin';
import { changesOwnRole } from '../../lib/own-role';
import { asyncRoute } from '../async-route';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('Email is required.'),
  phone: z.string().trim().optional(),
  role: z.enum(['ADMINISTRATOR', 'OFFICE_TEAM', 'ACCOUNTANT']),
  password: z.string(),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().nullable().optional(),
    role: z.enum(['ADMINISTRATOR', 'OFFICE_TEAM', 'ACCOUNTANT']).optional(),
    password: z.string().optional(),
    revoked: z.boolean().optional(),
  })
  .strict();

function identity(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  revokedAt: Date | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    revoked: user.revokedAt !== null,
  };
}

export const staffRouter = Router();

staffRouter.get(
  '/',
  asyncRoute(async (_req, res) => {
    const users = await prisma.staffUser.findMany({ orderBy: { name: 'asc' } });
    res.json(users.map(identity));
  }),
);

staffRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await prisma.staffUser.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'That email is already in use.', { code: 'EMAIL_IN_USE' });
    }
    const passwordHash = await hashPassword(body.password);
    const actor = req.staff!.id;
    const user = await prisma.staffUser.create({
      data: {
        name: body.name,
        email,
        phone: body.phone || null,
        role: body.role,
        passwordHash,
        createdById: actor,
        updatedById: actor,
      },
    });
    res.status(201).json(identity(user));
  }),
);

staffRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const actor = req.staff!.id;
    const updated = await prisma.$transaction(async (tx) => {
      // Lock the target and every active administrator so concurrent revokes and demotions run one at a time.
      await tx.$queryRaw`SELECT id FROM staff_users WHERE id = ${req.params.id}::uuid OR (role = 'ADMINISTRATOR' AND revoked_at IS NULL) ORDER BY id FOR UPDATE`;
      const target = await tx.staffUser.findUnique({ where: { id: req.params.id } });
      if (!target) throw new HttpError(404, 'Staff account not found.');
      if (changesOwnRole({ callerId: actor, targetId: target.id, currentRole: target.role, nextRole: body.role })) {
        throw new HttpError(403, 'You cannot change your own role.', { code: 'OWN_ROLE' });
      }
      if (body.revoked === true && target.revokedAt) {
        throw new HttpError(409, 'The account is already revoked.', { code: 'ALREADY_REVOKED' });
      }
      const nextRole = body.role ?? target.role;
      const nextRevoked = body.revoked === undefined ? target.revokedAt !== null : body.revoked;
      const activeAdmins = await tx.staffUser.count({
        where: { role: 'ADMINISTRATOR', revokedAt: null },
      });
      if (
        leavesNoActiveAdministrator({
          activeAdministratorCount: activeAdmins,
          targetIsActiveAdministrator: target.role === 'ADMINISTRATOR' && target.revokedAt === null,
          willBeActiveAdministrator: nextRole === 'ADMINISTRATOR' && !nextRevoked,
        })
      ) {
        throw new HttpError(409, 'The firm must keep one active administrator.', {
          code: 'LAST_ADMINISTRATOR',
        });
      }
      const data: {
        name?: string;
        phone?: string | null;
        role?: StaffRole;
        passwordHash?: string;
        revokedAt?: Date | null;
        updatedById: string;
      } = { updatedById: actor };
      if (body.name) data.name = body.name;
      if (body.phone !== undefined) data.phone = body.phone;
      if (body.role) data.role = body.role;
      if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);
      if (body.revoked === true) data.revokedAt = new Date();
      if (body.revoked === false) data.revokedAt = null;
      const saved = await tx.staffUser.update({ where: { id: target.id }, data });
      // Setting the caller's own password through this route stays as it was until T092 is answered.
      if (body.revoked === true || (body.password !== undefined && target.id !== actor)) {
        await tx.session.updateMany({
          where: { staffUserId: target.id, revokedAt: null },
          data: { revokedAt: new Date(), updatedById: actor },
        });
      }
      return saved;
    });
    res.json(identity(updated));
  }),
);
