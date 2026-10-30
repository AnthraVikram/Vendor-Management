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

  it('refuses each invalid vendor field separately and saves nothing', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = (await session.client.post('/api/categories').send({ name: 'Carpentry' })).body;

    const noName = await session.client.post('/api/vendors').send({ phone: '9100000001', category_ids: [category.id] });
    expect(noName.status).toBe(400);
    expect(noName.body.fields.name).toBeTruthy();

    const noCategory = await session.client.post('/api/vendors').send({ name: 'No category', phone: '9100000002', category_ids: [] });
    expect(noCategory.status).toBe(400);
    expect(noCategory.body.fields.category_ids).toBeTruthy();

    const unregisteredGstin = await session.client.post('/api/vendors').send({
      name: 'Unregistered', phone: '9100000003', category_ids: [category.id], gst_registered: false, gstin: '22AAAAA0000A1Z5',
    });
    expect(unregisteredGstin.status).toBe(400);
    expect(unregisteredGstin.body.fields.gstin).toBeTruthy();

    const negativeTeam = await session.client.post('/api/vendors').send({
      name: 'Negative team', phone: '9100000004', category_ids: [category.id], team_size: -1,
    });
    expect(negativeTeam.status).toBe(400);
    expect(negativeTeam.body.fields.team_size).toBeTruthy();

    expect((await session.client.get('/api/vendors').query({ include_archived: 'true' })).body).toHaveLength(0);
  });

  it('matches every search field and filters by linked project', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = (await session.client.post('/api/categories').send({ name: 'Carpentry' })).body;
    const vendor = (await session.client.post('/api/vendors').send({
      name: 'Mehta Joinery',
      phone: '9100000011',
      alternate_phone: '9100000012',
      contact_person: 'Ravi Kumar',
      category_ids: [category.id],
      services: ['Polishing'],
      materials: ['Teak'],
    })).body;
    const other = (await session.client.post('/api/vendors').send({
      name: 'Other Works', phone: '9100000099', category_ids: [category.id], services: ['Painting'],
    })).body;

    for (const q of ['Mehta Joinery', '9100000011', '9100000012', 'Ravi Kumar', 'Polishing']) {
      const found = await session.client.get('/api/vendors').query({ q });
      expect(found.body.map((row: { id: string }) => row.id)).toEqual([vendor.id]);
    }

    const project = (await session.client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' })).body;
    expect((await session.client.post(`/api/projects/${project.id}/links`).send({ vendor_id: vendor.id })).status).toBe(201);
    const linked = await session.client.get('/api/vendors').query({ project_id: project.id });
    expect(linked.body.map((row: { id: string }) => row.id)).toEqual([vendor.id]);
    expect(linked.body.map((row: { id: string }) => row.id)).not.toContain(other.id);
  });

  it('returns a restored vendor to the default directory', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = (await session.client.post('/api/categories').send({ name: 'Carpentry' })).body;
    const vendor = (await session.client.post('/api/vendors').send({ name: 'Mehta', phone: '9100000021', category_ids: [category.id] })).body;

    await session.client.post(`/api/vendors/${vendor.id}/archive`);
    expect((await session.client.get('/api/vendors')).body).toHaveLength(0);
    expect((await session.client.post(`/api/vendors/${vendor.id}/restore`)).status).toBe(200);
    const listed = await session.client.get('/api/vendors');
    expect(listed.body.map((row: { id: string }) => row.id)).toEqual([vendor.id]);
  });

  it('keeps rating history with author and time, and refuses invalid ratings and notes', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = (await session.client.post('/api/categories').send({ name: 'Carpentry' })).body;
    const vendor = (await session.client.post('/api/vendors').send({ name: 'Mehta', phone: '9100000031', category_ids: [category.id] })).body;

    await session.client.post(`/api/vendors/${vendor.id}/ratings`).send({ score: 5 });
    await session.client.post(`/api/vendors/${vendor.id}/ratings`).send({ score: 3 });
    const detail = await session.client.get(`/api/vendors/${vendor.id}`);
    expect(detail.body.rating_history).toHaveLength(2);
    for (const entry of detail.body.rating_history) {
      expect(entry.author.name).toBeTruthy();
      expect(Number.isNaN(Date.parse(entry.created_at))).toBe(false);
    }

    for (const score of [0, 6, 2.5]) {
      expect((await session.client.post(`/api/vendors/${vendor.id}/ratings`).send({ score })).status).toBe(400);
    }
    expect((await session.client.post(`/api/vendors/${vendor.id}/notes`).send({ note_type: 'GENERAL', body: '' })).status).toBe(400);
    expect((await session.client.post(`/api/vendors/${vendor.id}/notes`).send({ note_type: 'GENERAL', body: '   ' })).status).toBe(400);
    expect((await session.client.get(`/api/vendors/${vendor.id}`)).body.rating_history).toHaveLength(2);
  });

  it('matches phones ignoring spaces and dashes, across phone and alternate phone (FR-030, US2-13, SC-011)', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const category = await session.client.post('/api/categories').send({ name: 'Tiles' });
    const vendor = (body: Record<string, unknown>): Record<string, unknown> => ({ category_ids: [category.body.id], ...body });

    const spaced = await session.client.post('/api/vendors').send(vendor({ name: 'Spaced', phone: '98765 43210' }));
    expect(spaced.status).toBe(201);
    const withAlternate = await session.client.post('/api/vendors').send(vendor({ name: 'Alternate', phone: '90000 00001', alternate_phone: '91111 22222' }));
    expect(withAlternate.status).toBe(201);
    const plain = await session.client.post('/api/vendors').send(vendor({ name: 'Plain', phone: '93333 44444' }));
    expect(plain.status).toBe(201);

    const clashes = [
      { body: vendor({ name: 'Dashed', phone: '98765-43210' }), matched: spaced.body },
      { body: vendor({ name: 'Phone is their alternate', phone: '91111-22222' }), matched: withAlternate.body },
      { body: vendor({ name: 'Alternate is their phone', phone: '95555 00000', alternate_phone: '93333-44444' }), matched: plain.body },
    ];
    for (const { body, matched } of clashes) {
      const refused = await session.client.post('/api/vendors').send(body);
      expect(refused.status, String(body.name)).toBe(409);
      expect(refused.body.code).toBe('PHONE_IN_USE');
      expect(refused.body.matches).toEqual([{ id: matched.id, name: matched.name }]);
      const confirmed = await session.client.post('/api/vendors').send({ ...body, confirm_duplicate_phone: true });
      expect(confirmed.status, String(body.name)).toBe(201);
    }

    const editClash = vendor({ name: 'Plain', phone: '98765-43210' });
    const editRefused = await session.client.patch(`/api/vendors/${plain.body.id}`).send(editClash);
    expect(editRefused.status).toBe(409);
    expect(editRefused.body.code).toBe('PHONE_IN_USE');
    expect(editRefused.body.matches).toContainEqual({ id: spaced.body.id, name: 'Spaced' });
    expect((await session.client.patch(`/api/vendors/${plain.body.id}`).send({ ...editClash, confirm_duplicate_phone: true })).status).toBe(200);

    const ownPair = await session.client.post('/api/vendors').send(vendor({ name: 'Own pair', phone: '97777 88888', alternate_phone: '97777-88888' }));
    expect(ownPair.status).toBe(201);
    const ownEdit = await session.client.patch(`/api/vendors/${ownPair.body.id}`).send(vendor({ name: 'Own pair', phone: '97777-88888', alternate_phone: '97777 88888' }));
    expect(ownEdit.status).toBe(200);
  });
});
