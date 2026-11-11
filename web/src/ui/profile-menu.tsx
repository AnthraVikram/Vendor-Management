import { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../time';
import { ConfirmDialog } from './confirm-dialog';
import { Tooltip } from './tooltip';
import { canLeave, useUnsavedGuard } from './unsaved-guard';

// Feature 005 US5: the top-right profile icon and its menu (FR-030 to FR-032). Switching user signs the person out
// exactly as Sign out does; nothing about either person is stored in the browser.

export interface Me { id: string; name: string; email: string; role: string; created_at?: string }

export const ROLE_NAMES: Record<string, string> = { ADMINISTRATOR: 'Administrator', OFFICE_TEAM: 'Office Team', ACCOUNTANT: 'Accountant' };

// First letters of the first two words of the name (FR-030).
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');
}

export function ProfileMenu({ me, onSignedOut }: { me: Me; onSignedOut: (switchedFrom?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const roleName = ROLE_NAMES[me.role] ?? me.role;
  const label = `${me.name}, ${roleName}`;
  useUnsavedGuard(currentPassword !== '' || newPassword !== '');

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordMessage('');
    try {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Password changed.');
    } catch (caught) {
      setPasswordMessage(caught instanceof Error ? caught.message : 'Could not change the password');
    }
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open || confirmSwitch) return;
    setOpen(false);
    button.current?.focus();
  }

  async function signOut(switching: boolean) {
    await api('/api/auth/logout', { method: 'POST' });
    onSignedOut(switching ? me.name : undefined);
  }

  return (
    <div className={`profile-menu${open ? ' is-open' : ''}`} onKeyDown={closeOnEscape}>
      <Tooltip label={label}>
        <button
          type="button"
          ref={button}
          className="profile-button"
          aria-label={label}
          aria-expanded={open}
          aria-controls="profile-panel"
          onClick={() => setOpen(!open)}
        >
          {initials(me.name)}
        </button>
      </Tooltip>
      {open ? (
        <div id="profile-panel" className="profile-panel">
          <div className="account-who">
            <strong>{me.name}</strong>
            <span>{roleName}</span>
            <span>{me.email}</span>
            {me.created_at ? <span>Account created {formatDate(me.created_at)}</span> : null}
          </div>
          <form className="account-panel" onSubmit={changePassword}>
            <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <button type="submit">Change password</button>
            {passwordMessage ? <p role="status">{passwordMessage}</p> : null}
          </form>
          <div className="account-actions">
            <button type="button" className="secondary" onClick={() => canLeave() && setConfirmSwitch(true)}>Switch user</button>
            <button type="button" className="secondary" onClick={() => canLeave() && signOut(false)}>Sign out</button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmSwitch}
        title="Switch user?"
        message={`${me.name} will be signed out, exactly as with Sign out. The next person signs in with their own email and password.`}
        confirmLabel="Switch user"
        onCancel={() => setConfirmSwitch(false)}
        onConfirm={() => {
          setConfirmSwitch(false);
          signOut(true);
        }}
      />
    </div>
  );
}
