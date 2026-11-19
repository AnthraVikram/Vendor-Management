import { render, screen, within } from '@testing-library/react';
import { Dashboard } from '../src/pages/dashboard';

// Feature 006 (T059): client-finance lines in the dashboard's Recent activity (FR-039, research R6). New file; the
// Feature 003 and 005 assertions in dashboard-overview.test.tsx stay unchanged.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin' };
const at = '2026-11-18T05:00:00.000Z';
const lake = { id: 'p1', name: 'Lake House' };
const entries = [
  { id: 'h1', action: 'CREATED', target: { kind: 'client_advance', ...lake }, changes: {}, details: { amount: '50000.00', received_on: '2026-11-17' }, created_at: at, created_by: asha },
  { id: 'h2', action: 'VERIFIED', target: { kind: 'client_advance', ...lake }, status: 'VERIFIED', changes: {}, details: { record_status: 'VERIFIED' }, created_at: at, created_by: asha },
  { id: 'h3', action: 'REVERSED', target: { kind: 'client_receipt', ...lake }, status: 'REVERSED', changes: {}, details: { reason: 'Bounced', record_status: 'REVERSED' }, created_at: at, created_by: asha },
  { id: 'h4', action: 'STATUS_CHANGED', target: { kind: 'client_quotation', ...lake }, status: 'UNDER_REVIEW', changes: {}, details: { revision_number: 2, record_status: 'UNDER_REVIEW' }, created_at: at, created_by: asha },
  { id: 'h5', action: 'WARNING_CONFIRMED', target: { kind: 'client_purchase_order', ...lake }, status: 'SUBMITTED', changes: {}, details: { warning: 'PENDING_REVISION', record_status: 'SUBMITTED' }, created_at: at, created_by: asha },
  { id: 'h6', action: 'ATTACHED', target: { kind: 'client_quotation', ...lake }, status: 'APPROVED', changes: {}, details: { document_title: 'Signed quotation', record_status: 'APPROVED' }, created_at: at, created_by: asha },
];
const overview = {
  counts: { vendors_all: 0, vendors_archived: 0, projects_not_archived: 1, projects_in_progress: 0, projects_archived: 0 },
  progress: [],
  recently_updated: [],
  recent_activity: entries,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === '/api/dashboard/summary') return json(200, { vendors: { active: 0 }, projects: { PLANNED: 0, ACTIVE: 1, ON_HOLD: 0, COMPLETED: 0 }, projects_archived: 0 });
    if (url === '/api/dashboard/overview') return json(200, overview);
    if (url === '/api/dashboard') return json(200, { today: '2026-11-18', items: [], attention_projects: [], overdue: [], due_soon: [], missing_update: [], recent_delays_and_issues: [] });
    return json(200, []);
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('client finance in Recent activity', () => {
  it('keeps the Feature 003 advance line as it is and adds a status to every Feature 006 line, with no amounts', async () => {
    render(<Dashboard />);
    const panel = (await screen.findByRole('heading', { name: 'Recent activity' })).closest('section')!;
    const items = within(panel).getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(items[0]).toBe('Created: Client advance on Lake HouseAsha Admin18 Nov 2026, 10:30');
    expect(items[1]).toContain('Verified: Client advance on Lake House · Verified');
    expect(items[2]).toContain('Reversed: Client receipt on Lake House · Reversed');
    expect(items[3]).toContain('Status changed: Client quotation on Lake House · Under review');
    expect(items[4]).toContain('Warning confirmed: Client purchase order on Lake House · Awaiting verification');
    expect(items[5]).toContain('Document attached: Client quotation on Lake House · Approved');
    for (const item of items) expect(item).not.toMatch(/₹|\d+\.\d{2}/);
  });
});
