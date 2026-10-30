import { act, screen } from '@testing-library/react';

const user = { id: '1', name: 'Omar Office', email: 'office@example.com', role: 'OFFICE_TEAM' };

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

describe('import routes in the app shell (T048)', () => {
  it('opens the import page, the history, and a run, and never treats "import" as a vendor id', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === '/api/auth/me') return json(200, user);
      if (url === '/api/vendor-imports') return json(200, []);
      if (url === '/api/vendor-imports/run2') {
        return json(200, {
          run: { id: 'run2', file_name: 'second.xlsx', created_at: '2026-10-29T06:10:00.000Z', created_by: { id: '1', name: 'Omar Office' }, imported_count: 1, skipped_count: 0, rejected_count: 0 },
          rows: [{ row_number: 2, outcome: 'IMPORTED', vendor_id: 'n1', reasons: [] }],
        });
      }
      return json(200, []);
    });
    vi.stubGlobal('fetch', fetchMock);

    window.location.hash = '#/vendors/import';
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      await import('../src/main');
    });
    expect(await screen.findByRole('heading', { name: 'Import vendors' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain('/api/vendors/import');

    await act(async () => {
      window.location.hash = '#/vendor-imports?run=run2';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Import history' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Run rows' })).toBeInTheDocument();

    await act(async () => {
      window.location.hash = '#/vendors';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('link', { name: 'Import vendors' })).toHaveAttribute('href', '#/vendors/import');
  });
});
