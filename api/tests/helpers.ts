import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ResponsibleKind, StaffRole, TimelineItemType, TimelineStatus } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/passwords';
import { addDays, todayInIndia } from '../src/lib/india-date';

export const app = createApp();

export async function resetDatabase(): Promise<void> {
  await prisma.coordinationIssueVendor.deleteMany();
  await prisma.coordinationIssue.deleteMany();
  await prisma.delay.deleteMany();
  await prisma.timelineProgressUpdate.deleteMany();
  await prisma.timelineResponsibleChange.deleteMany();
  await prisma.timelineDateChange.deleteMany();
  await prisma.timelineItem.deleteMany();
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

export function dayOffset(days: number): string {
  return addDays(todayInIndia(), days);
}

export async function linkVendor(actorId: string, vendorId: string, projectId: string) {
  return prisma.vendorProjectLink.create({
    data: { vendorId, projectId, createdById: actorId, updatedById: actorId },
  });
}

export async function createTimelineItem(
  actorId: string,
  input: {
    projectId: string;
    name: string;
    deadline: string;
    itemType?: TimelineItemType;
    plannedDate?: string;
    responsibleKind?: ResponsibleKind;
    responsibleVendorId?: string;
    archived?: boolean;
  },
) {
  return prisma.timelineItem.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      itemType: input.itemType ?? 'ACTIVITY',
      deadline: new Date(`${input.deadline}T00:00:00Z`),
      plannedDate: input.plannedDate ? new Date(`${input.plannedDate}T00:00:00Z`) : null,
      responsibleKind: input.responsibleKind ?? (input.responsibleVendorId ? 'VENDOR' : 'NONE'),
      responsibleVendorId: input.responsibleVendorId ?? null,
      archived: input.archived ?? false,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

export async function insertProgressUpdate(input: {
  itemId: string;
  status: TimelineStatus;
  actorId: string;
  createdAt?: Date;
  note?: string;
}) {
  return prisma.timelineProgressUpdate.create({
    data: {
      timelineItemId: input.itemId,
      status: input.status,
      note: input.note,
      createdAt: input.createdAt,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
}

export function indiaNoon(date: string): Date {
  return new Date(`${date}T06:30:00Z`);
}
