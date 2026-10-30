import { render, screen, waitFor } from '@testing-library/react';
import { ProjectTimeline } from '../src/pages/project-timeline';

function item(id: string, name: string, archived = false) {
  return {
    id,
    item_type: 'ACTIVITY',
    name,
    description: null,
    planned_date: null,
    deadline: '2026-11-02',
    responsible: { kind: 'NONE', vendor: null, label: 'No responsible party' },
    status: 'NOT_STARTED',
    last_update_on: null,
    done_on: null,
    archived,
    flags: [],
  };
}

function mockTimeline() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        project: { id: 'p1', name: 'Lake House', archived: false },
        items: [item('i1', 'Joinery'), item('i2', 'Wiring')],
        archived_items: [item('i3', 'Shelving', true)],
        delays: [],
        coordination_issues: [],
      }),
    }),
  );
}

describe('opening a project at a timeline item (US5-6)', () => {
  it('highlights and scrolls to the selected item', async () => {
    mockTimeline();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<ProjectTimeline projectId="p1" linkedVendors={[]} itemId="i2" />);

    const target = await screen.findByRole('article', { name: 'Timeline item Wiring' });
    expect(target).toHaveClass('highlighted');
    expect(screen.getByRole('article', { name: 'Timeline item Joinery' })).not.toHaveClass('highlighted');
    // The scroll runs in an effect after the article appears; under load that effect can trail the DOM.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
  });

  it('opens the archived items list when the selected item is archived', async () => {
    mockTimeline();
    Element.prototype.scrollIntoView = vi.fn();
    render(<ProjectTimeline projectId="p1" linkedVendors={[]} itemId="i3" />);

    const target = await screen.findByRole('article', { name: 'Timeline item Shelving' });
    expect(target).toHaveClass('highlighted');
    expect(target.closest('details')).toHaveAttribute('open');
  });
});
