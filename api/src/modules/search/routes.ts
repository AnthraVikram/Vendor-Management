import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncRoute } from '../async-route';

// Feature 005 FR-037: the header search. Up to 5 vendors (name, phone) and 5 projects (name, client name), archived
// included and marked; records whose name matches come before those matched on the other field.

const LIMIT = 5;
const searchSchema = z.object({
  q: z.string({ message: 'Type 2 to 100 characters.' }).trim().min(2, 'Type 2 to 100 characters.').max(100, 'Type 2 to 100 characters.'),
});

export const searchRouter = Router();

searchRouter.get(
  '/search',
  asyncRoute(async (req, res) => {
    const { q } = searchSchema.parse(req.query);
    const has = { contains: q, mode: 'insensitive' } as const;
    const vendorSelect = { id: true, name: true, phone: true, archived: true };
    const projectSelect = { id: true, name: true, clientName: true, archived: true };

    const [vendorsByName, projectsByName] = await Promise.all([
      prisma.vendor.findMany({ where: { name: has }, select: vendorSelect, orderBy: { name: 'asc' }, take: LIMIT }),
      prisma.project.findMany({ where: { name: has }, select: projectSelect, orderBy: { name: 'asc' }, take: LIMIT }),
    ]);
    const [vendorsByPhone, projectsByClient] = await Promise.all([
      prisma.vendor.findMany({
        where: { phone: has, NOT: { name: has } }, select: vendorSelect, orderBy: { name: 'asc' }, take: LIMIT - vendorsByName.length,
      }),
      prisma.project.findMany({
        where: { clientName: has, NOT: { name: has } }, select: projectSelect, orderBy: { name: 'asc' }, take: LIMIT - projectsByName.length,
      }),
    ]);

    res.json({
      vendors: [...vendorsByName, ...vendorsByPhone],
      projects: [...projectsByName, ...projectsByClient].map(({ clientName, ...project }) => ({ ...project, client_name: clientName })),
    });
  }),
);
