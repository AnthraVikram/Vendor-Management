import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemForm } from '../src/pages/project-timeline';

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  });
}

describe('timeline item form', () => {
  it('sends the type, name, dates, description, and responsible party', async () => {
    const fetchMock = respond(201, { id: 'item-1' });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<ItemForm projectId="project-1" vendors={[{ id: 'vendor-1', name: 'Mehta' }]} onSaved={onSaved} />);

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'ACTIVITY');
    await userEvent.type(screen.getByLabelText('Name'), 'False ceiling');
    await userEvent.type(screen.getByLabelText('Planned date'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('Deadline'), '2026-11-05');
    await userEvent.type(screen.getByLabelText('Description'), 'Gypsum board');
    await userEvent.selectOptions(screen.getByLabelText('Responsible'), 'vendor:vendor-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save item' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/projects/project-1/timeline-items');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      item_type: 'ACTIVITY',
      name: 'False ceiling',
      planned_date: '2026-11-01',
      deadline: '2026-11-05',
      description: 'Gypsum board',
      responsible: { kind: 'VENDOR', vendor_id: 'vendor-1' },
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('offers the linked vendors plus Firm team and No responsible party', () => {
    vi.stubGlobal('fetch', respond(201, {}));
    render(
      <ItemForm
        projectId="project-1"
        vendors={[
          { id: 'vendor-1', name: 'Mehta' },
          { id: 'vendor-2', name: 'Rao' },
        ]}
        onSaved={vi.fn()}
      />,
    );
    const options = within(screen.getByLabelText('Responsible')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['No responsible party', 'Firm team', 'Mehta', 'Rao']);
  });

  it('shows each field message from a 400 next to its field', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        message: 'Check the highlighted fields.',
        fields: {
          name: 'Name is required.',
          planned_date: 'Planned date cannot be later than the deadline.',
        },
      }),
    );
    const onSaved = vi.fn();
    render(<ItemForm projectId="project-1" vendors={[]} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save item' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Planned date cannot be later than the deadline.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
