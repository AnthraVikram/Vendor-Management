import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleForm } from '../src/pages/project-detail';

describe('schedule form', () => {
  it('sends task, date, times, and team size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => ({ conflicts: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<ScheduleForm projectId="project-1" vendors={[{ id: 'vendor-1', name: 'Mehta' }]} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText('Task'), 'Floor tiling');
    await userEvent.type(screen.getByLabelText('Date'), '2026-11-02');
    await userEvent.clear(screen.getByLabelText('Start'));
    await userEvent.type(screen.getByLabelText('Start'), '09:00');
    await userEvent.clear(screen.getByLabelText('End'));
    await userEvent.type(screen.getByLabelText('End'), '12:00');
    await userEvent.clear(screen.getByLabelText('Team size'));
    await userEvent.type(screen.getByLabelText('Team size'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ task: 'Floor tiling', work_date: '2026-11-02', start_time: '09:00', end_time: '12:00', required_team_size: 4 });
    expect(onSaved).toHaveBeenCalled();
  });
});
