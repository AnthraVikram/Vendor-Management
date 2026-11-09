import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Feature 004 US7-1 to US7-4: the account block lives in a top-right profile menu on every page.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

async function renderShell(role: string) {
  const fetchMock = vi.fn(async (input: RequestInfo, _init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/me') return json(200, { id: 'u1', name: 'Asha Admin', email: 'asha@example.com', role });
    if (url === '/api/auth/logout') return json(204, {});
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

describe('profile menu (US7)', () => {
  it('opens from a top-right button with the person’s name and shows name, role, email, change password and Sign out', async () => {
    await renderShell('OFFICE_TEAM');
    const button = await screen.findByRole('button', { name: 'Asha Admin' });
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
    const button = await screen.findByRole('button', { name: 'Asha Admin' });
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('signs out through the existing logout call', async () => {
    const fetchMock = await renderShell('ADMINISTRATOR');
    await userEvent.click(await screen.findByRole('button', { name: 'Asha Admin' }));
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
