import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectDetail } from '../src/pages/project-detail';
import { ProjectSections, type SectionsProject } from '../src/pages/project-sections';
import { Projects } from '../src/pages/projects';
import { VendorDetail } from '../src/pages/vendor-detail';
import { Vendors } from '../src/pages/vendors';
import { collectNotices } from './notices';

// Feature 005 US4 (T033): archived records are marked everywhere, archiving asks first, restoring does not
// (US4-3 to US4-6, FR-027, FR-028).

const KEPT = /Archived records are kept and can be restored/;

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body };
}

const history = { record: { created_at: '2026-10-24T05:00:00.000Z', created_by: { id: 'u1', name: 'Asha' }, updated_at: '2026-10-24T05:00:00.000Z', updated_by: { id: 'u1', name: 'Asha' } }, entries: [] };

function vendor(archived: boolean) {
  return {
    id: 'v1', name: 'Mehta Carpentry', contact_person: null, phone: '9800000001', alternate_phone: null, email: null, address: null,
    categories: [], services: [], materials: [], locations: [], team_size: null, availability: null, manpower_note: null,
    gst_registered: false, gstin: null, gst_legal_name: null, archived, rates: [], notes: [], current_rating: null, import_run: null,
    project_count: 0, links: [], past_links: [],
  };
}

function project(archived: boolean, links: unknown[] = []) {
  return {
    id: 'p1', name: 'Lake House', status: 'ACTIVE', archived, client_name: null, site_location: null, description: null,
    start_date: null, expected_completion_date: null, health: 'ONGOING', progress: { done: 0, total: 0 }, overdue_count: 0,
    after_completion_count: 0, completed_on: null, upcoming: [], links, past_links: [], schedules: [],
    sections: [], removed_sections: [], sections_version: '',
  };
}

function mockRecord(url: string, body: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo, init: RequestInit = {}) => {
    const path = String(input);
    if (init.method === 'POST') return json(200, {});
    if (path === url) return json(200, body);
    if (path.startsWith('/api/history?')) return json(200, history);
    if (path === '/api/auth/me') return json(200, { id: 'u1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR' });
    if (path === '/api/projects/p1/client-advances') return json(200, { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] });
    if (path.startsWith('/api/projects/p1/timeline')) return json(200, { project: { id: 'p1', name: 'Lake House', archived: false }, items: [], archived_items: [], delays: [], coordination_issues: [] });
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function posts(fetchMock: ReturnType<typeof mockRecord>) {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').map(([url]) => String(url));
}

describe('archiving asks first (US4-3, FR-028)', () => {
  it('asks before archiving a vendor, explaining nothing is deleted; Cancel sends nothing', async () => {
    const fetchMock = mockRecord('/api/vendors/v1', vendor(false));
    const notices = collectNotices();
    render(<VendorDetail id="v1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Mehta Carpentry?' });
    expect(dialog).toHaveTextContent('hidden from active lists');
    expect(dialog).toHaveTextContent('Nothing is deleted');
    expect(dialog).toHaveTextContent('can be restored');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(posts(fetchMock)).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive vendor' }));
    await waitFor(() => expect(posts(fetchMock)).toEqual(['/api/vendors/v1/archive']));
    expect(notices).toContain('Vendor archived');
  });

  it('asks before archiving a project; Cancel sends nothing', async () => {
    const fetchMock = mockRecord('/api/projects/p1', project(false));
    render(<ProjectDetail id="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archive project' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Lake House?' });
    expect(dialog).toHaveTextContent('Nothing is deleted');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(posts(fetchMock)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Archive project' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive project' }));
    await waitFor(() => expect(posts(fetchMock)).toEqual(['/api/projects/p1/archive']));
  });
});

describe('restoring does not ask (US4-5, FR-028)', () => {
  it('restores an archived vendor at once with a confirmation, and says archived records are kept', async () => {
    const fetchMock = mockRecord('/api/vendors/v1', vendor(true));
    const notices = collectNotices();
    render(<VendorDetail id="v1" />);
    expect(await screen.findByText(KEPT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(posts(fetchMock)).toEqual(['/api/vendors/v1/restore']));
    expect(notices).toContain('Vendor restored');
  });

  it('restores an archived project at once, and says archived records are kept', async () => {
    const fetchMock = mockRecord('/api/projects/p1', project(true));
    render(<ProjectDetail id="p1" />);
    expect(await screen.findByText(KEPT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore project' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(posts(fetchMock)).toEqual(['/api/projects/p1/restore']));
  });
});

describe('archived records look archived everywhere (US4-4, US4-6, FR-027)', () => {
  it('marks archived vendors in the Archived view, with the kept-records sentence', async () => {
    mockRecord('/api/vendors?view=archived&limit=50', [{ id: 'v9', name: 'Old Glass', phone: '9000000009', archived: true, locations: [], availability: null, categories: [], project_count: 0 }]);
    render(<Vendors openVendor={() => undefined} view="archived" />);
    const row = (await screen.findByRole('button', { name: 'Old Glass' })).closest('tr')!;
    expect(row).toHaveClass('is-archived');
    expect(within(row).getByText('Archived')).toHaveClass('status-badge');
    expect(screen.getByText(KEPT)).toBeInTheDocument();
  });

  it('marks archived projects in the Archived view, with the kept-records sentence', async () => {
    mockRecord('/api/projects?view=archived&limit=50', [{ id: 'p9', name: 'Old Office', status: 'ACTIVE', archived: true, vendor_count: 0, progress: { done: 0, total: 0 }, overdue_count: 0, next_deadline: null, health: 'ONGOING' }]);
    render(<Projects openProject={() => undefined} view="archived" />);
    const row = (await screen.findByRole('button', { name: 'Old Office' })).closest('tr')!;
    expect(row).toHaveClass('is-archived');
    expect(within(row).getByText('Archived')).toHaveClass('status-badge');
    expect(screen.getByText(KEPT)).toBeInTheDocument();
  });

  it('marks an archived vendor on the project vendor cards', async () => {
    const archivedVendor = {
      id: 'l1', vendor_id: 'v1', vendor_name: 'Mehta Carpentry', vendor_archived: true, vendor_phone: '9800000001', vendor_contact_person: null,
      vendor_categories: [], role_on_project: null, scope_of_work: null, note: null, assignment_status: 'NO_ACTIVITIES', sections: [],
    };
    mockRecord('/api/projects/p1', project(false, [archivedVendor]));
    render(<ProjectDetail id="p1" />);
    const vendors = await screen.findByRole('region', { name: 'Vendors' });
    const card = within(vendors).getByRole('link', { name: 'Mehta Carpentry' }).closest('article')!;
    expect(card).toHaveClass('is-archived');
    expect(within(card).getByText('Archived')).toHaveClass('status-badge');
  });

  it('marks an archived vendor inside a project section', () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, {})));
    const sectionsProject: SectionsProject = {
      id: 'p1', archived: false, links: [{ vendor_id: 'v1' }], sections_version: 'v', removed_sections: [],
      sections: [{
        id: 's1', name: 'Execution', position: 0, description: null, notes: null,
        assignments: [{ id: 'a1', vendor_id: 'v1', vendor_name: 'Mehta Carpentry', vendor_archived: true, vendor_phone: '9800000001', vendor_contact_person: null, vendor_categories: [], role_in_section: null }],
      }],
    };
    render(<ProjectSections project={sectionsProject} vendors={[]} onChanged={() => undefined} />);
    const row = screen.getByRole('link', { name: 'Mehta Carpentry' }).closest('li')!;
    expect(row).toHaveClass('is-archived');
    expect(within(row).getByText('Archived')).toHaveClass('status-badge');
  });
});
