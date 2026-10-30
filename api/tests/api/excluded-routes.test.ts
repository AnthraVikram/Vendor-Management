import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, resetDatabase, signIn } from '../helpers';

describe('excluded procurement routes', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('does not expose quotation, purchase-order, invoice, or payment routes', async () => {
    await createUser({ email: 'admin@example.com' });
    const session = await signIn('admin@example.com');
    for (const path of ['/api/quotations', '/api/purchase-orders', '/api/invoices', '/api/payments']) {
      expect((await session.client.get(path)).status).toBe(404);
      expect((await session.client.post(path).send({})).status).toBe(404);
    }
  });
});
