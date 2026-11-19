import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 US3 (T041): the quotation panel in the Client finance area.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const omar = { id: 'u2', name: 'Omar Office' };
const anil = { id: 'u3', name: 'Anil Accountant' };
const revision = (over: Record<string, unknown>) => ({
  id: 'r1', number: 1, amount: '1840000.00', previous_amount: null, quotation_date: '2026-11-01', validity_date: null, submitted_at: null, reason: null, note: null,
  status: 'DRAFT', newest: true, status_changes: [], attachments: [], created_at: '2026-11-01T05:00:00.000Z', created_by: omar, ...over,
});

function finance(revisions: unknown[] | null, over: Record<string, unknown> = {}) {
  return {
    project: { id: 'p1', name: 'Lake House', client_name: 'Mehta Interiors', archived: false },
    quotation: revisions ? { id: 'q1', reference: 'Q-000042', title: 'Interior works', created_at: '2026-11-01T05:00:00.000Z', created_by: omar, newest_revision_number: revisions.length, revisions } : null,
    approvals: [], purchase_orders: [], current_po: null, current_po_text: null, receipts: [],
    summary: { approved_amount: null, approved_revision_number: null, verified_receipts: '0.00', outstanding: null, overpaid: null, basis_text: null, not_available_reason: 'Not available: no approved amount', counted_receipt_ids: [] },
    pending_verification: [],
    ...over,
  };
}

function mockFetch(role: string, meId: string, data: unknown, onPost: (url: string, body: Record<string, unknown>) => ReturnType<typeof json> = () => json(200, {})) {
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

const panel = () => screen.findByRole('region', { name: 'Client quotation' });

describe('client quotation panel', () => {
  it('offers every role a form to create the quotation when there is none', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance(null), () => json(201, {}));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    await userEvent.type(within(region).getByLabelText('Title'), 'Interior works');
    await userEvent.type(within(region).getByLabelText('Quoted amount (incl. GST)'), '1840000.00');
    await userEvent.click(within(region).getByRole('button', { name: 'Create quotation' }));
    expect(posts[0].url).toBe('/api/projects/p1/quotation');
    expect(posts[0].body).toMatchObject({ title: 'Interior works', amount: '1840000.00' });
  });

  it('lists revisions with their own statuses, marks the newest and shows amounts incl. GST', async () => {
    mockFetch('OFFICE_TEAM', 'u2', finance([
      revision({ id: 'r1', status: 'REJECTED', newest: false }),
      revision({ id: 'r2', number: 2, amount: '1910000.00', previous_amount: '1840000.00', reason: 'Scope grew', status: 'SUBMITTED', submitted_at: '2026-11-02T05:00:00.000Z' }),
    ]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    expect(region).toHaveTextContent('Q-000042');
    const items = within(region).getAllByRole('listitem').filter((li) => li.classList.contains('revision'));
    expect(items[0]).toHaveTextContent('Revision 1');
    expect(items[0]).toHaveTextContent('Rejected');
    expect(items[1]).toHaveTextContent('Revision 2 · Newest');
    expect(items[1]).toHaveTextContent('₹19,10,000.00 incl. GST');
    expect(items[1]).toHaveTextContent('was ₹18,40,000.00');
    expect(items[1]).toHaveTextContent('Reason: Scope grew');
    expect(items[1]).toHaveTextContent('Submitted');
  });

  it('disables adding a revision while one is active and says why', async () => {
    mockFetch('ACCOUNTANT', 'u3', finance([revision({ status: 'UNDER_REVIEW' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    expect(within(region).getByRole('button', { name: 'Add revision' })).toBeDisabled();
    expect(region).toHaveTextContent('Revision 1 is Under review. A new revision can be added once it is approved, rejected or withdrawn.');
  });

  it('gives each role only its status controls: Office Team submits and withdraws its own Draft, reviewers review', async () => {
    mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'DRAFT', created_by: omar })]));
    const office = render(<ClientFinanceArea projectId="p1" />);
    let region = await panel();
    expect(within(region).getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    office.unmount();

    mockFetch('OFFICE_TEAM', 'u9', finance([revision({ status: 'DRAFT', created_by: anil })]));
    const other = render(<ClientFinanceArea projectId="p1" />);
    region = await panel();
    expect(within(region).queryByRole('button', { name: 'Withdraw' })).toBeNull();
    other.unmount();

    mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'SUBMITTED' })]));
    const submitted = render(<ClientFinanceArea projectId="p1" />);
    region = await panel();
    for (const name of ['Mark under review', 'Withdraw', 'Reject', 'Submit']) expect(within(region).queryByRole('button', { name })).toBeNull();
    submitted.unmount();

    const posts = mockFetch('ACCOUNTANT', 'u3', finance([revision({ status: 'SUBMITTED' })]));
    render(<ClientFinanceArea projectId="p1" />);
    region = await panel();
    await userEvent.click(within(region).getByRole('button', { name: 'Mark under review' }));
    expect(posts[0]).toEqual({ url: '/api/quotation-revisions/r1/status', body: { to: 'UNDER_REVIEW', expected_status: 'SUBMITTED' } });
  });

  it('asks for a reason before withdrawing', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'DRAFT', created_by: omar })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    await userEvent.click(within(region).getByRole('button', { name: 'Withdraw' }));
    await userEvent.type(within(region).getByLabelText('Reason'), 'Wrong amount');
    await userEvent.click(within(region).getByRole('button', { name: 'Withdraw' }));
    expect(posts[0].body).toEqual({ to: 'WITHDRAWN', expected_status: 'DRAFT', reason: 'Wrong amount' });
  });
});
