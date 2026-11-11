import { render, screen, within } from '@testing-library/react';
import { Dashboard } from '../src/pages/dashboard';
import { Projects } from '../src/pages/projects';
import { Vendors } from '../src/pages/vendors';

// Feature 005 US3 (T030): the dashboard overview (US3-1 to US3-7, FR-020 to FR-025).

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body };
}

const summary = { vendors: { active: 2 }, projects: { PLANNED: 1, ACTIVE: 3, ON_HOLD: 1, COMPLETED: 2 }, projects_archived: 1 };
const lists = { today: '2026-11-10', items: [], attention_projects: [], overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [] };

const overview = {
  counts: { vendors_all: 3, vendors_archived: 1, projects_not_archived: 7, projects_in_progress: 2, projects_archived: 1 },
  progress: [
    { id: 'p2', name: 'Hill Villa', status: 'ON_HOLD', health: 'DELAYED', done: 1, total: 3, percent: 33 },
    { id: 'p1', name: 'Lake House', status: 'ACTIVE', health: 'ONGOING', done: 3, total: 4, percent: 75 },
  ],
  recently_updated: [{ id: 'p1', name: 'Lake House', status: 'ACTIVE', updated_at: '2026-11-10T08:35:00.000Z' }],
  recent_activity: [
    { id: 'h1', action: 'SECTION_ASSIGNED', target: { kind: 'project', id: 'p1', name: 'Lake House' }, changes: {}, details: {}, created_at: '2026-11-10T08:35:00.000Z', created_by: { id: 'u1', name: 'Asha Admin' } },
    { id: 'h2', action: 'ARCHIVED', target: { kind: 'vendor', id: 'v9', name: 'Old Glass' }, changes: {}, details: {}, created_at: '2026-11-09T05:00:00.000Z', created_by: { id: 'u2', name: 'Omar Office' } },
  ],
};
const empty = {
  counts: { vendors_all: 0, vendors_archived: 0, projects_not_archived: 0, projects_in_progress: 0, projects_archived: 0 },
  progress: [],
  recently_updated: [],
  recent_activity: [],
};

function mockDashboard(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === '/api/dashboard/summary') return json(200, summary);
    if (url === '/api/dashboard/overview') return json(status, body);
    if (url === '/api/dashboard') return json(200, lists);
    return json(200, []);
  }));
}

async function overviewRegion() {
  return screen.findByRole('region', { name: 'Business overview' });
}

describe('dashboard counts (US3-1, FR-020, FR-021, FR-025)', () => {
  // The archived-projects count moved to the "Archived projects" tile (owner change 2026-11-11), so the overview shows four.
  it('shows the four counts with their exact labels, each linked to the matching list and view', async () => {
    mockDashboard(overview);
    render(<Dashboard />);
    const region = within(await overviewRegion());
    const expected: [string, string, string][] = [
      ['Vendors, all', '3', '#/vendors?view=active'],
      ['Vendors, archived', '1', '#/vendors?view=archived'],
      ['Projects, not archived', '7', '#/projects?view=active'],
      ['Projects in progress', '2', '#/projects?view=active&progress=in_progress'],
    ];
    expect(region.getAllByRole('link')).toHaveLength(4);
    expect(region.queryByText(/Projects, archived/)).toBeNull();
    for (const [label, value, href] of expected) {
      const link = region.getByRole('link', { name: new RegExp(label) });
      expect(link).toHaveTextContent(value);
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('keeps the Feature 003 tiles and the Feature 004 sections, and shows no count twice', async () => {
    mockDashboard(overview);
    render(<Dashboard />);
    await overviewRegion();
    expect(await screen.findByRole('region', { name: 'At a glance' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Projects needing attention' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /\d\s*Vendors$/ })).toHaveLength(1);
    const archived = [...document.querySelectorAll('a[href="#/projects?view=archived"]')];
    expect(archived).toHaveLength(1);
    expect(archived[0]).toHaveAccessibleName(/^1\s*Archived projects$/);
    expect(screen.queryByRole('link', { name: /Active projects/ })).not.toBeNull();
    expect(within(await overviewRegion()).queryByText(/Active projects|Completed projects/)).toBeNull();
  });
});

describe('project progress (US3-2, US3-3, FR-022)', () => {
  it('shows each project with its bar, whole-number percentage and health, and links to all projects', async () => {
    mockDashboard(overview);
    render(<Dashboard />);
    const region = within(await screen.findByRole('region', { name: 'Project progress' }));
    const rows = region.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual(['Hill Villa', 'Lake House']);
    expect(rows[0]).toHaveTextContent('33%');
    expect(rows[0]).toHaveTextContent('1 of 3 items done');
    expect(rows[0]).toHaveTextContent('Delayed');
    expect(rows[0].querySelector('.progress-bar')).not.toBeNull();
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '#/projects/p2');
    expect(region.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '#/projects');
  });
});

describe('recent changes (US3-4, FR-023)', () => {
  it('lists recently updated projects and recent activity with who, what and when', async () => {
    mockDashboard(overview);
    render(<Dashboard />);
    const recent = within(await screen.findByRole('region', { name: 'Recently updated projects' }));
    expect(recent.getByRole('link', { name: 'Lake House' })).toHaveAttribute('href', '#/projects/p1');
    expect(recent.getByText('10 Nov 2026, 14:05')).toBeInTheDocument();

    const activity = within(screen.getByRole('region', { name: 'Recent activity' }));
    const rows = activity.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Asha Admin');
    expect(rows[0]).toHaveTextContent('Assigned to section');
    expect(rows[0]).toHaveTextContent('10 Nov 2026, 14:05');
    expect(within(rows[0]).getByRole('link', { name: 'Lake House' })).toHaveAttribute('href', '#/projects/p1');
    expect(rows[1]).toHaveTextContent('Omar Office');
    expect(rows[1]).toHaveTextContent('Archived');
    expect(within(rows[1]).getByRole('link', { name: 'Old Glass' })).toHaveAttribute('href', '#/vendors/v9');
  });
});

describe('quick actions (US3-5, FR-024)', () => {
  it('offers Add vendor and Add project, each opening its page with the form open', async () => {
    mockDashboard(overview);
    render(<Dashboard />);
    await overviewRegion();
    expect(screen.getByRole('link', { name: 'Add vendor' })).toHaveAttribute('href', '#/vendors?add=1');
    expect(screen.getByRole('link', { name: 'Add project' })).toHaveAttribute('href', '#/projects?add=1');
  });

  it('opens the vendor and project forms when asked for by the link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, [])));
    const { unmount } = render(<Vendors openVendor={() => undefined} add />);
    expect(await screen.findByRole('form', { name: 'Add vendor' })).toBeInTheDocument();
    unmount();
    render(<Projects openProject={() => undefined} add />);
    expect(await screen.findByRole('form', { name: 'Add project' })).toBeInTheDocument();
  });

  it('opens the view a dashboard link asks for, over the remembered one', async () => {
    window.localStorage.setItem('vm.list.projects', JSON.stringify({ sort: 'name', view: 'archived' }));
    const fetchMock = vi.fn(async (_input: RequestInfo) => json(200, []));
    vi.stubGlobal('fetch', fetchMock);
    render(<Projects openProject={() => undefined} view="active" />);
    await screen.findByText(/No projects have been created yet/);
    const first = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/projects'))!;
    expect(new URLSearchParams(first.split('?')[1]).has('view')).toBe(false);
    window.localStorage.clear();
  });
});

describe('empty, loading and error states (US3-6)', () => {
  it('explains each empty section and offers the action that fills it', async () => {
    mockDashboard(empty);
    render(<Dashboard />);
    const progress = within(await screen.findByRole('region', { name: 'Project progress' }));
    expect(progress.getByText(/No projects are in progress yet/)).toBeInTheDocument();
    expect(progress.getByRole('link', { name: 'Add a project' })).toHaveAttribute('href', '#/projects?add=1');
    const recent = within(screen.getByRole('region', { name: 'Recently updated projects' }));
    expect(recent.getByText(/No project has been changed yet/)).toBeInTheDocument();
    const activity = within(screen.getByRole('region', { name: 'Recent activity' }));
    expect(activity.getByText(/Nothing has been recorded yet/)).toBeInTheDocument();
  });

  it('shows placeholders while loading, and a plain message when the overview cannot load', async () => {
    let release: () => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url === '/api/dashboard/overview') return new Promise((resolve) => { release = () => resolve(json(500, { message: 'boom' })); });
      if (url === '/api/dashboard/summary') return Promise.resolve(json(200, summary));
      return Promise.resolve(json(200, lists));
    }));
    render(<Dashboard />);
    expect(screen.getByLabelText('Loading overview')).toHaveAttribute('aria-busy', 'true');
    release();
    expect(await screen.findByText('The action did not complete. Please try again.')).toBeInTheDocument();
  });
});
