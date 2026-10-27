import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createCategory, createProject, createUser, createVendor, resetDatabase, signIn } from '../helpers';
import { prisma } from '../../src/db';

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

  it('lets an administrator change another staff member role', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const adminSession = await signIn('admin@example.com');
    const officeSession = await signIn('office@example.com');

    const changed = await adminSession.client.patch(`/api/staff/${office.id}`).send({ role: 'ACCOUNTANT' });
    expect(changed.status).toBe(200);
    expect(changed.body.role).toBe('ACCOUNTANT');
    expect((await officeSession.client.get('/api/auth/me')).body.role).toBe('ACCOUNTANT');
  });

  it('refuses to demote the last active administrator', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const adminSession = await signIn('admin@example.com');

    const demoted = await adminSession.client.patch(`/api/staff/${admin.id}`).send({ role: 'OFFICE_TEAM' });
    expect(demoted.status).toBe(403);
    expect(demoted.body).toMatchObject({ code: 'OWN_ROLE', message: 'You cannot change your own role.' });
    expect((await prisma.staffUser.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('ADMINISTRATOR');
    expect((await adminSession.client.get('/api/auth/me')).body.role).toBe('ADMINISTRATOR');
  });

  it('refuses an administrator changing their own role even with a second administrator', async () => {
    const first = await createUser({ email: 'first@example.com' });
    const second = await createUser({ email: 'second@example.com', actorId: first.id });
    const firstSession = await signIn('first@example.com');

    const own = await firstSession.client.patch(`/api/staff/${first.id}`).send({ role: 'ACCOUNTANT' });
    expect(own.status).toBe(403);
    expect(own.body.code).toBe('OWN_ROLE');
    expect((await prisma.staffUser.findUniqueOrThrow({ where: { id: first.id } })).role).toBe('ADMINISTRATOR');

    const other = await firstSession.client.patch(`/api/staff/${second.id}`).send({ role: 'ACCOUNTANT' });
    expect(other.status).toBe(200);
    expect(other.body.role).toBe('ACCOUNTANT');
  });

  it('ends a person\'s open sessions when an administrator sets their password', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const adminSession = await signIn('admin@example.com');
    const officeSession = await signIn('office@example.com');
    expect((await officeSession.client.get('/api/auth/me')).status).toBe(200);

    const reset = await adminSession.client.patch(`/api/staff/${office.id}`).send({ password: 'password7' });
    expect(reset.status).toBe(200);
    expect((await officeSession.client.get('/api/auth/me')).status).toBe(401);
    expect((await signIn('office@example.com', 'password7')).response.status).toBe(200);
    expect((await adminSession.client.get('/api/auth/me')).status).toBe(200);
  });

  it('keeps other sessions open when a person changes their own password', async () => {
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM' });
    const first = await signIn('office@example.com');
    const second = await signIn('office@example.com');

    const changed = await first.client.post('/api/auth/password').send({ current_password: 'password1', new_password: 'password6' });
    expect(changed.status).toBe(200);
    expect((await second.client.get('/api/auth/me')).status).toBe(200);
  });

  it('refuses staff management by non-administrators', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const target = await createUser({ email: 'target@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const revoked = await createUser({ email: 'revoked@example.com', role: 'OFFICE_TEAM', revoked: true, actorId: admin.id });
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    await createUser({ email: 'accountant@example.com', role: 'ACCOUNTANT', actorId: admin.id });

    for (const email of ['office@example.com', 'accountant@example.com']) {
      const { client } = await signIn(email);
      expect((await client.get('/api/staff')).status).toBe(403);
      expect((await client.patch(`/api/staff/${target.id}`).send({ revoked: true })).status).toBe(403);
      expect((await client.patch(`/api/staff/${revoked.id}`).send({ revoked: false })).status).toBe(403);
      expect((await client.patch(`/api/staff/${target.id}`).send({ password: 'password9' })).status).toBe(403);
    }

    expect((await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } })).revokedAt).toBeNull();
    expect((await prisma.staffUser.findUniqueOrThrow({ where: { id: revoked.id } })).revokedAt).not.toBeNull();
    expect((await signIn('target@example.com')).response.status).toBe(200);
    expect((await signIn('target@example.com', 'password9')).response.status).toBe(401);
  });

  it('refuses staff management without a session', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    expect((await request(app).get('/api/staff')).status).toBe(401);
    expect((await request(app).post('/api/staff').send({
      name: 'Nope',
      email: 'nope@example.com',
      role: 'OFFICE_TEAM',
      password: 'password1',
    })).status).toBe(401);
    expect((await request(app).patch(`/api/staff/${admin.id}`).send({ revoked: true })).status).toBe(401);
    expect(await prisma.staffUser.count()).toBe(1);
  });

  it('refuses a duplicate email, including one held by a revoked account', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    await createUser({ email: 'former@example.com', role: 'OFFICE_TEAM', revoked: true, actorId: admin.id });
    const adminSession = await signIn('admin@example.com');

    for (const email of ['office@example.com', 'former@example.com']) {
      const duplicate = await adminSession.client.post('/api/staff').send({
        name: 'Duplicate',
        email,
        role: 'ACCOUNTANT',
        password: 'password1',
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('EMAIL_IN_USE');
    }
    expect(await prisma.staffUser.count()).toBe(3);
  });

  it('reports a second revocation as already revoked', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const adminSession = await signIn('admin@example.com');

    expect((await adminSession.client.patch(`/api/staff/${office.id}`).send({ revoked: true })).status).toBe(200);
    const again = await adminSession.client.patch(`/api/staff/${office.id}`).send({ revoked: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REVOKED');
    expect(again.body.message).toBe('The account is already revoked.');
    expect((await prisma.staffUser.findUniqueOrThrow({ where: { id: office.id } })).revokedAt).not.toBeNull();
  });

  it('refuses an empty or short password when an administrator sets one', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
    const adminSession = await signIn('admin@example.com');

    for (const password of ['', 'short', '1234567']) {
      const response = await adminSession.client.patch(`/api/staff/${office.id}`).send({ password });
      expect(response.status).toBe(400);
      expect(response.body.fields.password).toBeTruthy();
    }
    expect((await signIn('office@example.com', 'password1')).response.status).toBe(200);
  });
});
