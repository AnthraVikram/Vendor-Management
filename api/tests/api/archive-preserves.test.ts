import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createCategory, createDocument, createUser, createVendor, resetDatabase, signIn } from '../helpers';

// Feature 005 US4 (T033, FR-029, US4-5, US4-6): archiving and restoring a vendor or a project keeps every assignment,
// section assignment, document, schedule and existing history entry exactly as it was. The only new history entries
// are the ARCHIVED and RESTORED entries themselves (Feature 003 FR-027).

async function snapshot() {
  const [links, sectionAssignments, documents, schedules, history] = await Promise.all([
    prisma.vendorProjectLink.findMany({ orderBy: { id: 'asc' }, select: { id: true, vendorId: true, projectId: true, removedAt: true, roleOnProject: true } }),
    prisma.sectionAssignment.findMany({ orderBy: { id: 'asc' }, select: { id: true, sectionId: true, vendorId: true, removedAt: true, roleInSection: true } }),
    prisma.document.findMany({ orderBy: { id: 'asc' }, select: { id: true, archived: true, vendorId: true, projectId: true } }),
    prisma.workSchedule.findMany({ orderBy: { id: 'asc' }, select: { id: true, archived: true, vendorId: true, projectId: true } }),
    prisma.historyEntry.findMany({ orderBy: { id: 'asc' }, select: { id: true, action: true, vendorId: true, projectId: true, changes: true, details: true } }),
  ]);
  return { links, sectionAssignments, documents, schedules, history };
}

describe('archiving keeps everything (FR-029)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('leaves assignments, section assignments, documents, schedules and history intact through archive and restore', async () => {
    const admin = await createUser({ email: 'admin@example.com', name: 'Asha Admin' });
    const { client } = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000901', categoryId: category.id });

    // The vendor works in two sections of one project and one section of another.
    const lake = (await client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' })).body as { id: string };
    const hill = (await client.post('/api/projects').send({ name: 'Hill Villa', status: 'ACTIVE' })).body as { id: string };
    const sectionsOf = async (id: string) => ((await client.get(`/api/projects/${id}`)).body as { sections: { id: string; name: string }[] }).sections;
    const lakeSections = await sectionsOf(lake.id);
    const hillSections = await sectionsOf(hill.id);
    await client.post(`/api/sections/${lakeSections[7].id}/assignments`).send({ vendor_id: vendor.id, role_in_section: 'Lead carpenter' });
    await client.post(`/api/sections/${lakeSections[8].id}/assignments`).send({ vendor_id: vendor.id });
    await client.post(`/api/sections/${hillSections[6].id}/assignments`).send({ vendor_id: vendor.id });
    await prisma.workSchedule.create({
      data: {
        vendorId: vendor.id, projectId: lake.id, task: 'Wardrobes', workDate: new Date('2026-11-20T00:00:00Z'), startTime: '09:00', endTime: '12:00',
        requiredTeamSize: 3, pricingMode: 'FIXED', createdById: admin.id, updatedById: admin.id,
      },
    });
    await createDocument({ actorId: admin.id, vendorId: vendor.id });
    await createDocument({ actorId: admin.id, projectId: lake.id });

    const before = await snapshot();
    expect(before.links.filter((link) => !link.removedAt)).toHaveLength(2);
    expect(before.sectionAssignments.filter((row) => !row.removedAt)).toHaveLength(3);

    for (const step of [`/api/vendors/${vendor.id}/archive`, `/api/vendors/${vendor.id}/restore`, `/api/projects/${lake.id}/archive`, `/api/projects/${lake.id}/restore`]) {
      expect((await client.post(step)).status).toBe(200);
    }

    const after = await snapshot();
    expect(after.links).toEqual(before.links);
    expect(after.sectionAssignments).toEqual(before.sectionAssignments);
    expect(after.documents).toEqual(before.documents);
    expect(after.schedules).toEqual(before.schedules);
    // Every earlier entry is still there, unchanged; the new ones record the archive and restore steps only.
    for (const entry of before.history) expect(after.history).toContainEqual(entry);
    const added = after.history.filter((entry) => !before.history.some((old) => old.id === entry.id));
    expect(added.map((entry) => entry.action).sort()).toEqual(['ARCHIVED', 'ARCHIVED', 'RESTORED', 'RESTORED']);
  });

  it('still shows an archived vendor in its project sections and on its projects, marked archived (US4-6)', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const { client } = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta Carpentry', phone: '9000000902', categoryId: category.id });
    const lake = (await client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' })).body as { id: string };
    const execution = ((await client.get(`/api/projects/${lake.id}`)).body as { sections: { id: string; name: string }[] }).sections.find((row) => row.name === 'Execution')!;
    await client.post(`/api/sections/${execution.id}/assignments`).send({ vendor_id: vendor.id });
    await client.post(`/api/vendors/${vendor.id}/archive`);

    const detail = (await client.get(`/api/projects/${lake.id}`)).body as {
      links: { vendor_id: string; vendor_archived: boolean }[];
      sections: { name: string; assignments: { vendor_id: string; vendor_archived: boolean }[] }[];
    };
    expect(detail.links).toEqual([expect.objectContaining({ vendor_id: vendor.id, vendor_archived: true })]);
    expect(detail.sections.find((row) => row.name === 'Execution')!.assignments).toEqual([expect.objectContaining({ vendor_id: vendor.id, vendor_archived: true })]);
  });
});
