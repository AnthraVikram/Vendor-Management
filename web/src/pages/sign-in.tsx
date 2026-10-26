import { FormEvent, useState } from 'react';
import { api } from '../api/client';

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
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
    <main className="shell">
      <h1>Sign in</h1>
      <form className="card grid" onSubmit={submit}>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
