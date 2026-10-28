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
    const previous = replaced.body.file_history.find((entry: { archived: boolean }) => entry.archived);
    expect(previous.archived_at).toBeTruthy();
    expect(previous.archived_by.name).toBeTruthy();
  });

  it('switches pricing method by clearing first and keeps both histories readable (US6-8)', async () => {
    const { session, first } = await scheduled();
    await session.client.put(`/api/schedules/${first}/price`).send({ amount: '1000.00' });

    const clearedPrice = await session.client.post(`/api/schedules/${first}/price/clear`);
    expect(clearedPrice.status).toBe(200);
    expect(clearedPrice.body.pricing_mode).toBe('NONE');
    expect(clearedPrice.body.current_price).toBeNull();
    const reversal = clearedPrice.body.price_history[clearedPrice.body.price_history.length - 1];
    expect(reversal).toMatchObject({ kind: 'REVERSAL', amount: '-1000.00' });
    expect(reversal.author.name).toBeTruthy();
    expect(reversal.created_at).toBeTruthy();

    const attached = await session.client.post(`/api/schedules/${first}/costing-sheet`).attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'sheet.pdf');
    expect(attached.status).toBe(201);
    expect(attached.body.pricing_mode).toBe('FILE');
    const fileId = attached.body.current_file.id as string;

    const clearedFile = await session.client.post(`/api/schedules/${first}/costing-sheet/clear`);
    expect(clearedFile.status).toBe(200);
    expect(clearedFile.body.pricing_mode).toBe('NONE');
    expect(clearedFile.body.current_file).toBeNull();
    const archived = clearedFile.body.file_history.find((entry: { id: string }) => entry.id === fileId);
    expect(archived.archived).toBe(true);
    expect(archived.archived_at).toBeTruthy();
    expect(archived.archived_by.name).toBeTruthy();
    expect((await session.client.get(`/api/schedules/${first}/costing-sheets/${fileId}`)).status).toBe(200);

    const repriced = await session.client.put(`/api/schedules/${first}/price`).send({ amount: '1200.00' });
    expect(repriced.status).toBe(200);
    expect(repriced.body.pricing_mode).toBe('FIXED');
    expect(repriced.body.current_price.amount).toBe('1200.00');
    expect(repriced.body.current_file).toBeNull();
  });

  it('refuses to clear a method the task does not use', async () => {
    const { session, second } = await scheduled();
    const price = await session.client.post(`/api/schedules/${second}/price/clear`);
    expect(price.status).toBe(409);
    expect(price.body.code).toBe('NOT_FIXED');
    const sheet = await session.client.post(`/api/schedules/${second}/costing-sheet/clear`);
    expect(sheet.status).toBe(409);
    expect(sheet.body.code).toBe('NOT_FILE');
  });

  it('refuses a file over 10 MB and an amount with three decimal places', async () => {
    const { session, second, third } = await scheduled();
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await session.client.post(`/api/schedules/${third}/costing-sheet`).attach('file', big, 'big.pdf');
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.fields.file).toBeTruthy();
    const threeDecimals = await session.client.put(`/api/schedules/${second}/price`).send({ amount: '1.001' });
    expect(threeDecimals.status).toBe(400);
  });

  it('never leaves both pricing methods current when a price and a file arrive at once', async () => {
    const { session, third } = await scheduled();
    const [price, file] = await Promise.all([
      session.client.put(`/api/schedules/${third}/price`).send({ amount: '900.00' }),
      session.client.post(`/api/schedules/${third}/costing-sheet`).attach('file', Buffer.from('%PDF-1.1\n%%EOF'), 'race.pdf'),
    ]);
    const succeeded = [price.status === 200, file.status === 201].filter(Boolean).length;
    expect(succeeded).toBe(1);
    const final = (await session.client.get(`/api/schedules/${third}`)).body;
    expect(final.current_price === null || final.current_file === null).toBe(true);
    expect(final.pricing_mode).toBe(final.current_price ? 'FIXED' : 'FILE');
  });
});
