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

function Tile({ href, value, label, wide = false }: { href: string; value: string; label: string; wide?: boolean }) {
  return (
    <a className={wide ? 'card tile-wide' : 'card'} href={href}>
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
      {error ? <p className="error">{error}</p> : null}
      {summary ? (
        <>
          <Tile href="#/vendors" value={String(summary.vendors.active)} label="Vendors not archived" />
          {STATUSES.map(([status, name]) => (
            <Tile key={status} href={`#/projects?status=${status}`} value={String(summary.projects[status] ?? 0)} label={`${name} projects, not archived`} />
          ))}
          {summary.client_advances ? (
            <>
              <Tile wide href="#/client-advances?scope=all" value={`₹${summary.client_advances.standing_total}`} label={summary.client_advances.labels.standing_total} />
              <Tile wide href="#/client-advances?scope=month" value={`₹${summary.client_advances.received_this_month}`} label={summary.client_advances.labels.received_this_month} />
            </>
          ) : null}
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
    <section className="card grid" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {rows.length === 0 ? <p>{empty}</p> : <ul className="dashboard-list">{rows.map(render)}</ul>}
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
    <section className="grid">
      <h1>Dashboard</h1>
      <SummaryTiles />
      {data ? <p>Today: {data.today} (India Standard Time). Archived projects and archived items are not shown in the lists below.</p> : <p>{error || 'Loading dashboard'}</p>}
      {data ? <div className="dashboard-grid">
        <List
          title="Overdue"
          empty="Nothing overdue."
          rows={data.overdue}
          render={(row) => (
            <li key={row.item?.id}>
              <a href={target(row)}>{row.item?.name}</a> · {row.project.name} · {row.responsible_label} · deadline {row.deadline} ·{' '}
              <strong>{days(row.days_overdue)} overdue</strong>
            </li>
          )}
        />
        <List
          title="Due soon"
          empty="Nothing due soon."
          rows={data.due_soon}
          render={(row) => (
            <li key={row.item?.id}>
              <a href={target(row)}>{row.item?.name}</a> · {row.project.name} · {row.responsible_label} · deadline {row.deadline}
            </li>
          )}
        />
        <List
          title="Missing update"
          empty="No missing updates."
          rows={data.missing_update}
          render={(row) => (
            <li key={row.item?.id}>
              <a href={target(row)}>{row.item?.name}</a> · {row.project.name} · {row.responsible_label} · last update {row.last_update_on}
            </li>
          )}
        />
        <List
          title="Recent delays and coordination issues"
          empty="No delays or coordination issues."
          rows={data.recent_delays_and_issues}
          render={(row) => (
            <li key={`${row.kind}-${row.id}`}>
              <strong>{row.kind === 'DELAY' ? 'Delay' : 'Coordination issue'}</strong>:{' '}
              <a href={target(row)}>{row.item ? `${row.project.name} · ${row.item.name}` : row.project.name}</a> · {row.responsible_label} · {row.text} ·{' '}
              {row.created_by.name}, {new Date(row.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
            </li>
          )}
        />
      </div> : null}
    </section>
  );
}
