import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createUser, resetDatabase, signIn } from '../helpers';
import { prisma } from '../../src/db';

describe('vendor lookup timing', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns a category and location match from 200 vendors in under 30 seconds', async () => {
    const admin = await createUser({ email: 'admin@example.com' });
    const category = await createCategory(admin.id, 'Carpentry');
    const other = await createCategory(admin.id, 'Electrical');
    for (let index = 0; index < 200; index += 1) {
      const chosen = index === 0 ? category.id : other.id;
      const location = index === 0 ? 'Chennai' : 'Bengaluru';
      await prisma.vendor.create({
        data: {
          name: `Vendor ${index}`,
          phone: `910000${String(index).padStart(4, '0')}`,
          gstRegistered: false,
          createdById: admin.id,
          updatedById: admin.id,
          categories: { create: [{ categoryId: chosen, createdById: admin.id, updatedById: admin.id }] },
          locations: { create: [{ label: location, createdById: admin.id, updatedById: admin.id }] },
        },
      });
    }
    const session = await signIn('admin@example.com');
    const started = Date.now();
    const response = await session.client.get('/api/vendors').query({ category_id: category.id, location: 'Chennai' });
    expect(Date.now() - started).toBeLessThan(30000);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Vendor 0');
  });
});
