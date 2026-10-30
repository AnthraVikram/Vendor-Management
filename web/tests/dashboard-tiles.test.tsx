import { act, render, screen, within } from '@testing-library/react';
import { Dashboard } from '../src/pages/dashboard';
import { ClientAdvances } from '../src/pages/client-advances';
import { Projects } from '../src/pages/projects';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const lists = { today: '2026-10-29', overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [] };

const summary = {
  vendors: { active: 184 },
  projects: { PLANNED: 3, ACTIVE: 12, ON_HOLD: 0, COMPLETED: 9 },
  client_advances: {
    standing_total: '4520000.00',
    received_this_month: '350000.00',
    month: '2026-10',
    labels: {
      standing_total: 'Client advances received and not reversed, all projects',
      received_this_month: 'Client advances received in October 2026 and not reversed',
    },
  },
};

function mockFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    return url in routes ? json(200, routes[url]) : json(404, { message: 'Not found.' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function tiles() {
  return screen.findByRole('region', { name: 'At a glance' });
}

describe('dashboard tiles (US4)', () => {
  it('shows each count with what it counts, linked to the list behind it (US4-1, US4-2, US4-6)', async () => {
    mockFetch({ '/api/dashboard/summary': summary, '/api/dashboard': lists });
    render(<Dashboard />);
    const region = within(await tiles());
    const expectations: [RegExp, string, string][] = [
      [/Vendors not archived/, '184', '#/vendors'],
      [/Planned projects, not archived/, '3', '#/projects?status=PLANNED'],
      [/Active projects, not archived/, '12', '#/projects?status=ACTIVE'],
      [/On hold projects, not archived/, '0', '#/projects?status=ON_HOLD'],
      [/Completed projects, not archived/, '9', '#/projects?status=COMPLETED'],
    ];
    for (const [label, count, href] of expectations) {
      const link = region.getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveTextContent(count);
    }
  });

  it('shows the money as rupees with two decimals and the label from the API, linked to the advances behind it (US4-3, FR-024)', async () => {
    mockFetch({ '/api/dashboard/summary': summary, '/api/dashboard': lists });
    render(<Dashboard />);
    const region = within(await tiles());
    const total = region.getByRole('link', { name: /Client advances received and not reversed, all projects/ });
    expect(total).toHaveTextContent('₹4520000.00');
    expect(total).toHaveAttribute('href', '#/client-advances?scope=all');
    const month = region.getByRole('link', { name: /Client advances received in October 2026 and not reversed/ });
    expect(month).toHaveTextContent('₹350000.00');
    expect(month).toHaveAttribute('href', '#/client-advances?scope=month');
  });

  it('shows no money tile and no amount when the summary has no client_advances (FR-025)', async () => {
    const { client_advances: _omitted, ...countsOnly } = summary;
    mockFetch({ '/api/dashboard/summary': countsOnly, '/api/dashboard': lists });
    render(<Dashboard />);
    const region = await tiles();
    expect(within(region).getByRole('link', { name: /Vendors not archived/ })).toBeInTheDocument();
    expect(within(region).queryByRole('link', { name: /Client advances/ })).toBeNull();
    expect(region).not.toHaveTextContent('₹');
  });

  it('keeps the Feature 002 lists, below the tiles', async () => {
    mockFetch({ '/api/dashboard/summary': summary, '/api/dashboard': lists });
    render(<Dashboard />);
    const region = await tiles();
    const overdue = await screen.findByRole('region', { name: 'Overdue' });
    expect(screen.getByText('Nothing due soon.')).toBeInTheDocument();
    expect(region.compareDocumentPosition(overdue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('lists behind the tiles (US4-6)', () => {
  const advance = {
    id: 'a1', amount: '25000.50', received_on: '2026-10-01', payment_method: 'UPI', reference: 'UTR 1', note: null,
    created_at: '2026-10-01T06:00:00.000Z', created_by: { id: 'u1', name: 'Asha Admin' }, reversal: null,
    project: { id: 'p9', name: 'Archived Active', client_name: 'R. Kapoor', archived: true },
  };

  it('lists the advances for a scope with project, date, and amount', async () => {
    const fetchMock = mockFetch({ '/api/client-advances?scope=month': [advance] });
    render(<ClientAdvances scope="month" />);
    const list = await screen.findByRole('list', { name: 'Client advances' });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('/api/client-advances?scope=month');
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('2026-10-01');
    expect(item).toHaveTextContent('₹25000.50');
    expect(item).toHaveTextContent('archived');
    expect(within(item).getByRole('link', { name: /Archived Active/ })).toHaveAttribute('href', '#/projects/p9');
  });

  it('says so when a scope has no advances', async () => {
    mockFetch({ '/api/client-advances?scope=all': [] });
    render(<ClientAdvances scope="all" />);
    expect(await screen.findByText('No client advances to show.')).toBeInTheDocument();
  });

  it('asks the API for the projects in one status', async () => {
    const fetchMock = mockFetch({ '/api/projects?status=ACTIVE': [{ id: 'p1', name: 'Kapoor Residence', status: 'ACTIVE', archived: false }] });
    render(<Projects openProject={() => undefined} status="ACTIVE" />);
    expect(await screen.findByRole('button', { name: 'Kapoor Residence' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(['/api/projects?status=ACTIVE']);
  });

  it('opens the tile lists from the app shell', async () => {
    mockFetch({
      '/api/auth/me': { id: 'u1', name: 'Omar Office', role: 'OFFICE_TEAM' },
      '/api/client-advances?scope=all': [advance],
      '/api/projects?status=ON_HOLD': [{ id: 'p2', name: 'Paused Flat', status: 'ON_HOLD', archived: false }],
    });
    window.location.hash = '#/client-advances?scope=all';
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      await import('../src/main');
    });
    expect(await screen.findByRole('list', { name: 'Client advances' })).toBeInTheDocument();

    await act(async () => {
      window.location.hash = '#/projects?status=ON_HOLD';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('button', { name: 'Paused Flat' })).toBeInTheDocument();
  });
});
