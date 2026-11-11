import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Feature 004 US7-1 to US7-4: the account block lives in a top-right profile menu on every page.
// Feature 005 US5 (T035, FR-030 to FR-032): the menu opens from an initials icon and offers Switch user.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

const asha = { id: 'u1', name: 'Asha Admin', email: 'asha@example.com', created_at: '2026-11-09T05:00:00.000Z' };
const anil = { id: 'u2', name: 'Anil Accountant', email: 'anil@example.com', role: 'ACCOUNTANT', created_at: '2026-10-01T05:00:00.000Z' };

// Signs Asha in with `role`; after a logout, the next sign-in is Anil. Vendor lists differ per person, so a test can
// tell whether a page still shows what the previous person loaded.
async function renderShell(role: string) {
  let signedIn: Record<string, unknown> | null = { ...asha, role };
  const fetchMock = vi.fn(async (input: RequestInfo, _init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/me') return signedIn ? json(200, signedIn) : json(401, { message: 'Sign in required.' });
    if (url === '/api/auth/logout') {
      signedIn = null;
      return json(204, {});
    }
    if (url === '/api/auth/login') {
      signedIn = anil;
      return json(200, anil);
    }
    if (url.startsWith('/api/vendors?')) {
      const name = signedIn?.id === 'u1' ? 'Asha Only Vendor' : 'Anil Only Vendor';
      return json(200, [{ id: 'v1', name, phone: '9000000001', archived: false, locations: [], availability: null, categories: [], project_count: 0 }]);
    }
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  window.location.hash = '/vendors';
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await act(async () => {
    await import('../src/main');
  });
  return fetchMock;
}

// Superseded (Feature 005 spec, Backward Compatibility): the name button became an initials icon named "Name, Role".
async function profileButton() {
  return screen.findByRole('button', { name: /^Asha Admin, / });
}

function logoutCalls(fetchMock: Awaited<ReturnType<typeof renderShell>>) {
  return fetchMock.mock.calls.filter((call) => String(call[0]) === '/api/auth/logout');
}

afterEach(() => vi.restoreAllMocks());

describe('profile menu (US7)', () => {
  it('opens from a top-right button with the person’s name and shows name, role, email, change password and Sign out', async () => {
    await renderShell('OFFICE_TEAM');
    const button = await profileButton();
    // The app's top bar, not a page header (jsdom gives page headers inside <main> the banner role too).
    expect(button.closest('header')).toHaveClass('topbar');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).not.toBeNull();
    const inPanel = within(panel);
    expect(inPanel.getByText('Asha Admin')).toBeInTheDocument();
    expect(inPanel.getByText('Office Team')).toBeInTheDocument();
    expect(inPanel.getByText('asha@example.com')).toBeInTheDocument();
    expect(inPanel.getByLabelText('Current password')).toBeInTheDocument();
    expect(inPanel.getByLabelText('New password')).toBeInTheDocument();
    expect(inPanel.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
    expect(inPanel.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', async () => {
    await renderShell('ACCOUNTANT');
    const button = await profileButton();
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(button).toHaveFocus();
  });

  // T048 observation O4: the button keeps focus while the menu is open, so its tooltip covered the menu. The open
  // menu is marked, and the stylesheet hides the tooltip under that mark (pinned in visual-system.test.tsx).
  it('marks the menu open so the tooltip hides, and unmarks it on Escape with focus kept on the button', async () => {
    await renderShell('ACCOUNTANT');
    const button = await profileButton();
    const menu = button.closest('.profile-menu')!;
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Asha Admin, Accountant');
    expect(menu).not.toHaveClass('is-open');
    await userEvent.click(button);
    expect(menu).toHaveClass('is-open');
    await userEvent.keyboard('{Escape}');
    expect(menu).not.toHaveClass('is-open');
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleDescription('Asha Admin, Accountant');
  });

  it('signs out through the existing logout call', async () => {
    const fetchMock = await renderShell('ADMINISTRATOR');
    await userEvent.click(await profileButton());
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const logout = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/auth/logout');
    expect(logout?.[1]).toMatchObject({ method: 'POST' });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it.each([
    ['ADMINISTRATOR', true],
    ['OFFICE_TEAM', false],
  ])('shows the Staff link to %s only when an administrator (%s)', async (role, shown) => {
    await renderShell(role);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Staff' }) !== null).toBe(shown);
  });
});

describe('profile icon (US5-1, US5-2, FR-030, FR-031)', () => {
  it('shows the initials, named and described by name and role', async () => {
    await renderShell('OFFICE_TEAM');
    const button = await screen.findByRole('button', { name: 'Asha Admin, Office Team' });
    expect(button).toHaveTextContent(/^AA$/);
    expect(button).toHaveAccessibleDescription('Asha Admin, Office Team');
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Asha Admin, Office Team');
  });

  it('shows when the account was created, and offers Switch user beside Sign out', async () => {
    await renderShell('OFFICE_TEAM');
    await userEvent.click(await profileButton());
    const panel = document.getElementById('profile-panel')!;
    expect(panel).toHaveTextContent('Account created 9 Nov 2026');
    expect(within(panel).getByRole('button', { name: 'Switch user' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('switching user (US5-3, US5-4, FR-032)', () => {
  it('asks first; Cancel keeps the person signed in', async () => {
    const fetchMock = await renderShell('OFFICE_TEAM');
    await userEvent.click(await profileButton());
    await userEvent.click(screen.getByRole('button', { name: 'Switch user' }));
    const dialog = screen.getByRole('dialog', { name: 'Switch user?' });
    expect(dialog).toHaveTextContent('Asha Admin will be signed out');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(logoutCalls(fetchMock)).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('signs out exactly as Sign out does, then says who was signed out', async () => {
    const fetchMock = await renderShell('OFFICE_TEAM');
    await userEvent.click(await profileButton());
    await userEvent.click(screen.getByRole('button', { name: 'Switch user' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch user' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(logoutCalls(fetchMock)).toHaveLength(1);
    expect(logoutCalls(fetchMock)[0][1]).toMatchObject({ method: 'POST' });
    expect(screen.getByText('Signed out Asha Admin. Sign in as another staff member.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('asks about unsaved changes first, including a half-typed password change', async () => {
    const fetchMock = await renderShell('OFFICE_TEAM');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(await profileButton());
    await userEvent.type(screen.getByLabelText('Current password'), 'old-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Switch user' }));
    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving them?');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logoutCalls(fetchMock)).toHaveLength(0);
  });

  it('shows the next person only their own role and freshly loaded pages', async () => {
    const fetchMock = await renderShell('ADMINISTRATOR');
    expect(await screen.findByRole('button', { name: 'Asha Only Vendor' })).toBeInTheDocument();
    await userEvent.click(await profileButton());
    await userEvent.click(screen.getByRole('button', { name: 'Switch user' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch user' }));
    await screen.findByRole('heading', { name: 'Sign in' });

    await userEvent.type(screen.getByLabelText('Email'), 'anil@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Anil Accountant, Accountant' })).toHaveTextContent('AA');
    expect(await screen.findByRole('button', { name: 'Anil Only Vendor' })).toBeInTheDocument();
    expect(screen.queryByText('Asha Only Vendor')).toBeNull();
    expect(screen.queryByText(/Signed out Asha Admin/)).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Staff' })).toBeNull();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).startsWith('/api/vendors?')).length).toBeGreaterThanOrEqual(2);
  });

  it('stores nothing in the browser while switching', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await renderShell('OFFICE_TEAM');
    await userEvent.click(await profileButton());
    await userEvent.click(screen.getByRole('button', { name: 'Switch user' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch user' }));
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() => expect(setItem).not.toHaveBeenCalled());
  });
});
