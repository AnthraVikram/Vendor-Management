import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 US6 (T058): the balance summary, pending list and client financial history in the Client finance area.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin' };
const summary = (over: Record<string, unknown>) => ({
  approved_amount: '1840000.00', approved_revision_number: 2, verified_receipts: '650000.00', outstanding: '1190000.00', overpaid: null,
  basis_text: 'Approved client amount ₹18,40,000.00 less verified receipts ₹6,50,000.00', not_available_reason: null, counted_receipt_ids: [], ...over,
});
function finance(over: Record<string, unknown> = {}) {
  return {
    project: { id: 'p1', name: 'Lake House', client_name: 'Mehta Interiors', archived: false },
    quotation: null, approvals: [], purchase_orders: [], current_po: null, current_po_text: null, receipts: [],
    summary: summary({}),
    pending_verification: [{ kind: 'receipt', id: 'r9', amount: '200000.00', label: 'Receipt of ₹2,00,000.00', created_at: '2026-11-17T05:00:00.000Z', created_by: asha }],
    ...over,
  };
}

let current = finance();
const history = {
  entries: [
    { id: 'h1', action: 'CREATED', record: { kind: 'receipt', id: 'a1' }, amount: '50000.00', state: 'VERIFIED', details: {}, created_at: '2026-10-01T05:00:00.000Z', created_by: asha },
    { id: 'h2', action: 'APPROVED', record: { kind: 'quotation', id: 'q1', revision_number: 2 }, amount: '1840000.00', state: 'APPROVED', details: {}, created_at: '2026-11-02T05:00:00.000Z', created_by: asha },
  ],
};

beforeEach(() => {
  current = finance();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === '/api/auth/me') return json(200, { id: 'u1', name: 'Asha', role: 'ACCOUNTANT' });
    if (url === '/api/projects/p1/client-finance') return json(200, current);
    if (url === '/api/projects/p1/client-finance/history') return json(200, history);
    return json(404, { message: 'Not found.' });
  }));
});

afterEach(() => vi.unstubAllGlobals());

const summaryRegion = () => screen.findByRole('region', { name: 'Client balance' });

describe('client balance and history', () => {
  it('shows the three figures exactly, with Indian grouping and "incl. GST", and the basis', async () => {
    render(<ClientFinanceArea projectId="p1" />);
    const region = await summaryRegion();
    expect(region).toHaveTextContent('Approved client amount ₹18,40,000.00 incl. GST (revision 2)');
    expect(region).toHaveTextContent('Verified receipts ₹6,50,000.00 incl. GST');
    expect(region).toHaveTextContent('Outstanding ₹11,90,000.00 incl. GST');
    expect(region).toHaveTextContent('Approved client amount ₹18,40,000.00 less verified receipts ₹6,50,000.00');
  });

  it('reads "Not available" with the reason, and "₹0.00 outstanding" with the overpayment, never a negative amount', async () => {
    current = finance({ summary: summary({ approved_amount: null, outstanding: null, basis_text: null, not_available_reason: 'Not available: no approved amount' }) });
    const first = render(<ClientFinanceArea projectId="p1" />);
    expect(await summaryRegion()).toHaveTextContent('Not available: no approved amount');
    first.unmount();
    current = finance({ summary: summary({ outstanding: '0.00', overpaid: '60000.00' }) });
    render(<ClientFinanceArea projectId="p1" />);
    const region = await summaryRegion();
    expect(region).toHaveTextContent('₹0.00 outstanding');
    expect(region).toHaveTextContent('Overpaid by ₹60,000.00 (incl. GST)');
    expect(region).not.toHaveTextContent('-₹');
  });

  it('lists the records awaiting verification in words', async () => {
    render(<ClientFinanceArea projectId="p1" />);
    const list = await screen.findByRole('list', { name: 'Awaiting verification' });
    expect(within(list).getByRole('listitem')).toHaveTextContent('Receipt of ₹2,00,000.00 · Asha Admin');
  });

  it('opens the client financial history in date order with amounts and states in words', async () => {
    render(<ClientFinanceArea projectId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show client financial history' }));
    const items = within(await screen.findByRole('list', { name: 'Client financial history' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Created · Receipt · ₹50,000.00 · Verified · Asha Admin');
    expect(items[1]).toHaveTextContent('Approved · Quotation revision 2 · ₹18,40,000.00 · Approved');
  });

  it('loads fresh figures each time the area opens, with no cached values (NFR-002)', async () => {
    const first = render(<ClientFinanceArea projectId="p1" />);
    expect(await summaryRegion()).toHaveTextContent('Verified receipts ₹6,50,000.00');
    first.unmount();
    current = finance({ summary: summary({ verified_receipts: '850000.00', outstanding: '990000.00' }) });
    render(<ClientFinanceArea projectId="p1" />);
    expect(await summaryRegion()).toHaveTextContent('Verified receipts ₹8,50,000.00');
  });
});
