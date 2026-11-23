import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 convergence (T084, T085): documents chosen on the PO and receipt entry forms go in the save request.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const anil = { id: 'u3', name: 'Anil Accountant' };
const approval = {
  id: 'a1', revision_id: 'r1', revision_number: 1, amount: '1840000.00', client_acceptance_date: null, note: null, authoritative: true, superseded_by: null,
  attachments: [], created_at: '2026-11-03T05:00:00.000Z', created_by: anil,
};
const documents = [
  { id: 'd1', title: 'Client PO scan', document_type: 'PURCHASE_ORDER', archived: false },
  { id: 'd2', title: 'Bank slip', document_type: 'PAYMENT_PROOF', archived: false },
  { id: 'd3', title: 'Old drawing', document_type: 'DRAWING', archived: true },
];

function finance() {
  return {
    project: { id: 'p1', name: 'Lake House', client_name: 'Mehta Interiors', archived: false },
    quotation: null, approvals: [approval], purchase_orders: [], current_po: null, current_po_text: 'No PO for the current approved amount', receipts: [],
    summary: { approved_amount: '1840000.00', approved_revision_number: 1, verified_receipts: '0.00', outstanding: '1840000.00', overpaid: null, basis_text: null, not_available_reason: null, counted_receipt_ids: [] },
    pending_verification: [],
  };
}

function mockFetch(role: string, meId: string, onPost: (url: string, body: Record<string, unknown>, count: number) => ReturnType<typeof json> = () => json(201, {})) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') return json(200, { id: meId, name: 'Me', role });
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        return onPost(url, body, posts.length);
      }
      if (url === '/api/projects/p1/client-finance') return json(200, finance());
      if (url === '/api/projects/p1/documents') return json(200, documents);
      return json(404, { message: 'Not found.' });
    }),
  );
  return posts;
}

afterEach(() => vi.unstubAllGlobals());

const poForm = async () => screen.findByRole('form', { name: 'Enter a purchase order' });
const receiptForm = async () => screen.findByRole('form', { name: 'Enter a receipt' });

describe('documents on the PO entry form (T084, FR-030, US5-1)', () => {
  it('lets an Accountant enter a PO with its Purchase order document, which is verified on entry', async () => {
    const posts = mockFetch('ACCOUNTANT', 'u3');
    render(<ClientFinanceArea projectId="p1" />);
    const form = await poForm();
    expect(form).toHaveTextContent('A Purchase order document is required');
    await userEvent.type(within(form).getByLabelText('PO number'), 'PO/2026/118');
    await userEvent.type(within(form).getByLabelText('PO date'), '2026-11-04');
    await userEvent.click(within(form).getByRole('button', { name: 'Choose documents' }));
    await userEvent.click(await within(form).findByLabelText(/Client PO scan/));
    await userEvent.click(within(form).getByRole('button', { name: 'Save PO' }));
    expect(posts[0].url).toBe('/api/projects/p1/purchase-orders');
    expect(posts[0].body).toEqual({ client_approval_id: 'a1', po_number: 'PO/2026/118', po_date: '2026-11-04', amount: '1840000.00', document_ids: ['d1'] });
  });

  it('offers only documents that are not archived, and names the Feature 006 types', async () => {
    mockFetch('ACCOUNTANT', 'u3');
    render(<ClientFinanceArea projectId="p1" />);
    const form = await poForm();
    await userEvent.click(within(form).getByRole('button', { name: 'Choose documents' }));
    const choices = await within(form).findByRole('group', { name: 'Documents to attach' });
    expect(within(choices).getByLabelText('Client PO scan · Purchase order')).toBeInTheDocument();
    expect(within(choices).getByLabelText('Bank slip · Payment proof')).toBeInTheDocument();
    expect(within(choices).queryByLabelText(/Old drawing/)).toBeNull();
  });

  it('keeps the Office Team submit-and-verify entry unchanged: no document needed, none sent', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2');
    render(<ClientFinanceArea projectId="p1" />);
    const form = await poForm();
    expect(form).not.toHaveTextContent('A Purchase order document is required');
    await userEvent.type(within(form).getByLabelText('PO number'), 'PO/2026/118');
    await userEvent.type(within(form).getByLabelText('PO date'), '2026-11-04');
    await userEvent.click(within(form).getByRole('button', { name: 'Submit PO for verification' }));
    expect(posts[0].body).toEqual({ client_approval_id: 'a1', po_number: 'PO/2026/118', po_date: '2026-11-04', amount: '1840000.00' });
  });

  it('resends the chosen document when a warning is confirmed', async () => {
    const posts = mockFetch('ACCOUNTANT', 'u3', (_url, _body, count) =>
      count === 1 ? json(409, { message: 'PO/2026/118 is already recorded on Lake House.', code: 'DUPLICATE_PO_NUMBER' }) : json(201, {}),
    );
    render(<ClientFinanceArea projectId="p1" />);
    const form = await poForm();
    await userEvent.type(within(form).getByLabelText('PO number'), 'PO/2026/118');
    await userEvent.type(within(form).getByLabelText('PO date'), '2026-11-04');
    await userEvent.click(within(form).getByRole('button', { name: 'Choose documents' }));
    await userEvent.click(await within(form).findByLabelText(/Client PO scan/));
    await userEvent.click(within(form).getByRole('button', { name: 'Save PO' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Record anyway' }));
    expect(posts[1].body).toMatchObject({ document_ids: ['d1'], confirm_duplicate: true });
  });
});

describe('documents on the receipt entry form (T085, FR-016, US2-1)', () => {
  it('sends a chosen payment proof with the receipt', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2');
    render(<ClientFinanceArea projectId="p1" />);
    const form = await receiptForm();
    await userEvent.type(within(form).getByLabelText('Amount (incl. GST)'), '650000.00');
    await userEvent.type(within(form).getByLabelText('Date received'), '2026-11-05');
    await userEvent.click(within(form).getByRole('button', { name: 'Choose documents' }));
    await userEvent.click(await within(form).findByLabelText(/Bank slip/));
    await userEvent.click(within(form).getByRole('button', { name: 'Submit for verification' }));
    expect(posts[0].url).toBe('/api/projects/p1/receipts');
    expect(posts[0].body).toMatchObject({ amount: '650000.00', document_ids: ['d2'] });
  });

  it('keeps documents optional: none chosen, none sent', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2');
    render(<ClientFinanceArea projectId="p1" />);
    const form = await receiptForm();
    await userEvent.type(within(form).getByLabelText('Amount (incl. GST)'), '650000.00');
    await userEvent.type(within(form).getByLabelText('Date received'), '2026-11-05');
    await userEvent.click(within(form).getByRole('button', { name: 'Submit for verification' }));
    expect(posts[0].body).not.toHaveProperty('document_ids');
  });

  it('resends the same documents and submission ID when an overpayment is confirmed', async () => {
    const posts = mockFetch('ACCOUNTANT', 'u3', (_url, _body, count) =>
      count === 1
        ? json(409, { message: 'Overpayment.', code: 'OVERPAYMENT_CONFIRMATION_REQUIRED', approved_amount: '1840000.00', verified_receipts: '1800000.00', receipt_amount: '100000.00', excess: '60000.00' })
        : json(201, {}),
    );
    render(<ClientFinanceArea projectId="p1" />);
    const form = await receiptForm();
    await userEvent.type(within(form).getByLabelText('Amount (incl. GST)'), '100000.00');
    await userEvent.type(within(form).getByLabelText('Date received'), '2026-11-05');
    await userEvent.click(within(form).getByRole('button', { name: 'Choose documents' }));
    await userEvent.click(await within(form).findByLabelText(/Bank slip/));
    await userEvent.click(within(form).getByRole('button', { name: 'Save receipt' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save anyway' }));
    expect(posts[1].body).toMatchObject({ document_ids: ['d2'], confirm_overpayment: true, submission_id: posts[0].body.submission_id });
  });
});
