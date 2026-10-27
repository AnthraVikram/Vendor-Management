import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffPage } from '../src/pages/staff';

const people = [
  { id: 'u1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR', revoked: false },
  { id: 'u2', name: 'Omar Office', email: 'office@example.com', role: 'OFFICE_TEAM', revoked: false },
  { id: 'u3', name: 'Ravi Accounts', email: 'accounts@example.com', role: 'ACCOUNTANT', revoked: true },
];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body };
}

function mockFetch(patchStatus = 200, patchBody: unknown = {}) {
  const fetchMock = vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
    if (init?.method === 'PATCH') return json(patchStatus, patchBody);
    return json(200, people);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function patches(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    .map((call) => ({ url: String(call[0]), body: JSON.parse(String((call[1] as RequestInit).body)) }));
}

function getCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter((call) => !(call[1] as RequestInit | undefined)?.method).length;
}

async function row(name: string) {
  const heading = await screen.findByText(name);
  return heading.closest('article') as HTMLElement;
}

describe('staff page', () => {
  it('shows readable roles and status, and no role control on the caller\'s own row', async () => {
    mockFetch();
    render(<StaffPage currentUserId="u1" />);
    const own = await row('Asha Admin');
    expect(within(own).getByText('Role: Administrator')).toBeInTheDocument();
    expect(within(own).getByText('Active')).toBeInTheDocument();
    expect(within(own).queryByRole('combobox', { name: /role for/i })).toBeNull();
    const office = await row('Omar Office');
    expect(within(office).getByText('Role: Office Team')).toBeInTheDocument();
    expect(within(office).getByRole('combobox', { name: 'Role for Omar Office' })).toBeInTheDocument();
    const revoked = await row('Ravi Accounts');
    expect(within(revoked).getByText('Role: Accountant')).toBeInTheDocument();
    expect(within(revoked).getByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByText('OFFICE_TEAM')).toBeNull();
  });

  it('changes another person\'s role and reloads the list', async () => {
    const fetchMock = mockFetch();
    render(<StaffPage currentUserId="u1" />);
    const office = await row('Omar Office');
    await userEvent.selectOptions(within(office).getByRole('combobox', { name: 'Role for Omar Office' }), 'ACCOUNTANT');
    await userEvent.click(within(office).getByRole('button', { name: 'Save role' }));
    expect(patches(fetchMock)).toEqual([{ url: '/api/staff/u2', body: { role: 'ACCOUNTANT' } }]);
    expect(getCalls(fetchMock)).toBeGreaterThan(1);
  });

  it('sets another person\'s password', async () => {
    const fetchMock = mockFetch();
    render(<StaffPage currentUserId="u1" />);
    const office = await row('Omar Office');
    await userEvent.type(within(office).getByLabelText('New password for Omar Office'), 'newpass12');
    await userEvent.click(within(office).getByRole('button', { name: 'Set password' }));
    expect(patches(fetchMock)).toEqual([{ url: '/api/staff/u2', body: { password: 'newpass12' } }]);
  });

  it('restores a revoked account, with and without a new password', async () => {
    const fetchMock = mockFetch();
    render(<StaffPage currentUserId="u1" />);
    let revoked = await row('Ravi Accounts');
    await userEvent.click(within(revoked).getByRole('button', { name: 'Restore' }));
    revoked = await row('Ravi Accounts');
    await userEvent.type(within(revoked).getByLabelText('Password on restore for Ravi Accounts'), 'backagain1');
    await userEvent.click(within(revoked).getByRole('button', { name: 'Restore' }));
    expect(patches(fetchMock)).toEqual([
      { url: '/api/staff/u3', body: { revoked: false } },
      { url: '/api/staff/u3', body: { revoked: false, password: 'backagain1' } },
    ]);
  });

  it('shows the API error message when a change is refused', async () => {
    mockFetch(409, { code: 'LAST_ADMINISTRATOR', message: 'The firm must keep one active administrator.' });
    render(<StaffPage currentUserId="u1" />);
    const office = await row('Omar Office');
    await userEvent.selectOptions(within(office).getByRole('combobox', { name: 'Role for Omar Office' }), 'ACCOUNTANT');
    await userEvent.click(within(office).getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText('The firm must keep one active administrator.')).toBeInTheDocument();
  });
});
