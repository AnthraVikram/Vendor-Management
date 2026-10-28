import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectDetail } from '../src/pages/project-detail';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin' };
const omar = { id: 'u2', name: 'Omar Office' };
const schedule = (id: string, task: string, pricing_mode: string) => ({
  id, vendor_id: 'v1', task, work_date: '2026-11-02', start_time: '09:00', end_time: '10:00', required_team_size: 1, pricing_mode, archived: false, conflicts: [],
});
const project = {
  id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, links: [],
  schedules: [schedule('s1', 'Tiling', 'FIXED'), schedule('s2', 'Joinery', 'FILE'), schedule('s3', 'Painting', 'NONE')],
};
const details: Record<string, unknown> = {
  s1: {
    pricing_mode: 'FIXED',
    current_price: { id: 'c2', amount: '1200.00', created_at: '2026-10-21T10:00:00.000Z' },
    price_history: [
      { id: 'c1', amount: '1000.00', kind: 'CHARGE', reverses_entry_id: null, created_at: '2026-10-20T10:00:00.000Z', author: asha },
      { id: 'r1', amount: '-1000.00', kind: 'REVERSAL', reverses_entry_id: 'c1', created_at: '2026-10-21T10:00:00.000Z', author: omar },
      { id: 'c2', amount: '1200.00', kind: 'CHARGE', reverses_entry_id: null, created_at: '2026-10-21T10:00:00.000Z', author: omar },
    ],
    current_file: null,
    file_history: [],
  },
  s2: {
    pricing_mode: 'FILE',
    current_price: null,
    price_history: [],
    current_file: { id: 'f2', original_filename: 'sheet.pdf' },
    file_history: [
      { id: 'f1', original_filename: 'old.pdf', archived: true, created_at: '2026-10-19T10:00:00.000Z', author: asha, archived_at: '2026-10-22T10:00:00.000Z', archived_by: omar },
      { id: 'f2', original_filename: 'sheet.pdf', archived: false, created_at: '2026-10-22T10:00:00.000Z', author: omar, archived_at: null, archived_by: null },
    ],
  },
  s3: { pricing_mode: 'NONE', current_price: null, price_history: [], current_file: null, file_history: [] },
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const match = url.match(/^\/api\/schedules\/(s\d)(\/.*)?$/);
    if (match && !init?.method) return json(200, { id: match[1], ...(details[match[1]] as object) });
    if (match && init?.method === 'POST') return json(200, { id: match[1], ...(details.s3 as object) });
    if (url === '/api/projects/p1') return json(200, project);
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('task pricing on the project screen', () => {
  it('shows each task\'s own price or file with history, and clears either method', async () => {
    const fetchMock = mockFetch();
    render(<ProjectDetail id="p1" />);

    const fixed = await screen.findByRole('article', { name: 'Schedule Tiling' });
    expect(await within(fixed).findByText('Fixed price: 1200.00')).toBeInTheDocument();
    expect(within(fixed).getByText(/1000\.00 · charge · Asha Admin · 2026-10-20/)).toBeInTheDocument();
    expect(within(fixed).getByText(/-1000\.00 · reversal · Omar Office · 2026-10-21/)).toBeInTheDocument();

    const file = screen.getByRole('article', { name: 'Schedule Joinery' });
    expect(await within(file).findByText('Costing sheet: sheet.pdf')).toBeInTheDocument();
    expect(within(file).getByRole('link', { name: 'Open costing sheet' })).toHaveAttribute('href', '/api/schedules/s2/costing-sheets/f2');
    const fileHistory = within(file).getByRole('list', { name: 'Costing sheet history' });
    expect(fileHistory.textContent).toContain('old.pdf · Asha Admin · 2026-10-19 · cleared or replaced by Omar Office · 2026-10-22');
    expect(within(fileHistory).getByRole('link', { name: 'old.pdf' })).toHaveAttribute('href', '/api/schedules/s2/costing-sheets/f1');

    const none = screen.getByRole('article', { name: 'Schedule Painting' });
    expect(await within(none).findByText('Unpriced')).toBeInTheDocument();
    expect(within(none).queryByRole('button', { name: /Clear/ })).toBeNull();

    await userEvent.click(within(fixed).getByRole('button', { name: 'Clear price' }));
    await userEvent.click(within(file).getByRole('button', { name: 'Clear costing sheet' }));
    const posts = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST').map((call) => String(call[0]));
    expect(posts).toEqual(['/api/schedules/s1/price/clear', '/api/schedules/s2/costing-sheet/clear']);
  });
});
