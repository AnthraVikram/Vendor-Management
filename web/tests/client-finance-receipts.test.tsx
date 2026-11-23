import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 US2 (T032). Moves the scenarios of advances-section.test.tsx: the Advances section is replaced by the
// Client finance receipts panel (spec Backward Compatibility: Feature 003 FR-017 superseded; FR-043), with the
// Feature 006 permissions: the Office Team's control now submits for verification.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const anil = { id: 'u3', name: 'Anil Accountant' };
const omar = { id: 'u2', name: 'Omar Office' };
const receipt = (over: Record<string, unknown>) => ({
  id: 'r', receipt_type: 'ADVANCE', amount: '100000.00', received_on: '2026-09-14', payment_method: 'BANK_TRANSFER', reference: 'NEFT 8812', note: null,
  state: 'VERIFIED', entry_status: 'VERIFIED_ON_ENTRY', recorded_under: 'FEATURE_006', counted: true, link: null, decision: null, reversal: null, attachments: [],
  created_at: '2026-09-14T10:00:00.000Z', created_by: anil, ...over,
});

function finance(over: Record<string, unknown> = {}) {
  return {
    project: { id: 'p1', name: 'Kapoor Residence', client_name: 'R. Kapoor', archived: false },
    quotation: null, approvals: [], purchase_orders: [], current_po: null, current_po_text: null,
    receipts: [
      receipt({ id: 'a1', recorded_under: 'FEATURE_003', state: 'REVERSED', counted: false, reversal: { amount: '100000.00', reason: 'Entered against the wrong project.', created_at: '2026-10-02T09:00:00.000Z', created_by: anil } }),
      receipt({ id: 'a2', amount: '150000.00', received_on: '2026-10-05', payment_method: 'UPI', reference: 'UTR 4471', note: 'Second advance' }),
      receipt({ id: 'a3', receipt_type: 'STAGE_PAYMENT', amount: '1840000.00', received_on: '2026-11-01', state: 'SUBMITTED', entry_status: 'SUBMITTED', counted: false, created_by: omar }),
    ],
    summary: { approved_amount: null, approved_revision_number: null, verified_receipts: '150000.00', outstanding: null, overpaid: null, basis_text: null, not_available_reason: 'Not available: no approved amount', counted_receipt_ids: ['a2'] },
    pending_verification: [],
    ...over,
  };
}

type Post = { url: string; body: Record<string, unknown> };

function mockFetch(role: string, meId: string, onPost?: (url: string, body: Record<string, unknown>) => ReturnType<typeof json>, data = finance()) {
  const posts: Post[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') return json(200, { id: meId, name: 'Me', email: 'me@example.com', role });
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        return onPost ? onPost(url, body) : json(201, {});
      }
      if (url === '/api/projects/p1/client-finance') return json(200, data);
      return json(404, { message: 'Not found.' });
    }),
  );
  return posts;
}

async function receiptItems() {
  return within(await screen.findByRole('list', { name: 'Receipts' })).getAllByRole('listitem');
}

afterEach(() => vi.unstubAllGlobals());

describe('client finance receipts panel', () => {
  it('lists receipts in date order with the reversal and its reason, the Feature 003 label, states in words and incl. GST amounts', async () => {
    mockFetch('ADMINISTRATOR', 'u1');
    render(<ClientFinanceArea projectId="p1" />);
    const items = await receiptItems();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Recorded under Feature 003');
    expect(items[0]).toHaveTextContent('Reversed ₹1,00,000.00 by Anil Accountant');
    expect(items[0]).toHaveTextContent('Reason: Entered against the wrong project.');
    expect(items[1]).toHaveTextContent('₹1,50,000.00 incl. GST');
    expect(items[1]).toHaveTextContent('UPI · UTR 4471 · Second advance');
    expect(items[2]).toHaveTextContent('Stage payment');
    expect(items[2]).toHaveTextContent('Awaiting verification');
  });

  it('shows verify, reject and reverse to Accountants and Administrators', async () => {
    for (const role of ['ACCOUNTANT', 'ADMINISTRATOR']) {
      mockFetch(role, 'u9');
      const { unmount } = render(<ClientFinanceArea projectId="p1" />);
      const items = await receiptItems();
      expect(within(items[2]).getByRole('button', { name: 'Verify' })).toBeInTheDocument();
      expect(within(items[2]).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
      expect(within(items[1]).getByRole('button', { name: 'Reverse' })).toBeInTheDocument();
      expect(within(items[0]).queryByRole('button', { name: 'Reverse' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Save receipt' })).toBeInTheDocument();
      unmount();
    }
  });

  it('gives Office Team amounts and a submit-for-verification form, withdraw on their own entry, and no verify, reject or reverse', async () => {
    mockFetch('OFFICE_TEAM', 'u2');
    render(<ClientFinanceArea projectId="p1" />);
    const items = await receiptItems();
    expect(items[1]).toHaveTextContent('₹1,50,000.00 incl. GST');
    for (const name of ['Verify', 'Reject', 'Reverse']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(within(items[2]).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeInTheDocument();
  });

  it('shows a 400 amount message beside the amount field', async () => {
    mockFetch('ACCOUNTANT', 'u3', () => json(400, { message: 'Check the highlighted fields.', fields: { amount: 'Amount must be greater than zero with at most two decimal places.' } }));
    render(<ClientFinanceArea projectId="p1" />);
    await receiptItems();
    await userEvent.type(screen.getByLabelText('Amount (incl. GST)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(await screen.findByText('Amount must be greater than zero with at most two decimal places.')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount (incl. GST)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('warns of an overpayment with the four figures and resends with the confirmation and the same submission ID', async () => {
    let calls = 0;
    const posts = mockFetch('ACCOUNTANT', 'u3', () => {
      calls += 1;
      return calls === 1
        ? json(409, { code: 'OVERPAYMENT_CONFIRMATION_REQUIRED', message: 'Overpaid.', approved_amount: '1840000.00', verified_receipts: '1800000.00', receipt_amount: '100000.00', excess: '60000.00' })
        : json(201, {});
    });
    render(<ClientFinanceArea projectId="p1" />);
    await receiptItems();
    await userEvent.type(screen.getByLabelText('Amount (incl. GST)'), '100000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Approved amount ₹18,40,000.00, verified receipts ₹18,00,000.00, this receipt ₹1,00,000.00');
    expect(dialog).toHaveTextContent('overpaid by ₹60,000.00 (incl. GST)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save anyway' }));
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toMatchObject({ confirm_overpayment: true, submission_id: posts[0].body.submission_id });
  });

  it('reuses the submission ID on a retry and uses a new one for the next receipt', async () => {
    let calls = 0;
    const posts = mockFetch('ACCOUNTANT', 'u3', () => {
      calls += 1;
      return calls === 1 ? json(500, { message: 'Down' }) : json(201, {});
    });
    render(<ClientFinanceArea projectId="p1" />);
    await receiptItems();
    await userEvent.type(screen.getByLabelText('Amount (incl. GST)'), '5000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    await screen.findByText('The action did not complete. Please try again.');
    await userEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    await userEvent.type(screen.getByLabelText('Amount (incl. GST)'), '7000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(posts).toHaveLength(3);
    expect(posts[1].body.submission_id).toBe(posts[0].body.submission_id);
    expect(posts[2].body.submission_id).not.toBe(posts[1].body.submission_id);
  });

  it('on an archived project shows the notice and no entry form', async () => {
    mockFetch('ACCOUNTANT', 'u3', undefined, finance({ project: { id: 'p1', name: 'Kapoor Residence', client_name: null, archived: true } }));
    render(<ClientFinanceArea projectId="p1" />);
    await receiptItems();
    expect(screen.getByText(/This project is archived/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Enter a receipt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
  });
});
