import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignIn } from '../src/pages/sign-in';

describe('sign in', () => {
  it('submits email and password', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: '1', name: 'Asha', email: 'admin@example.com', role: 'ADMINISTRATOR' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSignedIn = vi.fn();
    render(<SignIn onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(onSignedIn).toHaveBeenCalled();
  });
});
