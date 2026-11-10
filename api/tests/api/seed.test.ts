import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/db';
import { DEFAULT_SECTIONS } from '../../src/lib/blueprint';
import { createProject, createUser, resetDatabase, signIn } from '../helpers';

// Feature 004 US8 (T058): the seed is a function run through the client it is given, and is safe to run again.
// Test-only passwords; the seed refuses to run without them.
process.env.SEED_ADMIN_PASSWORD = 'seed-admin-test-1';
process.env.SEED_OFFICE_PASSWORD = 'seed-office-test-1';
process.env.SEED_ACCOUNTANT_PASSWORD = 'seed-accountant-test-1';

async function coreCounts() {
  return {
    staff: await prisma.staffUser.count(),
    vendors: await prisma.vendor.count(),
    projects: await prisma.project.count(),
    links: await prisma.vendorProjectLink.count(),
  };
}

// Every table, so a second run can be shown to add nothing anywhere.
async function everyCount(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1);
    counts[model.name] = await (prisma as unknown as Record<string, { count: () => Promise<number> }>)[delegate].count();
  }
  return counts;
}

async function loadSeed() {
  return (await import('../../prisma/seed')).seed;
}

describe('seed (US8)', () => {
  it('runs nothing on import, and writes through the client it is given without disconnecting it', async () => {
    // No reset: the database may hold anything from earlier tests.
    const before = await coreCounts();
    const seed = await loadSeed();
    // A seed that ran on import would be async, so give it time to write before counting again.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await coreCounts()).toEqual(before);

    const disconnect = vi.spyOn(prisma, '$disconnect');
    await seed(prisma);
    expect(disconnect).not.toHaveBeenCalled();
    disconnect.mockRestore();

    expect(await prisma.vendor.findFirst({ where: { phone: '9800000003' } })).not.toBeNull();
    expect(await prisma.project.findFirst({ where: { name: 'Hill Villa' } })).not.toBeNull();
  });

  it('seeds every state Feature 004 shows, and a second run changes nothing (US8-1 to US8-5)', async () => {
    await resetDatabase();
    const seed = await loadSeed();
    await seed(prisma);

    const vendors = await prisma.vendor.findMany({ include: { categories: true } });
    expect(vendors.length).toBeGreaterThanOrEqual(9);
    expect(vendors.length).toBeLessThanOrEqual(12);
    expect(new Set(vendors.flatMap((vendor) => vendor.categories.map((row) => row.categoryId))).size).toBeGreaterThanOrEqual(6);
    for (const vendor of vendors) expect(vendor.phone).toMatch(/^98000000\d\d$/);

    const projects = await prisma.project.findMany();
    expect(projects.length).toBeGreaterThanOrEqual(3);
    expect(projects.length).toBeLessThanOrEqual(4);
    expect(new Set(projects.map((project) => project.status)).size).toBeGreaterThanOrEqual(3);

    const current = await prisma.vendorProjectLink.groupBy({ by: ['vendorId'], where: { removedAt: null }, _count: { _all: true } });
    expect(current.filter((row) => row._count._all > 1).length).toBeGreaterThanOrEqual(2);
    expect(current.filter((row) => row._count._all === 1).length).toBeGreaterThanOrEqual(3);
    expect(await prisma.vendorProjectLink.count({ where: { removedAt: { not: null } } })).toBeGreaterThanOrEqual(1);

    const emails = [
      ...(await prisma.staffUser.findMany()).map((user) => user.email),
      ...vendors.map((vendor) => vendor.email).filter((email): email is string => email !== null),
    ];
    for (const email of emails) expect(email).toMatch(/@example\.com$/);

    const { client } = await signIn('admin@example.com', process.env.SEED_ADMIN_PASSWORD);
    const dashboard = (await client.get('/api/dashboard')).body as { items: { group: string | null }[]; missing_update: unknown[] };
    const groups = new Set(dashboard.items.map((item) => item.group));
    for (const group of ['OVERDUE', 'DUE_TODAY', 'COMING_SOON', 'UPCOMING']) expect(groups).toContain(group);
    expect(dashboard.missing_update.length).toBeGreaterThan(0);

    const statuses = new Set<string>();
    let done = 0;
    let afterCompletion = 0;
    for (const project of projects) {
      const detail = (await client.get(`/api/projects/${project.id}`)).body as { links: { assignment_status: string }[] };
      for (const link of detail.links) statuses.add(link.assignment_status);
      const timeline = (await client.get(`/api/projects/${project.id}/timeline`)).body as { items: { status: string; after_project_completion: boolean }[] };
      done += timeline.items.filter((item) => item.status === 'DONE').length;
      afterCompletion += timeline.items.filter((item) => item.after_project_completion).length;
    }
    expect([...statuses].sort()).toEqual(['COMPLETED', 'DELAYED', 'IN_PROGRESS', 'NOT_STARTED', 'NO_ACTIVITIES']);
    expect(done).toBeGreaterThan(0);
    expect(afterCompletion).toBeGreaterThan(0);

    // Quickstart 3.3: the seeded Delayed project shows upcoming items and items due after its completion date.
    const delayed = (await client.get('/api/projects')).body.find((row: { health: string }) => row.health === 'DELAYED') as { id: string };
    const delayedDetail = (await client.get(`/api/projects/${delayed.id}`)).body as { upcoming: unknown[]; after_completion_count: number };
    expect(delayedDetail.upcoming.length).toBeGreaterThan(0);
    expect(delayedDetail.after_completion_count).toBeGreaterThan(0);

    // A staff edit between runs is kept, and the second run adds nothing to any table.
    const edited = await prisma.vendor.update({ where: { id: vendors[0].id }, data: { name: 'Renamed By Staff' } });
    const counts = await everyCount();
    await seed(prisma);
    expect(await everyCount()).toEqual(counts);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: edited.id } })).name).toBe('Renamed By Staff');
  });
});

// Feature 005 T043 (FR-013, owner decision I1): the seed gives the 15 blueprint sections only to projects it creates in
// that run, and sample section assignments only on those projects. A project that already exists never gets sections.
describe('seed sections (Feature 005)', () => {
  async function sectionsOf(name: string) {
    const project = await prisma.project.findFirstOrThrow({ where: { name } });
    return prisma.projectSection.findMany({
      where: { projectId: project.id },
      orderBy: { position: 'asc' },
      include: { assignments: { where: { removedAt: null }, include: { vendor: true } } },
    });
  }

  it('gives each project it creates the 15 blueprint sections in order, with sample assignments on Lake House', async () => {
    await resetDatabase();
    await (await loadSeed())(prisma);

    for (const name of ['Lake House', 'Studio Fit-out', 'Hill Villa', 'Riverside Clinic']) {
      const sections = await sectionsOf(name);
      // Every blueprint section exists once, current or removed.
      expect(sections.map((section) => section.name).sort()).toEqual([...DEFAULT_SECTIONS].sort());
      const current = sections.filter((section) => section.removedAt === null);
      // Current sections keep the blueprint order with positions 0 to n-1.
      expect(current.map((section) => section.name)).toEqual(DEFAULT_SECTIONS.filter((section) => current.some((row) => row.name === section)));
      expect(current.map((section) => section.position)).toEqual(current.map((_section, index) => index));
    }

    const lake = await sectionsOf('Lake House');
    const removed = lake.filter((section) => section.removedAt !== null);
    expect(removed).toHaveLength(1);
    expect(removed[0].removedById).not.toBeNull();
    expect(removed[0].assignments).toEqual([]);

    // One vendor in two sections, and one section with two vendors.
    const sectionsByVendor = new Map<string, string[]>();
    for (const section of lake) {
      for (const row of section.assignments) sectionsByVendor.set(row.vendor.name, [...(sectionsByVendor.get(row.vendor.name) ?? []), section.name]);
    }
    expect([...sectionsByVendor.values()].some((names) => names.length === 2)).toBe(true);
    expect(lake.some((section) => section.assignments.length === 2)).toBe(true);

    // Every vendor assigned to a section is currently assigned to the project (FR-015a).
    const lakeId = lake[0].projectId;
    for (const vendorName of sectionsByVendor.keys()) {
      const vendor = await prisma.vendor.findFirstOrThrow({ where: { name: vendorName } });
      expect(await prisma.vendorProjectLink.count({ where: { vendorId: vendor.id, projectId: lakeId, removedAt: null } })).toBe(1);
    }

    // The other seeded projects get sections but no sample assignments.
    for (const name of ['Studio Fit-out', 'Hill Villa', 'Riverside Clinic']) {
      expect((await sectionsOf(name)).every((section) => section.assignments.length === 0 && section.removedAt === null)).toBe(true);
    }

    // A second run changes nothing in any table.
    const counts = await everyCount();
    await (await loadSeed())(prisma);
    expect(await everyCount()).toEqual(counts);
  });

  it('never adds sections to projects that already exist, such as section-less development projects', async () => {
    await resetDatabase();
    const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
    await createProject(admin.id, 'Lake House');
    await createProject(admin.id, 'Studio Fit-out', 'PLANNED');

    await (await loadSeed())(prisma);
    expect(await sectionsOf('Lake House')).toEqual([]);
    expect(await sectionsOf('Studio Fit-out')).toEqual([]);
    expect(await prisma.sectionAssignment.count()).toBe(0);
    // The projects the seed did create still get the blueprint.
    expect(await sectionsOf('Hill Villa')).toHaveLength(15);
    expect(await sectionsOf('Riverside Clinic')).toHaveLength(15);

    const counts = await everyCount();
    await (await loadSeed())(prisma);
    expect(await everyCount()).toEqual(counts);
    expect(await sectionsOf('Lake House')).toEqual([]);
  });
});
