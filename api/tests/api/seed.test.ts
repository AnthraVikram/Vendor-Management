import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/db';
import { resetDatabase, signIn } from '../helpers';

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
