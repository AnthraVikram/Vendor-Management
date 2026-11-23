import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type {
  DocumentType,
  EntryStatus,
  PrismaClient,
  RecordDecision,
  RecordedUnder,
  ReceiptType,
  ResponsibleKind,
  RevisionStatus,
  StaffRole,
  TimelineItemType,
  TimelineStatus,
} from '@prisma/client';
import { createApp } from '../src/app';
import { loadConfig, resetConfigForTests } from '../src/config';
import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/passwords';
import { addDays, todayInIndia } from '../src/lib/india-date';
import { assertConnectedTestDatabase } from './test-db-guard';

export const app = createApp();

export async function resetDatabase(client: PrismaClient = prisma): Promise<void> {
  // Independent of global setup: refuse unless this live connection is the marked test database.
  await assertConnectedTestDatabase(client, process.env.DATABASE_URL);
  await client.historyEntry.deleteMany();
  // Feature 006: RESTRICT foreign keys, so decisions and attachments go before the records they point to.
  await client.financialAttachmentRemoval.deleteMany();
  // A supersede chain points at itself; remove the attachments nobody supersedes until none are left.
  while ((await client.financialAttachment.deleteMany({ where: { supersededBy: { is: null } } })).count > 0);
  await client.clientReceiptDecision.deleteMany();
  await client.purchaseOrderCancellation.deleteMany();
  await client.purchaseOrderDecision.deleteMany();
  await client.clientAdvanceReversal.deleteMany();
  await client.clientAdvance.deleteMany();
  await client.clientPurchaseOrder.deleteMany();
  await client.clientApproval.deleteMany();
  await client.quotationStatusChange.deleteMany();
  await client.quotationRevision.deleteMany();
  await client.clientQuotation.deleteMany();
  await client.document.deleteMany();
  await client.vendorImportRow.deleteMany();
  await client.vendor.updateMany({ data: { importRunId: null } });
  await client.vendorImportRun.deleteMany();
  await client.vendorImportPreview.deleteMany();
  await client.coordinationIssueVendor.deleteMany();
  await client.coordinationIssue.deleteMany();
  await client.delay.deleteMany();
  await client.timelineProgressUpdate.deleteMany();
  await client.timelineResponsibleChange.deleteMany();
  await client.timelineDateChange.deleteMany();
  await client.timelineItem.deleteMany();
  await client.costingSheetFile.deleteMany();
  await client.taskPriceEntry.deleteMany();
  await client.workSchedule.deleteMany();
  // Feature 005: sections reference projects and vendors with RESTRICT, so they go first.
  await client.sectionAssignment.deleteMany();
  await client.projectSection.deleteMany();
  await client.vendorProjectLink.deleteMany();
  await client.vendorRating.deleteMany();
  await client.vendorNote.deleteMany();
  await client.vendorRate.deleteMany();
  await client.vendorMaterial.deleteMany();
  await client.vendorService.deleteMany();
  await client.vendorLocation.deleteMany();
  await client.vendorCategory.deleteMany();
  await client.vendor.deleteMany();
  await client.project.deleteMany();
  await client.category.deleteMany();
  await client.session.deleteMany();
  await client.staffUser.deleteMany();
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

export async function createAdvance(input: {
  projectId: string;
  amount: string;
  receivedOn: string;
  actorId: string;
  receiptType?: ReceiptType;
  entryStatus?: EntryStatus;
  recordedUnder?: RecordedUnder;
}) {
  return prisma.clientAdvance.create({
    data: {
      projectId: input.projectId,
      amount: input.amount,
      receivedOn: new Date(`${input.receivedOn}T00:00:00Z`),
      receiptType: input.receiptType,
      entryStatus: input.entryStatus,
      recordedUnder: input.recordedUnder,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
}

// ---------------------------------------------------------------------------
// Feature 006 fixtures: written directly with Prisma, for test setup only.
// ---------------------------------------------------------------------------

const day = (date: string) => new Date(`${date}T00:00:00Z`);

// An advance as Feature 003 recorded it before the Feature 006 migration (FR-013).
export async function createLegacyAdvance(input: { projectId: string; amount: string; receivedOn: string; actorId: string }) {
  return createAdvance({ ...input, recordedUnder: 'FEATURE_003' });
}

export async function createProjectDocument(
  actorId: string,
  input: { projectId?: string; vendorId?: string; documentType?: DocumentType; title?: string; archived?: boolean },
) {
  return prisma.document.create({
    data: {
      projectId: input.vendorId ? null : input.projectId,
      vendorId: input.vendorId ?? null,
      title: input.title ?? 'Document',
      documentType: input.documentType ?? 'OTHER',
      originalFilename: 'file.pdf',
      mediaType: 'application/pdf',
      byteSize: 10,
      storageKey: randomUUID(),
      archived: input.archived ?? false,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

export async function createQuotation(actorId: string, projectId: string, input: { title?: string; amount?: string; quotationDate?: string } = {}) {
  const [{ next }] = await prisma.$queryRaw<{ next: bigint }[]>`SELECT nextval('client_quotation_reference_seq') AS next`;
  const quotation = await prisma.clientQuotation.create({
    data: {
      projectId,
      reference: `Q-${String(next).padStart(6, '0')}`,
      title: input.title ?? 'Interior works',
      createdById: actorId,
      updatedById: actorId,
    },
  });
  const revision = await addRevision(actorId, quotation.id, { amount: input.amount ?? '1840000.00', quotationDate: input.quotationDate });
  return { quotation, revision };
}

export async function addRevision(actorId: string, quotationId: string, input: { amount: string; reason?: string; quotationDate?: string }) {
  const newest = await prisma.quotationRevision.findFirst({ where: { clientQuotationId: quotationId }, orderBy: { number: 'desc' } });
  const number = (newest?.number ?? 0) + 1;
  return prisma.quotationRevision.create({
    data: {
      clientQuotationId: quotationId,
      number,
      amount: input.amount,
      quotationDate: day(input.quotationDate ?? addDays(todayInIndia(), -1)),
      reason: number === 1 ? null : (input.reason ?? 'Revised scope'),
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

export async function setRevisionStatus(actorId: string, revisionId: string, from: RevisionStatus, to: RevisionStatus, reason?: string) {
  return prisma.quotationStatusChange.create({
    data: {
      quotationRevisionId: revisionId,
      fromStatus: from,
      toStatus: to,
      reason: reason ?? (to === 'REJECTED' || to === 'WITHDRAWN' ? 'Reason' : null),
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

// Takes a Draft revision through Submitted and Under review to Approved, with its approval (FR-026).
export async function approveRevision(actorId: string, revisionId: string) {
  const revision = await prisma.quotationRevision.findUniqueOrThrow({ where: { id: revisionId } });
  await setRevisionStatus(actorId, revisionId, 'DRAFT', 'SUBMITTED');
  await setRevisionStatus(actorId, revisionId, 'SUBMITTED', 'UNDER_REVIEW');
  await setRevisionStatus(actorId, revisionId, 'UNDER_REVIEW', 'APPROVED');
  return prisma.clientApproval.create({
    data: { quotationRevisionId: revisionId, amount: revision.amount, createdById: actorId, updatedById: actorId },
  });
}

export async function createPurchaseOrder(
  actorId: string,
  input: { projectId: string; approvalId: string; poNumber?: string; amount: string; poDate?: string; entryStatus?: EntryStatus },
) {
  return prisma.clientPurchaseOrder.create({
    data: {
      projectId: input.projectId,
      clientApprovalId: input.approvalId,
      poNumber: input.poNumber ?? 'PO/2026/118',
      poDate: day(input.poDate ?? addDays(todayInIndia(), -1)),
      amount: input.amount,
      entryStatus: input.entryStatus ?? 'VERIFIED_ON_ENTRY',
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

export async function decidePurchaseOrder(actorId: string, poId: string, decision: RecordDecision, reason?: string) {
  return prisma.purchaseOrderDecision.create({
    data: { clientPurchaseOrderId: poId, decision, reason: reason ?? (decision === 'VERIFIED' ? null : 'Reason'), createdById: actorId, updatedById: actorId },
  });
}

export async function cancelPurchaseOrder(actorId: string, poId: string, reason = 'Client replaced the PO') {
  return prisma.purchaseOrderCancellation.create({
    data: { clientPurchaseOrderId: poId, reason, createdById: actorId, updatedById: actorId },
  });
}

export async function createReceipt(
  actorId: string,
  input: {
    projectId: string;
    amount: string;
    receivedOn?: string;
    receiptType?: ReceiptType;
    entryStatus?: EntryStatus;
    approvalId?: string;
    poId?: string;
  },
) {
  return prisma.clientAdvance.create({
    data: {
      projectId: input.projectId,
      amount: input.amount,
      receivedOn: day(input.receivedOn ?? addDays(todayInIndia(), -1)),
      receiptType: input.receiptType ?? 'STAGE_PAYMENT',
      entryStatus: input.entryStatus ?? 'VERIFIED_ON_ENTRY',
      clientApprovalId: input.approvalId ?? null,
      clientPurchaseOrderId: input.poId ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

export async function decideReceipt(actorId: string, receiptId: string, decision: RecordDecision, reason?: string) {
  return prisma.clientReceiptDecision.create({
    data: { clientAdvanceId: receiptId, decision, reason: reason ?? (decision === 'VERIFIED' ? null : 'Reason'), createdById: actorId, updatedById: actorId },
  });
}

export type AttachTarget =
  | { kind: 'revision'; id: string }
  | { kind: 'approval'; id: string }
  | { kind: 'purchase_order'; id: string }
  | { kind: 'receipt'; id: string };

export async function attachDocument(actorId: string, input: { documentId: string; record: AttachTarget; supersedesId?: string; reason?: string }) {
  const { kind, id } = input.record;
  return prisma.financialAttachment.create({
    data: {
      documentId: input.documentId,
      quotationRevisionId: kind === 'revision' ? id : null,
      clientApprovalId: kind === 'approval' ? id : null,
      clientPurchaseOrderId: kind === 'purchase_order' ? id : null,
      clientAdvanceId: kind === 'receipt' ? id : null,
      supersedesAttachmentId: input.supersedesId ?? null,
      supersedeReason: input.supersedesId ? (input.reason ?? 'Corrected copy') : null,
      createdById: actorId,
      updatedById: actorId,
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
