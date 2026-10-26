import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';
import { prisma } from '../../src/db';

describe('schedules', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 5 scenarios 1 through 6', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000031', categoryId: category.id, availability: 'UNAVAILABLE' });
    const other = await createVendor(admin.id, { name: 'Rao', phone: '9000000032', categoryId: category.id });
    const first = await createProject(admin.id, 'Lake House');
    const second = await createProject(admin.id, 'Studio');
    await session.client.post(`/api/projects/${first.id}/links`).send({ vendor_id: vendor.id });
    await session.client.post(`/api/projects/${second.id}/links`).send({ vendor_id: vendor.id });
    await session.client.post(`/api/projects/${first.id}/links`).send({ vendor_id: other.id });

    const saved = await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Floor tiling',
      work_date: '2026-11-02',
      start_time: '09:00',
      end_time: '12:00',
      required_team_size: 4,
    });
    expect(saved.status).toBe(201);
    expect((await prisma.vendor.findUnique({ where: { id: vendor.id } }))?.name).toBe('Mehta');

    const overlap = await session.client.post(`/api/projects/${second.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Skirting',
      work_date: '2026-11-02',
      start_time: '11:00',
      end_time: '13:00',
      required_team_size: 2,
    });
    expect(overlap.status).toBe(201);
    expect(overlap.body.conflicts[0].id).toBe(saved.body.id);

    const otherVendor = await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: other.id,
      task: 'Wiring',
      work_date: '2026-11-02',
      start_time: '09:00',
      end_time: '12:00',
      required_team_size: 2,
    });
    expect(otherVendor.body.conflicts).toEqual([]);

    const unavailable = await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: vendor.id,
      task: 'Polish',
      work_date: '2026-11-03',
      start_time: '09:00',
      end_time: '10:00',
      required_team_size: 1,
    });
    expect(unavailable.status).toBe(201);

    const invalid = await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: vendor.id,
      task: '',
      work_date: '2026-11-03',
      start_time: '12:00',
      end_time: '09:00',
      required_team_size: 0,
    });
    expect(invalid.status).toBe(400);

    const stranger = await createVendor(admin.id, { name: 'Unlinked', phone: '9000000033', categoryId: category.id });
    expect((await session.client.post(`/api/projects/${first.id}/schedules`).send({
      vendor_id: stranger.id,
      task: 'Extra',
      work_date: '2026-11-06',
      start_time: '09:00',
      end_time: '10:00',
      required_team_size: 1,
    })).status).toBe(409);
  });
});
