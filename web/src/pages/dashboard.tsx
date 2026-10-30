import { ReactNode, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Ref { id: string; name: string }
interface Entry { project: Ref; item: Ref | null; responsible_label: string }
interface DashboardData {
  today: string;
  overdue: (Entry & { deadline: string; days_overdue: number })[];
  due_soon: (Entry & { deadline: string })[];
  missing_update: (Entry & { last_update_on: string })[];
  recent_delays_and_issues: (Entry & {
    kind: 'DELAY' | 'COORDINATION_ISSUE';
    id: string;
    text: string;
    created_at: string;
    created_by: Ref;
  })[];
}

interface Summary {
  vendors: { active: number };
  projects: Record<string, number>;
  client_advances?: {
    standing_total: string;
    received_this_month: string;
    month: string;
    labels: { standing_total: string; received_this_month: string };
  };
}

const STATUSES: [string, string][] = [
  ['PLANNED', 'Planned'],
  ['ACTIVE', 'Active'],
  ['ON_HOLD', 'On hold'],
  ['COMPLETED', 'Completed'],
];

function Tile({ href, value, label, wide = false, tone }: { href: string; value: string; label: string; wide?: boolean; tone?: string }) {
  return (
    <a className={`card tile${wide ? ' tile-wide' : ''}${tone ? ` tile-${tone}` : ''}`} href={href}>
      <strong>{value}</strong>
      <span>{label}</span>
    </a>
  );
}

// Count and money tiles (FR-023 to FR-026). The money tiles appear only when the API sends them.
function SummaryTiles() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Summary>('/api/dashboard/summary').then(setSummary).catch((caught: Error) => setError(caught.message));
  }, []);

  return (
    <section className="dashboard-tiles" aria-label="At a glance">
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      {summary ? (
        <>
          {summary.client_advances ? (
            <div className="tile-group">
              <p className="tile-group-title">Client advances</p>
              <div className="tile-row tile-row-money">
                <Tile wide tone="money" href="#/client-advances?scope=all" value={`₹${summary.client_advances.standing_total}`} label={summary.client_advances.labels.standing_total} />
                <Tile wide tone="money" href="#/client-advances?scope=month" value={`₹${summary.client_advances.received_this_month}`} label={summary.client_advances.labels.received_this_month} />
              </div>
            </div>
          ) : null}
          <div className="tile-group">
            <p className="tile-group-title">Directory and projects</p>
            <div className="tile-row tile-row-counts">
              <Tile tone="vendors" href="#/vendors" value={String(summary.vendors.active)} label="Vendors not archived" />
              {STATUSES.map(([status, name]) => (
                <Tile key={status} tone={status.toLowerCase().replace('_', '-')} href={`#/projects?status=${status}`} value={String(summary.projects[status] ?? 0)} label={`${name} projects, not archived`} />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function target(entry: Entry): string {
  return entry.item ? `#/projects/${entry.project.id}?item=${entry.item.id}` : `#/projects/${entry.project.id}`;
}

function List<T>({ title, empty, rows, render }: { title: string; empty: string; rows: T[]; render: (row: T) => ReactNode }) {
  const id = `dashboard-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section className="card grid dashboard-panel" aria-labelledby={id}>
      <div className="panel-heading">
        <h2 id={id}>{title}</h2>
        <span className="count-badge" aria-hidden="true">{rows.length}</span>
      </div>
      {rows.length === 0 ? <p className="empty">{empty}</p> : <ul className="dashboard-list">{rows.map(render)}</ul>}
    </section>
  );
}

function days(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('/api/dashboard').then(setData).catch((caught: Error) => setError(caught.message));
  }, []);

  return (
    <section className="grid dashboard">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Client advances, the directory, and project deadlines in one place.</p>
        </div>
        {data ? <span className="today-pill">Today · {data.today} IST</span> : null}
      </header>
      <SummaryTiles />
      {data ? (
        <p className="section-note">Archived projects and archived items are not shown.</p>
      ) : (
        <p className="section-note">{error || 'Loading dashboard'}</p>
      )}
      {data ? <div className="dashboard-grid">
        <List
          title="Overdue"
          empty="Nothing overdue."
          rows={data.overdue}
          render={(row) => (
            <li key={row.item?.id} className="dash-item">
              <div className="dash-item-main">
                <a href={target(row)}>{row.item?.name}</a>
                <span className="dash-item-meta">{row.project.name} · {row.responsible_label}</span>
              </div>
              <div className="dash-item-side">
                <span>deadline {row.deadline}</span>
                <strong className="flag flag-overdue">{days(row.days_overdue)} overdue</strong>
              </div>
            </li>
          )}
        />
        <List
          title="Due soon"
          empty="Nothing due soon."
          rows={data.due_soon}
          render={(row) => (
            <li key={row.item?.id} className="dash-item">
              <div className="dash-item-main">
                <a href={target(row)}>{row.item?.name}</a>
                <span className="dash-item-meta">{row.project.name} · {row.responsible_label}</span>
              </div>
              <div className="dash-item-side">
                <span>deadline {row.deadline}</span>
              </div>
            </li>
          )}
        />
        <List
          title="Missing update"
          empty="No missing updates."
          rows={data.missing_update}
          render={(row) => (
            <li key={row.item?.id} className="dash-item">
              <div className="dash-item-main">
                <a href={target(row)}>{row.item?.name}</a>
                <span className="dash-item-meta">{row.project.name} · {row.responsible_label}</span>
              </div>
              <div className="dash-item-side">
                <span>last update {row.last_update_on}</span>
              </div>
            </li>
          )}
        />
        <List
          title="Recent delays and coordination issues"
          empty="No delays or coordination issues."
          rows={data.recent_delays_and_issues}
          render={(row) => (
            <li key={`${row.kind}-${row.id}`} className="dash-item">
              <div className="dash-item-main">
                <span className="dash-item-title">
                  <strong className={`flag ${row.kind === 'DELAY' ? 'flag-delay' : 'flag-issue'}`}>{row.kind === 'DELAY' ? 'Delay' : 'Coordination issue'}</strong>
                  <a href={target(row)}>{row.item ? `${row.project.name} · ${row.item.name}` : row.project.name}</a>
                </span>
                <span className="dash-item-text">{row.text}</span>
                <span className="dash-item-meta">
                  {row.responsible_label} · {row.created_by.name}, {new Date(row.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
                </span>
              </div>
            </li>
          )}
        />
      </div> : null}
    </section>
  );
}
