import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressForm } from '../src/pages/project-timeline';

describe('progress form', () => {
  it('offers exactly the three statuses and sends status and note', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'item-1', status: 'IN_PROGRESS' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<ProgressForm itemId="item-1" itemName="False ceiling" onSaved={onSaved} />);

    const status = screen.getByLabelText('Status');
    expect(within(status).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Not started',
      'In progress',
      'Done',
    ]);
    await userEvent.selectOptions(status, 'IN_PROGRESS');
    await userEvent.type(screen.getByLabelText('Note'), 'Framing done');
    await userEvent.click(screen.getByRole('button', { name: 'Save update' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/timeline-items/item-1/progress-updates');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'IN_PROGRESS', note: 'Framing done' });
    expect(onSaved).toHaveBeenCalled();
  });
});
