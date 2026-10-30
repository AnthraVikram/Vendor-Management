import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, type StaffRole } from '@prisma/client';
import { hashPassword } from '../src/lib/passwords';
import { stampCreate } from '../src/lib/audit';
import { recordHistory } from '../src/lib/history';
import { addDays, currentMonthInIndia, toDateColumn, todayInIndia } from '../src/lib/india-date';

const prisma = new PrismaClient();

const SAMPLE_PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function staff(email: string, name: string, role: StaffRole, password: string, actorId?: string) {
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) return existing;
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const owner = actorId ?? id;
  return prisma.staffUser.create({
    data: {
      id,
      name,
      email,
      role,
      passwordHash,
      createdById: owner,
      updatedById: owner,
    },
  });
}

async function category(name: string, actorId: string) {
  const rows = await prisma.category.findMany();
  const found = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  return prisma.category.create({ data: { name, ...stampCreate(actorId) } });
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const officePassword = process.env.SEED_OFFICE_PASSWORD;
  const accountantPassword = process.env.SEED_ACCOUNTANT_PASSWORD;
  if (!adminPassword || !officePassword || !accountantPassword) {
    throw new Error('Set SEED_ADMIN_PASSWORD, SEED_OFFICE_PASSWORD, and SEED_ACCOUNTANT_PASSWORD.');
  }
  const admin = await staff('admin@example.com', 'Asha Admin', 'ADMINISTRATOR', adminPassword);
  const office = await staff('office@example.com', 'Omar Office', 'OFFICE_TEAM', officePassword, admin.id);
  const accountant = await staff('accountant@example.com', 'Anil Accountant', 'ACCOUNTANT', accountantPassword, admin.id);

  const carpentry = await category('Carpentry', admin.id);
  const electrical = await category('Electrical', admin.id);

  async function vendor(input: {
    name: string;
    phone: string;
    categoryId: string;
    location: string;
    availability: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
    rate?: string;
  }) {
    const existing = await prisma.vendor.findFirst({ where: { phone: input.phone } });
    if (existing) return existing;
    return prisma.vendor.create({
      data: {
        name: input.name,
        phone: input.phone,
        gstRegistered: false,
        availability: input.availability,
        teamSize: 4,
        ...stampCreate(admin.id),
        categories: { create: [{ categoryId: input.categoryId, ...stampCreate(admin.id) }] },
        locations: { create: [{ label: input.location, ...stampCreate(admin.id) }] },
        rates: input.rate
          ? { create: [{ label: 'Day rate', amount: input.rate, unit: 'day', ...stampCreate(admin.id) }] }
          : undefined,
      },
    });
  }

  const mehta = await vendor({
    name: 'Mehta Carpentry',
    phone: '9800000001',
    categoryId: carpentry.id,
    location: 'Chennai',
    availability: 'AVAILABLE',
    rate: '1800.00',
  });
  await vendor({
    name: 'Rao Electrical',
    phone: '9800000002',
    categoryId: electrical.id,
    location: 'Bengaluru',
    availability: 'LIMITED',
    rate: '2200.00',
  });

  async function project(name: string) {
    const existing = await prisma.project.findFirst({ where: { name } });
    if (existing) return existing;
    return prisma.project.create({
      data: { name, status: 'ACTIVE', clientName: 'Sample client', ...stampCreate(admin.id) },
    });
  }
  const lake = await project('Lake House');
  const studio = await project('Studio Fit-out');

  async function link(projectId: string) {
    const existing = await prisma.vendorProjectLink.findUnique({
      where: { vendorId_projectId: { vendorId: mehta.id, projectId } },
    });
    if (existing) return existing;
    return prisma.vendorProjectLink.create({
      data: {
        vendorId: mehta.id,
        projectId,
        roleOnProject: 'Carpentry',
        scopeOfWork: 'Joinery',
        ...stampCreate(admin.id),
      },
    });
  }
  await link(lake.id);
  await link(studio.id);

  async function pricedSchedule(projectId: string, task: string, workDate: string, amount: string) {
    const existing = await prisma.workSchedule.findFirst({ where: { projectId, task } });
    if (existing) return existing;
    const schedule = await prisma.workSchedule.create({
      data: {
        vendorId: mehta.id,
        projectId,
        task,
        workDate: new Date(`${workDate}T00:00:00.000Z`),
        startTime: '09:00',
        endTime: '12:00',
        requiredTeamSize: 3,
        pricingMode: 'FIXED',
        ...stampCreate(office.id),
      },
    });
    await prisma.taskPriceEntry.create({
      data: { scheduleId: schedule.id, amount, kind: 'CHARGE', ...stampCreate(office.id) },
    });
    return schedule;
  }

  await pricedSchedule(lake.id, 'Floor tiling', '2026-11-02', '1000.00');
  await pricedSchedule(studio.id, 'Wardrobes', '2026-11-03', '2500.00');

  const sheetTask = 'Site measure sheet';
  const existingSheet = await prisma.workSchedule.findFirst({ where: { task: sheetTask } });
  if (!existingSheet) {
    const schedule = await prisma.workSchedule.create({
      data: {
        vendorId: mehta.id,
        projectId: lake.id,
        task: sheetTask,
        workDate: new Date('2026-11-04T00:00:00.000Z'),
        startTime: '14:00',
        endTime: '17:00',
        requiredTeamSize: 2,
        pricingMode: 'FILE',
        ...stampCreate(office.id),
      },
    });
    const directory = path.resolve(process.env.FILE_STORAGE_DIR ?? './storage');
    await fs.mkdir(directory, { recursive: true });
    const storageKey = `${randomUUID()}.pdf`;
    await fs.writeFile(path.join(directory, storageKey), SAMPLE_PDF);
    await prisma.costingSheetFile.create({
      data: {
        scheduleId: schedule.id,
        storageKey,
        originalFilename: 'measure.pdf',
        mediaType: 'application/pdf',
        byteSize: SAMPLE_PDF.length,
        ...stampCreate(office.id),
      },
    });
  }

  const today = todayInIndia();
  const indiaNoon = (offset: number) => new Date(`${addDays(today, offset)}T06:30:00Z`);
  async function timelineItem(input: {
    name: string;
    itemType: 'MILESTONE' | 'ACTIVITY';
    deadline: number;
    responsible?: 'VENDOR' | 'FIRM_TEAM';
    updates?: { status: 'IN_PROGRESS' | 'DONE'; daysAgo: number; note: string }[];
  }) {
    const existing = await prisma.timelineItem.findFirst({ where: { projectId: lake.id, name: input.name } });
    if (existing) return existing;
    const item = await prisma.timelineItem.create({
      data: {
        projectId: lake.id,
        name: input.name,
        itemType: input.itemType,
        deadline: toDateColumn(addDays(today, input.deadline)),
        responsibleKind: input.responsible ?? 'NONE',
        responsibleVendorId: input.responsible === 'VENDOR' ? mehta.id : null,
        ...stampCreate(office.id),
      },
    });
    for (const update of input.updates ?? []) {
      await prisma.timelineProgressUpdate.create({
        data: {
          timelineItemId: item.id,
          status: update.status,
          note: update.note,
          createdAt: indiaNoon(-update.daysAgo),
          ...stampCreate(office.id),
        },
      });
    }
    return item;
  }

  const overdueJoinery = await timelineItem({
    name: 'Kitchen joinery',
    itemType: 'ACTIVITY',
    deadline: -3,
    responsible: 'VENDOR',
    updates: [{ status: 'IN_PROGRESS', daysAgo: 4, note: 'Carcasses on site' }],
  });
  await timelineItem({ name: 'Client walkthrough', itemType: 'MILESTONE', deadline: 4 });
  await timelineItem({
    name: 'Ceiling wiring',
    itemType: 'ACTIVITY',
    deadline: 20,
    updates: [{ status: 'IN_PROGRESS', daysAgo: 8, note: 'First fix started' }],
  });
  await timelineItem({
    name: 'Demolition',
    itemType: 'ACTIVITY',
    deadline: -10,
    updates: [{ status: 'DONE', daysAgo: 9, note: 'Debris cleared' }],
  });
  await timelineItem({ name: 'Material selection', itemType: 'ACTIVITY', deadline: 12, responsible: 'FIRM_TEAM' });

  const delayReason = 'Laminate shipment arrived late';
  if (!(await prisma.delay.findFirst({ where: { projectId: lake.id, reason: delayReason } }))) {
    await prisma.delay.create({
      data: { projectId: lake.id, timelineItemId: overdueJoinery.id, reason: delayReason, ...stampCreate(office.id) },
    });
  }
  const issueText = 'Carpenter and electrician both need the kitchen ceiling this week';
  if (!(await prisma.coordinationIssue.findFirst({ where: { projectId: lake.id, description: issueText } }))) {
    await prisma.coordinationIssue.create({
      data: {
        projectId: lake.id,
        timelineItemId: overdueJoinery.id,
        description: issueText,
        ...stampCreate(office.id),
        vendors: { create: [{ vendorId: mehta.id, ...stampCreate(office.id) }] },
      },
    });
  }

  // Client advances (data-model.md, Seed additions). Found again by project, amount, and a fixed seed
  // reference, so rerunning the seed on a later day does not add rows even though dates are relative.
  const lastMonth = addDays(currentMonthInIndia().start, -10);
  async function advance(input: {
    projectId: string;
    amount: string;
    receivedOn: string;
    reference: string;
    paymentMethod: 'BANK_TRANSFER' | 'UPI' | 'CHEQUE';
    reversalReason?: string;
  }) {
    let row = await prisma.clientAdvance.findFirst({
      where: { projectId: input.projectId, amount: input.amount, reference: input.reference },
      include: { reversal: true },
    });
    if (!row) {
      row = await prisma.$transaction(async (tx) => {
        const created = await tx.clientAdvance.create({
          data: {
            projectId: input.projectId,
            amount: input.amount,
            receivedOn: toDateColumn(input.receivedOn),
            paymentMethod: input.paymentMethod,
            reference: input.reference,
            ...stampCreate(accountant.id),
          },
          include: { reversal: true },
        });
        await recordHistory(tx, {
          target: { clientAdvanceId: created.id },
          action: 'CREATED',
          actorId: accountant.id,
          details: { amount: input.amount, received_on: input.receivedOn },
        });
        return created;
      });
    }
    if (input.reversalReason && !row.reversal) {
      const reason = input.reversalReason;
      const advanceId = row.id;
      await prisma.$transaction(async (tx) => {
        await tx.clientAdvanceReversal.create({
          data: { clientAdvanceId: advanceId, amount: input.amount, reason, ...stampCreate(accountant.id) },
        });
        await recordHistory(tx, {
          target: { clientAdvanceId: advanceId },
          action: 'REVERSED',
          actorId: accountant.id,
          details: { amount: input.amount, reason },
        });
      });
    }
  }
  await advance({ projectId: lake.id, amount: '150000.00', receivedOn: today, reference: 'SEED-ADV-1', paymentMethod: 'UPI' });
  await advance({
    projectId: lake.id,
    amount: '100000.00',
    receivedOn: lastMonth,
    reference: 'SEED-ADV-2',
    paymentMethod: 'BANK_TRANSFER',
    reversalReason: 'Entered against the wrong project.',
  });
  await advance({ projectId: studio.id, amount: '75000.00', receivedOn: lastMonth, reference: 'SEED-ADV-3', paymentMethod: 'CHEQUE' });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
