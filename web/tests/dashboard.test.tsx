import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../src/pages/dashboard';

// Feature 003 added the summary tiles, which ask for /api/dashboard/summary; every other URL gets `body`.
const summary = { vendors: { active: 0 }, projects: { PLANNED: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0 } };

function respond(body: unknown) {
  return vi.fn(async (input: RequestInfo) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => (String(input) === '/api/dashboard/summary' ? summary : body),
  }));
}

// Badges split their text between a visually hidden prefix and the visible label, so match the whole badge text.
function badgeText(text: string) {
  return (_content: string, element: Element | null) => Boolean(element?.classList.contains('status-badge') && element.textContent === text);
}

const lake = { id: 'p1', name: 'Lake House' };
const studio = { id: 'p2', name: 'Studio Fit-out' };
const sharma = { kind: 'VENDOR', vendor: { id: 'v1', name: 'Sharma Interiors', archived: false }, label: 'Sharma Interiors' };
const rao = { kind: 'VENDOR', vendor: { id: 'v2', name: 'Rao Tiles', archived: false }, label: 'Rao Tiles' };
const firm = { kind: 'FIRM_TEAM', vendor: null, label: 'Firm team' };
const none = { kind: 'NONE', vendor: null, label: 'None' };

type Responsible = { kind: string; vendor: { id: string; name: string; archived: boolean } | null; label: string };

function item(id: string, name: string, group: string | null, deadline: string, project: typeof lake, responsible: Responsible, extra: Record<string, unknown> = {}) {
  return { id, name, item_type: 'ACTIVITY', group, deadline, status: 'NOT_STARTED', last_update_on: null, days_overdue: null, flags: [], project, responsible, ...extra };
}

const items = [
  item('i1', 'Joinery', 'OVERDUE', '2026-11-06', lake, sharma, { status: 'IN_PROGRESS', last_update_on: '2026-11-01', days_overdue: 2 }),
  item('i2', 'Wiring', 'OVERDUE', '2026-11-07', studio, firm, { days_overdue: 1 }),
  item('i3', 'Handover', 'DUE_TODAY', '2026-11-08', lake, none, { item_type: 'MILESTONE' }),
  item('i4', 'Tiling', 'COMING_SOON', '2026-11-12', studio, rao, { status: 'IN_PROGRESS', last_update_on: '2026-11-05' }),
  item('i5', 'Paint', 'UPCOMING', '2026-11-25', lake, none),
  item('i6', 'Garden', null, '2027-01-10', studio, none),
];

const attention = [
  { id: 'p1', name: 'Lake House', health: 'DELAYED', progress: { done: 3, total: 8 }, overdue_count: 1, reasons: [{ type: 'PAST_EXPECTED_COMPLETION' }, { type: 'OVERDUE_ITEMS', count: 1 }] },
  { id: 'p2', name: 'Studio Fit-out', health: 'ONGOING', progress: { done: 0, total: 0 }, overdue_count: 2, reasons: [{ type: 'OVERDUE_ITEMS', count: 2 }] },
];

function data(overrides: Record<string, unknown> = {}) {
  return { today: '2026-11-08', overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [], items, attention_projects: attention, ...overrides };
}

function names(region: HTMLElement): string[] {
  return within(region).queryAllByRole('listitem').map((row) => within(row).getAllByRole('link')[0].textContent ?? '');
}

async function deadlines() {
  return screen.findByRole('region', { name: /^(Overdue|Due today|Coming soon|Upcoming|All)$/ });
}

describe('dashboard deadline groups (Feature 004 US6)', () => {
  // These cases replace the Feature 002 "Overdue" and "Due soon" list cases: Feature 004 supersedes Feature 002
  // FR-020 and FR-021 with five non-overlapping deadline groups (spec.md, Backward Compatibility).

  it('opens on Overdue and states how many items each group holds (US6-1 to US6-5, FR-018, FR-019)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    expect(within(group).getByRole('radio', { name: 'Overdue (2)' })).toBeChecked();
    for (const label of ['Due today (1)', 'Coming soon (1)', 'Upcoming (1)', 'All (6)']) {
      expect(within(group).getByRole('radio', { name: label })).not.toBeChecked();
    }
    const list = await deadlines();
    expect(list).toHaveAccessibleName('Overdue');
    expect(names(list)).toEqual(['Joinery', 'Wiring']);

    const joinery = within(list).getByRole('link', { name: 'Joinery' }).closest('li')!;
    expect(within(joinery).getByRole('link', { name: 'Joinery' })).toHaveAttribute('href', '#/projects/p1?item=i1');
    expect(within(joinery).getByRole('link', { name: 'Lake House' })).toHaveAttribute('href', '#/projects/p1');
    expect(within(joinery).getByRole('link', { name: 'Sharma Interiors' })).toHaveAttribute('href', '#/vendors/v1');
    expect(joinery).toHaveTextContent('Activity');
    expect(joinery).toHaveTextContent('Deadline 2026-11-06');
    expect(joinery).toHaveTextContent('In progress');
    expect(joinery).toHaveTextContent('2 days overdue');
    const wiring = within(list).getByRole('link', { name: 'Wiring' }).closest('li')!;
    expect(wiring).toHaveTextContent('Firm team');
    expect(wiring).toHaveTextContent('1 day overdue');
  });

  it('shows each group and every open item under All (US6-2 to US6-5)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    const expected: [string, string[]][] = [
      ['Due today (1)', ['Handover']],
      ['Coming soon (1)', ['Tiling']],
      ['Upcoming (1)', ['Paint']],
      ['All (6)', ['Joinery', 'Wiring', 'Handover', 'Tiling', 'Paint', 'Garden']],
    ];
    for (const [label, rows] of expected) {
      await userEvent.click(within(group).getByRole('radio', { name: label }));
      expect(names(await deadlines()), label).toEqual(rows);
    }
    expect(within(await deadlines()).getByRole('link', { name: 'Handover' }).closest('li')).toHaveTextContent('Milestone');
  });

  it('filters by project, responsible party and status, combined (US6-7 to US6-9, FR-020)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    await userEvent.click(within(group).getByRole('radio', { name: 'All (6)' }));
    const filters = within(screen.getByRole('group', { name: 'Filter and sort' }));

    await userEvent.selectOptions(filters.getByLabelText('Project'), 'p1');
    expect(names(await deadlines())).toEqual(['Joinery', 'Handover', 'Paint']);
    await userEvent.selectOptions(filters.getByLabelText('Project'), '');

    await userEvent.selectOptions(filters.getByLabelText('Responsible party'), 'FIRM_TEAM');
    expect(names(await deadlines())).toEqual(['Wiring']);
    await userEvent.selectOptions(filters.getByLabelText('Responsible party'), 'NONE');
    expect(names(await deadlines())).toEqual(['Handover', 'Paint', 'Garden']);
    await userEvent.selectOptions(filters.getByLabelText('Responsible party'), 'v1');
    expect(names(await deadlines())).toEqual(['Joinery']);
    await userEvent.selectOptions(filters.getByLabelText('Responsible party'), '');

    await userEvent.selectOptions(filters.getByLabelText('Status'), 'IN_PROGRESS');
    expect(names(await deadlines())).toEqual(['Joinery', 'Tiling']);
    await userEvent.selectOptions(filters.getByLabelText('Project'), 'p2');
    expect(names(await deadlines())).toEqual(['Tiling']);
    expect(within(group).getByRole('radio', { name: 'All (1)' })).toBeChecked();
  });

  it('sorts by deadline by default, then by project or by latest update with none last (US6-10, US6-11, FR-021)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    await userEvent.click(within(group).getByRole('radio', { name: 'All (6)' }));
    const sort = within(screen.getByRole('group', { name: 'Filter and sort' })).getByLabelText('Sort by');
    expect(sort).toHaveValue('DEADLINE');
    await userEvent.selectOptions(sort, 'PROJECT');
    expect(names(await deadlines())).toEqual(['Joinery', 'Handover', 'Paint', 'Wiring', 'Tiling', 'Garden']);
    await userEvent.selectOptions(sort, 'UPDATE');
    expect(names(await deadlines())).toEqual(['Tiling', 'Joinery', 'Wiring', 'Handover', 'Paint', 'Garden']);
  });

  it('says each group is empty, or that no items match the filters (US6-15, FR-031)', async () => {
    vi.stubGlobal('fetch', respond(data({ items: [], attention_projects: [] })));
    render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    const messages: [string, string][] = [
      ['Overdue (0)', 'No overdue items'],
      ['Due today (0)', 'Nothing due today'],
      ['Coming soon (0)', 'Nothing due in the next 7 days'],
      ['Upcoming (0)', 'No upcoming items'],
      ['All (0)', 'No open items'],
    ];
    for (const [label, message] of messages) {
      await userEvent.click(within(group).getByRole('radio', { name: label }));
      expect(within(await deadlines()).getByText(message)).toBeInTheDocument();
    }
  });

  it('says no items match when filters leave an otherwise full group empty', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    await screen.findByRole('radiogroup', { name: 'Deadline group' });
    await userEvent.selectOptions(within(screen.getByRole('group', { name: 'Filter and sort' })).getByLabelText('Responsible party'), 'v2');
    expect(within(await deadlines()).getByText('No items match these filters')).toBeInTheDocument();
  });

  it('lists the projects needing attention with health, progress and reasons (US6-17 to US6-19, FR-023a)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    const section = await screen.findByRole('region', { name: 'Projects needing attention' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual(['Lake House', 'Studio Fit-out']);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '#/projects/p1');
    expect(within(rows[0]).getByText(badgeText('Health: Delayed'))).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('3 of 8 items done');
    expect(rows[0]).toHaveTextContent('Past expected completion date');
    expect(rows[0]).toHaveTextContent('1 overdue item');
    expect(within(rows[1]).getByText(badgeText('Health: Ongoing'))).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('No activities yet');
    expect(rows[1]).toHaveTextContent('2 overdue items');
    expect(rows[1]).not.toHaveTextContent('Past expected completion date');
    // The attention section sits above the deadline groups.
    expect(section.compareDocumentPosition(await deadlines()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says when no project needs attention', async () => {
    vi.stubGlobal('fetch', respond(data({ attention_projects: [] })));
    render(<Dashboard />);
    const section = await screen.findByRole('region', { name: 'Projects needing attention' });
    expect(within(section).getByText('No projects need attention')).toBeInTheDocument();
  });

  it('is usable with a keyboard and labelled for screen readers (NFR-004)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    within(group).getByRole('radio', { name: 'Overdue (2)' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(group).getByRole('radio', { name: 'Due today (1)' })).toBeChecked();
    expect(await deadlines()).toHaveAccessibleName('Due today');
    const filters = within(screen.getByRole('group', { name: 'Filter and sort' }));
    for (const label of ['Project', 'Responsible party', 'Status', 'Sort by']) {
      expect(filters.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('starts from the default group, no filters and deadline sort on every visit (decision D4)', async () => {
    vi.stubGlobal('fetch', respond(data()));
    const { unmount } = render(<Dashboard />);
    const group = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    await userEvent.click(within(group).getByRole('radio', { name: 'All (6)' }));
    const filters = within(screen.getByRole('group', { name: 'Filter and sort' }));
    await userEvent.selectOptions(filters.getByLabelText('Project'), 'p1');
    await userEvent.selectOptions(filters.getByLabelText('Sort by'), 'UPDATE');
    unmount();

    render(<Dashboard />);
    const again = await screen.findByRole('radiogroup', { name: 'Deadline group' });
    expect(within(again).getByRole('radio', { name: 'Overdue (2)' })).toBeChecked();
    const reset = within(screen.getByRole('group', { name: 'Filter and sort' }));
    expect(reset.getByLabelText('Project')).toHaveValue('');
    expect(reset.getByLabelText('Responsible party')).toHaveValue('');
    expect(reset.getByLabelText('Status')).toHaveValue('');
    expect(reset.getByLabelText('Sort by')).toHaveValue('DEADLINE');
  });
});

describe('dashboard lists kept from Feature 002', () => {
  it('keeps the Missing update and recent delays and issues lists (US6-12, US6-13, FR-022)', async () => {
    vi.stubGlobal(
      'fetch',
      respond(data({
        missing_update: [{ project: lake, item: { id: 'i3', name: 'Wiring' }, responsible_label: 'None', last_update_on: '2026-10-19' }],
        recent_delays_and_issues: [
          {
            kind: 'DELAY',
            id: 'd1',
            project: lake,
            item: null,
            responsible_label: 'None',
            text: 'Client away',
            created_at: '2026-10-27T05:00:00.000Z',
            created_by: { id: 'u1', name: 'Asha' },
          },
        ],
      })),
    );
    render(<Dashboard />);
    const missing = within(await screen.findByRole('region', { name: 'Missing update' }));
    expect(missing.getByText(/2026-10-19/)).toBeInTheDocument();
    expect(missing.getByRole('link', { name: /Wiring/ })).toHaveAttribute('href', '#/projects/p1?item=i3');

    const recent = within(screen.getByRole('region', { name: 'Recent delays and coordination issues' }));
    expect(recent.getByText(/Client away/)).toBeInTheDocument();
    expect(recent.getByRole('link', { name: /Lake House/ })).toHaveAttribute('href', '#/projects/p1');
  });

  it('says the kept lists are empty when there is nothing to show (US5-5)', async () => {
    vi.stubGlobal('fetch', respond(data({ items: [], attention_projects: [] })));
    render(<Dashboard />);
    expect(await screen.findByText('No missing updates.')).toBeInTheDocument();
    expect(screen.getByText('No delays or coordination issues.')).toBeInTheDocument();
  });

  it('shows a loading message until the dashboard arrives', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<Dashboard />);
    expect(screen.getByText('Loading dashboard')).toBeInTheDocument();
  });
});
