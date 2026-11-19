import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 US5 (T051): the purchase orders panel.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const anil = { id: 'u3', name: 'Anil Accountant' };
const omar = { id: 'u2', name: 'Omar Office' };
const approval = (over: Record<string, unknown>) => ({
  id: 'a1', revision_id: 'r1', revision_number: 1, amount: '1840000.00', client_acceptance_date: null, note: null, authoritative: true, superseded_by: null,
  attachments: [], created_at: '2026-11-03T05:00:00.000Z', created_by: anil, ...over,
});
const po = (over: Record<string, unknown>) => ({
  id: 'p1', po_number: 'PO/2026/118', po_date: '2026-11-05', amount: '1840000.00', note: null, state: 'SUBMITTED', entry_status: 'SUBMITTED',
  approval: { id: 'a1', revision_number: 1 }, label: null, decision: null, cancellation: null, attachments: [], created_at: '2026-11-05T05:00:00.000Z', created_by: omar, ...over,
});

function finance(over: Record<string, unknown> = {}) {
  return {
    project: { id: 'p1', name: 'Lake House', client_name: 'Mehta Interiors', archived: false },
    quotation: null, approvals: [approval({})], purchase_orders: [], current_po: null, current_po_text: 'No PO for the current approved amount', receipts: [],
    summary: { approved_amount: '1840000.00', approved_revision_number: 1, verified_receipts: '0.00', outstanding: '1840000.00', overpaid: null, basis_text: null, not_available_reason: null, counted_receipt_ids: [] },
    pending_verification: [],
    ...over,
  };
}

function mockFetch(role: string, meId: string, data: unknown, onPost: (url: string, body: Record<string, unknown>) => ReturnType<typeof json> = () => json(201, {})) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') return json(200, { id: meId, name: 'Me', role });
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        return onPost(url, body);
      }
      if (url === '/api/projects/p1/client-finance') return json(200, data);
      return json(404, { message: 'Not found.' });
    }),
  );
  return posts;
}

afterEach(() => vi.unstubAllGlobals());
const panel = () => screen.findByRole('region', { name: 'Client purchase orders' });

describe('client purchase orders panel', () => {
  it('enters a PO against the current approval at its amount, confirming each warning and resending', async () => {
    let calls = 0;
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance(), () => {
      calls += 1;
      if (calls === 1) return json(409, { code: 'DUPLICATE_PO_NUMBER', message: 'PO number PO/2026/118 is already recorded on Studio.', po_number: 'PO/2026/118', project: { id: 'x', name: 'Studio' } });
      if (calls === 2) return json(409, { code: 'PENDING_REVISION', message: 'Revision 2 (under review, ₹1910000.00) is pending.' });
      return json(201, {});
    });
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    expect(region).toHaveTextContent('No PO for the current approved amount');
    expect(within(region).getByLabelText('PO amount (incl. GST)')).toHaveValue('1840000.00');
    await userEvent.type(within(region).getByLabelText('PO number'), 'PO/2026/118');
    await userEvent.type(within(region).getByLabelText('PO date'), '2026-11-05');
    await userEvent.click(within(region).getByRole('button', { name: 'Submit PO for verification' }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('already recorded on Studio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record anyway' }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Revision 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record anyway' }));
    expect(posts).toHaveLength(3);
    expect(posts[0].body).toMatchObject({ client_approval_id: 'a1', po_number: 'PO/2026/118', amount: '1840000.00' });
    expect(posts[2].body).toMatchObject({ confirm_duplicate: true, confirm_pending_revision: true });
  });

  it('shows states and the superseded label in words, and the current PO', async () => {
    const current = po({ id: 'p2', po_number: 'PO/2', state: 'VERIFIED', entry_status: 'VERIFIED_ON_ENTRY' });
    mockFetch('OFFICE_TEAM', 'u2', finance({
      purchase_orders: [po({ state: 'CANCELLED', label: 'Matches superseded approval (revision 1)', cancellation: { reason: 'Replaced', created_at: '2026-11-06T05:00:00.000Z', created_by: anil } }), current],
      current_po: current,
      current_po_text: null,
    }));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    const items = within(within(region).getByRole('list', { name: 'Purchase orders' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Cancelled');
    expect(items[0]).toHaveTextContent('Matches superseded approval (revision 1)');
    expect(items[0]).toHaveTextContent('Reason: Replaced');
    expect(items[1]).toHaveTextContent('₹18,40,000.00 incl. GST');
    expect(region).toHaveTextContent('Current PO: PO/2');
  });

  it('gives reviewers verify, reject and cancel, and Office Team only withdraw on its own Submitted PO', async () => {
    const data = finance({ purchase_orders: [po({}), po({ id: 'p2', po_number: 'PO/2', state: 'VERIFIED' })] });
    mockFetch('OFFICE_TEAM', 'u2', data);
    const office = render(<ClientFinanceArea projectId="p1" />);
    let region = await panel();
    for (const name of ['Verify', 'Reject', 'Cancel PO']) expect(within(region).queryByRole('button', { name })).toBeNull();
    expect(within(region).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    office.unmount();
    const posts = mockFetch('ACCOUNTANT', 'u3', data, () => json(200, {}));
    render(<ClientFinanceArea projectId="p1" />);
    region = await panel();
    expect(within(region).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Cancel PO' })).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: 'Verify' }));
    expect(posts[0]).toEqual({ url: '/api/purchase-orders/p1/verification', body: { expected_state: 'SUBMITTED' } });
  });

  it('says a PO needs an approved quotation first', async () => {
    mockFetch('OFFICE_TEAM', 'u2', finance({ approvals: [], current_po_text: null, summary: { ...finance().summary, approved_amount: null } }));
    render(<ClientFinanceArea projectId="p1" />);
    expect(await panel()).toHaveTextContent('A purchase order can be entered once the client quotation is approved.');
  });
});
