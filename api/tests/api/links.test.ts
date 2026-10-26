import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';
import { prisma } from '../../src/db';

describe('links', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 4 and keeps price and file history after removal', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000021', categoryId: category.id });
    const first = await createProject(admin.id, 'Lake House');
    const second = await createProject(admin.id, 'Studio');

    const linkA = await session.client.post(`/api/projects/${first.id}/links`).send({ vendor_id: vendor.id, role_on_project: 'Lead', scope_of_work: 'Joinery', note: 'North wing' });
    const linkB = await session.client.post(`/api/projects/${second.id}/links`).send({ vendor_id: vendor.id });
    expect(linkA.status).toBe(201);
    expect(linkB.status).toBe(201);
    const projectView = await session.client.get(`/api/projects/${first.id}`);
    expect(projectView.body.links[0].vendor_id).toBe(vendor.id);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).body.links).toHaveLength(2);
    expect((await session.client.post(`/api/projects/${first.id}/links`).send({ vendor_id: vendor.id })).status).toBe(409);

    await prisma.vendor.update({ where: { id: vendor.id }, data: { archived: true, updatedById: admin.id } });
    const third = await createProject(admin.id, 'Annex');
    expect((await session.client.post(`/api/projects/${third.id}/links`).send({ vendor_id: vendor.id })).status).toBe(409);
    await prisma.vendor.update({ where: { id: vendor.id }, data: { archived: false, updatedById: admin.id } });

    const schedule = await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Doors',
      work_date: '2026-11-02',
      start_time: '09:00',
      end_time: '12:00',
      required_team_size: 2,
    });
    await session.client.put(`/api/schedules/${schedule.body.id}/price`).send({ amount: '1000.00' });
    const file = await session.client
      .post(`/api/schedules/${schedule.body.id}/costing-sheet`)
      .attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'sheet.pdf');
    expect(file.status).toBe(409);

    const unpriced = await session.client.post(`/api/projects/${second.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Measure',
      work_date: '2026-11-05',
      start_time: '09:00',
      end_time: '10:00',
      required_team_size: 1,
    });
    const uploaded = await session.client
      .post(`/api/schedules/${unpriced.body.id}/costing-sheet`)
      .attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'measure.pdf');
    expect(uploaded.status).toBe(201);

    const removed = await session.client.delete(`/api/links/${linkA.body.id}`);
    expect(removed.body.archived_schedule_ids).toContain(schedule.body.id);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).status).toBe(200);
    const history = await session.client.get(`/api/schedules/${schedule.body.id}`);
    expect(history.body.archived).toBe(true);
    expect(history.body.price_history.length).toBeGreaterThan(0);
    expect((await prisma.workSchedule.count({ where: { id: schedule.body.id } }))).toBe(1);
    expect((await prisma.taskPriceEntry.count({ where: { scheduleId: schedule.body.id } }))).toBe(1);
  });
});
