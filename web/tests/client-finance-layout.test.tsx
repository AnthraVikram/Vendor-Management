/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { ClientFinanceArea } from '../src/pages/client-finance/area';

// Feature 006 (T068, NFR-003): jsdom does not lay out CSS, so this checks what the 375, 768 and 1280 px layouts depend
// on, following phone-layout.test.tsx and visual-system.test.tsx: the forms collapse to one column, action rows wrap,
// every control is labelled, and every state is written in words, not shown by colour alone.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const anil = { id: 'u3', name: 'Anil Accountant' };
const data = {
  project: { id: 'p1', name: 'Lake House', client_name: null, archived: false },
  quotation: {
    id: 'q1', reference: 'Q-000001', title: 'Works', created_at: '2026-11-01T05:00:00.000Z', created_by: anil, newest_revision_number: 1,
    revisions: [{ id: 'r1', number: 1, amount: '1840000.00', previous_amount: null, quotation_date: '2026-11-01', validity_date: null, submitted_at: null, reason: null, note: null, status: 'UNDER_REVIEW', newest: true, status_changes: [], attachments: [], created_at: '2026-11-01T05:00:00.000Z', created_by: anil }],
  },
  approvals: [], purchase_orders: [], current_po: null, current_po_text: null,
  receipts: [{ id: 'c1', receipt_type: 'STAGE_PAYMENT', amount: '1000.00', received_on: '2026-11-10', payment_method: null, reference: null, note: null, state: 'SUBMITTED', entry_status: 'SUBMITTED', recorded_under: 'FEATURE_006', counted: false, link: null, decision: null, reversal: null, attachments: [], created_at: '2026-11-10T05:00:00.000Z', created_by: anil }],
  summary: { approved_amount: null, approved_revision_number: null, verified_receipts: '0.00', outstanding: null, overpaid: null, basis_text: null, not_available_reason: 'Not available: no approved amount', counted_receipt_ids: [] },
  pending_verification: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url === '/api/auth/me') return json(200, { id: 'u3', name: 'Anil', role: 'ACCOUNTANT' });
    if (url === '/api/projects/p1/client-finance') return json(200, data);
    return json(404, { message: 'Not found.' });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('client finance layout and accessibility', () => {
  it('collapses two-column forms at phone width and wraps action rows', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width: 700px)'));
    expect(phone).toMatch(/\.form-2col[^{]*\{[^}]*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/\.inline-actions\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.advance-main\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('labels every control and writes every state in words', async () => {
    render(<ClientFinanceArea projectId="p1" />);
    const area = await screen.findByRole('region', { name: 'Client finance' });
    await within(area).findByRole('list', { name: 'Receipts' });
    for (const control of within(area).queryAllByRole('textbox')) expect(control).toHaveAccessibleName();
    for (const control of within(area).queryAllByRole('combobox')) expect(control).toHaveAccessibleName();
    for (const button of within(area).getAllByRole('button')) expect(button).toHaveAccessibleName();
    const badges = Array.from(area.querySelectorAll('.status-badge')).map((badge) => badge.textContent?.trim());
    expect(badges).toEqual(expect.arrayContaining(['Under review', 'Awaiting verification']));
    for (const text of badges) expect(text).toBeTruthy();
  });
});
