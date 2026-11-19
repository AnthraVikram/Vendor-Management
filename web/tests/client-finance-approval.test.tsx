import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 US4 (T046): approving a revision and showing approvals.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const anil = { id: 'u3', name: 'Anil Accountant' };
const revision = (over: Record<string, unknown>) => ({
  id: 'r1', number: 1, amount: '1840000.00', previous_amount: null, quotation_date: '2026-11-01', validity_date: null, submitted_at: null, reason: null, note: null,
  status: 'UNDER_REVIEW', newest: true, status_changes: [], attachments: [], created_at: '2026-11-01T05:00:00.000Z', created_by: anil, ...over,
});
const approval = (over: Record<string, unknown>) => ({
  id: 'a1', revision_id: 'r1', revision_number: 1, amount: '1840000.00', client_acceptance_date: null, note: null, authoritative: true, superseded_by: null,
  attachments: [], created_at: '2026-11-03T05:00:00.000Z', created_by: anil, ...over,
});

function finance(revisions: unknown[], approvals: unknown[] = []) {
  return {
    project: { id: 'p1', name: 'Lake House', client_name: 'Mehta Interiors', archived: false },
    quotation: { id: 'q1', reference: 'Q-000042', title: 'Interior works', created_at: '2026-11-01T05:00:00.000Z', created_by: anil, newest_revision_number: revisions.length, revisions },
    approvals, purchase_orders: [], current_po: null, current_po_text: null, receipts: [],
    summary: { approved_amount: null, approved_revision_number: null, verified_receipts: '0.00', outstanding: null, overpaid: null, basis_text: null, not_available_reason: 'Not available: no approved amount', counted_receipt_ids: [] },
    pending_verification: [],
  };
}

function mockFetch(role: string, data: unknown, onPost: (url: string, body: Record<string, unknown>) => ReturnType<typeof json> = () => json(201, {})) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') return json(200, { id: 'me', name: 'Me', role });
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        return onPost(url, body);
      }
      if (url === '/api/projects/p1/client-finance') return json(200, data);
      if (url === '/api/projects/p1/documents') return json(200, [{ id: 'd1', title: 'Signed quotation', archived: false, document_type: 'QUOTATION' }]);
      return json(404, { message: 'Not found.' });
    }),
  );
  return posts;
}

afterEach(() => vi.unstubAllGlobals());

const panel = () => screen.findByRole('region', { name: 'Client quotation' });

describe('approving a revision', () => {
  it('offers Approve only to reviewers on a revision under review', async () => {
    mockFetch('OFFICE_TEAM', finance([revision({})]));
    const office = render(<ClientFinanceArea projectId="p1" />);
    expect(within(await panel()).queryByRole('button', { name: 'Approve' })).toBeNull();
    office.unmount();
    mockFetch('ACCOUNTANT', finance([revision({ status: 'SUBMITTED' })]));
    const submitted = render(<ClientFinanceArea projectId="p1" />);
    expect(within(await panel()).queryByRole('button', { name: 'Approve' })).toBeNull();
    submitted.unmount();
    mockFetch('ACCOUNTANT', finance([revision({})]));
    render(<ClientFinanceArea projectId="p1" />);
    expect(within(await panel()).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('approves at the revision amount with chosen documents, and shows the server refusal', async () => {
    let calls = 0;
    const posts = mockFetch('ACCOUNTANT', finance([revision({})]), () => {
      calls += 1;
      return calls === 1 ? json(409, { code: 'QUOTATION_DOCUMENT_REQUIRED', message: 'Attach the Quotation document before approving this revision.' }) : json(201, {});
    });
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    await userEvent.click(within(region).getByRole('button', { name: 'Approve' }));
    expect(within(region).getByText(/Approve revision 1 at ₹18,40,000.00 incl. GST/)).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: 'Approve revision' }));
    expect(await within(region).findByText('Attach the Quotation document before approving this revision.')).toBeInTheDocument();
    await userEvent.click(await within(region).findByLabelText('Signed quotation'));
    await userEvent.click(within(region).getByRole('button', { name: 'Approve revision' }));
    expect(posts[1]).toEqual({ url: '/api/quotation-revisions/r1/approval', body: { expected_status: 'UNDER_REVIEW', amount: '1840000.00', document_ids: ['d1'] } });
  });

  it('shows the approved amount with its revision and labels a superseded approval', async () => {
    mockFetch('OFFICE_TEAM', finance(
      [revision({ status: 'APPROVED', newest: false }), revision({ id: 'r2', number: 2, amount: '1910000.00', status: 'APPROVED' })],
      [approval({ authoritative: false, superseded_by: { approval_id: 'a2', revision_number: 2 } }), approval({ id: 'a2', revision_id: 'r2', revision_number: 2, amount: '1910000.00' })],
    ));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await panel();
    const approvals = within(within(region).getByRole('list', { name: 'Approvals' })).getAllByRole('listitem');
    expect(approvals[0]).toHaveTextContent('Revision 1 approved at ₹18,40,000.00 incl. GST');
    expect(approvals[0]).toHaveTextContent('Superseded by the approval of revision 2');
    expect(approvals[1]).toHaveTextContent('Revision 2 approved at ₹19,10,000.00 incl. GST');
    expect(approvals[1]).toHaveTextContent('Current approved client amount');
  });
});
