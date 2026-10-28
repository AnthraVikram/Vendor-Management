import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';

interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  revoked: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATOR: 'Administrator',
  OFFICE_TEAM: 'Office Team',
  ACCOUNTANT: 'Accountant',
};

export function StaffPage({ currentUserId }: { currentUserId: string }) {
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

  async function update(id: string, body: Record<string, unknown>, failure: string): Promise<boolean> {
    setError('');
    try {
      await api(`/api/staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : failure);
      return false;
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
        <StaffRow key={person.id} person={person} own={person.id === currentUserId} update={update} />
      ))}
    </section>
  );
}

function StaffRow({
  person,
  own,
  update,
}: {
  person: Staff;
  own: boolean;
  update: (id: string, body: Record<string, unknown>, failure: string) => Promise<boolean>;
}) {
  const [role, setRole] = useState(person.role);
  const [newPassword, setNewPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    await update(person.id, { role }, 'Could not change the role');
  }

  async function setPassword(event: FormEvent) {
    event.preventDefault();
    if (await update(person.id, { password: newPassword }, 'Could not set the password')) setNewPassword('');
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    const body = restorePassword ? { revoked: false, password: restorePassword } : { revoked: false };
    if (await update(person.id, body, 'Could not restore the account')) setRestorePassword('');
  }

  return (
    <article className="card">
      <p>
        <strong>{person.name}</strong> · {person.email} · <span>Role: {ROLE_LABELS[person.role] ?? person.role}</span> ·{' '}
        <span>{person.revoked ? 'Revoked' : 'Active'}</span>
      </p>
      {!person.revoked ? (
        <button type="button" className="secondary" onClick={() => update(person.id, { revoked: true }, 'Could not revoke the account')}>
          Revoke
        </button>
      ) : (
        <form className="row" onSubmit={restore}>
          <label>
            New password (optional)
            <input
              type="password"
              aria-label={`Password on restore for ${person.name}`}
              value={restorePassword}
              onChange={(event) => setRestorePassword(event.target.value)}
            />
          </label>
          <button type="submit">Restore</button>
        </form>
      )}
      {!own ? (
        <form className="row" onSubmit={saveRole}>
          <label>
            Role
            <select aria-label={`Role for ${person.name}`} value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="ADMINISTRATOR">Administrator</option>
              <option value="OFFICE_TEAM">Office Team</option>
              <option value="ACCOUNTANT">Accountant</option>
            </select>
          </label>
          <button type="submit">Save role</button>
        </form>
      ) : null}
      {!own && !person.revoked ? (
        <form className="row" onSubmit={setPassword}>
          <label>
            New password
            <input
              type="password"
              aria-label={`New password for ${person.name}`}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <button type="submit">Set password</button>
        </form>
      ) : null}
    </article>
  );
}
