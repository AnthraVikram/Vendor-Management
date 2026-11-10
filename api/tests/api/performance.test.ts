import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { DEFAULT_SECTIONS } from '../../src/lib/blueprint';
import { addDays, toDateColumn, todayInIndia } from '../../src/lib/india-date';
import { createUser, resetDatabase, signIn } from '../helpers';

// Feature 005 T044 (NFR-001, SC-007): with 200 vendors, 50 projects and 20 sections per project on the test database,
// each read a page needs answers in under 500 ms, leaving room within the 2-second page budget. Each request is made
// once to warm up, then timed 5 times; every timed run must be under the budget, not just the average.

const BUDGET_MS = 500;
const RUNS = 5;
const VENDORS = 200;
const PROJECTS = 50;
const SECTIONS_PER_PROJECT = 20;
const LINKS_PER_PROJECT = 6;
const ITEMS_PER_PROJECT = 8;

type Agent = Awaited<ReturnType<typeof signIn>>['client'];
let client: Agent;
let busiestProjectId = '';

beforeAll(async () => {
  await resetDatabase();
  const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
  client = (await signIn('admin@example.com')).client;
  const stamp = { createdById: admin.id, updatedById: admin.id };
  const today = todayInIndia();

  const vendorIds = Array.from({ length: VENDORS }, () => randomUUID());
  await prisma.vendor.createMany({
    data: vendorIds.map((id, index) => ({
      id, name: `Vendor ${String(index).padStart(3, '0')}`, phone: `97${String(index).padStart(8, '0')}`, gstRegistered: false,
      archived: index % 20 === 0, ...stamp,
    })),
  });

  const projectIds = Array.from({ length: PROJECTS }, () => randomUUID());
  busiestProjectId = projectIds[0];
  await prisma.project.createMany({
    data: projectIds.map((id, index) => ({
      id, name: `Project ${String(index).padStart(2, '0')}`, status: index % 5 === 4 ? 'COMPLETED' : 'ACTIVE', clientName: `Client ${index}`,
      startDate: toDateColumn(addDays(today, -60)), expectedCompletionDate: toDateColumn(addDays(today, 30 + index)), archived: index % 10 === 9, ...stamp,
    })),
  });

  // The 15 blueprint sections plus 5 added ones, so every project has 20.
  const sectionNames = [...DEFAULT_SECTIONS, 'Lighting', 'Joinery', 'Flooring', 'Plumbing', 'Landscaping'];
  const sections = projectIds.flatMap((projectId) => sectionNames.map((name, position) => ({ id: randomUUID(), projectId, name, position, ...stamp })));
  await prisma.projectSection.createMany({ data: sections });

  // Each project has 6 vendors; each vendor works in 3 of its sections (so sections hold several vendors).
  const links = projectIds.flatMap((projectId, projectIndex) =>
    Array.from({ length: LINKS_PER_PROJECT }, (_, slot) => ({ projectId, vendorId: vendorIds[(projectIndex * LINKS_PER_PROJECT + slot) % VENDORS], ...stamp })));
  await prisma.vendorProjectLink.createMany({ data: links });
  await prisma.sectionAssignment.createMany({
    data: links.flatMap((link, index) => {
      const projectSections = sections.filter((section) => section.projectId === link.projectId);
      return [0, 1, 2].map((offset) => ({ sectionId: projectSections[(index + offset * 7) % SECTIONS_PER_PROJECT].id, vendorId: link.vendorId, roleInSection: 'Work', ...stamp }));
    }),
  });

  // Timeline items spread across overdue, due soon and later, half with a progress update.
  const items = projectIds.flatMap((projectId, projectIndex) =>
    Array.from({ length: ITEMS_PER_PROJECT }, (_, slot) => ({
      id: randomUUID(), projectId, name: `Item ${slot}`, itemType: 'ACTIVITY' as const, deadline: toDateColumn(addDays(today, slot * 5 - 10)),
      responsibleKind: 'VENDOR' as const, responsibleVendorId: links[projectIndex * LINKS_PER_PROJECT + (slot % LINKS_PER_PROJECT)].vendorId, ...stamp,
    })));
  await prisma.timelineItem.createMany({ data: items });
  await prisma.timelineProgressUpdate.createMany({
    data: items.filter((_, index) => index % 2 === 0).map((item, index) => ({ timelineItemId: item.id, status: index % 3 === 0 ? 'DONE' as const : 'IN_PROGRESS' as const, ...stamp })),
  });
}, 300_000);

async function timings(url: string): Promise<number[]> {
  const warm = await client.get(url);
  expect(warm.status, url).toBe(200);
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const response = await client.get(url);
    runs.push(Math.round(performance.now() - started));
    expect(response.status, url).toBe(200);
  }
  return runs;
}

describe('response times with realistic volume (NFR-001, SC-007)', () => {
  it('has the volume the budget is defined for', async () => {
    expect(await prisma.vendor.count()).toBe(VENDORS);
    expect(await prisma.project.count()).toBe(PROJECTS);
    expect(await prisma.projectSection.count({ where: { projectId: busiestProjectId } })).toBe(SECTIONS_PER_PROJECT);
    expect(await prisma.projectSection.count()).toBe(PROJECTS * SECTIONS_PER_PROJECT);
  });

  it.each([
    ['Vendors list', '/api/vendors?view=active&limit=50'],
    ['Projects list', '/api/projects?view=active&limit=50'],
    ['Project detail', () => `/api/projects/${busiestProjectId}`],
    ['Dashboard summary', '/api/dashboard/summary'],
    ['Dashboard overview', '/api/dashboard/overview'],
    ['Dashboard lists', '/api/dashboard'],
    ['Search', '/api/search?q=ven'],
  ] as const)('%s answers in under 500 ms', async (name, url) => {
    const runs = await timings(typeof url === 'function' ? url() : url);
    console.log(`T044 ${name}: ${runs.join(', ')} ms (max ${Math.max(...runs)} ms)`);
    for (const ms of runs) expect(ms, `${name} took ${ms} ms`).toBeLessThan(BUDGET_MS);
  });
});
