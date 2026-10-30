import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const user = { id: '1', name: 'Asha Admin', email: 'admin@example.com', role: 'ADMINISTRATOR' };

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('app shell', () => {
  it('moves from sign-in to the signed-in app and back on sign-out', async () => {
    let signedIn = false;
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url === '/api/auth/me') return signedIn ? json(200, user) : json(401, { message: 'Sign in required.' });
      if (url === '/api/auth/login') {
        signedIn = true;
        return json(200, user);
      }
      if (url === '/api/auth/logout') {
        signedIn = false;
        return json(200, {});
      }
      return json(200, []);
    });
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi.spyOn(console, 'error');

    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      await import('../src/main');
    });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // The change-password form sits behind the Account button in the app shell.
    const account = await screen.findByRole('button', { name: 'Account' });
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    await userEvent.click(account);
    expect(account).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByText('Asha Admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vendors' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    const logged = consoleError.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toMatch(/Rendered (more|fewer) hooks|change in the order of Hooks/);
  });
});
