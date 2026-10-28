import { render, screen, within } from '@testing-library/react';
import { Dashboard } from '../src/pages/dashboard';

function respond(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  });
}

const project = { id: 'p1', name: 'Lake House' };

describe('dashboard', () => {
  it('says each list is empty when there is nothing to show (US5-5)', async () => {
    vi.stubGlobal('fetch', respond({ today: '2026-10-28', overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [] }));
    render(<Dashboard />);
    expect(await screen.findByText('Nothing overdue.')).toBeInTheDocument();
    expect(screen.getByText('Nothing due soon.')).toBeInTheDocument();
    expect(screen.getByText('No missing updates.')).toBeInTheDocument();
    expect(screen.getByText('No delays or coordination issues.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Overdue',
      'Due soon',
      'Missing update',
      'Recent delays and coordination issues',
    ]);
  });

  it('shows each entry with its project, responsible party, and date, linked to the project at the item (US5-1, US5-6)', async () => {
    vi.stubGlobal(
      'fetch',
      respond({
        today: '2026-10-28',
        overdue: [{ project, item: { id: 'i1', name: 'Joinery' }, responsible_label: 'Sharma Interiors', deadline: '2026-10-25', days_overdue: 3 }],
        due_soon: [{ project, item: { id: 'i2', name: 'Handover' }, responsible_label: 'Firm team', deadline: '2026-10-30' }],
        missing_update: [{ project, item: { id: 'i3', name: 'Wiring' }, responsible_label: 'None', last_update_on: '2026-10-19' }],
        recent_delays_and_issues: [
          {
            kind: 'DELAY',
            id: 'd1',
            project,
            item: null,
            responsible_label: 'None',
            text: 'Client away',
            created_at: '2026-10-27T05:00:00.000Z',
            created_by: { id: 'u1', name: 'Asha' },
          },
        ],
      }),
    );
    render(<Dashboard />);

    const overdue = within(await screen.findByRole('region', { name: 'Overdue' }));
    expect(overdue.getByText(/Sharma Interiors/)).toBeInTheDocument();
    expect(overdue.getByText(/3 days overdue/)).toBeInTheDocument();
    expect(overdue.getByRole('link', { name: /Joinery/ })).toHaveAttribute('href', '#/projects/p1?item=i1');

    const dueSoon = within(screen.getByRole('region', { name: 'Due soon' }));
    expect(dueSoon.getByText(/Firm team/)).toBeInTheDocument();
    expect(dueSoon.getByRole('link', { name: /Handover/ })).toHaveAttribute('href', '#/projects/p1?item=i2');

    const missing = within(screen.getByRole('region', { name: 'Missing update' }));
    expect(missing.getByText(/2026-10-19/)).toBeInTheDocument();

    const recent = within(screen.getByRole('region', { name: 'Recent delays and coordination issues' }));
    expect(recent.getByText(/Client away/)).toBeInTheDocument();
    expect(recent.getByRole('link', { name: /Lake House/ })).toHaveAttribute('href', '#/projects/p1');
  });
});
