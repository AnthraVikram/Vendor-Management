import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, resetDatabase, signIn } from '../helpers';
import { prisma } from '../../src/db';

// These cases can pass by chance without row locks, so they guard regressions rather than prove the lock.
describe('concurrent staff changes', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('lets only one of two simultaneous revokes of the same account succeed', async () => {
    const first = await createUser({ email: 'first@example.com' });
    await createUser({ email: 'second@example.com', actorId: first.id });
    const office = await createUser({ email: 'office@example.com', role: 'OFFICE_TEAM', actorId: first.id });
    const a = await signIn('first@example.com');
    const b = await signIn('second@example.com');

    const responses = await Promise.all([
      a.client.patch(`/api/staff/${office.id}`).send({ revoked: true }),
      b.client.patch(`/api/staff/${office.id}`).send({ revoked: true }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe('ALREADY_REVOKED');
  });

  it('keeps one active administrator when two administrators revoke each other at once', async () => {
    const first = await createUser({ email: 'first@example.com' });
    const second = await createUser({ email: 'second@example.com', actorId: first.id });
    const a = await signIn('first@example.com');
    const b = await signIn('second@example.com');

    const responses = await Promise.all([
      a.client.patch(`/api/staff/${second.id}`).send({ revoked: true }),
      b.client.patch(`/api/staff/${first.id}`).send({ revoked: true }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe('LAST_ADMINISTRATOR');
    expect(await prisma.staffUser.count({ where: { role: 'ADMINISTRATOR', revokedAt: null } })).toBe(1);
  });
});
