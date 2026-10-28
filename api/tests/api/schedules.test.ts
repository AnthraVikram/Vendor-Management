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

  it('treats back-to-back bookings as no conflict and refuses each invalid input separately', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000071', categoryId: category.id });
    const project = await createProject(admin.id, 'Lake House');
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    const base = { vendor_id: vendor.id, task: 'Tiling', work_date: '2026-11-02', start_time: '09:00', end_time: '12:00', required_team_size: 2 };

    const first = await session.client.post(`/api/projects/${project.id}/schedules`).send(base);
    const second = await session.client.post(`/api/projects/${project.id}/schedules`).send({ ...base, start_time: '12:00', end_time: '14:00' });
    expect(first.body.conflicts).toEqual([]);
    expect(second.body.conflicts).toEqual([]);

    const invalid: Record<string, unknown>[] = [
      { ...base, task: '' },
      { ...base, work_date: undefined },
      { ...base, end_time: '09:00' },
      { ...base, end_time: '08:00' },
      { ...base, required_team_size: undefined },
      { ...base, required_team_size: 0 },
      { ...base, required_team_size: -1 },
      { ...base, required_team_size: 1.5 },
    ];
    for (const body of invalid) {
      expect((await session.client.post(`/api/projects/${project.id}/schedules`).send(body)).status).toBe(400);
    }
    const view = (await session.client.get(`/api/projects/${project.id}`)).body;
    expect(view.schedules.map((row: { id: string }) => row.id).sort()).toEqual([first.body.id, second.body.id].sort());

    await session.client.post(`/api/schedules/${first.body.id}/archive`);
    expect((await session.client.get(`/api/projects/${project.id}`)).body.schedules.map((row: { id: string }) => row.id)).toEqual([second.body.id]);
  });

  it('refuses a schedule while the vendor or the project is archived', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await createVendor(admin.id, { name: 'Mehta', phone: '9000000081', categoryId: category.id });
    const project = await createProject(admin.id, 'Lake House');
    await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id });
    const body = { vendor_id: vendor.id, task: 'Tiling', work_date: '2026-11-02', start_time: '09:00', end_time: '10:00', required_team_size: 1 };

    await session.client.post(`/api/vendors/${vendor.id}/archive`);
    const vendorArchived = await session.client.post(`/api/projects/${project.id}/schedules`).send(body);
    expect(vendorArchived.status).toBe(409);
    expect(vendorArchived.body.code).toBe('ARCHIVED');
    await session.client.post(`/api/vendors/${vendor.id}/restore`);

    await session.client.post(`/api/projects/${project.id}/archive`);
    const projectArchived = await session.client.post(`/api/projects/${project.id}/schedules`).send(body);
    expect(projectArchived.status).toBe(409);
    expect(projectArchived.body.code).toBe('ARCHIVED');
  });
});
