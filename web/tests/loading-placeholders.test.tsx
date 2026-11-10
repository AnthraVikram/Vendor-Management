import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AdvancesSection } from '../src/pages/advances-section';
import { ClientAdvances } from '../src/pages/client-advances';
import { DocumentsSection } from '../src/pages/documents-section';
import { StaffPage } from '../src/pages/staff';
import { VendorImports } from '../src/pages/vendor-imports';

// Feature 005 FR-039 (US7-3): pages and sections that showed nothing, or an empty "0 accounts", while their data
// loaded now show placeholder rows; empty states and error messages are unchanged.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const advances = { project: { id: 'p1', name: 'Lake House', client_name: null, archived: false }, net_amount: '0.00', advances: [] };
const run = { id: 'r1', file_name: 'vendors.xlsx', created_at: '2026-10-29T05:00:00.000Z', created_by: { id: 'u1', name: 'Asha Admin' }, imported_count: 1, skipped_count: 0, rejected_count: 0 };

// Every case: the component, its placeholder's name, what one URL answers when loaded, and the empty state it then shows.
const CASES: [string, () => ReactElement, string, Record<string, unknown>, string][] = [
  ['client advances page', () => <ClientAdvances scope="all" />, 'Loading client advances', { '/api/client-advances?scope=all': [] }, 'No client advances to show.'],
  ['import history', () => <VendorImports />, 'Loading import history', { '/api/vendor-imports': [] }, 'No imports yet.'],
  ['documents section', () => <DocumentsSection parent="vendors" parentId="v1" parentArchived={false} />, 'Loading documents', { '/api/vendors/v1/documents': [] }, 'No documents yet.'],
  ['advances section', () => <AdvancesSection projectId="p1" />, 'Loading client advances', { '/api/projects/p1/client-advances': advances, '/api/auth/me': { role: 'ADMINISTRATOR' } }, 'No client advances recorded yet.'],
];

afterEach(() => vi.restoreAllMocks());

describe('loading placeholders (FR-039)', () => {
  it.each(CASES)('the %s shows placeholder rows while it loads, then its empty state', async (_name, page, label, answers, empty) => {
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      await gate;
      const url = String(input);
      return json(200, url in answers ? answers[url] : []);
    }));
    render(page());
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(empty)).toBeNull();

    release();
    expect(await screen.findByText(empty)).toBeInTheDocument();
    expect(screen.queryByLabelText(label)).toBeNull();
  });

  it.each(CASES)('the %s keeps its error message instead of the placeholder when loading fails', async (_name, page, label) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { message: 'boom' })));
    render(page());
    expect(await screen.findByText('The action did not complete. Please try again.')).toBeInTheDocument();
    expect(screen.queryByLabelText(label)).toBeNull();
  });

  it('the staff page shows placeholder rows, not "0 active", until the accounts arrive', async () => {
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const person = { id: 'u1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR', revoked: false };
    vi.stubGlobal('fetch', vi.fn(async () => {
      await gate;
      return json(200, [person]);
    }));
    render(<StaffPage currentUserId="u1" />);
    expect(screen.getByLabelText('Loading staff')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/0 active/)).toBeNull();

    release();
    expect(await screen.findByText('1 active · 0 revoked')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading staff')).toBeNull();
  });

  it('the staff page keeps its error message instead of the placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { message: 'Administrators only.', code: 'ROLE_NOT_ALLOWED' })));
    render(<StaffPage currentUserId="u1" />);
    expect(await screen.findByText('You are not allowed to do this.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading staff')).toBeNull();
    expect(screen.queryByText(/active ·/)).toBeNull();
  });

  it('an opened import run shows placeholder rows until its rows arrive', async () => {
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      if (String(input) === '/api/vendor-imports') return json(200, [run]);
      await gate;
      return json(200, { run, rows: [] });
    }));
    render(<VendorImports runId="r1" />);
    expect(await screen.findByRole('table', { name: 'Import runs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Loading import run')).toHaveAttribute('aria-busy', 'true');

    release();
    expect(await screen.findByRole('region', { name: 'Import run' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('Loading import run')).toBeNull());
  });
});
