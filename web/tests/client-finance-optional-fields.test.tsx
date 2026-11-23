import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 convergence (T078 to T080): optional dates and notes the API accepts are offered and shown, and each
// entry of the project's client financial history names its record and links to it.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const omar = { id: 'u2', name: 'Omar Office' };
const anil = { id: 'u3', name: 'Anil Accountant' };
const revision = (over: Record<string, unknown>) => ({
  id: 'r1', number: 1, amount: '1840000.00', previous_amount: null, quotation_date: '2026-11-01', validity_date: null, submitted_at: null, reason: null, note: null,
  status: 'DRAFT', newest: true, status_changes: [], attachments: [], created_at: '2026-11-01T05:00:00.000Z', created_by: omar, ...over,
});
const approval = (over: Record<string, unknown> = {}) => ({
  id: 'a1', revision_id: 'r1', revision_number: 1, amount: '1840000.00', client_acceptance_date: null, note: null, authoritative: true, superseded_by: null,
  attachments: [], created_at: '2026-11-03T05:00:00.000Z', created_by: anil, ...over,
});
const po = (over: Record<string, unknown> = {}) => ({
  id: 'po1', po_number: 'PO/2026/118', po_date: '2026-11-04', amount: '1840000.00', note: null, state: 'VERIFIED', entry_status: 'VERIFIED_ON_ENTRY',
  approval: { id: 'a1', revision_number: 1 }, label: null, decision: null, cancellation: null, attachments: [], created_at: '2026-11-04T05:00:00.000Z', created_by: anil, ...over,
});
const receipt = (over: Record<string, unknown> = {}) => ({
  id: 'rc1', receipt_type: 'STAGE_PAYMENT', amount: '650000.00', received_on: '2026-11-05', payment_method: null, reference: null, note: null, state: 'VERIFIED',
  entry_status: 'VERIFIED_ON_ENTRY', recorded_under: 'FEATURE_006', counted: true, link: null, decision: null, reversal: null, attachments: [],
  created_at: '2026-11-05T05:00:00.000Z', created_by: anil, ...over,
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

function mockFetch(role: string, meId: string, data: unknown, extra: Record<string, unknown> = {}) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') return json(200, { id: meId, name: 'Me', role });
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return json(201, {});
      }
      if (url === '/api/projects/p1/client-finance') return json(200, data);
      if (url in extra) return json(200, extra[url]);
      return json(404, { message: 'Not found.' });
    }),
  );
  return posts;
}

afterEach(() => vi.unstubAllGlobals());

describe('optional quotation dates (T078, FR-022, FR-026)', () => {
  it('sends a validity date with a new quotation and with a new revision', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance(null));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.type(within(region).getByLabelText('Title'), 'Interior works');
    await userEvent.type(within(region).getByLabelText('Quoted amount (incl. GST)'), '1840000.00');
    await userEvent.type(within(region).getByLabelText('Validity date'), '2026-12-31');
    await userEvent.click(within(region).getByRole('button', { name: 'Create quotation' }));
    expect(posts[0].body).toMatchObject({ validity_date: '2026-12-31' });
  });

  it('leaves the validity date out when it is not given', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'REJECTED' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.click(within(region).getByRole('button', { name: 'Add revision' }));
    const form = within(region).getByRole('form', { name: 'Add a revision' });
    await userEvent.type(within(form).getByLabelText('New amount (incl. GST)'), '1910000.00');
    await userEvent.type(within(form).getByLabelText('Reason for the revision'), 'Scope grew');
    await userEvent.type(within(form).getByLabelText('Revision note'), 'Adds the deck');
    await userEvent.click(within(form).getByRole('button', { name: 'Save revision' }));
    expect(posts[0].url).toBe('/api/quotations/q1/revisions');
    expect(posts[0].body).toMatchObject({ amount: '1910000.00', reason: 'Scope grew', note: 'Adds the deck' });
    expect(posts[0].body).not.toHaveProperty('validity_date');
  });

  it('sends the client acceptance date and note with an approval', async () => {
    const posts = mockFetch('ACCOUNTANT', 'u3', finance([revision({ status: 'UNDER_REVIEW' })]), { '/api/projects/p1/documents': [] });
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.click(within(region).getByRole('button', { name: 'Approve' }));
    const form = within(region).getByRole('form', { name: 'Approve the revision' });
    await userEvent.type(within(form).getByLabelText('Client acceptance date'), '2026-11-02');
    await userEvent.type(within(form).getByLabelText('Approval note'), 'Signed copy received');
    await userEvent.click(within(form).getByRole('button', { name: 'Approve revision' }));
    expect(posts[0].body).toMatchObject({ amount: '1840000.00', client_acceptance_date: '2026-11-02', note: 'Signed copy received' });
  });

  it('shows the validity date, the client acceptance date and the approval note', async () => {
    mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'APPROVED', validity_date: '2026-12-31' })], {
      approvals: [approval({ client_acceptance_date: '2026-11-02', note: 'Signed copy received' })],
    }));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    expect(within(region).getByRole('list', { name: 'Revisions' })).toHaveTextContent('Valid until 31 Dec 2026');
    const approvals = within(region).getByRole('list', { name: 'Approvals' });
    expect(approvals).toHaveTextContent('Client accepted 2 Nov 2026');
    expect(approvals).toHaveTextContent('Signed copy received');
  });
});

describe('optional notes (T079, FR-023, FR-025, FR-029)', () => {
  it('sends an optional note with a revision withdrawal and shows status-change notes', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([
      revision({ id: 'r1', status: 'REJECTED', newest: false, status_changes: [{ from: 'UNDER_REVIEW', to: 'REJECTED', reason: 'Too high', note: 'Client wants a cheaper finish', created_at: '2026-11-02T05:00:00.000Z', created_by: anil }] }),
      revision({ id: 'r2', number: 2 }),
    ]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    expect(region).toHaveTextContent('Client wants a cheaper finish');
    await userEvent.click(within(region).getByRole('button', { name: 'Withdraw' }));
    await userEvent.type(within(region).getByLabelText('Reason'), 'Wrong amount');
    await userEvent.type(within(region).getByLabelText('Status note'), 'Re-entering as revision 3');
    await userEvent.click(within(region).getAllByRole('button', { name: 'Withdraw' }).at(-1)!);
    expect(posts[0].body).toMatchObject({ to: 'WITHDRAWN', reason: 'Wrong amount', note: 'Re-entering as revision 3' });
  });

  it('sends an optional note with a PO and shows it', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'APPROVED' })], {
      approvals: [approval()],
      purchase_orders: [po({ note: 'Received by e-mail', state: 'CANCELLED', cancellation: { reason: 'Replaced', created_at: '2026-11-05T05:00:00.000Z', created_by: anil } })],
    }));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client purchase orders' });
    expect(within(region).getByRole('list', { name: 'Purchase orders' })).toHaveTextContent('Received by e-mail');
    await userEvent.type(within(region).getByLabelText('PO number'), 'PO/2026/119');
    await userEvent.type(within(region).getByLabelText('PO date'), '2026-11-06');
    await userEvent.type(within(region).getByLabelText('PO note'), 'Replacement copy');
    await userEvent.click(within(region).getByRole('button', { name: 'Submit PO for verification' }));
    expect(posts[0].body).toMatchObject({ po_number: 'PO/2026/119', note: 'Replacement copy' });
  });

  it('sends no note fields when they are left empty, so the strict routes are unchanged', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'APPROVED' })], { approvals: [approval()] }));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client purchase orders' });
    await userEvent.type(within(region).getByLabelText('PO number'), 'PO/2026/119');
    await userEvent.type(within(region).getByLabelText('PO date'), '2026-11-06');
    await userEvent.click(within(region).getByRole('button', { name: 'Submit PO for verification' }));
    expect(posts[0].body).not.toHaveProperty('note');
  });
});

describe('convergence follow-up (T082, T083)', () => {
  it('sends a filled-in validity date with a new revision (T083, FR-022)', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'REJECTED' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.click(within(region).getByRole('button', { name: 'Add revision' }));
    const form = within(region).getByRole('form', { name: 'Add a revision' });
    await userEvent.type(within(form).getByLabelText('New amount (incl. GST)'), '1910000.00');
    await userEvent.type(within(form).getByLabelText('Reason for the revision'), 'Scope grew');
    await userEvent.type(within(form).getByLabelText('Validity date'), '2027-01-31');
    await userEvent.click(within(form).getByRole('button', { name: 'Save revision' }));
    expect(posts[0].url).toBe('/api/quotations/q1/revisions');
    expect(posts[0].body).toMatchObject({ amount: '1910000.00', reason: 'Scope grew', validity_date: '2027-01-31' });
  });

  it('sends the status note with a revision rejection (T083, FR-025)', async () => {
    const posts = mockFetch('ACCOUNTANT', 'u3', finance([revision({ status: 'UNDER_REVIEW' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.click(within(region).getByRole('button', { name: 'Reject' }));
    await userEvent.type(within(region).getByLabelText('Reason'), 'Too high');
    await userEvent.type(within(region).getByLabelText('Status note'), 'Client asked for a cheaper finish');
    await userEvent.click(within(region).getByRole('button', { name: 'Reject' }));
    expect(posts[0].url).toBe('/api/quotation-revisions/r1/status');
    expect(posts[0].body).toEqual({ to: 'REJECTED', expected_status: 'UNDER_REVIEW', reason: 'Too high', note: 'Client asked for a cheaper finish' });
  });

  it('submits in one click with no note, and sends a note only when one is typed (T082, FR-025)', async () => {
    const posts = mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'DRAFT' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.click(within(region).getByRole('button', { name: 'Submit' }));
    expect(posts[0].body).toEqual({ to: 'SUBMITTED', expected_status: 'DRAFT' });
    await userEvent.type(within(region).getByLabelText('Note (optional)'), 'Sent to the client today');
    await userEvent.click(within(region).getByRole('button', { name: 'Submit' }));
    expect(posts[1].body).toEqual({ to: 'SUBMITTED', expected_status: 'DRAFT', note: 'Sent to the client today' });
  });

  it('sends an optional note when a reviewer marks a revision under review (T082, FR-025)', async () => {
    const posts = mockFetch('ACCOUNTANT', 'u3', finance([revision({ status: 'SUBMITTED' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    await userEvent.type(within(region).getByLabelText('Note (optional)'), 'Checking the BOQ');
    await userEvent.click(within(region).getByRole('button', { name: 'Mark under review' }));
    expect(posts[0].body).toEqual({ to: 'UNDER_REVIEW', expected_status: 'SUBMITTED', note: 'Checking the BOQ' });
  });

  it('offers no step note to Office Team on a Submitted revision, where they have no step to take', async () => {
    mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'SUBMITTED' })]));
    render(<ClientFinanceArea projectId="p1" />);
    const region = await screen.findByRole('region', { name: 'Client quotation' });
    expect(within(region).queryByLabelText('Note (optional)')).toBeNull();
  });
});

describe('client financial history entries (T080, FR-038)', () => {
  it('names each record and links to it on the page', async () => {
    mockFetch('OFFICE_TEAM', 'u2', finance([revision({ status: 'APPROVED' })], { approvals: [approval()], purchase_orders: [po()], receipts: [receipt()] }), {
      '/api/projects/p1/client-finance/history': {
        entries: [
          { id: 'h1', action: 'CREATED', record: { kind: 'quotation', id: 'q1', revision_number: 1 }, amount: '1840000.00', state: 'DRAFT', created_at: '2026-11-01T05:00:00.000Z', created_by: omar },
          { id: 'h2', action: 'CREATED', record: { kind: 'purchase_order', id: 'po1' }, amount: '1840000.00', state: 'VERIFIED', created_at: '2026-11-04T05:00:00.000Z', created_by: anil },
          { id: 'h3', action: 'CREATED', record: { kind: 'receipt', id: 'rc1' }, amount: '650000.00', state: 'VERIFIED', created_at: '2026-11-05T05:00:00.000Z', created_by: anil },
          { id: 'h4', action: 'CREATED', record: { kind: 'receipt', id: 'gone' }, amount: null, state: null, created_at: '2026-11-06T05:00:00.000Z', created_by: anil },
        ],
      },
    });
    render(<ClientFinanceArea projectId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show client financial history' }));
    const list = await screen.findByRole('list', { name: 'Client financial history' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Quotation revision 1', 'PO PO/2026/118', 'Stage payment received 5 Nov 2026']);
    for (const link of links) {
      const target = document.getElementById(link.getAttribute('href')!.slice(1));
      expect(target).not.toBeNull();
    }
    expect(within(list).getAllByRole('listitem')[3]).toHaveTextContent('Receipt');
  });
});
