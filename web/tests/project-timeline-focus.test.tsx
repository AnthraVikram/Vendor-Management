import { render, screen, waitFor, within } from '@testing-library/react';
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
        items: [
          item('i1', 'Joinery'),
          item('i2', 'Wiring'),
          { ...item('i4', 'Tiling'), responsible: { kind: 'VENDOR', vendor: { id: 'v9', name: 'Nair Tile Studio', archived: true }, label: 'Nair Tile Studio' } },
        ],
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

describe('responsible vendor on a timeline item (FR-025)', () => {
  it('links the vendor name to its profile and keeps the archived text', async () => {
    mockTimeline();
    Element.prototype.scrollIntoView = vi.fn();
    render(<ProjectTimeline projectId="p1" linkedVendors={[]} />);
    const article = await screen.findByRole('article', { name: 'Timeline item Tiling' });
    expect(within(article).getByRole('link', { name: 'Nair Tile Studio (archived)' })).toHaveAttribute('href', '#/vendors/v9');
  });
});
