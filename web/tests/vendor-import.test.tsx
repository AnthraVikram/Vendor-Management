import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VendorImport } from '../src/pages/vendor-import';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const preview = {
  id: 'pv1',
  file_name: 'vendors.csv',
  expires_at: '2026-10-29T06:30:00.000Z',
  status: 'OPEN',
  ignored_headings: [],
  counts: { ready: 1, rejected: 2, possible_duplicate: 2 },
  rows: [
    { row_number: 2, outcome: 'READY', name: 'Fresh Tiles', reasons: [], matches: [], cells: {} },
    { row_number: 3, outcome: 'REJECTED', name: 'No Phone Glass', reasons: ['Phone is required.'], matches: [], cells: {} },
    {
      row_number: 4, outcome: 'REJECTED', name: 'Known GST Steel', reasons: ['This GSTIN already belongs to Gupta & Sons.'],
      matches: [{ kind: 'VENDOR', vendor_id: 'v1', vendor_name: 'Gupta & Sons' }], cells: {},
    },
    {
      row_number: 5, outcome: 'POSSIBLE_DUPLICATE', name: 'Dashed Phone Paints', reasons: ['Phone matches an existing vendor.'],
      matches: [{ kind: 'VENDOR', vendor_id: 'v2', vendor_name: 'Mehta Tile Co' }], cells: {},
    },
    {
      row_number: 6, outcome: 'POSSIBLE_DUPLICATE', name: 'Repeat Phone Tiles', reasons: ['Phone matches row 2.'],
      matches: [{ kind: 'ROW', row_number: 2 }], cells: {},
    },
  ],
};

const summary = {
  run: {
    id: 'run1', file_name: 'vendors.csv', created_at: '2026-10-29T06:10:00.000Z', created_by: { id: 'u1', name: 'Omar Office' },
    imported_count: 2, skipped_count: 1, rejected_count: 2,
  },
  rows: [
    { row_number: 2, outcome: 'IMPORTED', vendor_id: 'n1', reasons: [] },
    { row_number: 3, outcome: 'REJECTED', vendor_id: null, reasons: ['Phone is required.'] },
    { row_number: 4, outcome: 'REJECTED', vendor_id: null, reasons: ['This GSTIN already belongs to Gupta & Sons.'] },
    { row_number: 5, outcome: 'IMPORTED', vendor_id: 'n2', reasons: [] },
    { row_number: 6, outcome: 'SKIPPED', vendor_id: null, reasons: ['Phone matches row 2. Not approved.'] },
  ],
};

type Reply = ReturnType<typeof json>;

function mockFetch(replies: { upload?: () => Reply; confirm?: (body: unknown) => Reply }) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/vendor-imports/previews' && init?.method === 'POST') return (replies.upload ?? (() => json(201, preview)))();
    if (url === '/api/vendor-imports/previews/pv1/confirm') return (replies.confirm ?? (() => json(201, summary)))(JSON.parse(String(init?.body)));
    return json(404, { message: 'Not found.' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function previewFile() {
  render(<VendorImport />);
  await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['Name,Phone,Categories\r\n'], 'vendors.csv', { type: 'text/csv' }));
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
  return screen.findByRole('table', { name: 'Preview' });
}

describe('vendor import page', () => {
  it('offers both template downloads', () => {
    mockFetch({});
    render(<VendorImport />);
    expect(screen.getByRole('link', { name: 'Download Excel template' })).toHaveAttribute('href', '/api/vendor-imports/template?format=xlsx');
    expect(screen.getByRole('link', { name: 'Download CSV template' })).toHaveAttribute('href', '/api/vendor-imports/template?format=csv');
  });

  it('shows each row with its outcome badge, reasons, and named matches', async () => {
    mockFetch({});
    const table = await previewFile();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('2');
    expect(rows[0]).toHaveTextContent('Fresh Tiles');
    expect(rows[0]).toHaveTextContent('Ready');
    expect(rows[1]).toHaveTextContent('Rejected');
    expect(rows[1]).toHaveTextContent('Phone is required.');
    expect(rows[2]).toHaveTextContent('Gupta & Sons');
    expect(rows[3]).toHaveTextContent('Possible duplicate');
    expect(rows[3]).toHaveTextContent('Mehta Tile Co');
    expect(rows[4]).toHaveTextContent('Row 2');
    expect(screen.getByText(/Confirm before .* or upload again/)).toBeInTheDocument();
  });

  it('offers a checkbox only on possible duplicates and posts the ticked row numbers', async () => {
    const posted: unknown[] = [];
    mockFetch({
      confirm: (body) => {
        posted.push(body);
        return json(201, summary);
      },
    });
    const table = await previewFile();
    const checkboxes = within(table).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(within(table).getByRole('checkbox', { name: 'Import row 5 anyway' })).toBeInTheDocument();
    expect(within(table).getByRole('checkbox', { name: 'Import row 6 anyway' })).toBeInTheDocument();

    await userEvent.click(within(table).getByRole('checkbox', { name: 'Import row 5 anyway' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(posted).toEqual([{ approved_rows: [5] }]);
  });

  it('shows the counts and the reasons for skipped and rejected rows after confirming', async () => {
    mockFetch({});
    await previewFile();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    const result = await screen.findByRole('region', { name: 'Import summary' });
    expect(result).toHaveTextContent('Imported 2');
    expect(result).toHaveTextContent('Skipped 1');
    expect(result).toHaveTextContent('Rejected 2');
    expect(result).toHaveTextContent('Row 6: Phone matches row 2. Not approved.');
    expect(result).toHaveTextContent('Row 3: Phone is required.');
    expect(result).toHaveTextContent('Row 4: This GSTIN already belongs to Gupta & Sons.');
  });

  it('asks for a new upload when the preview has expired', async () => {
    mockFetch({ confirm: () => json(409, { message: 'This preview has expired.', code: 'PREVIEW_EXPIRED' }) });
    await previewFile();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByText('This preview has expired. Upload the file again.')).toBeInTheDocument();
  });

  it('cancels a preview, clears it, and says nothing was imported', async () => {
    const fetchMock = mockFetch({});
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/vendor-imports/previews' && init?.method === 'POST') return json(201, preview);
      if (url === '/api/vendor-imports/previews/pv1/cancel') return json(200, { status: 'CANCELLED' });
      return json(404, { message: 'Not found.' });
    });
    await previewFile();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel preview' }));
    expect(await screen.findByText('Preview cancelled. Nothing was imported.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Preview' })).toBeNull();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('/api/vendor-imports/previews/pv1/cancel');
  });

  it('shows the cancelled message when the preview was cancelled elsewhere', async () => {
    mockFetch({ confirm: () => json(409, { message: 'This preview was cancelled. Upload the file again.', code: 'PREVIEW_CANCELLED' }) });
    await previewFile();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByText('This preview was cancelled. Upload the file again.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Preview' })).toBeNull();
  });

  it('disables Confirm while the confirmation is in flight', async () => {
    let release: (reply: Reply) => void = () => undefined;
    const fetchMock = mockFetch({});
    fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/vendor-imports/previews' && init?.method === 'POST') return json(201, preview);
      if (url === '/api/vendor-imports/previews/pv1/confirm') return new Promise<Reply>((resolve) => { release = resolve; });
      return json(404, { message: 'Not found.' });
    });
    await previewFile();
    const confirmButton = screen.getByRole('button', { name: 'Confirm import' });
    await userEvent.click(confirmButton);
    expect(confirmButton).toBeDisabled();
    await userEvent.click(confirmButton);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/confirm'))).toHaveLength(1);
    release(json(201, summary));
    expect(await screen.findByRole('region', { name: 'Import summary' })).toBeInTheDocument();
  });

  it('shows the size message when the file is too large', async () => {
    mockFetch({
      upload: () => json(400, { message: 'Check the highlighted fields.', code: 'FILE_TOO_LARGE', fields: { file: 'The file must be 25 MB or smaller.' } }),
    });
    render(<VendorImport />);
    await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['x'], 'big.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('The file must be 25 MB or smaller.')).toBeInTheDocument();
  });
});
