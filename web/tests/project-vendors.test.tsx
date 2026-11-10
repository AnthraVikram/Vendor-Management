import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectDetail } from '../src/pages/project-detail';
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

function project(links: unknown[]) {
  return { id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, links, schedules: [] };
}

const sharma = {
  id: 'l1', vendor_id: 'v1', vendor_name: 'Sharma Interiors', vendor_archived: false,
  vendor_phone: '98765 43210', vendor_contact_person: 'Ravi Sharma',
  vendor_categories: [{ id: 'c1', name: 'Carpentry' }, { id: 'c2', name: 'Tiling' }],
  role_on_project: 'Lead carpenter', scope_of_work: 'Wardrobes', note: 'North wing',
};
const rao = {
  id: 'l2', vendor_id: 'v2', vendor_name: 'Rao Tiles', vendor_archived: true,
  vendor_phone: '98000 00002', vendor_contact_person: null, vendor_categories: [{ id: 'c2', name: 'Tiling' }],
  role_on_project: null, scope_of_work: null, note: null,
};

function mockFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.startsWith('/api/history?')) return json(200, history);
    if (url === '/api/projects/p1') return json(200, body);
    if (url === '/api/auth/me') return json(200, { id: 'u1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR' });
    // The page's other sections need their real response shapes, or they fail while the test runs.
    if (url === '/api/projects/p1/client-advances') {
      return json(200, { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] });
    }
    if (url.startsWith('/api/projects/p1/timeline')) {
      return json(200, { project: { id: 'p1', name: 'Lake House', archived: false }, items: [], archived_items: [], delays: [], coordination_issues: [] });
    }
    return json(200, []);
  }));
}

describe('project vendors', () => {
  it('shows each vendor with contact details, categories and its role, linked to the profile (US1-3, US1-4)', async () => {
    mockFetch(project([sharma, rao]));
    render(<ProjectDetail id="p1" />);
    const section = await screen.findByRole('region', { name: 'Vendors' });
    const name = within(section).getByRole('link', { name: 'Sharma Interiors' });
    expect(name).toHaveAttribute('href', '#/vendors/v1');
    const card = name.closest('article')!;
    expect(within(card).getByText('98765 43210')).toBeInTheDocument();
    expect(within(card).getByText('Ravi Sharma')).toBeInTheDocument();
    expect(within(card).getByText('Carpentry, Tiling')).toBeInTheDocument();
    expect(within(card).getByText(/Lead carpenter/)).toBeInTheDocument();
    expect(within(card).getByText(/Wardrobes/)).toBeInTheDocument();
    expect(within(card).getByText(/North wing/)).toBeInTheDocument();

    const raoCard = within(section).getByRole('link', { name: 'Rao Tiles' }).closest('article')!;
    expect(within(raoCard).getByText('No contact person')).toBeInTheDocument();
    expect(within(raoCard).getByText('Archived')).toBeInTheDocument();
  });

  it('says when no vendors are assigned (FR-031)', async () => {
    mockFetch(project([]));
    render(<ProjectDetail id="p1" />);
    const section = await screen.findByRole('region', { name: 'Vendors' });
    expect(within(section).getByText('No vendors are assigned to this project yet')).toBeInTheDocument();
  });

  it('uses plain wording with no mention of links (NFR-005, FR-031)', async () => {
    mockFetch(project([sharma]));
    render(<ProjectDetail id="p1" />);
    const section = await screen.findByRole('region', { name: 'Vendors' });
    expect(within(section).getByRole('button', { name: 'Remove from project' })).toBeInTheDocument();
    expect(within(section).getByRole('heading', { name: 'Assign a vendor' })).toBeInTheDocument();
    expect(section.textContent ?? '').not.toMatch(/\blink(ed)?\b/i);
  });

  it('confirms removing a vendor from the project (FR-026)', async () => {
    const notices = collectNotices();
    mockFetch(project([sharma]));
    render(<ProjectDetail id="p1" />);
    const section = await screen.findByRole('region', { name: 'Vendors' });
    await userEvent.click(within(section).getByRole('button', { name: 'Remove from project' }));
    // Superseded (Feature 005 FR-043, T042): removing a vendor from the project asks first.
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from project' }));
    await waitFor(() => expect(notices).toEqual(['Vendor removed from project']));
  });
});

describe('project vendors assignment status (US3)', () => {
  it('shows each assignment status as text on the vendor card (T023)', async () => {
    const statuses: [string, string][] = [
      ['NO_ACTIVITIES', 'No activities'],
      ['NOT_STARTED', 'Not started'],
      ['IN_PROGRESS', 'In progress'],
      ['DELAYED', 'Delayed'],
      ['COMPLETED', 'Completed'],
    ];
    const links = statuses.map(([status], index) => ({
      ...sharma, id: `l${index}`, vendor_id: `v${index}`, vendor_name: `Vendor ${index}`, assignment_status: status,
    }));
    mockFetch(project(links));
    render(<ProjectDetail id="p1" />);
    const section = await screen.findByRole('region', { name: 'Vendors' });
    statuses.forEach(([, label], index) => {
      const card = within(section).getByRole('link', { name: `Vendor ${index}` }).closest('article')!;
      expect(within(card).getByText(badgeText(`Assignment status: ${label}`))).toBeInTheDocument();
    });
  });
});

describe('project past vendors (US4)', () => {
  const pastLinks = [
    {
      id: 'pl2', vendor_id: 'v8', vendor_name: 'Gone Tiles', vendor_archived: true,
      role_on_project: 'Tiling', scope_of_work: 'Bathrooms', note: 'Left early',
      removed_at: '2026-11-03T05:00:00.000Z', removed_by: { id: 'u1', name: 'Asha Admin' },
    },
    {
      id: 'pl1', vendor_id: 'v9', vendor_name: 'Old Joinery', vendor_archived: false,
      role_on_project: null, scope_of_work: null, note: null,
      removed_at: '2026-10-20T05:00:00.000Z', removed_by: { id: 'u2', name: 'Omar Office' },
    },
  ];

  it('lists past vendors apart from current ones, newest removal first, read-only (US4-3, US4-8, FR-013a)', async () => {
    mockFetch({ ...project([sharma]), past_links: pastLinks });
    render(<ProjectDetail id="p1" />);
    const past = await screen.findByRole('region', { name: 'Past vendors' });
    const names = within(past).getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['Gone Tiles', 'Old Joinery']);
    const row = within(past).getByRole('link', { name: 'Gone Tiles' }).closest('li')!;
    expect(within(past).getByRole('link', { name: 'Gone Tiles' })).toHaveAttribute('href', '#/vendors/v8');
    expect(within(row).getByText(/Tiling/)).toBeInTheDocument();
    expect(within(row).getByText(/Bathrooms/)).toBeInTheDocument();
    expect(within(row).getByText(/Left early/)).toBeInTheDocument();
    // Superseded (Feature 005 FR-042, T042): dates read "9 Nov 2026" and recorded times "9 Nov 2026, 14:05".
    expect(within(row).getByText('Removed by Asha Admin on 3 Nov 2026, 10:30')).toBeInTheDocument();
    expect(within(row).getByText('Archived')).toBeInTheDocument();
    expect(within(past).queryByRole('button')).toBeNull();
    expect(within(past).queryByText(/Assignment status/)).toBeNull();

    const current = screen.getByRole('region', { name: 'Vendors' });
    expect(within(current).queryByRole('link', { name: 'Gone Tiles' })).toBeNull();
    expect(within(current).getByRole('link', { name: 'Sharma Interiors' })).toBeInTheDocument();
  });

  it('says when there are no past vendors', async () => {
    mockFetch({ ...project([sharma]), past_links: [] });
    render(<ProjectDetail id="p1" />);
    const past = await screen.findByRole('region', { name: 'Past vendors' });
    expect(within(past).getByText('No past vendors')).toBeInTheDocument();
  });
});
