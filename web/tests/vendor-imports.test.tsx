import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VendorImports } from '../src/pages/vendor-imports';
import { VendorDetail } from '../src/pages/vendor-detail';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const runs = [
  {
    id: 'run2', file_name: 'second.xlsx', created_at: '2026-10-29T06:10:00.000Z', created_by: { id: 'u1', name: 'Omar Office' },
    imported_count: 2, skipped_count: 1, rejected_count: 2,
  },
  {
    id: 'run1', file_name: 'first.csv', created_at: '2026-10-28T05:00:00.000Z', created_by: { id: 'u2', name: 'Anil Accountant' },
    imported_count: 5, skipped_count: 0, rejected_count: 0,
  },
];

const detail = {
  run: runs[0],
  rows: [
    { row_number: 2, outcome: 'IMPORTED', vendor_id: 'n1', reasons: [] },
    { row_number: 3, outcome: 'REJECTED', vendor_id: null, reasons: ['Phone is required.'] },
    { row_number: 6, outcome: 'SKIPPED', vendor_id: null, reasons: ['Phone matches row 2. Not approved.'] },
  ],
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === '/api/vendor-imports') return json(200, runs);
    if (url === '/api/vendor-imports/run2') return json(200, detail);
    return json(404, { message: 'Not found.' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('import history page', () => {
  it('lists runs with who, when, file, and counts, newest first as the API returns them', async () => {
    mockFetch();
    render(<VendorImports />);
    const table = await screen.findByRole('table', { name: 'Import runs' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('second.xlsx');
    expect(rows[0]).toHaveTextContent('Omar Office');
    expect(rows[0]).toHaveTextContent('2026-10-29');
    expect(rows[0]).toHaveTextContent('Imported 2');
    expect(rows[0]).toHaveTextContent('Skipped 1');
    expect(rows[0]).toHaveTextContent('Rejected 2');
    expect(rows[1]).toHaveTextContent('first.csv');
    expect(screen.getByRole('link', { name: 'Import vendors' })).toHaveAttribute('href', '#/vendors/import');
  });

  it('opens a run with each row outcome, its reasons, and a link to the vendor it created', async () => {
    mockFetch();
    render(<VendorImports />);
    await userEvent.click(await screen.findByRole('button', { name: 'View second.xlsx' }));
    const table = await screen.findByRole('table', { name: 'Run rows' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Imported');
    expect(within(rows[0]).getByRole('link', { name: 'Open vendor' })).toHaveAttribute('href', '#/vendors/n1');
    expect(rows[1]).toHaveTextContent('Rejected');
    expect(rows[1]).toHaveTextContent('Phone is required.');
    expect(rows[2]).toHaveTextContent('Skipped');
    expect(rows[2]).toHaveTextContent('Phone matches row 2. Not approved.');
    expect(within(rows[1]).queryByRole('link')).toBeNull();
  });

  it('opens a run directly when given its id', async () => {
    const fetchMock = mockFetch();
    render(<VendorImports runId="run2" />);
    expect(await screen.findByRole('table', { name: 'Run rows' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('/api/vendor-imports/run2');
  });
});

describe('vendor page import line', () => {
  const vendor = { id: 'v1', name: 'Fresh Tiles', phone: '91111 22222', archived: false, availability: null, rates: [], notes: [], current_rating: null };

  it('says which import created the vendor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ...vendor, import_run: { id: 'run2', file_name: 'second.xlsx', created_at: '2026-10-29T06:10:00.000Z' } })));
    render(<VendorDetail id="v1" />);
    expect(await screen.findByText('Imported in second.xlsx on 2026-10-29')).toBeInTheDocument();
  });

  it('shows no import line for a vendor added by hand', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ...vendor, import_run: null })));
    render(<VendorDetail id="v1" />);
    expect(await screen.findByRole('heading', { name: 'Fresh Tiles' })).toBeInTheDocument();
    expect(screen.queryByText(/Imported in/)).toBeNull();
  });
});
