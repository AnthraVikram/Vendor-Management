import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryPanel } from '../src/pages/history-panel';

// Feature 006 (T022): client-finance history actions read as words, show the record status after the event,
// and hide internal ids.
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin' };
const entry = (id: string, action: string, details: Record<string, unknown>) => ({ id, action, changes: {}, details, created_at: '2026-11-18T05:00:00.000Z', created_by: asha });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json(200, {
        record: { created_at: '2026-11-18T04:00:00.000Z', created_by: asha, updated_at: '2026-11-18T04:00:00.000Z', updated_by: asha },
        entries: [
          entry('h1', 'REVISION_ADDED', { revision_id: 'r2', revision_number: 2, reason: 'Scope grew', record_status: 'DRAFT' }),
          entry('h2', 'STATUS_CHANGED', { revision_id: 'r2', revision_number: 2, from: 'DRAFT', to: 'SUBMITTED', record_status: 'SUBMITTED' }),
          entry('h3', 'APPROVED', { approval_id: 'a1', revision_number: 2, record_status: 'APPROVED' }),
          entry('h4', 'VERIFIED', { receipt_id: 'c1', record_status: 'VERIFIED' }),
          entry('h5', 'WARNING_CONFIRMED', { warning: 'OVERPAYMENT', record_status: 'VERIFIED' }),
          entry('h6', 'ATTACHED', { attachment_id: 'f1', document_id: 'd1', document_title: 'PO copy', record_status: 'SUBMITTED' }),
          entry('h7', 'ATTACHMENT_REMOVED', { attachment_id: 'f1', document_id: 'd1', document_title: 'PO copy', reason: 'Wrong file', record_status: 'SUBMITTED' }),
          entry('h8', 'SUPERSEDED', { attachment_id: 'f2', supersedes_attachment_id: 'f1', document_title: 'Corrected', record_status: 'APPROVED' }),
          entry('h9', 'CANCELLED', { purchase_order_id: 'p1', reason: 'Replaced', record_status: 'CANCELLED' }),
          entry('h10', 'REJECTED', { receipt_id: 'c2', reason: 'No proof', record_status: 'REJECTED' }),
          entry('h11', 'WITHDRAWN', { receipt_id: 'c3', reason: 'Typed twice', record_status: 'WITHDRAWN' }),
        ],
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client finance history labels', () => {
  it('names every new action, shows the status after the event and hides internal ids', async () => {
    render(<HistoryPanel target="client_quotation_id" id="q1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show history' }));
    const items = within(await screen.findByRole('list', { name: 'History entries' })).getAllByRole('listitem');
    const text = items.map((item) => item.textContent ?? '');
    expect(text[0]).toContain('Revision added');
    expect(text[0]).toContain('Status: Draft');
    expect(text[1]).toContain('Status changed');
    expect(text[2]).toContain('Approved');
    expect(text[3]).toContain('Verified');
    expect(text[4]).toContain('Warning confirmed');
    expect(text[5]).toContain('Document attached');
    expect(text[5]).toContain('Document: PO copy');
    expect(text[6]).toContain('Attachment removed');
    expect(text[7]).toContain('Attachment superseded');
    expect(text[8]).toContain('Cancelled');
    expect(text[9]).toContain('Rejected');
    expect(text[10]).toContain('Withdrawn');
    for (const line of text) expect(line).not.toMatch(/\b(f1|f2|d1|r2|a1|c1|p1)\b/);
  });
});
