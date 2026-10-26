import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { StaffRole } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/passwords';

export const app = createApp();

export async function resetDatabase(): Promise<void> {
  await prisma.costingSheetFile.deleteMany();
  await prisma.taskPriceEntry.deleteMany();
  await prisma.workSchedule.deleteMany();
  await prisma.vendorProjectLink.deleteMany();
  await prisma.vendorRating.deleteMany();
  await prisma.vendorNote.deleteMany();
  await prisma.vendorRate.deleteMany();
  await prisma.vendorMaterial.deleteMany();
  await prisma.vendorService.deleteMany();
  await prisma.vendorLocation.deleteMany();
  await prisma.vendorCategory.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.project.deleteMany();
  await prisma.category.deleteMany();
  await prisma.session.deleteMany();
  await prisma.staffUser.deleteMany();
}

export async function createUser(input: {
  email: string;
  role?: StaffRole;
  password?: string;
  revoked?: boolean;
  actorId?: string;
  name?: string;
}) {
  const id = randomUUID();
  return prisma.staffUser.create({
    data: {
      id,
      name: input.name ?? input.email,
      email: input.email,
      role: input.role ?? 'ADMINISTRATOR',
      passwordHash: await hashPassword(input.password ?? 'password1'),
      revokedAt: input.revoked ? new Date() : null,
      createdById: input.actorId ?? id,
      updatedById: input.actorId ?? id,
    },
  });
}

export async function signIn(email: string, password = 'password1') {
  const client = request.agent(app);
  const response = await client.post('/api/auth/login').send({ email, password });
  return { client, response };
}

export async function createCategory(actorId: string, name: string) {
  return prisma.category.create({
    data: { name, createdById: actorId, updatedById: actorId },
  });
}

export async function createVendor(actorId: string, input: { name: string; phone: string; categoryId: string; location?: string; availability?: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' }) {
  return prisma.vendor.create({
    data: {
      name: input.name,
      phone: input.phone,
      gstRegistered: false,
      availability: input.availability,
      createdById: actorId,
      updatedById: actorId,
      categories: { create: [{ categoryId: input.categoryId, createdById: actorId, updatedById: actorId }] },
      locations: input.location
        ? { create: [{ label: input.location, createdById: actorId, updatedById: actorId }] }
        : undefined,
    },
  });
}

export async function createProject(actorId: string, name: string, status: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' = 'ACTIVE') {
  return prisma.project.create({
    data: { name, status, createdById: actorId, updatedById: actorId },
  });
}
