import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VendorImport } from '../src/pages/vendor-import';
import { VendorImports } from '../src/pages/vendor-imports';

// T065: at phone width each table row stacks into a card, and each cell shows its column name from
// data-label. jsdom does not lay out CSS, so this checks the labels the stacked cards depend on.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

function expectLabelledCells(table: HTMLElement) {
  const headings = within(table).getAllByRole('columnheader').map((th) => th.textContent ?? '');
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(Array.from(row.querySelectorAll('td')).map((td) => td.getAttribute('data-label'))).toEqual(headings);
  }
}

const run = {
  id: 'run1', file_name: 'vendors.csv', created_at: '2026-10-29T06:10:00.000Z', created_by: { id: 'u1', name: 'Omar Office' },
  imported_count: 1, skipped_count: 1, rejected_count: 1,
};

describe('tables that stack into cards at phone width (T065)', () => {
  it('labels every preview cell with its column, and gives each outcome its badge class', async () => {
    const preview = {
      id: 'pv1', file_name: 'vendors.csv', expires_at: '2026-10-29T06:30:00.000Z', status: 'OPEN', ignored_headings: [],
      counts: { ready: 1, rejected: 1, possible_duplicate: 1 },
      rows: [
        { row_number: 2, outcome: 'READY', name: 'Fresh Tiles', reasons: [], matches: [], cells: {} },
        { row_number: 3, outcome: 'REJECTED', name: 'No Phone Glass', reasons: ['Phone is required.'], matches: [], cells: {} },
        { row_number: 4, outcome: 'POSSIBLE_DUPLICATE', name: 'Repeat Tiles', reasons: ['Phone matches row 2.'], matches: [{ kind: 'ROW', row_number: 2 }], cells: {} },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => json(201, preview)));
    render(<VendorImport />);
    await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['Name\r\n'], 'vendors.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const table = await screen.findByRole('table', { name: 'Preview' });
    expectLabelledCells(table);
    expect(within(table).getByText('Ready')).toHaveClass('flag', 'outcome-ready');
    expect(within(table).getByText('Rejected')).toHaveClass('flag', 'outcome-rejected');
    expect(within(table).getByText('Possible duplicate')).toHaveClass('flag', 'outcome-duplicate');
  });

  it('labels every cell of the import history and run tables', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) =>
        String(input) === '/api/vendor-imports'
          ? json(200, [run])
          : json(200, { run, rows: [{ row_number: 2, outcome: 'IMPORTED', vendor_id: 'n1', reasons: [] }, { row_number: 3, outcome: 'REJECTED', vendor_id: null, reasons: ['Phone is required.'] }] }),
      ),
    );
    render(<VendorImports runId="run1" />);
    expectLabelledCells(await screen.findByRole('table', { name: 'Import runs' }));
    expectLabelledCells(await screen.findByRole('table', { name: 'Run rows' }));
  });
});
