import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';

interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  revoked: boolean;
}

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OFFICE_TEAM');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<Staff[]>('/api/staff').then(setStaff).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load staff');
    });
  }

  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/staff', { method: 'POST', body: JSON.stringify({ name, email, role, password }) });
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the account');
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/staff/${id}`, { method: 'PATCH', body: JSON.stringify({ revoked: true }) });
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke the account');
    }
  }

  return (
    <section className="grid">
      <h1>Staff</h1>
      <p>The server refuses this page's actions for anyone who is not an administrator.</p>
      <form className="card grid" onSubmit={create}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="ADMINISTRATOR">Administrator</option>
            <option value="OFFICE_TEAM">Office Team</option>
            <option value="ACCOUNTANT">Accountant</option>
          </select>
        </label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button type="submit">Create account</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {staff.map((person) => (
        <article className="card" key={person.id}>
          <p>{person.name} · {person.email} · {person.role} {person.revoked ? '(revoked)' : ''}</p>
          {!person.revoked ? <button type="button" className="secondary" onClick={() => revoke(person.id)}>Revoke</button> : null}
        </article>
      ))}
    </section>
  );
}
