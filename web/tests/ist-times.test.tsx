import { render, screen, within } from '@testing-library/react';
import { AdvancesSection } from '../src/pages/advances-section';
import { DocumentsSection } from '../src/pages/documents-section';
import { VendorImports } from '../src/pages/vendor-imports';
import { VendorDetail } from '../src/pages/vendor-detail';

// T070–T072: times recorded are shown in India Standard Time. 19:00 UTC on 29 October is 00:30 IST on
// 30 October, so a UTC calendar date would show the wrong day.
const NEAR_MIDNIGHT = '2026-10-29T19:00:00.000Z';
const IST = '2026-10-30 00:30 IST';

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}
function routes(map: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => json(200, map[String(input)] ?? [])));
}
const anil = { id: 'u3', name: 'Anil Accountant' };

describe('recorded times in India Standard Time', () => {
  it('shows when an advance and its reversal were recorded (FR-021, US1-1, US1-4, SC-008)', async () => {
    routes({
      '/api/auth/me': { id: 'u2', name: 'Omar Office', role: 'OFFICE_TEAM' },
      '/api/projects/p1/client-advances': {
        project: { id: 'p1', name: 'Lake House', client_name: null, archived: false },
        net_amount: '0.00',
        advances: [{
          id: 'a1', amount: '50000.00', received_on: '2026-10-29', payment_method: null, reference: null, note: null,
          created_at: NEAR_MIDNIGHT, created_by: anil,
          reversal: { id: 'r1', amount: '50000.00', reason: 'Wrong project.', created_at: '2026-10-30T20:15:00.000Z', created_by: anil },
        }],
      },
    });
    render(<AdvancesSection projectId="p1" />);
    const item = within(await screen.findByRole('list', { name: 'Advances' })).getByRole('listitem');
    expect(item).toHaveTextContent(`Recorded by Anil Accountant · ${IST}`);
    expect(item).toHaveTextContent('by Anil Accountant · 2026-10-31 01:45 IST · Reason: Wrong project.');
    // 2026-10-29 is the date received; the recorded line must not fall back to the UTC day.
    expect(item).not.toHaveTextContent('Recorded by Anil Accountant · 2026-10-29');
  });

  it("shows a document's upload time (US3-1)", async () => {
    routes({
      '/api/vendors/v1/documents': [{
        id: 'd1', vendor_id: 'v1', project_id: null, title: 'Agreement', document_type: 'AGREEMENT', note: null, original_filename: 'a.pdf',
        media_type: 'application/pdf', byte_size: 100, archived: false, created_at: NEAR_MIDNIGHT, created_by: { id: 'u1', name: 'Asha Admin' },
      }],
    });
    render(<DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />);
    const item = within(await screen.findByRole('list', { name: 'Documents' })).getByRole('listitem');
    expect(item).toHaveTextContent(`Uploaded by Asha Admin · ${IST}`);
  });

  it('shows when an import ran, in the history list and the run (FR-010, US2-9)', async () => {
    const run = { id: 'r1', file_name: 'late.csv', created_at: NEAR_MIDNIGHT, created_by: { id: 'u2', name: 'Omar Office' }, imported_count: 1, skipped_count: 0, rejected_count: 0 };
    routes({ '/api/vendor-imports': [run], '/api/vendor-imports/r1': { run, rows: [] } });
    render(<VendorImports runId="r1" />);
    const table = await screen.findByRole('table', { name: 'Import runs' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(IST);
    expect(await screen.findByText(new RegExp(`Imported by Omar Office on ${IST}`))).toBeInTheDocument();
  });

  it("dates a vendor's import by the IST day", async () => {
    routes({
      '/api/vendors/v1': {
        id: 'v1', name: 'Late Vendor', phone: '9', archived: false, availability: null, rates: [], notes: [], current_rating: null,
        import_run: { id: 'r1', file_name: 'late.csv', created_at: NEAR_MIDNIGHT },
      },
    });
    render(<VendorDetail id="v1" />);
    expect(await screen.findByRole('link', { name: 'Imported in late.csv on 2026-10-30' })).toHaveAttribute('href', '#/vendor-imports?run=r1');
  });
});
