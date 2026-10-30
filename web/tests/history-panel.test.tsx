import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryPanel } from '../src/pages/history-panel';
import { DocumentsSection } from '../src/pages/documents-section';
import { AdvancesSection } from '../src/pages/advances-section';
import { VendorImports } from '../src/pages/vendor-imports';
import { VendorDetail } from '../src/pages/vendor-detail';
import { ProjectDetail } from '../src/pages/project-detail';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin' };
const omar = { id: 'u2', name: 'Omar Office' };

const vendorHistory = {
  record: { created_at: '2026-10-24T05:00:00.000Z', created_by: asha, updated_at: '2026-10-27T08:00:00.000Z', updated_by: omar },
  entries: [
    {
      id: 'h2', action: 'EDITED', details: {}, created_at: '2026-10-29T06:00:00.000Z', created_by: omar,
      changes: {
        phone: { from: '98765 43210', to: '98765-43211' },
        categories: { from: ['Tiles'], to: ['Marble', 'Tiles'] },
        email: { from: null, to: 'sharma@example.com' },
        gst_registered: { from: false, to: true },
      },
    },
    { id: 'h1', action: 'CREATED', changes: {}, details: { import_run_id: 'r1' }, created_at: '2026-10-24T05:00:00.000Z', created_by: asha },
  ],
};

const emptyHistory = { record: vendorHistory.record, entries: [] };

// Answers /api/history with `historyBody` and every other URL from `routes`, or an empty list.
function mockFetch(routes: Record<string, unknown> = {}, historyBody: unknown = emptyHistory) {
  const fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.startsWith('/api/history?')) return json(200, historyBody);
    return url in routes ? json(200, routes[url]) : json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function historyCalls(fetchMock: ReturnType<typeof mockFetch>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.startsWith('/api/history'));
}

describe('history panel (US5)', () => {
  it('stays closed without a request until opened, then shows the record stamps and each entry (US5-3, US5-6)', async () => {
    const fetchMock = mockFetch({}, vendorHistory);
    render(<HistoryPanel target="vendor_id" id="v1" />);
    expect(historyCalls(fetchMock)).toEqual([]);
    expect(screen.queryByText(/Created by/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Show history' }));
    expect(historyCalls(fetchMock)).toEqual(['/api/history?vendor_id=v1']);
    expect(await screen.findByText('Created by Asha Admin on 2026-10-24 10:30 IST')).toBeInTheDocument();
    expect(screen.getByText('Last updated by Omar Office on 2026-10-27 13:30 IST')).toBeInTheDocument();

    const items = within(screen.getByRole('list', { name: 'History entries' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Edited · Omar Office · 2026-10-29 11:30 IST');
    expect(items[0]).toHaveTextContent('Phone: 98765 43210 → 98765-43211');
    expect(items[0]).toHaveTextContent('Categories: Tiles → Marble, Tiles');
    expect(items[0]).toHaveTextContent('Email: (blank) → sharma@example.com');
    expect(items[0]).toHaveTextContent('GST registered: No → Yes');
    expect(items[1]).toHaveTextContent('Created · Asha Admin · 2026-10-24 10:30 IST');
    expect(within(items[1]).getByRole('link', { name: 'From an import' })).toHaveAttribute('href', '#/vendor-imports?run=r1');

    await userEvent.click(screen.getByRole('button', { name: 'Hide history' }));
    expect(screen.queryByRole('list', { name: 'History entries' })).toBeNull();
  });

  it('shows the amount and reason on advance entries (US5-1)', async () => {
    mockFetch({}, {
      record: { created_at: '2026-10-20T05:00:00.000Z', created_by: asha, updated_at: '2026-10-20T05:00:00.000Z', updated_by: asha },
      entries: [
        { id: 'h4', action: 'REVERSED', changes: {}, details: { amount: '50000.00', reason: 'Keyed twice.' }, created_at: '2026-10-21T05:00:00.000Z', created_by: omar },
        { id: 'h3', action: 'CREATED', changes: {}, details: { amount: '50000.00', received_on: '2026-10-19' }, created_at: '2026-10-20T05:00:00.000Z', created_by: asha },
      ],
    });
    render(<HistoryPanel target="client_advance_id" id="a1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show history' }));
    const items = within(await screen.findByRole('list', { name: 'History entries' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Reversed · Omar Office');
    expect(items[0]).toHaveTextContent('Amount: ₹50000.00');
    expect(items[0]).toHaveTextContent('Reason: Keyed twice.');
    expect(items[1]).toHaveTextContent('Date received: 2026-10-19');
  });

  it('says when nothing has been recorded since history began, and has no edit or delete control (US5-4, US5-6)', async () => {
    mockFetch();
    render(<HistoryPanel target="project_id" id="p1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show history' }));
    expect(await screen.findByText('No changes recorded since history began.')).toBeInTheDocument();
    expect(screen.getByText(/Created by Asha Admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|delete|remove/i })).toBeNull();
  });
});

describe('history on each page (T064)', () => {
  it('opens a document row’s history', async () => {
    const doc = {
      id: 'd1', vendor_id: 'v1', project_id: null, title: 'Agreement', document_type: 'AGREEMENT', note: null, original_filename: 'a.pdf',
      media_type: 'application/pdf', byte_size: 100, archived: false, created_at: '2026-10-29T06:00:00.000Z', created_by: asha,
    };
    const fetchMock = mockFetch({ '/api/vendors/v1/documents': [doc] });
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    const item = within(await screen.findByRole('list', { name: 'Documents' })).getByRole('listitem');
    await userEvent.click(within(item).getByRole('button', { name: 'Show history' }));
    expect(historyCalls(fetchMock)).toEqual(['/api/history?document_id=d1']);
  });

  it('opens an advance’s history', async () => {
    const advance = {
      id: 'a1', amount: '50000.00', received_on: '2026-10-19', payment_method: null, reference: null, note: null,
      created_at: '2026-10-20T05:00:00.000Z', created_by: asha, reversal: null,
    };
    const fetchMock = mockFetch({
      '/api/auth/me': { id: 'u2', name: 'Omar Office', role: 'OFFICE_TEAM' },
      '/api/projects/p1/client-advances': { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '50000.00', advances: [advance] },
    });
    render(<AdvancesSection projectId="p1" />);
    const item = within(await screen.findByRole('list', { name: 'Advances' })).getByRole('listitem');
    await userEvent.click(within(item).getByRole('button', { name: 'Show history' }));
    expect(historyCalls(fetchMock)).toEqual(['/api/history?client_advance_id=a1']);
  });

  it('opens an import run’s history', async () => {
    const run = { id: 'r1', file_name: 'one.csv', created_at: '2026-10-29T06:00:00.000Z', created_by: omar, imported_count: 1, skipped_count: 0, rejected_count: 0 };
    const fetchMock = mockFetch({ '/api/vendor-imports': [run], '/api/vendor-imports/r1': { run, rows: [] } });
    render(<VendorImports runId="r1" />);
    const section = await screen.findByRole('region', { name: 'Import run' });
    await userEvent.click(within(section).getByRole('button', { name: 'Show history' }));
    expect(historyCalls(fetchMock)).toEqual(['/api/history?import_run_id=r1']);
  });

  it('opens a vendor’s history from the vendor page', async () => {
    const vendor = { id: 'v1', name: 'Sharma Interiors', phone: '98765 43210', archived: false, availability: null, rates: [], notes: [], current_rating: null, import_run: null };
    const fetchMock = mockFetch({ '/api/vendors/v1': vendor });
    render(<VendorDetail id="v1" />);
    const panel = await screen.findByRole('region', { name: 'Vendor history' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Show history' }));
    expect(historyCalls(fetchMock)).toEqual(['/api/history?vendor_id=v1']);
  });

  it('opens a project’s history from the project page', async () => {
    const fetchMock = mockFetch({
      '/api/projects/p1': { id: 'p1', name: 'Lake House', status: 'ACTIVE', archived: false, links: [], schedules: [] },
      '/api/auth/me': { id: 'u1', name: 'Asha Admin', role: 'ADMINISTRATOR' },
      '/api/projects/p1/client-advances': { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] },
      '/api/projects/p1/timeline': { project: { id: 'p1', name: 'Lake House', archived: false }, items: [], archived_items: [], delays: [], coordination_issues: [] },
    });
    render(<ProjectDetail id="p1" />);
    const panel = await screen.findByRole('region', { name: 'Project history' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Show history' }));
    expect(historyCalls(fetchMock)).toEqual(['/api/history?project_id=p1']);
  });
});
