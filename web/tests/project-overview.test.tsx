import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectDetail } from '../src/pages/project-detail';
import { collectNotices } from './notices';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

function badgeText(text: string) {
  return (_content: string, element: Element | null) => Boolean(element?.classList.contains('status-badge') && element.textContent === text);
}

const history = { record: { created_at: '2026-10-24T05:00:00.000Z', created_by: { id: 'u1', name: 'Asha' }, updated_at: '2026-10-24T05:00:00.000Z', updated_by: { id: 'u1', name: 'Asha' } }, entries: [] };

function upcomingItem(index: number, deadline: string) {
  return { id: `i${index}`, name: `Item ${index}`, item_type: 'ACTIVITY', deadline, status: 'NOT_STARTED', flags: [] };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, client_name: 'Mehta Family', site_location: 'Pune', description: 'Lakeside home',
    start_date: '2026-11-01', expected_completion_date: '2026-12-20', health: 'DELAYED',
    progress: { done: 12, total: 20 }, overdue_count: 2, after_completion_count: 2, completed_on: null,
    // Deadlines 2026-11-02 to 2026-11-06, so none equals the start date shown in the same overview.
    upcoming: [1, 2, 3, 4, 5].map((index) => upcomingItem(index, `2026-11-0${index + 1}`)),
    links: [], past_links: [], schedules: [],
    ...overrides,
  };
}

const timelineItem = {
  id: 't1', item_type: 'ACTIVITY', name: 'Tiling', description: null, planned_date: null, deadline: '2026-12-22',
  responsible: { kind: 'NONE', vendor: null, label: 'No responsible party' }, status: 'NOT_STARTED', last_update_on: null, done_on: null,
  archived: false, flags: [], after_project_completion: true,
};

function mockFetch(body: unknown, items: unknown[] = [timelineItem]) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/history?')) return json(200, history);
    if (url === '/api/projects/p1' && init?.method === 'PATCH') return json(200, { ...(body as object), ...JSON.parse(String(init.body)) });
    if (url === '/api/projects/p1') return json(200, body);
    if (url === '/api/auth/me') return json(200, { id: 'u1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR' });
    if (url === '/api/projects/p1/client-advances') {
      return json(200, { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] });
    }
    if (url.startsWith('/api/projects/p1/timeline')) {
      return json(200, { project: { id: 'p1', name: 'Lake House', archived: false }, items, archived_items: [], delays: [], coordination_issues: [] });
    }
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('project overview', () => {
  it('shows the project facts, health, progress, overdue count and up to 5 upcoming items (US5-6, FR-009a)', async () => {
    mockFetch(project());
    render(<ProjectDetail id="p1" />);
    const overview = await screen.findByRole('region', { name: 'Overview' });
    expect(within(overview).getByText('Mehta Family')).toBeInTheDocument();
    expect(within(overview).getByText('Pune')).toBeInTheDocument();
    expect(within(overview).getByText('2026-11-01')).toBeInTheDocument();
    // FR-015: the project date and item dates carry different labels.
    expect(within(overview).getByText('Project expected completion')).toBeInTheDocument();
    expect(within(overview).getByText('2026-12-20')).toBeInTheDocument();
    expect(within(overview).getByText(badgeText('Health: Delayed'))).toBeInTheDocument();
    expect(within(overview).getByText('12 of 20 items done')).toBeInTheDocument();
    expect(within(overview).getByText('2 overdue items')).toBeInTheDocument();
    expect(within(overview).getByText('2 items are due after the expected completion date')).toBeInTheDocument();

    const upcoming = within(overview).getByRole('list', { name: 'Upcoming items' });
    const links = within(upcoming).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveTextContent('Item 1');
    expect(links[0]).toHaveAttribute('href', '#/projects/p1?item=i1');
    expect(within(upcoming).getAllByText('Deadline')).toHaveLength(5);
  });

  it('says "No activities yet" with no bar when the project has no items (US5-7, FR-016a)', async () => {
    mockFetch(project({ progress: { done: 0, total: 0 }, overdue_count: 0, after_completion_count: 0, upcoming: [] }));
    render(<ProjectDetail id="p1" />);
    const overview = await screen.findByRole('region', { name: 'Overview' });
    expect(within(overview).getByText('No activities yet')).toBeInTheDocument();
    expect(within(overview).queryByText(/items done/)).toBeNull();
    expect(within(overview).queryByText(/due after the expected completion date/)).toBeNull();
  });

  it('shows when a Completed project was completed, or just "Completed" when history has no date (US5-12, US5-13, FR-014a)', async () => {
    mockFetch(project({ status: 'COMPLETED', health: 'COMPLETED', completed_on: '2026-12-03' }));
    const { unmount } = render(<ProjectDetail id="p1" />);
    const overview = await screen.findByRole('region', { name: 'Overview' });
    expect(within(overview).getByText('Completed on 2026-12-03')).toBeInTheDocument();
    unmount();

    mockFetch(project({ status: 'COMPLETED', health: 'COMPLETED', completed_on: null }));
    render(<ProjectDetail id="p1" />);
    const again = await screen.findByRole('region', { name: 'Overview' });
    expect(within(again).getByText('Completed', { selector: 'dd' })).toBeInTheDocument();
    expect(within(again).queryByText(/Completed on/)).toBeNull();
  });

  it('edits every project field through PATCH (US5-9, Feature 001 T078)', async () => {
    const notices = collectNotices();
    const fetchMock = mockFetch(project());
    render(<ProjectDetail id="p1" />);
    await screen.findByRole('region', { name: 'Overview' });
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    expect(form.getByLabelText('Name')).toHaveValue('Lake House');
    expect(form.getByLabelText('Start date')).toHaveValue('2026-11-01');
    await userEvent.clear(form.getByLabelText('Client name'));
    await userEvent.type(form.getByLabelText('Client name'), 'Mehta Trust');
    await userEvent.clear(form.getByLabelText('Expected completion date'));
    await userEvent.type(form.getByLabelText('Expected completion date'), '2026-12-31');
    await userEvent.click(form.getByRole('button', { name: 'Save changes' }));
    const patch = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/projects/p1' && init?.method === 'PATCH');
    expect(JSON.parse(String(patch![1]!.body))).toEqual({
      name: 'Lake House', client_name: 'Mehta Trust', site_location: 'Pune', description: 'Lakeside home', status: 'ACTIVE',
      start_date: '2026-11-01', expected_completion_date: '2026-12-31',
    });
    expect(notices).toEqual(['Project updated']);
  });

  it('marks timeline items due after the project completion date (US5-14, FR-015b)', async () => {
    mockFetch(project());
    render(<ProjectDetail id="p1" />);
    const timeline = await screen.findByRole('region', { name: 'Timeline' });
    expect(await within(timeline).findByText('After project completion date')).toBeInTheDocument();
  });

  it('says "No activities yet" on an empty timeline and offers to add an item (FR-031)', async () => {
    mockFetch(project({ upcoming: [], progress: { done: 0, total: 0 } }), []);
    render(<ProjectDetail id="p1" />);
    const timeline = await screen.findByRole('region', { name: 'Timeline' });
    expect(await within(timeline).findByText('No activities yet')).toBeInTheDocument();
    expect(within(timeline).queryByText('No timeline items yet.')).toBeNull();
    await userEvent.click(within(timeline).getByRole('button', { name: 'Add an item' }));
    expect(within(screen.getByRole('form', { name: 'Add timeline item' })).getByLabelText('Type')).toHaveFocus();
  });
});
