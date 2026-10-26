import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, resetDatabase, signIn } from '../helpers';

describe('vendors', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 2 scenarios 1 through 9 and category reuse', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const carpentry = await session.client.post('/api/categories').send({ name: 'Carpentry' });
    expect(carpentry.status).toBe(201);
    const again = await session.client.post('/api/categories').send({ name: 'carpentry' });
    expect(again.body).toEqual({ id: carpentry.body.id, name: 'Carpentry' });

    const missing = await session.client.post('/api/vendors').send({ name: 'No phone', category_ids: [carpentry.body.id] });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.phone).toBeTruthy();

    const created = await session.client.post('/api/vendors').send({
      name: 'Mehta Carpentry',
      phone: '9000000011',
      category_ids: [carpentry.body.id],
      contact_person: 'Mehta',
      locations: ['Chennai'],
      services: ['Joinery'],
      materials: ['Teak'],
      availability: 'AVAILABLE',
      team_size: 4,
      rates: [{ label: 'Day', amount: '1500.00', unit: 'day' }],
    });
    expect(created.status).toBe(201);

    const found = await session.client.get('/api/vendors').query({ q: 'Teak', category_id: carpentry.body.id, location: 'Chennai', availability: 'AVAILABLE' });
    expect(found.body).toHaveLength(1);

    const archived = await session.client.post(`/api/vendors/${created.body.id}/archive`);
    expect(archived.status).toBe(200);
    expect((await session.client.get('/api/vendors')).body).toHaveLength(0);
    expect((await session.client.get('/api/vendors').query({ include_archived: 'true' })).body).toHaveLength(1);
    const opened = await session.client.get(`/api/vendors/${created.body.id}`);
    expect(opened.status).toBe(200);
    await session.client.post(`/api/vendors/${created.body.id}/restore`);

    await session.client.post(`/api/vendors/${created.body.id}/ratings`).send({ score: 5, comment: 'Reliable' });
    await session.client.post(`/api/vendors/${created.body.id}/ratings`).send({ score: 3, comment: 'Late once' });
    await session.client.post(`/api/vendors/${created.body.id}/notes`).send({ note_type: 'RELIABILITY', body: 'Called back the same day' });
    const detailed = await session.client.get(`/api/vendors/${created.body.id}`);
    expect(detailed.body.current_rating.score).toBe(3);
    expect(detailed.body.rating_history).toHaveLength(2);
    expect(detailed.body.notes[0].author.name).toBe(admin.email);

    const noGst = await session.client.patch(`/api/vendors/${created.body.id}`).send({
      ...created.body,
      category_ids: [carpentry.body.id],
      gst_registered: true,
      gstin: null,
      rates: [{ label: 'Day', amount: '1500.00', unit: 'day' }],
    });
    expect(noGst.status).toBe(400);

    const withGst = await session.client.patch(`/api/vendors/${created.body.id}`).send({
      name: 'Mehta Carpentry',
      phone: '9000000011',
      category_ids: [carpentry.body.id],
      locations: ['Chennai'],
      services: ['Joinery'],
      materials: ['Teak'],
      availability: 'AVAILABLE',
      team_size: 4,
      gst_registered: true,
      gstin: '22AAAAA0000A1Z5',
      rates: [{ label: 'Day', amount: '1500.00', unit: 'day' }],
    });
    expect(withGst.status).toBe(200);

    const other = await session.client.post('/api/vendors').send({
      name: 'Other',
      phone: '9000000012',
      category_ids: [carpentry.body.id],
      gst_registered: true,
      gstin: '22AAAAA0000A1Z5',
    });
    expect(other.status).toBe(409);

    const duplicatePhone = await session.client.post('/api/vendors').send({
      name: 'Copy',
      phone: '9000000011',
      category_ids: [carpentry.body.id],
    });
    expect(duplicatePhone.body.code).toBe('PHONE_IN_USE');
    const confirmed = await session.client.post('/api/vendors').send({
      name: 'Copy',
      phone: '9000000011',
      category_ids: [carpentry.body.id],
      confirm_duplicate_phone: true,
    });
    expect(confirmed.status).toBe(201);

    const limited = await session.client.post('/api/vendors').send({
      name: 'Limited crew',
      phone: '9000000013',
      category_ids: [carpentry.body.id],
      availability: 'LIMITED',
      confirm_duplicate_phone: true,
    });
    const filtered = await session.client.get('/api/vendors').query({ availability: 'LIMITED' });
    expect(filtered.body.map((row: { id: string }) => row.id)).toEqual([limited.body.id]);

    const badRate = await session.client.post('/api/vendors').send({
      name: 'Bad rate',
      phone: '9000000014',
      category_ids: [carpentry.body.id],
      rates: [{ label: 'Day', amount: '1.001', unit: 'day' }],
    });
    expect(badRate.status).toBe(400);
  });
});
