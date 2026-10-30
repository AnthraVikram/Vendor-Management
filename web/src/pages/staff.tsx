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

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');
}

type Update = (id: string, body: Record<string, unknown>, failure: string, success: string) => Promise<boolean>;

export function StaffPage({ currentUserId }: { currentUserId: string }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OFFICE_TEAM');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function load() {
    api<Staff[]>('/api/staff').then(setStaff).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load staff');
    });
  }

  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/api/staff', { method: 'POST', body: JSON.stringify({ name, email, role, password }) });
      setNotice(`Account created for ${name}.`);
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the account');
    }
  }

  const update: Update = async (id, body, failure, success) => {
    setError('');
    setNotice('');
    try {
      await api(`/api/staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setNotice(success);
      load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : failure);
      return false;
    }
  };

  const active = staff.filter((person) => !person.revoked).length;
  return (
    <section className="grid staff-page">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Administration</p>
          <h1>Staff</h1>
          <p className="page-subtitle">The server refuses this page's actions for anyone who is not an administrator.</p>
        </div>
      </header>

      <form className="card form-2col" onSubmit={create} aria-label="Create an account">
        <h2 className="span-2">Create an account</h2>
        <label>Name<input autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Email<input inputMode="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="ADMINISTRATOR">Administrator</option>
            <option value="OFFICE_TEAM">Office Team</option>
            <option value="ACCOUNTANT">Accountant</option>
          </select>
        </label>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <div className="form-actions">
          <button type="submit">Create account</button>
        </div>
      </form>

      {/* Outcomes of the actions below, announced to screen readers. */}
      <div aria-live="polite">{notice ? <p className="success-message" role="status">{notice}</p> : null}</div>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}

      {/* When the list itself was refused, an empty "0 accounts" section would read as if the firm had none. */}
      {staff.length > 0 || !error ? <div className="section">
        <div className="section-heading">
          <div>
            <h2>Accounts</h2>
            <span className="count-badge">{staff.length}</span>
          </div>
          <p>{active} active · {staff.length - active} revoked</p>
        </div>
        <div className="staff-list">
          {staff.map((person) => (
            <StaffRow key={person.id} person={person} own={person.id === currentUserId} update={update} />
          ))}
        </div>
      </div> : null}
    </section>
  );
}

function StaffRow({ person, own, update }: { person: Staff; own: boolean; update: Update }) {
  const [role, setRole] = useState(person.role);
  const [newPassword, setNewPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const roleLabel = ROLE_LABELS[person.role] ?? person.role;

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    await update(person.id, { role }, 'Could not change the role', `${person.name} is now ${ROLE_LABELS[role] ?? role}.`);
  }

  async function setPassword(event: FormEvent) {
    event.preventDefault();
    if (await update(person.id, { password: newPassword }, 'Could not set the password', `New password set for ${person.name}.`)) setNewPassword('');
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    const body = restorePassword ? { revoked: false, password: restorePassword } : { revoked: false };
    if (await update(person.id, body, 'Could not restore the account', `${person.name}'s account is restored.`)) setRestorePassword('');
  }

  return (
    <article className={`card staff-card${person.revoked ? ' is-revoked' : ''}`}>
      <div className="staff-head">
        <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
        <div className="staff-who">
          <h3>{person.name}{own ? <span className="you-tag"> (you)</span> : null}</h3>
          <p className="meta">{person.email}</p>
        </div>
        <div className="staff-badges">
          <span className="role-badge">Role: {roleLabel}</span>
          <span className={`status-badge ${person.revoked ? 'status-revoked' : 'status-active'}`}>{person.revoked ? 'Revoked' : 'Active'}</span>
        </div>
      </div>
      <div className="staff-manage">
        {!own ? (
          <form className="inline-form" onSubmit={saveRole}>
            <label>
              Role
              <select aria-label={`Role for ${person.name}`} value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="ADMINISTRATOR">Administrator</option>
                <option value="OFFICE_TEAM">Office Team</option>
                <option value="ACCOUNTANT">Accountant</option>
              </select>
            </label>
            <button type="submit" className="secondary">Save role</button>
          </form>
        ) : null}
        {!own && !person.revoked ? (
          <form className="inline-form" onSubmit={setPassword}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                aria-label={`New password for ${person.name}`}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <button type="submit" className="secondary">Set password</button>
          </form>
        ) : null}
        {person.revoked ? (
          <form className="inline-form" onSubmit={restore}>
            <label>
              Password on restore (optional)
              <input
                type="password"
                autoComplete="new-password"
                aria-label={`Password on restore for ${person.name}`}
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
              />
            </label>
            <button type="submit">Restore</button>
          </form>
        ) : null}
      </div>
      {!person.revoked ? (
        <div className="staff-actions">
          <button
            type="button"
            className="danger small"
            onClick={() => update(person.id, { revoked: true }, 'Could not revoke the account', `${person.name}'s account is revoked.`)}
          >
            Revoke
          </button>
        </div>
      ) : null}
    </article>
  );
}
