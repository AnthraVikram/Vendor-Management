import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createProject, createUser, createVendor, resetDatabase, resetFileStorage, signIn } from '../helpers';
import { pdfBuffer } from '../fixtures/files';

// Feature 006 FR-041, OQ-42 (US3-40): Quotation, Purchase order and Payment proof are project document types only.
const NEW_TYPES = ['QUOTATION', 'PURCHASE_ORDER', 'PAYMENT_PROOF'];
const FEATURE_003_TYPES = ['AGREEMENT', 'DRAWING', 'REGISTRATION_CERTIFICATE', 'PHOTO', 'OTHER'];

describe('client finance document types', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  async function setup() {
    const admin = await createUser({ email: 'admin@example.com' });
    const category = await createCategory(admin.id, 'Tiles');
    const vendor = await createVendor(admin.id, { name: 'Rao Tiles', phone: '98765 43210', categoryId: category.id });
    const project = await createProject(admin.id, 'Lake House');
    const { client } = await signIn('admin@example.com');
    const upload = (parent: string, type: string) =>
      client.post(`/api/${parent}/documents`).field('title', `A ${type}`).field('document_type', type).attach('file', pdfBuffer(), 'a.pdf');
    return { vendor, project, upload };
  }

  it('accepts all eight types for a project document', async () => {
    const { project, upload } = await setup();
    for (const type of [...FEATURE_003_TYPES, ...NEW_TYPES]) {
      const response = await upload(`projects/${project.id}`, type);
      expect(response.status, type).toBe(201);
      expect(response.body.document_type).toBe(type);
    }
  });

  it('refuses the three new types for a vendor document, naming document_type, and keeps the five', async () => {
    const { vendor, upload } = await setup();
    for (const type of NEW_TYPES) {
      const response = await upload(`vendors/${vendor.id}`, type);
      expect(response.status, type).toBe(400);
      expect(response.body.fields.document_type).toBeTruthy();
    }
    for (const type of FEATURE_003_TYPES) expect((await upload(`vendors/${vendor.id}`, type)).status, type).toBe(201);
  });
});
