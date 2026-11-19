import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  app,
  approveRevision,
  attachDocument,
  createProject,
  createProjectDocument,
  createPurchaseOrder,
  createQuotation,
  createReceipt,
  createUser,
  dayOffset,
  resetDatabase,
  resetFileStorage,
  setRevisionStatus,
  signIn,
} from '../helpers';

// Permissions (T064, SC-005): for every FR-001 action, the allowed roles succeed and the others are refused by the
// server; signed-out and revoked people get 401 and no amount (FR-002).
type Role = 'ADMINISTRATOR' | 'ACCOUNTANT' | 'OFFICE_TEAM';
const ROLES: Role[] = ['ADMINISTRATOR', 'ACCOUNTANT', 'OFFICE_TEAM'];
const EMAIL: Record<Role, string> = { ADMINISTRATOR: 'admin@example.com', ACCOUNTANT: 'accountant@example.com', OFFICE_TEAM: 'office@example.com' };
type Session = Awaited<ReturnType<typeof signIn>>;
type Ctx = { project: { id: string }; actorId: string; ownerId: string; otherId: string; session: Session };

async function people() {
  const admin = await createUser({ email: EMAIL.ADMINISTRATOR });
  const accountant = await createUser({ email: EMAIL.ACCOUNTANT, role: 'ACCOUNTANT', actorId: admin.id });
  const office = await createUser({ email: EMAIL.OFFICE_TEAM, role: 'OFFICE_TEAM', actorId: admin.id });
  const other = await createUser({ email: 'other@example.com', role: 'OFFICE_TEAM', actorId: admin.id });
  return { ADMINISTRATOR: admin.id, ACCOUNTANT: accountant.id, OFFICE_TEAM: office.id, other: other.id, admin: admin.id };
}

async function approved(adminId: string, projectId: string) {
  const { revision } = await createQuotation(adminId, projectId, { amount: '1000.00' });
  return approveRevision(adminId, revision.id);
}

// Each case builds its own records on a fresh project and returns the request to send. "own" makes the record the
// acting person's; otherwise another Office Team member created it.
type Case = { action: string; allowed: Role[]; own?: boolean; run: (c: Ctx) => Promise<request.Response> };

const CASES: Case[] = [
  { action: 'view client finance', allowed: ROLES, run: (c) => c.session.client.get(`/api/projects/${c.project.id}/client-finance`) },
  {
    action: 'enter a receipt',
    allowed: ROLES,
    run: (c) => c.session.client.post(`/api/projects/${c.project.id}/receipts`).send({ submission_id: randomUUID(), receipt_type: 'OTHER', amount: '1.00', received_on: dayOffset(-1) }),
  },
  ...(['verification', 'rejection'] as const).map((step) => ({
    action: `${step} of a receipt`,
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'] as Role[],
    run: async (c: Ctx) => {
      const receipt = await createReceipt(c.otherId, { projectId: c.project.id, amount: '1.00', entryStatus: 'SUBMITTED' });
      return c.session.client.post(`/api/receipts/${receipt.id}/${step}`).send(step === 'rejection' ? { reason: 'x' } : {});
    },
  })),
  {
    action: 'reversal of a verified receipt',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => c.session.client.post(`/api/client-advances/${(await createReceipt(c.otherId, { projectId: c.project.id, amount: '1.00' })).id}/reversal`).send({ reason: 'x' }),
  },
  {
    action: 'withdrawal of another person’s Submitted receipt',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => c.session.client.post(`/api/receipts/${(await createReceipt(c.otherId, { projectId: c.project.id, amount: '1.00', entryStatus: 'SUBMITTED' })).id}/withdrawal`).send({ reason: 'x' }),
  },
  {
    action: 'withdrawal of one’s own Submitted receipt',
    allowed: ROLES,
    run: async (c) => c.session.client.post(`/api/receipts/${(await createReceipt(c.actorId, { projectId: c.project.id, amount: '1.00', entryStatus: 'SUBMITTED' })).id}/withdrawal`).send({ reason: 'x' }),
  },
  { action: 'create the quotation', allowed: ROLES, run: (c) => c.session.client.post(`/api/projects/${c.project.id}/quotation`).send({ title: 'Q', amount: '1.00', quotation_date: dayOffset(-1) }) },
  {
    action: 'add a revision',
    allowed: ROLES,
    run: async (c) => {
      const { quotation, revision } = await createQuotation(c.otherId, c.project.id);
      await setRevisionStatus(c.otherId, revision.id, 'DRAFT', 'WITHDRAWN');
      return c.session.client.post(`/api/quotations/${quotation.id}/revisions`).send({ amount: '2.00', quotation_date: dayOffset(-1), reason: 'x' });
    },
  },
  {
    action: 'submit a revision',
    allowed: ROLES,
    run: async (c) => c.session.client.post(`/api/quotation-revisions/${(await createQuotation(c.otherId, c.project.id)).revision.id}/status`).send({ to: 'SUBMITTED' }),
  },
  {
    action: 'withdraw another person’s Draft',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => c.session.client.post(`/api/quotation-revisions/${(await createQuotation(c.otherId, c.project.id)).revision.id}/status`).send({ to: 'WITHDRAWN', reason: 'x' }),
  },
  {
    action: 'withdraw one’s own Draft',
    allowed: ROLES,
    run: async (c) => c.session.client.post(`/api/quotation-revisions/${(await createQuotation(c.actorId, c.project.id)).revision.id}/status`).send({ to: 'WITHDRAWN', reason: 'x' }),
  },
  ...(
    [
      ['withdraw a Submitted revision', 'SUBMITTED', { to: 'WITHDRAWN', reason: 'x' }],
      ['mark a revision Under review', 'SUBMITTED', { to: 'UNDER_REVIEW' }],
      ['reject a revision', 'UNDER_REVIEW', { to: 'REJECTED', reason: 'x' }],
    ] as const
  ).map(([action, reach, body]) => ({
    action,
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'] as Role[],
    run: async (c: Ctx) => {
      const { revision } = await createQuotation(c.actorId, c.project.id);
      await setRevisionStatus(c.otherId, revision.id, 'DRAFT', 'SUBMITTED');
      if (reach === 'UNDER_REVIEW') await setRevisionStatus(c.otherId, revision.id, 'SUBMITTED', 'UNDER_REVIEW');
      return c.session.client.post(`/api/quotation-revisions/${revision.id}/status`).send(body);
    },
  })),
  {
    action: 'approve a revision',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => {
      const { revision } = await createQuotation(c.otherId, c.project.id, { amount: '1000.00' });
      await setRevisionStatus(c.otherId, revision.id, 'DRAFT', 'SUBMITTED');
      await setRevisionStatus(c.otherId, revision.id, 'SUBMITTED', 'UNDER_REVIEW');
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id, documentType: 'QUOTATION' });
      await attachDocument(c.otherId, { documentId: document.id, record: { kind: 'revision', id: revision.id } });
      return c.session.client.post(`/api/quotation-revisions/${revision.id}/approval`).send({ amount: '1000.00' });
    },
  },
  {
    action: 'enter a PO',
    allowed: ROLES,
    run: async (c) => {
      const approval = await approved(c.otherId, c.project.id);
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id, documentType: 'PURCHASE_ORDER' });
      return c.session.client.post(`/api/projects/${c.project.id}/purchase-orders`).send({ client_approval_id: approval.id, po_number: 'PO/1', po_date: dayOffset(-1), amount: '1000.00', document_ids: [document.id] });
    },
  },
  ...(['verification', 'rejection'] as const).map((step) => ({
    action: `${step} of a PO`,
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'] as Role[],
    run: async (c: Ctx) => {
      const approval = await approved(c.otherId, c.project.id);
      const po = await createPurchaseOrder(c.otherId, { projectId: c.project.id, approvalId: approval.id, amount: '1000.00', entryStatus: 'SUBMITTED' });
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id, documentType: 'PURCHASE_ORDER' });
      await attachDocument(c.otherId, { documentId: document.id, record: { kind: 'purchase_order', id: po.id } });
      return c.session.client.post(`/api/purchase-orders/${po.id}/${step}`).send(step === 'rejection' ? { reason: 'x' } : {});
    },
  })),
  {
    action: 'cancel a Verified PO',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => {
      const approval = await approved(c.otherId, c.project.id);
      const po = await createPurchaseOrder(c.otherId, { projectId: c.project.id, approvalId: approval.id, amount: '1000.00' });
      return c.session.client.post(`/api/purchase-orders/${po.id}/cancellation`).send({ reason: 'x' });
    },
  },
  {
    action: 'withdraw another person’s Submitted PO',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => {
      const approval = await approved(c.otherId, c.project.id);
      const po = await createPurchaseOrder(c.otherId, { projectId: c.project.id, approvalId: approval.id, amount: '1000.00', entryStatus: 'SUBMITTED' });
      return c.session.client.post(`/api/purchase-orders/${po.id}/withdrawal`).send({ reason: 'x' });
    },
  },
  {
    action: 'withdraw one’s own Submitted PO',
    allowed: ROLES,
    run: async (c) => {
      const approval = await approved(c.otherId, c.project.id);
      const po = await createPurchaseOrder(c.actorId, { projectId: c.project.id, approvalId: approval.id, amount: '1000.00', entryStatus: 'SUBMITTED' });
      return c.session.client.post(`/api/purchase-orders/${po.id}/withdrawal`).send({ reason: 'x' });
    },
  },
  {
    action: 'attach to an active record',
    allowed: ROLES,
    run: async (c) => {
      const receipt = await createReceipt(c.otherId, { projectId: c.project.id, amount: '1.00', entryStatus: 'SUBMITTED' });
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id });
      return c.session.client.post('/api/financial-attachments').send({ record: { kind: 'receipt', id: receipt.id }, document_id: document.id });
    },
  },
  {
    action: 'attach to a final record or an approval',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => {
      const approval = await approved(c.otherId, c.project.id);
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id });
      return c.session.client.post('/api/financial-attachments').send({ record: { kind: 'approval', id: approval.id }, document_id: document.id });
    },
  },
  {
    action: 'remove another person’s attachment',
    allowed: ['ADMINISTRATOR', 'ACCOUNTANT'],
    run: async (c) => {
      const receipt = await createReceipt(c.otherId, { projectId: c.project.id, amount: '1.00', entryStatus: 'SUBMITTED' });
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id });
      const attachment = await attachDocument(c.otherId, { documentId: document.id, record: { kind: 'receipt', id: receipt.id } });
      return c.session.client.post(`/api/financial-attachments/${attachment.id}/removal`).send({ reason: 'x' });
    },
  },
  {
    action: 'remove one’s own attachment',
    allowed: ROLES,
    run: async (c) => {
      const receipt = await createReceipt(c.otherId, { projectId: c.project.id, amount: '1.00', entryStatus: 'SUBMITTED' });
      const document = await createProjectDocument(c.otherId, { projectId: c.project.id });
      const attachment = await attachDocument(c.actorId, { documentId: document.id, record: { kind: 'receipt', id: receipt.id } });
      return c.session.client.post(`/api/financial-attachments/${attachment.id}/removal`).send({ reason: 'x' });
    },
  },
];

describe('client finance permissions (SC-005)', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetFileStorage();
  });

  it('lets exactly the FR-001 roles take each action and refuses the others with 403', async () => {
    const ids = await people();
    const sessions = Object.fromEntries(await Promise.all(ROLES.map(async (role) => [role, await signIn(EMAIL[role])]))) as Record<Role, Session>;
    const outcomes: string[] = [];
    for (const testCase of CASES) {
      for (const role of ROLES) {
        const project = await createProject(ids.admin, `${testCase.action} ${role}`);
        const response = await testCase.run({ project, actorId: ids[role], ownerId: ids[role], otherId: ids.other, session: sessions[role] });
        const allowed = testCase.allowed.includes(role);
        const ok = allowed ? response.status < 300 : response.status === 403 && response.body.code === 'ROLE_NOT_ALLOWED';
        if (!ok) outcomes.push(`${testCase.action} as ${role}: ${response.status} ${JSON.stringify(response.body)}`);
      }
    }
    expect(outcomes).toEqual([]);
  });

  it('refuses signed-out and revoked people on every client-finance route, without any amount (FR-002)', async () => {
    const ids = await people();
    const project = await createProject(ids.admin, 'Lake House');
    const approval = await approved(ids.admin, project.id);
    await createReceipt(ids.admin, { projectId: project.id, amount: '123456.78' });
    const revoked = await signIn(EMAIL.OFFICE_TEAM);
    await prisma.staffUser.update({ where: { id: ids.OFFICE_TEAM }, data: { revokedAt: new Date() } });
    const id = randomUUID();
    const routes: [string, string][] = [
      ['get', `/api/projects/${project.id}/client-finance`],
      ['get', `/api/projects/${project.id}/client-finance/history`],
      ['post', `/api/projects/${project.id}/receipts`],
      ['post', `/api/receipts/${id}/verification`],
      ['post', `/api/projects/${project.id}/quotation`],
      ['post', `/api/quotations/${id}/revisions`],
      ['post', `/api/quotation-revisions/${id}/status`],
      ['post', `/api/quotation-revisions/${id}/approval`],
      ['post', `/api/projects/${project.id}/purchase-orders`],
      ['post', `/api/purchase-orders/${id}/cancellation`],
      ['post', '/api/financial-attachments'],
      ['post', `/api/financial-attachments/${id}/removal`],
      ['get', `/api/history?client_quotation_id=${id}`],
    ];
    for (const [method, url] of routes) {
      for (const client of [request(app), revoked.client]) {
        const response = await (method === 'get' ? client.get(url) : client.post(url).send({ amount: '1.00', client_approval_id: approval.id }));
        expect(response.status, `${method} ${url}`).toBe(401);
        expect(JSON.stringify(response.body)).not.toMatch(/123456|1000\.00/);
      }
    }
  });
});
