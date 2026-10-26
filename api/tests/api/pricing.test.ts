import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';

async function scheduled() {
  const admin = await createUser({ email: 'admin@example.com' });
  const session = await signIn('admin@example.com');
  const category = await createCategory(admin.id, 'Carpentry');
  const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000041', categoryId: category.id });
  await prismaRate(admin.id, vendor.id);
  const project = await createProject(admin.id, 'Lake House');
  await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
  const first = await session.client.post(`/api/projects/${project.id}/schedules`).send({
    vendor_id: vendor.id, task: 'One', work_date: '2026-11-02', start_time: '09:00', end_time: '10:00', required_team_size: 1,
  });
  const second = await session.client.post(`/api/projects/${project.id}/schedules`).send({
    vendor_id: vendor.id, task: 'Two', work_date: '2026-11-03', start_time: '09:00', end_time: '10:00', required_team_size: 1,
  });
  const third = await session.client.post(`/api/projects/${project.id}/schedules`).send({
    vendor_id: vendor.id, task: 'Three', work_date: '2026-11-04', start_time: '09:00', end_time: '10:00', required_team_size: 1,
  });
  return { session, vendor, first: first.body.id as string, second: second.body.id as string, third: third.body.id as string };
}

async function prismaRate(actorId: string, vendorId: string) {
  const { prisma } = await import('../../src/db');
  await prisma.vendorRate.create({
    data: { vendorId, label: 'Day', amount: '1800.00', unit: 'day', createdById: actorId, updatedById: actorId },
  });
}

describe('pricing', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 6 scenarios 1 through 7', async () => {
    const { session, vendor, first, second, third } = await scheduled();
    await session.client.put(`/api/schedules/${first}/price`).send({ amount: '1000.00' });
    await session.client.put(`/api/schedules/${second}/price`).send({ amount: '2500.00' });
    const vendorView = await session.client.get(`/api/vendors/${vendor.id}`);
    expect(vendorView.body.rates.map((rate: { amount: string }) => rate.amount)).toEqual(['1800.00']);
    expect(JSON.stringify(vendorView.body)).not.toContain('1000.00');

    const priced = await session.client.get(`/api/schedules/${first}`);
    const other = await session.client.get(`/api/schedules/${second}`);
    expect(priced.body.current_price.amount).toBe('1000.00');
    expect(other.body.current_price.amount).toBe('2500.00');

    const uploaded = await session.client.post(`/api/schedules/${third}/costing-sheet`).attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'sheet.pdf');
    expect(uploaded.status).toBe(201);
    const fileId = uploaded.body.current_file.id as string;
    const download = await session.client.get(`/api/schedules/${third}/costing-sheets/${fileId}`);
    expect(download.status).toBe(200);
    expect((await request(app).get(`/api/schedules/${third}/costing-sheets/${fileId}`)).status).toBe(401);

    const both = await session.client.post(`/api/schedules/${first}/costing-sheet`).attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'extra.pdf');
    expect(both.status).toBe(409);
    const png = await session.client.post(`/api/schedules/${third}/costing-sheet`).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image.png');
    expect(png.status).toBe(400);
    const negative = await session.client.put(`/api/schedules/${second}/price`).send({ amount: '-5.00' });
    expect(negative.status).toBe(400);

    const changed = await session.client.put(`/api/schedules/${first}/price`).send({ amount: '1200.00' });
    expect(changed.body.current_price.amount).toBe('1200.00');
    expect(changed.body.price_history.map((entry: { amount: string }) => entry.amount)).toEqual(['1000.00', '-1000.00', '1200.00']);
    const replaced = await session.client.post(`/api/schedules/${third}/costing-sheet`).attach('file', Buffer.from('%PDF-1.4\n%%EOF'), 'next.pdf');
    expect(replaced.body.current_file.original_filename).toBe('next.pdf');
    expect(replaced.body.file_history).toHaveLength(2);
  });
});
