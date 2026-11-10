import { useEffect, useState } from 'react';
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
import { Breadcrumbs } from './ui/breadcrumbs';
import { GlobalSearch } from './ui/global-search';
import { Me, ProfileMenu } from './ui/profile-menu';
import { Skeleton } from './ui/skeleton';
import { canLeave } from './ui/unsaved-guard';
import './styles.css';

function pathOf(): string {
  return window.location.hash.replace(/^#/, '') || '/vendors';
}

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
  const [notice, setNotice] = useState('');
  // Feature 005 FR-032: who was just signed out by Switch user, held in memory only for the sign-in page.
  const [switchedFrom, setSwitchedFrom] = useState('');
  // Feature 005 FR-038: the record name a detail page reports, kept with the path it belongs to.
  const [title, setTitle] = useState({ path: '', name: '' });

  // FR-026: the latest confirmation from any page, shown for 5 seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onNotify = (event: Event) => {
      setNotice((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(''), 5000);
    };
    window.addEventListener('notify', onNotify);
    return () => {
      window.removeEventListener('notify', onNotify);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    api<Me>('/api/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setReady(true));
    // Feature 005 FR-007: a form with unsaved changes can keep the person on the page; the address is put back.
    const onHash = (event: HashChangeEvent) => {
      if (!canLeave()) {
        if (event.oldURL) window.history.replaceState(null, '', event.oldURL);
        return;
      }
      setPath(pathOf());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!ready) return <div className="shell"><Skeleton label="Loading" rows={3} /></div>;
  if (!me) {
    return (
      <SignIn
        notice={switchedFrom ? `Signed out ${switchedFrom}. Sign in as another staff member.` : undefined}
        onSignedIn={() => api<Me>('/api/auth/me').then((next) => {
          setSwitchedFrom('');
          setMe(next);
        })}
      />
    );
  }

  // '/vendors/import' is the import page, not a vendor id.
  const vendorId = path.startsWith('/vendors/') && path !== '/vendors/import' ? path.slice('/vendors/'.length) : '';
  const [projectPath, projectQuery = ''] = path.split('?');
  const projectId = projectPath.startsWith('/projects/') ? projectPath.slice('/projects/'.length) : '';
  const focusItemId = new URLSearchParams(projectQuery).get('item') ?? undefined;
  const importRunId = new URLSearchParams(projectQuery).get('run') ?? undefined;
  const projectStatus = new URLSearchParams(projectQuery).get('status') ?? undefined;
  const projectProgress = new URLSearchParams(projectQuery).get('progress') ?? undefined;
  const advanceScope = new URLSearchParams(projectQuery).get('scope') === 'month' ? 'month' : 'all';
  // Feature 005 FR-021, FR-024: dashboard links open a list in a given view, or with its add form open.
  const listView = (['active', 'archived'] as const).find((view) => view === new URLSearchParams(projectQuery).get('view'));
  const addOpen = new URLSearchParams(projectQuery).get('add') === '1';
  const reportTitle = (name: string) => setTitle({ path, name });
  const recordName = title.path === path ? title.name : '';
  const vendorsCrumb = { label: 'Vendors', href: '#/vendors' };
  const trail = vendorId && recordName ? [vendorsCrumb, { label: recordName }]
    : projectId && recordName ? [{ label: 'Projects', href: '#/projects' }, { label: recordName }]
      : path === '/vendors/import' ? [vendorsCrumb, { label: 'Import vendors' }]
        : projectPath === '/vendor-imports' ? [vendorsCrumb, { label: 'Import history' }]
          : null;

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
      </aside>
      <div className="workspace">
      <header className="topbar">
        {trail ? <Breadcrumbs trail={trail} /> : null}
        <GlobalSearch />
        {/* Signing out unmounts every page, so the next person's pages load their own data (US5-4). */}
        <ProfileMenu me={me} onSignedOut={(from) => { setSwitchedFrom(from ?? ''); setMe(null); }} />
      </header>
      <div className="notice-region" role="status" aria-live="polite">{notice ? <p className="success-message">{notice}</p> : null}</div>
      <main className="content">
      {path.startsWith('/vendors/') && vendorId ? <VendorDetail id={vendorId} onTitle={reportTitle} /> : null}
      {projectPath === '/vendors' ? <Vendors key={projectQuery} add={addOpen} view={listView} openVendor={(id) => { window.location.hash = `/vendors/${id}`; }} /> : null}
      {path === '/vendors/import' ? <VendorImport /> : null}
      {projectPath === '/vendor-imports' ? <VendorImports key={importRunId ?? ''} runId={importRunId} /> : null}
      {path === '/dashboard' ? <Dashboard /> : null}
      {projectPath.startsWith('/projects/') && projectId ? <ProjectDetail key={`${projectId}:${focusItemId ?? ''}`} id={projectId} itemId={focusItemId} onTitle={reportTitle} /> : null}
      {projectPath === '/projects' ? <Projects key={projectQuery} status={projectStatus} progress={projectProgress} add={addOpen} view={listView} openProject={(id) => { window.location.hash = `/projects/${id}`; }} /> : null}
      {projectPath === '/client-advances' ? <ClientAdvances scope={advanceScope} /> : null}
      {path === '/staff' ? <StaffPage currentUserId={me.id} /> : null}
      </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
