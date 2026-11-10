import { FormEvent, useState } from 'react';
import { api } from '../api/client';

// `notice` says who Switch user just signed out (Feature 005 FR-032); it is held in memory, never stored.
export function SignIn({ onSignedIn, notice }: { onSignedIn: () => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">VM</span>
          <span>Vendor Management</span>
        </div>
        <div className="auth-heading">
          <h1>Sign in</h1>
          <p>Use your staff account to continue.</p>
        </div>
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        <form className="grid auth-form" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {error ? <p className="error form-error" role="alert">{error}</p> : null}
          <button type="submit">Sign in</button>
        </form>
        <p className="auth-foot">Access is for active staff. An administrator manages staff accounts.</p>
      </div>
    </main>
  );
}
