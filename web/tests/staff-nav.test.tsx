import { act, screen, within } from '@testing-library/react';

// The Staff link appears only for administrators. The server refuses staff management for every other role;
// this only stops offering them a page they cannot use.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: { get: () => 'application/json' }, json: async () => body };
}

async function renderAppAs(role: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) =>
      String(input) === '/api/auth/me' ? json(200, { id: 'u1', name: 'Signed In', email: 'person@example.com', role }) : json(200, []),
    ),
  );
  window.location.hash = '/vendors';
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await act(async () => {
    await import('../src/main');
  });
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  return within(nav).getAllByRole('link').map((link) => link.textContent);
}

describe('main navigation by role', () => {
  it('shows the Staff link to an administrator', async () => {
    expect(await renderAppAs('ADMINISTRATOR')).toEqual(['Dashboard', 'Vendors', 'Projects', 'Staff']);
  });

  it.each(['OFFICE_TEAM', 'ACCOUNTANT'])('hides the Staff link from %s', async (role) => {
    expect(await renderAppAs(role)).toEqual(['Dashboard', 'Vendors', 'Projects']);
  });
});
