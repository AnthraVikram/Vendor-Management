import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vendors } from '../src/pages/vendors';
import { Projects } from '../src/pages/projects';
import { ProjectDetail } from '../src/pages/project-detail';
import { canLeave } from '../src/ui/unsaved-guard';

// Feature 005 US1 (T015): lists before closed, sectioned add forms; Active and Archived views; sort and view remembered,
// search not; Show more; unsaved-change protection (US1-1 to US1-7, FR-001 to FR-007, FR-021, FR-026).

type Headers = Record<string, string>;

function json(status: number, body: unknown, headers: Headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : (lower[name.toLowerCase()] ?? null)) },
    json: async () => body,
  };
}

function vendor(index: number, archived = false) {
  return { id: `v${index}`, name: `Vendor ${String(index).padStart(2, '0')}`, phone: `90000${String(index).padStart(5, '0')}`, archived, locations: [], availability: null, categories: [], project_count: 0 };
}

function project(index: number, archived = false) {
  return { id: `p${index}`, name: `Project ${String(index).padStart(2, '0')}`, status: 'ACTIVE', archived, vendor_count: 0, progress: { done: 1, total: 2 }, overdue_count: 0, next_deadline: null, health: 'ONGOING' };
}

// Answers each list request by its query, so a test can check the exact request the page made.
function mockLists(answer: (path: string, query: URLSearchParams) => { body: unknown; headers?: Headers }) {
  const fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    const [path, query = ''] = url.split('?');
    if (path === '/api/vendors' || path === '/api/projects') {
      const result = answer(path, new URLSearchParams(query));
      return json(200, result.body, result.headers);
    }
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function listRequests(fetchMock: ReturnType<typeof mockLists>, path: string): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.split('?')[0] === path)
    .map((url) => new URLSearchParams(url.split('?')[1] ?? ''));
}

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Vendors list first (US1)', () => {
  const three = { body: [vendor(1), vendor(2), vendor(3)], headers: { 'X-Total-Count': '3', 'X-Active-Count': '3', 'X-Archived-Count': '1' } };

  it('shows the list with search, sort and views, and keeps the add form closed until asked for', async () => {
    mockLists(() => three);
    render(<Vendors openVendor={() => undefined} />);
    const table = await screen.findByRole('table', { name: 'Vendors' });
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Active (3)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Archived (1)' })).not.toBeChecked();
    expect(screen.queryByRole('form', { name: 'Add vendor' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Add vendor' }));
    const form = screen.getByRole('form', { name: 'Add vendor' });
    expect(precedes(table, form)).toBe(true);
    expect(within(form).getByLabelText('Name')).toHaveFocus();
    for (const legend of ['Contact', 'What they do', 'Manpower', 'GST', 'Rates']) {
      expect(within(form).getByRole('group', { name: legend })).toBeInTheDocument();
    }
  });

  it('asks the API for 50 at a time and shows the total that match', async () => {
    const fetchMock = mockLists(() => three);
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    const [first] = listRequests(fetchMock, '/api/vendors');
    expect(first.get('limit')).toBe('50');
    expect(first.has('view')).toBe(false);
    expect(first.has('sort')).toBe(false);
    expect(screen.getByText('3 vendors')).toBeInTheDocument();
  });

  it('remembers the sort and the view on this browser, but not the search', async () => {
    const fetchMock = mockLists(() => three);
    const { unmount } = render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'project_count');
    await userEvent.click(screen.getByRole('radio', { name: 'Archived (1)' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'tiles');
    await waitFor(() => expect(listRequests(fetchMock, '/api/vendors').at(-1)?.get('view')).toBe('archived'));
    expect(listRequests(fetchMock, '/api/vendors').at(-1)?.get('sort')).toBe('project_count');
    expect(JSON.parse(window.localStorage.getItem('vm.list.vendors') ?? '{}')).toEqual({ sort: 'project_count', view: 'archived' });
    unmount();

    fetchMock.mockClear();
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    const [again] = listRequests(fetchMock, '/api/vendors');
    expect(again.get('sort')).toBe('project_count');
    expect(again.get('view')).toBe('archived');
    expect(again.has('q')).toBe(false);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  });

  it('falls back to the defaults when the remembered choice cannot be used', async () => {
    window.localStorage.setItem('vm.list.vendors', JSON.stringify({ sort: 'phone', view: 'deleted' }));
    const fetchMock = mockLists(() => three);
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    const [first] = listRequests(fetchMock, '/api/vendors');
    expect(first.has('sort')).toBe(false);
    expect(first.has('view')).toBe(false);
  });

  it('adds the next 50 with Show more', async () => {
    const fetchMock = mockLists((_path, query) => {
      const offset = Number(query.get('offset') ?? 0);
      const rows = offset === 0 ? Array.from({ length: 50 }, (_, index) => vendor(index + 1)) : [vendor(51)];
      return { body: rows, headers: { 'X-Total-Count': '51', 'X-Active-Count': '51', 'X-Archived-Count': '0' } };
    });
    render(<Vendors openVendor={() => undefined} />);
    const table = await screen.findByRole('table', { name: 'Vendors' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(52));
    expect(listRequests(fetchMock, '/api/vendors').at(-1)?.get('offset')).toBe('50');
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('shows placeholder rows while loading', async () => {
    let release: () => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { release = () => resolve(json(200, [])); })));
    render(<Vendors openVendor={() => undefined} />);
    expect(screen.getByLabelText('Loading vendors')).toHaveAttribute('aria-busy', 'true');
    await act(async () => release());
  });

  it('asks before closing a form with typed changes, and protects them from navigation', async () => {
    mockLists(() => three);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    await userEvent.click(screen.getByRole('button', { name: 'Add vendor' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Mehta');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole('form', { name: 'Add vendor' })).toBeInTheDocument();
    expect(canLeave()).toBe(false);

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Add vendor' })).toBeNull();
  });

  it('closes an unchanged form without asking', async () => {
    mockLists(() => three);
    const confirm = vi.spyOn(window, 'confirm');
    render(<Vendors openVendor={() => undefined} />);
    await screen.findByRole('table', { name: 'Vendors' });
    await userEvent.click(screen.getByRole('button', { name: 'Add vendor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'Add vendor' })).toBeNull();
  });
});

describe('Projects list first (US1)', () => {
  const two = { body: [project(1), project(2)], headers: { 'X-Total-Count': '2', 'X-Active-Count': '2', 'X-Archived-Count': '4' } };

  it('shows the list first and a closed add form with Basics, Client and Dates', async () => {
    mockLists(() => two);
    render(<Projects openProject={() => undefined} />);
    const table = await screen.findByRole('table', { name: 'Projects' });
    expect(screen.getByRole('radio', { name: 'Archived (4)' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add project' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));
    const form = screen.getByRole('form', { name: 'Add project' });
    expect(precedes(table, form)).toBe(true);
    expect(within(form).getByLabelText('Name')).toHaveFocus();
    for (const legend of ['Basics', 'Client', 'Dates']) {
      expect(within(form).getByRole('group', { name: legend })).toBeInTheDocument();
    }
  });

  it('sorts by progress and remembers it', async () => {
    const fetchMock = mockLists(() => two);
    render(<Projects openProject={() => undefined} />);
    await screen.findByRole('table', { name: 'Projects' });
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'progress');
    await waitFor(() => expect(listRequests(fetchMock, '/api/projects').at(-1)?.get('sort')).toBe('progress'));
    expect(JSON.parse(window.localStorage.getItem('vm.list.projects') ?? '{}')).toMatchObject({ sort: 'progress' });
  });

  it('applies the in-progress filter from a dashboard link, and offers to clear it (FR-021)', async () => {
    const fetchMock = mockLists(() => two);
    render(<Projects openProject={() => undefined} progress="in_progress" />);
    await screen.findByRole('table', { name: 'Projects' });
    expect(listRequests(fetchMock, '/api/projects')[0].get('progress')).toBe('in_progress');
    expect(screen.getByText(/Showing projects in progress only/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all projects' })).toHaveAttribute('href', '#/projects');
  });
});

describe('Edit project form (FR-003, FR-007)', () => {
  const detail = {
    id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, client_name: 'Mehta Family', site_location: 'Pune', description: 'Lakeside home',
    start_date: '2026-11-01', expected_completion_date: '2026-12-20', health: 'ONGOING', progress: { done: 1, total: 2 }, overdue_count: 0,
    after_completion_count: 0, completed_on: null, upcoming: [], links: [], past_links: [], schedules: [],
  };

  it('groups the fields into Basics, Client and Dates, and protects typed changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === '/api/projects/p1') return json(200, detail);
      if (url.startsWith('/api/history?')) return json(200, { record: { created_at: '2026-10-24T05:00:00.000Z', created_by: { id: 'u1', name: 'Asha' }, updated_at: '2026-10-24T05:00:00.000Z', updated_by: { id: 'u1', name: 'Asha' } }, entries: [] });
      if (url === '/api/auth/me') return json(200, { id: 'u1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR' });
      if (url === '/api/projects/p1/client-advances') return json(200, { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] });
      if (url.startsWith('/api/projects/p1/timeline')) return json(200, { project: { id: 'p1', name: 'Lake House', archived: false }, items: [], archived_items: [], delays: [], coordination_issues: [] });
      return json(200, []);
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProjectDetail id="p1" />);
    const form = await screen.findByRole('form', { name: 'Edit project' });
    for (const legend of ['Basics', 'Client', 'Dates']) {
      expect(within(form).getByRole('group', { name: legend })).toBeInTheDocument();
    }
    expect(canLeave()).toBe(true);
    await userEvent.type(within(form).getByLabelText('Client name'), ' Trust');
    expect(canLeave()).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });
});
