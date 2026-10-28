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
import './styles.css';

interface Me { id: string; name: string; role: string }

function pathOf(): string {
  return window.location.hash.replace(/^#/, '') || '/vendors';
}

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState(pathOf());
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

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

  const vendorId = path.startsWith('/vendors/') ? path.slice('/vendors/'.length) : '';
  const [projectPath, projectQuery = ''] = path.split('?');
  const projectId = projectPath.startsWith('/projects/') ? projectPath.slice('/projects/'.length) : '';
  const focusItemId = new URLSearchParams(projectQuery).get('item') ?? undefined;

  return (
    <div className="shell">
      <nav>
        <strong>{me.name}</strong>
        <a href="#/dashboard">Dashboard</a>
        <a href="#/vendors">Vendors</a>
        <a href="#/projects">Projects</a>
        <a href="#/staff">Staff</a>
        <button type="button" className="secondary" onClick={async () => {
          await api('/api/auth/logout', { method: 'POST' });
          setMe(null);
        }}>Sign out</button>
      </nav>
      <form className="card row" onSubmit={changePassword}>
        <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <button type="submit">Change password</button>
        {passwordMessage ? <p>{passwordMessage}</p> : null}
      </form>
      {path.startsWith('/vendors/') && vendorId ? <VendorDetail id={vendorId} /> : null}
      {path === '/vendors' ? <Vendors openVendor={(id) => { window.location.hash = `/vendors/${id}`; }} /> : null}
      {path === '/dashboard' ? <Dashboard /> : null}
      {projectPath.startsWith('/projects/') && projectId ? <ProjectDetail key={`${projectId}:${focusItemId ?? ''}`} id={projectId} itemId={focusItemId} /> : null}
      {path === '/projects' ? <Projects openProject={(id) => { window.location.hash = `/projects/${id}`; }} /> : null}
      {path === '/staff' ? <StaffPage currentUserId={me.id} /> : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
