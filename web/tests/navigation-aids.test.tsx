import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientAdvances } from '../src/pages/client-advances';
import { Dashboard } from '../src/pages/dashboard';
import { ProjectDetail } from '../src/pages/project-detail';
import { ProjectSections, type SectionsProject } from '../src/pages/project-sections';
import { Projects } from '../src/pages/projects';
import { VendorDetail } from '../src/pages/vendor-detail';
import { GlobalSearch } from '../src/ui/global-search';

// Feature 005 US7 (T040): header search, breadcrumbs, tooltips on icon-only controls, one date format and confirmation
// before removing a vendor from a project or a section (US7-1 to US7-5, FR-037 to FR-043).

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body };
}

const ISO_DATE = /\d{4}-\d{2}-\d{2}/;
const asha = { id: 'u1', name: 'Asha Admin' };
const history = { record: { created_at: '2026-10-24T05:00:00.000Z', created_by: asha, updated_at: '2026-10-24T05:00:00.000Z', updated_by: asha }, entries: [] };

function vendor() {
  return {
    id: 'v1', name: 'Mehta Carpentry', contact_person: null, phone: '9800000001', alternate_phone: null, email: null, address: null,
    categories: [], services: [], materials: [], locations: [], team_size: null, availability: null, manpower_note: null,
    gst_registered: false, gstin: null, gst_legal_name: null, archived: false, rates: [], notes: [], current_rating: null,
    import_run: { id: 'r1', file_name: 'vendors.xlsx', created_at: '2026-10-29T05:00:00.000Z' },
    project_count: 0, links: [],
    past_links: [{ id: 'l0', project_id: 'p1', project_name: 'Lake House', project_archived: false, role_on_project: null, scope_of_work: null, note: null, removed_at: '2026-11-01T05:00:00.000Z', removed_by: asha }],
  };
}

const mehtaLink = {
  id: 'l1', vendor_id: 'v1', vendor_name: 'Mehta Carpentry', vendor_archived: false, vendor_phone: '9800000001', vendor_contact_person: null,
  vendor_categories: [], role_on_project: null, scope_of_work: null, note: null, assignment_status: 'NO_ACTIVITIES', sections: [],
};

function project() {
  return {
    id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, client_name: 'Meher Family', site_location: null, description: null,
    start_date: '2026-11-01', expected_completion_date: '2026-12-20', health: 'ONGOING', progress: { done: 0, total: 1 }, overdue_count: 0,
    after_completion_count: 0, completed_on: null,
    upcoming: [{ id: 'i1', name: 'Tiling', item_type: 'ACTIVITY', deadline: '2026-11-12', status: 'NOT_STARTED', flags: [] }],
    links: [mehtaLink],
    past_links: [{ ...mehtaLink, id: 'l0', removed_at: '2026-11-03T05:00:00.000Z', removed_by: asha }],
    schedules: [{ id: 's1', vendor_id: 'v1', task: 'Joinery', work_date: '2026-11-02', start_time: '09:00', end_time: '10:00', required_team_size: 1, pricing_mode: 'FIXED', archived: false, conflicts: [] }],
    sections: [], removed_sections: [], sections_version: '',
  };
}

const pricing = {
  id: 's1', pricing_mode: 'FIXED', current_price: { id: 'c1', amount: '1000.00', created_at: '2026-10-20T10:00:00.000Z' },
  price_history: [{ id: 'c1', amount: '1000.00', kind: 'CHARGE', reverses_entry_id: null, created_at: '2026-10-20T10:00:00.000Z', author: asha }],
  current_file: null, file_history: [],
};

const searchResults = {
  vendors: [
    { id: 'v1', name: 'Mehta Carpentry', phone: '9800000001', archived: false },
    { id: 'v9', name: 'Mehra Glass', phone: '9800000009', archived: true },
  ],
  projects: [{ id: 'p1', name: 'Lake House', client_name: 'Meher Family', archived: false }],
};

function mockApi(extra: (url: string, init: RequestInit) => unknown = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo, init: RequestInit = {}) => {
    const url = String(input);
    const custom = extra(url, init);
    if (custom !== undefined) return json(200, custom);
    if (init.method && init.method !== 'GET') return json(200, {});
    if (url === '/api/auth/me') return json(200, { ...asha, email: 'admin@example.com', role: 'ADMINISTRATOR' });
    if (url === '/api/vendors/v1') return json(200, vendor());
    if (url === '/api/projects/p1') return json(200, project());
    if (url === '/api/schedules/s1') return json(200, pricing);
    if (url.startsWith('/api/search?')) return json(200, url.includes('zz') ? { vendors: [], projects: [] } : searchResults);
    if (url.startsWith('/api/history?')) return json(200, history);
    if (url === '/api/dashboard/summary') return json(200, { vendors: { active: 0 }, projects: { PLANNED: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0 } });
    if (url === '/api/dashboard/overview') {
      return json(200, { counts: { vendors_all: 0, vendors_archived: 0, projects_not_archived: 0, projects_in_progress: 0, projects_archived: 0 }, progress: [], recently_updated: [], recent_activity: [] });
    }
    if (url === '/api/dashboard') return json(200, { today: '2026-11-10', items: [], attention_projects: [], overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [] });
    if (url === '/api/projects/p1/client-advances') return json(200, { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] });
    if (url.startsWith('/api/projects/p1/timeline')) return json(200, { project: { id: 'p1', name: 'Lake House', archived: false }, items: [], archived_items: [], delays: [], coordination_issues: [] });
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function searchCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/search?'));
}

async function renderShell(hash: string) {
  const fetchMock = mockApi();
  window.location.hash = hash;
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await act(async () => {
    await import('../src/main');
  });
  return fetchMock;
}

afterEach(() => vi.restoreAllMocks());

describe('header search (US7-1, FR-037)', () => {
  it('waits for 2 characters and a 250 ms pause, then lists vendors and projects with archived ones marked', async () => {
    const fetchMock = mockApi();
    render(<GlobalSearch />);
    const box = screen.getByRole('searchbox', { name: 'Search vendors and projects' });
    await userEvent.type(box, 'm');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchCalls(fetchMock)).toEqual([]);

    await userEvent.type(box, 'eh');
    expect(searchCalls(fetchMock)).toEqual([]);
    const results = await screen.findByRole('region', { name: 'Search results' });
    expect(searchCalls(fetchMock)).toEqual(['/api/search?q=meh']);
    const vendors = within(within(results).getByRole('group', { name: 'Vendors' }));
    expect(vendors.getByRole('link', { name: /Mehta Carpentry/ })).toHaveAttribute('href', '#/vendors/v1');
    expect(vendors.getByRole('link', { name: /Mehra Glass/ })).toHaveTextContent('Archived');
    const projects = within(within(results).getByRole('group', { name: 'Projects' }));
    expect(projects.getByRole('link', { name: /Lake House/ })).toHaveAttribute('href', '#/projects/p1');
    expect(projects.getByRole('link', { name: /Lake House/ })).toHaveTextContent('Meher Family');
  });

  it('opens the chosen record and closes the results', async () => {
    mockApi();
    window.location.hash = '/dashboard';
    render(<GlobalSearch />);
    await userEvent.type(screen.getByRole('searchbox'), 'meh');
    await userEvent.click(await screen.findByRole('link', { name: /Mehta Carpentry/ }));
    expect(window.location.hash).toBe('#/vendors/v1');
    expect(screen.queryByRole('region', { name: 'Search results' })).toBeNull();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('says when nothing matches', async () => {
    mockApi();
    render(<GlobalSearch />);
    await userEvent.type(screen.getByRole('searchbox'), 'zz');
    expect(await screen.findByText('No vendors or projects match')).toBeInTheDocument();
  });

  it('sits in the header of every page', async () => {
    await renderShell('/dashboard');
    const header = (await screen.findByRole('searchbox', { name: 'Search vendors and projects' })).closest('header');
    expect(header).toHaveClass('topbar');
  });
});

describe('breadcrumbs (US7-2, FR-038)', () => {
  async function trail() {
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    return nav;
  }

  it('shows Vendors / name on a vendor page, with a working earlier link', async () => {
    await renderShell('/vendors/v1');
    const nav = await trail();
    await waitFor(() => expect(nav).toHaveTextContent('Vendors/Mehta Carpentry'));
    expect(within(nav).getByRole('link', { name: 'Vendors' })).toHaveAttribute('href', '#/vendors');
    expect(within(nav).getByText('Mehta Carpentry')).toHaveAttribute('aria-current', 'page');
  });

  it('shows Projects / name on a project page', async () => {
    await renderShell('/projects/p1');
    const nav = await trail();
    await waitFor(() => expect(nav).toHaveTextContent('Projects/Lake House'));
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '#/projects');
  });

  it('shows Vendors / Import vendors on the import page and Vendors / Import history on the history page', async () => {
    await renderShell('/vendors/import');
    expect(await trail()).toHaveTextContent('Vendors/Import vendors');
    await act(async () => {
      window.location.hash = '/vendor-imports';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(async () => expect(await trail()).toHaveTextContent('Vendors/Import history'));
  });

  it('shows no breadcrumbs on top-level pages', async () => {
    await renderShell('/dashboard');
    await screen.findByRole('searchbox');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});

describe('icon-only controls (US7-4, FR-040)', () => {
  it('gives the section move arrows a tooltip matching their accessible name', () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, {})));
    const sections = ['Execution', 'Snagging'].map((name, position) => ({ id: `s${position}`, name, position, description: null, notes: null, assignments: [] }));
    const sectionsProject: SectionsProject = { id: 'p1', archived: false, links: [], sections_version: 'v', removed_sections: [], sections };
    render(<ProjectSections project={sectionsProject} vendors={[]} onChanged={() => undefined} />);
    for (const name of ['Move Execution down', 'Move Snagging up']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAccessibleDescription(name);
    }
  });
});

describe('one date format (US7-5, FR-042)', () => {
  // Only the rendered page: other tests in this file leave the whole app mounted in the document.
  function expectNoIsoDates(container: HTMLElement) {
    expect(container.textContent).not.toMatch(ISO_DATE);
  }

  it('shows project dates as "1 Nov 2026" and times as "3 Nov 2026, 10:30"', async () => {
    mockApi();
    const { container } = render(<ProjectDetail id="p1" />);
    const overview = await screen.findByRole('region', { name: 'Overview' });
    expect(overview).toHaveTextContent('1 Nov 2026');
    expect(overview).toHaveTextContent('20 Dec 2026');
    expect(overview).toHaveTextContent('12 Nov 2026');
    expect(await screen.findByText(/1000\.00 · charge · Asha Admin · 20 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText('Removed by Asha Admin on 3 Nov 2026, 10:30')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'When' })).toHaveTextContent('2 Nov 2026');
    expectNoIsoDates(container);
  });

  it('shows vendor dates in the same format', async () => {
    mockApi();
    const { container } = render(<VendorDetail id="v1" />);
    expect(await screen.findByText('Imported in vendors.xlsx on 29 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Removed by Asha Admin on 1 Nov 2026, 10:30')).toBeInTheDocument();
    expectNoIsoDates(container);
  });

  it('shows list, dashboard and advance dates in the same format', async () => {
    mockApi((url) => (url.startsWith('/api/projects?')
      ? [{ id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, start_date: '2026-11-01', expected_completion_date: '2026-12-20', vendor_count: 0, progress: { done: 0, total: 0 }, overdue_count: 0, next_deadline: '2026-11-05', health: 'ONGOING' }]
      : undefined));
    const { container, unmount } = render(<Projects openProject={() => undefined} />);
    const row = (await screen.findByRole('button', { name: 'Lake House' })).closest('tr')!;
    expect(row).toHaveTextContent('1 Nov 2026');
    expect(row).toHaveTextContent('5 Nov 2026');
    expectNoIsoDates(container);
    unmount();

    const lake = { id: 'p1', name: 'Lake House' };
    mockApi((url) => (url === '/api/dashboard'
      ? {
        today: '2026-11-08', overdue: [], due_soon: [], attention_projects: [],
        items: [{ id: 'i1', name: 'Joinery', item_type: 'ACTIVITY', group: 'OVERDUE', deadline: '2026-11-06', status: 'NOT_STARTED', last_update_on: null, days_overdue: 2, flags: [], project: lake, responsible: { kind: 'NONE', vendor: null, label: 'None' } }],
        missing_update: [{ project: lake, item: { id: 'i3', name: 'Wiring' }, responsible_label: 'None', last_update_on: '2026-10-19' }],
        recent_delays_and_issues: [{ kind: 'DELAY', id: 'd1', project: lake, item: null, responsible_label: 'None', text: 'Client away', created_at: '2026-10-27T05:00:00.000Z', created_by: asha }],
      }
      : undefined));
    const dashboard = render(<Dashboard />);
    const page = within(dashboard.container);
    expect(await page.findByText('Deadline 6 Nov 2026')).toBeInTheDocument();
    expect(page.getByText('last update 19 Oct 2026')).toBeInTheDocument();
    expect(page.getByRole('region', { name: 'Recent delays and coordination issues' })).toHaveTextContent('Asha Admin, 27 Oct 2026');
    expectNoIsoDates(dashboard.container);
    dashboard.unmount();

    mockApi((url) => (url.startsWith('/api/client-advances?')
      ? [{ id: 'a1', amount: '5000.00', received_on: '2026-10-19', reference: null, note: null, created_by: asha, project: { id: 'p1', name: 'Lake House', client_name: null, archived: false } }]
      : undefined));
    const advances = render(<ClientAdvances scope="all" />);
    expect(await screen.findByText(/Received 19 Oct 2026/)).toBeInTheDocument();
    expectNoIsoDates(advances.container);
  });
});

describe('confirming removals (FR-043)', () => {
  function deletes(fetchMock: ReturnType<typeof mockApi>) {
    return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE').map(([url]) => String(url));
  }

  it('asks before removing a vendor from a project, naming both and the consequence; Cancel sends nothing', async () => {
    const fetchMock = mockApi();
    render(<ProjectDetail id="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from project' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Mehta Carpentry from Lake House?' });
    expect(dialog).toHaveTextContent('section');
    expect(dialog).toHaveTextContent('kept under Past vendors');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deletes(fetchMock)).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove from project' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from project' }));
    await waitFor(() => expect(deletes(fetchMock)).toEqual(['/api/links/l1']));
  });

  it('asks before removing a vendor from a section; Cancel sends nothing', async () => {
    const fetchMock = mockApi();
    const sectionsProject: SectionsProject = {
      id: 'p1', archived: false, links: [{ vendor_id: 'v1' }], sections_version: 'v', removed_sections: [],
      sections: [{
        id: 's1', name: 'Execution', position: 0, description: null, notes: null,
        assignments: [{ id: 'a1', vendor_id: 'v1', vendor_name: 'Mehta Carpentry', vendor_archived: false, vendor_phone: '9800000001', vendor_contact_person: null, vendor_categories: [], role_in_section: null }],
      }],
    };
    render(<ProjectSections project={sectionsProject} vendors={[]} onChanged={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mehta Carpentry from Execution' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Mehta Carpentry from Execution?' });
    expect(dialog).toHaveTextContent('stays on the project');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deletes(fetchMock)).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Mehta Carpentry from Execution' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(deletes(fetchMock)).toEqual(['/api/section-assignments/a1']));
  });
});

describe('loading placeholders (US7-3, FR-039)', () => {
  it.each([
    ['project', () => <ProjectDetail id="p1" />, 'Loading project'],
    ['vendor', () => <VendorDetail id="v1" />, 'Loading vendor'],
    ['dashboard', () => <Dashboard />, 'Loading dashboard'],
  ])('shows a skeleton while the %s loads', (_name, page, label) => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(page());
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-busy', 'true');
  });
});
