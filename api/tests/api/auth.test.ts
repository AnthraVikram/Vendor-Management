import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';

describe('auth and staff', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 1 scenarios 1 through 7', async () => {
    const admin = await createUser({ email: 'admin@example.com', role: 'ADMINISTRATOR', password: 'password1' });
    const adminSession = await signIn('admin@example.com');
    expect(adminSession.response.status).toBe(200);

    const created = await adminSession.client.post('/api/staff').send({
      name: 'Office User',
      email: 'office@example.com',
      role: 'OFFICE_TEAM',
      password: 'password1',
    });
    expect(created.status).toBe(201);
    const office = await signIn('office@example.com');
    expect(office.response.status).toBe(200);

    const accountant = await adminSession.client.post('/api/staff').send({
      name: 'Accounts',
      email: 'accountant@example.com',
      role: 'ACCOUNTANT',
      password: 'password1',
    });
    expect(accountant.status).toBe(201);

    expect((await office.client.post('/api/staff').send({
      name: 'Nope',
      email: 'nope@example.com',
      role: 'OFFICE_TEAM',
      password: 'password1',
    })).status).toBe(403);
    const accountantSession = await signIn('accountant@example.com');
    expect((await accountantSession.client.patch(`/api/staff/${created.body.id}`).send({ role: 'ADMINISTRATOR' })).status).toBe(403);

    const category = await createCategory(admin.id, 'Carpentry');
    const vendor = await office.client.post('/api/vendors').send({
      name: 'Mehta',
      phone: '9000000001',
      category_ids: [category.id],
    });
    expect(vendor.status).toBe(201);
    const project = await accountantSession.client.post('/api/projects').send({ name: 'Lake House', status: 'ACTIVE' });
    expect(project.status).toBe(201);
    const link = await office.client.post(`/api/projects/${project.body.id}/links`).send({ vendor_id: vendor.body.id, role_on_project: 'Carpentry' });
    expect(link.status).toBe(201);
    expect((await office.client.delete(`/api/links/${link.body.id}`)).status).toBe(200);

    const revoked = await adminSession.client.patch(`/api/staff/${created.body.id}`).send({ revoked: true });
    expect(revoked.status).toBe(200);
    expect((await office.client.get('/api/vendors')).status).toBe(401);
    const refused = await signIn('office@example.com');
    expect(refused.response.status).toBe(401);
    expect(refused.response.body.message).toBe('Email or password is not valid.');

    const restored = await adminSession.client.patch(`/api/staff/${created.body.id}`).send({ revoked: false, password: 'password2' });
    expect(restored.status).toBe(200);
    expect((await signIn('office@example.com', 'password2')).response.status).toBe(200);

    const last = await adminSession.client.patch(`/api/staff/${admin.id}`).send({ revoked: true });
    expect(last.status).toBe(409);
    expect(last.body.message).toBe('The firm must keep one active administrator.');
    expect((await adminSession.client.get('/api/auth/me')).body.role).toBe('ADMINISTRATOR');

    for (const attempt of [
      { email: 'missing@example.com', password: 'password1' },
      { email: 'admin@example.com', password: 'wrong-password' },
    ]) {
      const response = await signIn(attempt.email, attempt.password);
      expect(response.response.status).toBe(401);
      expect(response.response.body.message).toBe('Email or password is not valid.');
    }

    const changed = await adminSession.client.post('/api/auth/password').send({ current_password: 'password1', new_password: 'password9' });
    expect(changed.status).toBe(200);
    const withRole = await adminSession.client.post('/api/auth/password').send({ current_password: 'password9', new_password: 'password8', role: 'ACCOUNTANT' });
    expect(withRole.status).toBe(400);

    await createVendor(admin.id, { name: 'Other', phone: '9000000002', categoryId: category.id });
    await createProject(admin.id, 'Studio');
  });
});
