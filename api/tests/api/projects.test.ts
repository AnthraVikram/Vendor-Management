import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, resetDatabase, signIn } from '../helpers';

describe('projects', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('covers user story 3 scenarios 1 through 4', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    const missing = await session.client.post('/api/projects').send({ status: 'ACTIVE' });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.name).toBeTruthy();

    const created = await session.client.post('/api/projects').send({ name: 'Lake House', status: 'COMPLETED' });
    expect(created.status).toBe(201);
    const listed = await session.client.get('/api/projects');
    expect(listed.body.map((row: { name: string; status: string }) => row.status)).toContain('COMPLETED');

    await session.client.post(`/api/projects/${created.body.id}/archive`);
    expect((await session.client.get('/api/projects')).body).toHaveLength(0);
    const opened = await session.client.get(`/api/projects/${created.body.id}`);
    expect(opened.status).toBe(200);
    await session.client.post(`/api/projects/${created.body.id}/restore`);
    expect((await session.client.get('/api/projects')).body).toHaveLength(1);
  });
});
