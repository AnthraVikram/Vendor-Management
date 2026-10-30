import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api/client';
import { SignIn } from './pages/sign-in';
import { Vendors } from './pages/vendors';
import { VendorDetail } from './pages/vendor-detail';
import { Projects } from './pages/projects';
import { ProjectDetail } from './pages/project-detail';
import { StaffPage } from './pages/staff';
import { Dashboard } from './pages/dashboard';
import { VendorImport } from './pages/vendor-import';
import { VendorImports } from './pages/vendor-imports';
import { ClientAdvances } from './pages/client-advances';
import './styles.css';

interface Me { id: string; name: string; role: string }

function pathOf(): string {
  return window.location.hash.replace(/^#/, '') || '/vendors';
}

const ROLE_NAMES: Record<string, string> = { ADMINISTRATOR: 'Administrator', OFFICE_TEAM: 'Office Team', ACCOUNTANT: 'Accountant' };

// The main navigation; each link is marked current for the paths that belong to its section.
// Staff is offered only to administrators. The server enforces this; hiding the link only stops
// showing other roles a page whose every action they would be refused.
const SECTIONS: { href: string; label: string; owns: string[]; adminOnly?: boolean }[] = [
  { href: '#/dashboard', label: 'Dashboard', owns: ['/dashboard', '/client-advances'] },
  { href: '#/vendors', label: 'Vendors', owns: ['/vendors', '/vendor-imports'] },
  { href: '#/projects', label: 'Projects', owns: ['/projects'] },
  { href: '#/staff', label: 'Staff', owns: ['/staff'], adminOnly: true },
];

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState(pathOf());
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    api<Me>('/api/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setReady(true));
    const onHash = () => setPath(pathOf());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!ready) return <p className="shell">Loading</p>;
  if (!me) return <SignIn onSignedIn={() => api<Me>('/api/auth/me').then(setMe)} />;

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

  // '/vendors/import' is the import page, not a vendor id.
  const vendorId = path.startsWith('/vendors/') && path !== '/vendors/import' ? path.slice('/vendors/'.length) : '';
  const [projectPath, projectQuery = ''] = path.split('?');
  const projectId = projectPath.startsWith('/projects/') ? projectPath.slice('/projects/'.length) : '';
  const focusItemId = new URLSearchParams(projectQuery).get('item') ?? undefined;
  const importRunId = new URLSearchParams(projectQuery).get('run') ?? undefined;
  const projectStatus = new URLSearchParams(projectQuery).get('status') ?? undefined;
  const advanceScope = new URLSearchParams(projectQuery).get('scope') === 'month' ? 'month' : 'all';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">VM</span>
          <span>Vendor Management</span>
        </div>
        <nav className="main-nav" aria-label="Main">
          {SECTIONS.filter((section) => !section.adminOnly || me.role === 'ADMINISTRATOR').map((section) => (
            <a
              key={section.href}
              href={section.href}
              aria-current={section.owns.some((owned) => projectPath === owned || projectPath.startsWith(`${owned}/`)) ? 'page' : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="account">
          <div className="account-who">
            <strong>{me.name}</strong>
            <span>{ROLE_NAMES[me.role] ?? me.role}</span>
          </div>
          <div className="account-actions">
            <button type="button" className="secondary" aria-expanded={accountOpen} aria-controls="account-panel" onClick={() => setAccountOpen(!accountOpen)}>
              Account
            </button>
            <button type="button" className="secondary" onClick={async () => {
              await api('/api/auth/logout', { method: 'POST' });
              setMe(null);
            }}>Sign out</button>
          </div>
          {accountOpen ? (
            <form id="account-panel" className="account-panel" onSubmit={changePassword}>
              <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
              <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              <button type="submit">Change password</button>
              {passwordMessage ? <p role="status">{passwordMessage}</p> : null}
            </form>
          ) : null}
        </div>
      </aside>
      <main className="content">
      {path.startsWith('/vendors/') && vendorId ? <VendorDetail id={vendorId} /> : null}
      {path === '/vendors' ? <Vendors openVendor={(id) => { window.location.hash = `/vendors/${id}`; }} /> : null}
      {path === '/vendors/import' ? <VendorImport /> : null}
      {projectPath === '/vendor-imports' ? <VendorImports key={importRunId ?? ''} runId={importRunId} /> : null}
      {path === '/dashboard' ? <Dashboard /> : null}
      {projectPath.startsWith('/projects/') && projectId ? <ProjectDetail key={`${projectId}:${focusItemId ?? ''}`} id={projectId} itemId={focusItemId} /> : null}
      {projectPath === '/projects' ? <Projects key={projectStatus ?? ''} status={projectStatus} openProject={(id) => { window.location.hash = `/projects/${id}`; }} /> : null}
      {projectPath === '/client-advances' ? <ClientAdvances scope={advanceScope} /> : null}
      {path === '/staff' ? <StaffPage currentUserId={me.id} /> : null}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
