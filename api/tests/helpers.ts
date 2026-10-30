import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { ResponsibleKind, StaffRole, TimelineItemType, TimelineStatus } from '@prisma/client';
import { createApp } from '../src/app';
import { loadConfig, resetConfigForTests } from '../src/config';
import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/passwords';
import { addDays, todayInIndia } from '../src/lib/india-date';

export const app = createApp();

export async function resetDatabase(): Promise<void> {
  await prisma.historyEntry.deleteMany();
  await prisma.clientAdvanceReversal.deleteMany();
  await prisma.clientAdvance.deleteMany();
  await prisma.document.deleteMany();
  await prisma.vendorImportRow.deleteMany();
  await prisma.vendor.updateMany({ data: { importRunId: null } });
  await prisma.vendorImportRun.deleteMany();
  await prisma.vendorImportPreview.deleteMany();
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

// A fresh, empty FILE_STORAGE_DIR for the next test; the previous one is removed.
let testStorageDir: string | undefined;
export function resetFileStorage(): string {
  if (testStorageDir) fs.rmSync(testStorageDir, { recursive: true, force: true });
  testStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-management-test-files-'));
  process.env.FILE_STORAGE_DIR = testStorageDir;
  resetConfigForTests();
  return testStorageDir;
}

// The 15th of the month n months away from the current India Standard Time month.
export function monthOffset(months: number): string {
  const [year, month] = todayInIndia().split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-15`;
}

export async function createAdvance(input: { projectId: string; amount: string; receivedOn: string; actorId: string }) {
  return prisma.clientAdvance.create({
    data: {
      projectId: input.projectId,
      amount: input.amount,
      receivedOn: new Date(`${input.receivedOn}T00:00:00Z`),
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
}

export async function reverseAdvance(input: { advanceId: string; reason: string; actorId: string; createdAt?: Date }) {
  const advance = await prisma.clientAdvance.findUniqueOrThrow({ where: { id: input.advanceId } });
  return prisma.clientAdvanceReversal.create({
    data: {
      clientAdvanceId: advance.id,
      amount: advance.amount,
      reason: input.reason,
      createdAt: input.createdAt,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
}

// Inserts a document row and writes its bytes under FILE_STORAGE_DIR, so the row never points at a missing file.
export async function createDocument(input: { actorId: string; vendorId?: string; projectId?: string; archived?: boolean }) {
  const bytes = Buffer.from('%PDF-1.4\n% test document\n');
  const storageKey = `${randomUUID()}.pdf`;
  const directory = path.resolve(loadConfig().FILE_STORAGE_DIR);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, storageKey), bytes);
  return prisma.document.create({
    data: {
      vendorId: input.vendorId ?? null,
      projectId: input.projectId ?? null,
      title: 'Test document',
      documentType: 'OTHER',
      originalFilename: 'test.pdf',
      mediaType: 'application/pdf',
      byteSize: bytes.length,
      storageKey,
      archived: input.archived ?? false,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
}
