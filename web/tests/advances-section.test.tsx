import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvancesSection } from '../src/pages/advances-section';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const anil = { id: 'u3', name: 'Anil Accountant' };
const advances = {
  project: { id: 'p1', name: 'Kapoor Residence', client_name: 'R. Kapoor', archived: false },
  net_amount: '150000.00',
  advances: [
    {
      id: 'a1', amount: '100000.00', received_on: '2026-09-14', payment_method: 'BANK_TRANSFER', reference: 'NEFT 8812', note: null,
      created_at: '2026-09-14T10:00:00.000Z', created_by: anil,
      reversal: { id: 'r1', amount: '100000.00', reason: 'Entered against the wrong project.', created_at: '2026-10-02T09:00:00.000Z', created_by: anil },
    },
    {
      id: 'a2', amount: '150000.00', received_on: '2026-10-05', payment_method: 'UPI', reference: 'UTR 4471', note: 'Second advance',
      created_at: '2026-10-05T10:00:00.000Z', created_by: anil, reversal: null,
    },
  ],
};

function mockFetch(role: string, onPost?: (url: string, body: unknown) => ReturnType<typeof json>) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/me') return json(200, { id: 'me', name: 'Me', email: 'me@example.com', role });
    if (init?.method === 'POST' && onPost) return onPost(url, JSON.parse(String(init.body)));
    if (url === '/api/projects/p1/client-advances') return json(200, advances);
    return json(404, { message: 'Not found.' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('client advances on the project page', () => {
  it('lists advances in date order with the reversal and its reason, and the net amount', async () => {
    mockFetch('ACCOUNTANT');
    render(<AdvancesSection projectId="p1" />);
    const section = await screen.findByRole('region', { name: 'Client advances' });
    expect(await within(section).findByText(/Net client advances received \(not reversed\)/)).toHaveTextContent('₹150000.00');

    const rows = within(within(section).getByRole('list', { name: 'Advances' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026-09-14');
    expect(rows[0]).toHaveTextContent('₹100000.00');
    expect(rows[0]).toHaveTextContent('Reversed');
    expect(rows[0]).toHaveTextContent('Entered against the wrong project.');
    expect(rows[0]).toHaveTextContent('Anil Accountant');
    expect(rows[1]).toHaveTextContent('2026-10-05');
    expect(rows[1]).toHaveTextContent('₹150000.00');
    expect(rows[1]).not.toHaveTextContent('Reversed');
  });

  it('shows the record and reverse controls to Accountants and Administrators', async () => {
    for (const role of ['ACCOUNTANT', 'ADMINISTRATOR']) {
      mockFetch(role);
      const { unmount } = render(<AdvancesSection projectId="p1" />);
      const section = await screen.findByRole('region', { name: 'Client advances' });
      expect(await within(section).findByRole('button', { name: 'Record advance' })).toBeInTheDocument();
      const rows = within(within(section).getByRole('list', { name: 'Advances' })).getAllByRole('listitem');
      expect(within(rows[0]).queryByRole('button', { name: 'Reverse' })).toBeNull();
      expect(within(rows[1]).getByRole('button', { name: 'Reverse' })).toBeInTheDocument();
      unmount();
    }
  });

  it('shows amounts but no record or reverse controls to Office Team members', async () => {
    mockFetch('OFFICE_TEAM');
    render(<AdvancesSection projectId="p1" />);
    const section = await screen.findByRole('region', { name: 'Client advances' });
    expect(await within(section).findByText(/Net client advances received/)).toHaveTextContent('₹150000.00');
    expect(within(section).getByRole('list', { name: 'Advances' })).toHaveTextContent('₹100000.00');
    expect(within(section).queryByRole('button', { name: 'Record advance' })).toBeNull();
    expect(within(section).queryByRole('button', { name: 'Reverse' })).toBeNull();
  });

  it('shows a 400 amount message beside the amount field', async () => {
    const posts: [string, unknown][] = [];
    mockFetch('ACCOUNTANT', (url, body) => {
      posts.push([url, body]);
      return json(400, { message: 'Check the highlighted fields.', fields: { amount: 'Amount must be greater than zero with at most two decimal places.' } });
    });
    render(<AdvancesSection projectId="p1" />);
    const section = await screen.findByRole('region', { name: 'Client advances' });
    await userEvent.type(await within(section).findByLabelText('Amount'), '0');
    await userEvent.type(within(section).getByLabelText('Date received'), '2026-10-20');
    await userEvent.click(within(section).getByRole('button', { name: 'Record advance' }));

    expect(await within(section).findByText('Amount must be greater than zero with at most two decimal places.')).toBeInTheDocument();
    expect(within(section).getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
    expect(posts[0][0]).toBe('/api/projects/p1/client-advances');
    expect(posts[0][1]).toMatchObject({ amount: '0', received_on: '2026-10-20' });
  });
});
