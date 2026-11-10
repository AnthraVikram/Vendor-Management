import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Projects } from '../src/pages/projects';
import { collectNotices } from './notices';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

// Badges split their text between a visually hidden prefix and the visible label, so match the whole badge text.
function badgeText(text: string) {
  return (_content: string, element: Element | null) => Boolean(element?.classList.contains('status-badge') && element.textContent === text);
}

const lake = {
  id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, client_name: 'Mehta Family', site_location: 'Pune',
  start_date: '2026-11-01', expected_completion_date: '2026-12-20', vendor_count: 3,
  progress: { done: 12, total: 20 }, overdue_count: 2, next_deadline: '2026-11-05', health: 'DELAYED',
};
const studio = {
  id: 'p2', name: 'Studio Fit-out', status: 'PLANNED', archived: false, client_name: null, site_location: null,
  start_date: null, expected_completion_date: null, vendor_count: 1,
  progress: { done: 0, total: 0 }, overdue_count: 0, next_deadline: null, health: 'ONGOING',
};

// Answers GET /api/projects from `pages` in order, and records every request.
function mockFetch(pages: unknown[], post?: (body: Record<string, unknown>) => { status: number; body: unknown }) {
  const queue = [...pages];
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/projects') && init?.method === 'POST' && post) {
      const result = post(JSON.parse(String(init.body)));
      return json(result.status, result.body);
    }
    if (url.startsWith('/api/projects')) return json(200, queue.length > 1 ? queue.shift() : queue[0]);
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastListQuery(fetchMock: ReturnType<typeof mockFetch>): Record<string, string> {
  const url = fetchMock.mock.calls.map(([input]) => String(input)).filter((value) => value.startsWith('/api/projects')).at(-1)!;
  return Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''));
}

describe('project directory', () => {
  it('shows each project\'s status, dates, vendors, progress, health, overdue count and next deadline (US5-1)', async () => {
    mockFetch([[lake, studio]]);
    render(<Projects openProject={() => undefined} />);
    const table = await screen.findByRole('table', { name: 'Projects' });
    const lakeRow = within(table).getByRole('button', { name: 'Lake House' }).closest('tr')!;
    expect(within(lakeRow).getByText('Active')).toBeInTheDocument();
    // Superseded (Feature 005 FR-042, T042): dates read "9 Nov 2026" and recorded times "9 Nov 2026, 14:05".
    expect(within(lakeRow).getByText('1 Nov 2026')).toBeInTheDocument();
    expect(within(lakeRow).getByText('20 Dec 2026')).toBeInTheDocument();
    expect(within(lakeRow).getByText('3 vendors')).toBeInTheDocument();
    expect(within(lakeRow).getByText('12 of 20 items done')).toBeInTheDocument();
    expect(within(lakeRow).getByText(badgeText('Health: Delayed'))).toBeInTheDocument();
    expect(within(lakeRow).getByText('2 overdue')).toBeInTheDocument();
    // Superseded (Feature 005 FR-042, T042): dates read "9 Nov 2026" and recorded times "9 Nov 2026, 14:05".
    expect(within(lakeRow).getByText('5 Nov 2026')).toBeInTheDocument();

    const studioRow = within(table).getByRole('button', { name: 'Studio Fit-out' }).closest('tr')!;
    expect(within(studioRow).getAllByText('Not set')).toHaveLength(4);
    expect(within(studioRow).getByText('1 vendor')).toBeInTheDocument();
    expect(within(studioRow).getByText('No activities yet')).toBeInTheDocument();
    expect(within(studioRow).queryByText(/items done/)).toBeNull();
    expect(within(studioRow).getByText(badgeText('Health: Ongoing'))).toBeInTheDocument();
  });

  // Superseded (Feature 005 spec, Backward Compatibility): "Include archived" became the Archived view, and the list asks for 50 at a time (FR-006, FR-026).
  it('sends the search and the two attention filters, keeping the status filter and the Archived view (US5-2 to US5-5)', async () => {
    const fetchMock = mockFetch([[lake]]);
    render(<Projects openProject={() => undefined} status="ACTIVE" />);
    await screen.findByRole('table', { name: 'Projects' });
    const filters = within(screen.getByRole('form', { name: 'Project filters' }));
    await userEvent.type(filters.getByLabelText('Search projects'), 'mehta');
    await userEvent.click(filters.getByLabelText('Has overdue items'));
    await userEvent.click(filters.getByLabelText('Has items due in the next 7 days'));
    await userEvent.click(screen.getByRole('radio', { name: /^Archived/ }));
    await userEvent.click(filters.getByRole('button', { name: 'Apply filters' }));
    expect(lastListQuery(fetchMock)).toEqual({ status: 'ACTIVE', q: 'mehta', has_overdue: 'true', due_within_7: 'true', view: 'archived', limit: '50' });
  });

  it('offers the full project form, sending every field, and shows field messages under both dates (US5-9, US5-10)', async () => {
    const order = 'The expected completion date cannot be before the start date.';
    const posted: Record<string, unknown>[] = [];
    mockFetch([[lake]], (body) => {
      posted.push(body);
      return { status: 400, body: { message: 'Check the highlighted fields.', fields: { start_date: order, expected_completion_date: order } } };
    });
    render(<Projects openProject={() => undefined} />);
    await screen.findByRole('table', { name: 'Projects' });
    // Superseded (Feature 005 spec, Backward Compatibility): the add form is closed until Add project is pressed (FR-002).
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));
    const form = within(screen.getByRole('form', { name: 'Add project' }));
    await userEvent.type(form.getByLabelText('Name'), 'Hill Villa');
    await userEvent.type(form.getByLabelText('Client name'), 'Iyer');
    await userEvent.type(form.getByLabelText('Site location'), 'Lonavala');
    await userEvent.type(form.getByLabelText('Description'), 'Weekend home');
    await userEvent.selectOptions(form.getByLabelText('Status'), 'ACTIVE');
    await userEvent.type(form.getByLabelText('Start date'), '2026-12-01');
    await userEvent.type(form.getByLabelText('Expected completion date'), '2026-11-30');
    await userEvent.click(form.getByRole('button', { name: 'Save project' }));
    expect(posted[0]).toEqual({
      name: 'Hill Villa', client_name: 'Iyer', site_location: 'Lonavala', description: 'Weekend home', status: 'ACTIVE',
      start_date: '2026-12-01', expected_completion_date: '2026-11-30',
    });
    expect(await form.findAllByText(order)).toHaveLength(2);
  });

  it('confirms a created project (FR-026)', async () => {
    const notices = collectNotices();
    mockFetch([[lake]], () => ({ status: 201, body: { ...studio } }));
    render(<Projects openProject={() => undefined} />);
    await screen.findByRole('table', { name: 'Projects' });
    // Superseded (Feature 005 spec, Backward Compatibility): the add form is closed until Add project is pressed (FR-002).
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));
    const form = within(screen.getByRole('form', { name: 'Add project' }));
    await userEvent.type(form.getByLabelText('Name'), 'Studio Fit-out');
    await userEvent.click(form.getByRole('button', { name: 'Save project' }));
    expect(notices).toEqual(['Project created']);
  });

  it('says no projects exist yet and offers to add one, or that nothing matches a search (FR-031)', async () => {
    mockFetch([[], []]);
    render(<Projects openProject={() => undefined} />);
    expect(await screen.findByText('No projects have been created yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));
    expect(within(screen.getByRole('form', { name: 'Add project' })).getByLabelText('Name')).toHaveFocus();

    const filters = within(screen.getByRole('form', { name: 'Project filters' }));
    await userEvent.type(filters.getByLabelText('Search projects'), 'nobody');
    await userEvent.click(filters.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('No projects match your search and filters')).toBeInTheDocument();
    expect(filters.getByLabelText('Search projects')).toHaveValue('nobody');
  });

  it('shows a loading message before the first list arrives', async () => {
    let release: (value: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { release = resolve; })));
    render(<Projects openProject={() => undefined} />);
    // Superseded (Feature 005 spec, Backward Compatibility): placeholder rows replace the loading text (FR-039).
    expect(screen.getByLabelText('Loading projects')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No projects have been created yet')).toBeNull();
    release(json(200, [lake]));
    expect(await screen.findByRole('table', { name: 'Projects' })).toBeInTheDocument();
  });
});

// Superseded (Feature 005 spec, Backward Compatibility): "Include archived" became the Archived view, which still reloads at once (FR-026).
describe('project directory Archived view', () => {
  it('reloads as soon as the Archived view is chosen', async () => {
    const fetchMock = mockFetch([[lake]]);
    render(<Projects openProject={() => undefined} />);
    await screen.findByRole('table', { name: 'Projects' });
    await userEvent.click(screen.getByRole('radio', { name: /^Archived/ }));
    expect(lastListQuery(fetchMock)).toEqual({ view: 'archived', limit: '50' });
  });
});
