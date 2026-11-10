import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VendorDetail } from '../src/pages/vendor-detail';
import { collectNotices } from './notices';

// The assignment badge splits its text between a visually hidden prefix and the visible label,
// so match on the whole text of the badge element.
function badgeText(text: string) {
  return (_content: string, element: Element | null) => Boolean(element?.classList.contains('status-badge') && element.textContent === text);
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const history = { record: { created_at: '2026-10-24T05:00:00.000Z', created_by: { id: 'u1', name: 'Asha' }, updated_at: '2026-10-24T05:00:00.000Z', updated_by: { id: 'u1', name: 'Asha' } }, entries: [] };

function vendor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    name: 'Sharma Interiors',
    contact_person: 'Ravi Sharma',
    phone: '98765 43210',
    alternate_phone: null,
    email: 'ravi@example.com',
    address: 'Pune',
    categories: [{ id: 'c1', name: 'Carpentry' }],
    services: ['Wardrobes'],
    materials: ['Plywood'],
    locations: ['Pune'],
    team_size: 6,
    availability: 'AVAILABLE',
    manpower_note: null,
    gst_registered: false,
    gstin: null,
    gst_legal_name: null,
    archived: false,
    rates: [],
    notes: [],
    current_rating: null,
    import_run: null,
    project_count: 3,
    links: [
      { id: 'l1', project_id: 'p1', project_name: 'Lake House', project_status: 'ACTIVE', project_archived: false, role_on_project: 'Lead carpenter', scope_of_work: 'Wardrobes', note: 'North wing', assignment_status: 'IN_PROGRESS' },
      { id: 'l2', project_id: 'p2', project_name: 'Studio Fit-out', project_status: 'PLANNED', project_archived: false, role_on_project: null, scope_of_work: null, note: null, assignment_status: 'NOT_STARTED' },
      { id: 'l3', project_id: 'p3', project_name: 'Hill Villa', project_status: 'COMPLETED', project_archived: false, role_on_project: null, scope_of_work: null, note: null, assignment_status: 'COMPLETED' },
      { id: 'l4', project_id: 'p4', project_name: 'Old Office', project_status: 'ACTIVE', project_archived: true, role_on_project: null, scope_of_work: null, note: null, assignment_status: 'DELAYED' },
      { id: 'l5', project_id: 'p5', project_name: 'New Clinic', project_status: 'PLANNED', project_archived: false, role_on_project: null, scope_of_work: null, note: null, assignment_status: 'NO_ACTIVITIES' },
    ],
    ...overrides,
  };
}

function mockFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.startsWith('/api/history?')) return json(200, history);
    if (url === '/api/vendors/v1') return json(200, body);
    return json(200, []);
  }));
}

describe('vendor profile', () => {
  it('groups the vendor information into headed sections (FR-003)', async () => {
    mockFetch(vendor());
    render(<VendorDetail id="v1" />);
    await screen.findByRole('heading', { name: 'Sharma Interiors' });
    for (const heading of ['Contact details', 'What the vendor does', 'Manpower', 'GST details', 'Indicative rates', 'Rating', 'Notes', 'Projects', 'Documents', 'History']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText('Ravi Sharma')).toBeInTheDocument();
  });

  it('confirms archiving the vendor (FR-026)', async () => {
    const notices = collectNotices();
    mockFetch(vendor());
    render(<VendorDetail id="v1" />);
    await screen.findByRole('heading', { name: 'Sharma Interiors' });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    // Superseded (Feature 005 spec, Backward Compatibility; FR-028): archiving now asks first.
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive vendor' }));
    await waitFor(() => expect(notices).toEqual(['Vendor archived']));
  });

  it('lists the vendor\'s projects with status, role, scope and note, and a count (US1-1, US1-2, US1-7)', async () => {
    mockFetch(vendor());
    render(<VendorDetail id="v1" />);
    const section = await screen.findByRole('region', { name: 'Projects' });
    expect(within(section).getByText('3 projects')).toBeInTheDocument();
    const lake = within(section).getByRole('link', { name: 'Lake House' });
    expect(lake).toHaveAttribute('href', '#/projects/p1');
    const lakeRow = lake.closest('li')!;
    expect(within(lakeRow).getByText('Active')).toBeInTheDocument();
    expect(within(lakeRow).getByText(/Lead carpenter/)).toBeInTheDocument();
    expect(within(lakeRow).getByText(/Wardrobes/)).toBeInTheDocument();
    expect(within(lakeRow).getByText(/North wing/)).toBeInTheDocument();
    const oldRow = within(section).getByRole('link', { name: 'Old Office' }).closest('li')!;
    expect(within(oldRow).getByText('Archived')).toBeInTheDocument();
  });

  it('says when the vendor has no projects (US1-5)', async () => {
    mockFetch(vendor({ links: [], project_count: 0 }));
    render(<VendorDetail id="v1" />);
    const section = await screen.findByRole('region', { name: 'Projects' });
    expect(within(section).getByText('0 projects')).toBeInTheDocument();
    expect(within(section).getByText('This vendor is not assigned to any project yet')).toBeInTheDocument();
  });
});

describe('vendor profile assignment status (US3)', () => {
  it('shows each assignment status as text, apart from the project status (T023, FR-028)', async () => {
    mockFetch(vendor());
    render(<VendorDetail id="v1" />);
    const section = await screen.findByRole('region', { name: 'Projects' });
    const expected: [string, string][] = [
      ['Lake House', 'In progress'],
      ['Studio Fit-out', 'Not started'],
      ['Hill Villa', 'Completed'],
      ['Old Office', 'Delayed'],
      ['New Clinic', 'No activities'],
    ];
    for (const [project, label] of expected) {
      const row = within(section).getByRole('link', { name: project }).closest('li')!;
      expect(within(row).getByText(badgeText(`Assignment status: ${label}`))).toBeInTheDocument();
    }
  });
});

describe('vendor profile past projects (US4)', () => {
  const pastLink = {
    id: 'pl1', project_id: 'p9', project_name: 'Old Clinic', project_archived: true,
    role_on_project: 'Carpentry', scope_of_work: 'Wardrobes', note: 'North wing',
    removed_at: '2026-11-01T05:00:00.000Z', removed_by: { id: 'u2', name: 'Omar Office' },
  };

  it('lists past assignments apart from current ones, read-only, with who removed them and when (US4-4, FR-013a)', async () => {
    mockFetch(vendor({ past_links: [pastLink] }));
    render(<VendorDetail id="v1" />);
    const past = await screen.findByRole('region', { name: 'Past projects' });
    const name = within(past).getByRole('link', { name: 'Old Clinic' });
    expect(name).toHaveAttribute('href', '#/projects/p9');
    const row = name.closest('li')!;
    expect(within(row).getByText(/Carpentry/)).toBeInTheDocument();
    expect(within(row).getByText(/Wardrobes/)).toBeInTheDocument();
    expect(within(row).getByText(/North wing/)).toBeInTheDocument();
    // Superseded (Feature 005 FR-042, T042): dates read "9 Nov 2026" and recorded times "9 Nov 2026, 14:05".
    expect(within(row).getByText('Removed by Omar Office on 1 Nov 2026, 10:30')).toBeInTheDocument();
    expect(within(row).getByText('Archived')).toBeInTheDocument();
    expect(within(past).queryByRole('button')).toBeNull();
    expect(within(past).queryByText(/Assignment status/)).toBeNull();

    const current = screen.getByRole('region', { name: 'Projects' });
    expect(within(current).queryByRole('link', { name: 'Old Clinic' })).toBeNull();
  });

  it('says when there are no past projects', async () => {
    mockFetch(vendor({ past_links: [] }));
    render(<VendorDetail id="v1" />);
    const past = await screen.findByRole('region', { name: 'Past projects' });
    expect(within(past).getByText('No past projects')).toBeInTheDocument();
  });
});
