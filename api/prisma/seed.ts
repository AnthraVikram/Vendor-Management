import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, type StaffRole } from '@prisma/client';
import { hashPassword } from '../src/lib/passwords';
import { stampCreate } from '../src/lib/audit';
import { recordHistory } from '../src/lib/history';
import { addDays, currentMonthInIndia, toDateColumn, todayInIndia } from '../src/lib/india-date';

const SAMPLE_PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function staff(prisma: PrismaClient, email: string, name: string, role: StaffRole, password: string, actorId?: string) {
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

async function category(prisma: PrismaClient, name: string, actorId: string) {
  const rows = await prisma.category.findMany();
  const found = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  return prisma.category.create({ data: { name, ...stampCreate(actorId) } });
}

// Feature 004 T059: the seed runs only through the client it is given, so a test can call it with its own
// client. It never disconnects or exits; the command-line entry at the end does that.
export async function seed(prisma: PrismaClient): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const officePassword = process.env.SEED_OFFICE_PASSWORD;
  const accountantPassword = process.env.SEED_ACCOUNTANT_PASSWORD;
  if (!adminPassword || !officePassword || !accountantPassword) {
    throw new Error('Set SEED_ADMIN_PASSWORD, SEED_OFFICE_PASSWORD, and SEED_ACCOUNTANT_PASSWORD.');
  }
  const admin = await staff(prisma, 'admin@example.com', 'Asha Admin', 'ADMINISTRATOR', adminPassword);
  const office = await staff(prisma, 'office@example.com', 'Omar Office', 'OFFICE_TEAM', officePassword, admin.id);
  const accountant = await staff(prisma, 'accountant@example.com', 'Anil Accountant', 'ACCOUNTANT', accountantPassword, admin.id);

  const carpentry = await category(prisma, 'Carpentry', admin.id);
  const electrical = await category(prisma, 'Electrical', admin.id);
  const plumbing = await category(prisma, 'Plumbing', admin.id);
  const tiling = await category(prisma, 'Tiling', admin.id);
  const painting = await category(prisma, 'Painting', admin.id);
  const falseCeiling = await category(prisma, 'False ceiling', admin.id);
  const glass = await category(prisma, 'Glass and aluminium', admin.id);

  async function vendor(input: {
    name: string;
    phone: string;
    categoryId: string;
    location: string;
    availability: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
    rate?: string;
    email?: string;
  }) {
    const existing = await prisma.vendor.findFirst({ where: { phone: input.phone } });
    if (existing) return existing;
    return prisma.vendor.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
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
  const rao = await vendor({
    name: 'Rao Electrical',
    phone: '9800000002',
    categoryId: electrical.id,
    location: 'Bengaluru',
    availability: 'LIMITED',
    rate: '2200.00',
  });

  // Feature 004 (FR-032, FR-034): eight more fictional vendors, so seven categories are covered.
  const patel = await vendor({ name: 'Patel Plumbing Works', phone: '9800000003', categoryId: plumbing.id, location: 'Chennai', availability: 'AVAILABLE', email: 'patel.plumbing@example.com' });
  const nair = await vendor({ name: 'Nair Tile Studio', phone: '9800000004', categoryId: tiling.id, location: 'Kochi', availability: 'LIMITED', rate: '95.00' });
  const iyer = await vendor({ name: 'Iyer Painters', phone: '9800000005', categoryId: painting.id, location: 'Chennai', availability: 'AVAILABLE', email: 'iyer.painters@example.com' });
  const khan = await vendor({ name: 'Khan Ceiling Systems', phone: '9800000006', categoryId: falseCeiling.id, location: 'Hyderabad', availability: 'AVAILABLE' });
  await vendor({ name: 'Clearview Glass and Aluminium', phone: '9800000007', categoryId: glass.id, location: 'Bengaluru', availability: 'UNAVAILABLE' });
  const joseph = await vendor({ name: 'Joseph Woodcraft', phone: '9800000008', categoryId: carpentry.id, location: 'Kochi', availability: 'AVAILABLE', rate: '1600.00' });
  await vendor({ name: 'Das Power Fittings', phone: '9800000009', categoryId: electrical.id, location: 'Chennai', availability: 'LIMITED' });
  await vendor({ name: 'Bose Colour Works', phone: '9800000010', categoryId: painting.id, location: 'Bengaluru', availability: 'AVAILABLE', email: 'bose.colour@example.com' });

  const today = todayInIndia();
  const indiaNoon = (offset: number) => new Date(`${addDays(today, offset)}T06:30:00Z`);
  // Dates are relative to the first run; a project found again keeps the dates it was created with.
  async function project(name: string, status: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED', start: number, expected: number) {
    const existing = await prisma.project.findFirst({ where: { name } });
    if (existing) return existing;
    return prisma.project.create({
      data: {
        name,
        status,
        clientName: 'Sample client',
        startDate: toDateColumn(addDays(today, start)),
        expectedCompletionDate: toDateColumn(addDays(today, expected)),
        ...stampCreate(admin.id),
      },
    });
  }
  const lake = await project('Lake House', 'ACTIVE', -60, 15);
  const studio = await project('Studio Fit-out', 'PLANNED', 10, 90);
  const hill = await project('Hill Villa', 'COMPLETED', -150, -30);
  const riverside = await project('Riverside Clinic', 'ON_HOLD', -90, -5);

  async function link(vendorId: string, projectId: string, role: string, scope: string) {
    const existing = await prisma.vendorProjectLink.findFirst({
      where: { vendorId, projectId, removedAt: null },
    });
    if (existing) return existing;
    return prisma.vendorProjectLink.create({
      data: { vendorId, projectId, roleOnProject: role, scopeOfWork: scope, ...stampCreate(admin.id) },
    });
  }
  await link(mehta.id, lake.id, 'Carpentry', 'Joinery');
  await link(mehta.id, studio.id, 'Carpentry', 'Joinery');
  await link(rao.id, lake.id, 'Electrical contractor', 'Wiring and lighting');
  await link(rao.id, hill.id, 'Electrical contractor', 'Full rewiring');
  await link(patel.id, lake.id, 'Plumber', 'Bathrooms and kitchen');
  await link(iyer.id, hill.id, 'Painter', 'Exterior and interior painting');
  await link(khan.id, riverside.id, 'Ceiling contractor', 'Gypsum false ceiling');
  await link(nair.id, riverside.id, 'Tiler', 'Clinic floor tiling');
  await link(joseph.id, studio.id, 'Second carpenter', 'Loose furniture');

  // A past assignment (FR-013a), created only when the pair has never had an assignment.
  if (!(await prisma.vendorProjectLink.findFirst({ where: { vendorId: nair.id, projectId: lake.id } }))) {
    await prisma.vendorProjectLink.create({
      data: {
        vendorId: nair.id,
        projectId: lake.id,
        roleOnProject: 'Tiler',
        scopeOfWork: 'Balcony tiling',
        removedAt: indiaNoon(-20),
        removedById: office.id,
        ...stampCreate(admin.id),
      },
    });
  }

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

  async function timelineItem(input: {
    name: string;
    itemType: 'MILESTONE' | 'ACTIVITY';
    deadline: number;
    responsible?: 'VENDOR' | 'FIRM_TEAM';
    projectId?: string;
    vendorId?: string;
    updates?: { status: 'IN_PROGRESS' | 'DONE'; daysAgo: number; note: string }[];
  }) {
    const projectId = input.projectId ?? lake.id;
    const existing = await prisma.timelineItem.findFirst({ where: { projectId, name: input.name } });
    if (existing) return existing;
    const item = await prisma.timelineItem.create({
      data: {
        projectId,
        name: input.name,
        itemType: input.itemType,
        deadline: toDateColumn(addDays(today, input.deadline)),
        responsibleKind: input.responsible ?? 'NONE',
        responsibleVendorId: input.responsible === 'VENDOR' ? (input.vendorId ?? mehta.id) : null,
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

  // Feature 004 (FR-033): every deadline group, each assignment status, and a Missing update.
  await timelineItem({ name: 'Site measurement sign-off', itemType: 'MILESTONE', deadline: 0, responsible: 'FIRM_TEAM' });
  await timelineItem({
    name: 'Bathroom plumbing',
    itemType: 'ACTIVITY',
    deadline: 6,
    responsible: 'VENDOR',
    vendorId: patel.id,
    updates: [{ status: 'IN_PROGRESS', daysAgo: 10, note: 'Concealed lines laid' }],
  });
  await timelineItem({ name: 'Lighting layout', itemType: 'ACTIVITY', deadline: 25, responsible: 'VENDOR', vendorId: rao.id });
  // The Delayed project (quickstart 3.3) has an upcoming item due after its expected completion date.
  await timelineItem({ name: 'Clinic false ceiling', itemType: 'ACTIVITY', deadline: 10, responsible: 'VENDOR', projectId: riverside.id, vendorId: khan.id });
  await timelineItem({
    name: 'Final electrical inspection',
    itemType: 'MILESTONE',
    deadline: -35,
    responsible: 'VENDOR',
    projectId: hill.id,
    vendorId: rao.id,
    updates: [{ status: 'DONE', daysAgo: 36, note: 'Inspection passed' }],
  });
  await timelineItem({
    name: 'Exterior painting',
    itemType: 'ACTIVITY',
    deadline: -40,
    responsible: 'VENDOR',
    projectId: hill.id,
    vendorId: iyer.id,
    updates: [
      { status: 'IN_PROGRESS', daysAgo: 50, note: 'Primer coat done' },
      { status: 'DONE', daysAgo: 41, note: 'Final coat done' },
    ],
  });

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

// Command-line entry (`prisma db seed` runs `tsx prisma/seed.ts`). Importing this file runs nothing.
if (require.main === module) {
  const client = new PrismaClient();
  seed(client)
    .then(async () => {
      await client.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await client.$disconnect();
      process.exit(1);
    });
}
