import { ReactNode, useEffect, useState } from 'react';
import { api } from '../api/client';
import { HealthBadge, ProgressMeter } from '../badges';

interface Ref { id: string; name: string }
interface Entry { project: Ref; item: Ref | null; responsible_label: string }
type Group = 'OVERDUE' | 'DUE_TODAY' | 'COMING_SOON' | 'UPCOMING';
interface DashboardItem {
  id: string;
  name: string;
  item_type: string;
  deadline: string;
  status: string;
  last_update_on: string | null;
  group: Group | null;
  days_overdue: number | null;
  project: Ref;
  responsible: { kind: string; vendor: { id: string; name: string } | null; label: string };
}
interface AttentionProject {
  id: string;
  name: string;
  health: string;
  progress: { done: number; total: number };
  overdue_count: number;
  reasons: ({ type: 'PAST_EXPECTED_COMPLETION' } | { type: 'OVERDUE_ITEMS'; count: number })[];
}
interface DashboardData {
  today: string;
  items?: DashboardItem[];
  attention_projects?: AttentionProject[];
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

// Feature 004 FR-018: one group at a time. The four dated groups never overlap; All is every open item.
const GROUPS: { key: Group | 'ALL'; label: string; empty: string }[] = [
  { key: 'OVERDUE', label: 'Overdue', empty: 'No overdue items' },
  { key: 'DUE_TODAY', label: 'Due today', empty: 'Nothing due today' },
  { key: 'COMING_SOON', label: 'Coming soon', empty: 'Nothing due in the next 7 days' },
  { key: 'UPCOMING', label: 'Upcoming', empty: 'No upcoming items' },
  { key: 'ALL', label: 'All', empty: 'No open items' },
];
const STATUS_LABEL: Record<string, string> = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done' };
const TYPE_LABEL: Record<string, string> = { MILESTONE: 'Milestone', ACTIVITY: 'Activity' };
type Sort = 'DEADLINE' | 'PROJECT' | 'UPDATE';

function byDeadline(a: DashboardItem, b: DashboardItem): number {
  return a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name);
}

// FR-021: deadline first by default (for Overdue, most overdue first); by project; or newest update first, none last.
function sortItems(items: DashboardItem[], sort: Sort): DashboardItem[] {
  return [...items].sort((a, b) => {
    if (sort === 'PROJECT') return a.project.name.localeCompare(b.project.name) || byDeadline(a, b);
    if (sort === 'UPDATE') {
      if (a.last_update_on !== b.last_update_on) {
        if (a.last_update_on === null) return 1;
        if (b.last_update_on === null) return -1;
        return b.last_update_on.localeCompare(a.last_update_on);
      }
    }
    return byDeadline(a, b);
  });
}

function responsibleKey(item: DashboardItem): string {
  return item.responsible.kind === 'VENDOR' && item.responsible.vendor ? item.responsible.vendor.id : item.responsible.kind;
}

function uniqueById<T extends { id: string; name: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Projects needing attention (FR-023a): Delayed, or Ongoing with overdue items. A project, not an item, view.
function AttentionProjects({ projects }: { projects: AttentionProject[] }) {
  return (
    <section className="card grid dashboard-panel" aria-labelledby="dashboard-attention">
      <div className="panel-heading">
        <h2 id="dashboard-attention">Projects needing attention</h2>
        <span className="count-badge" aria-hidden="true">{projects.length}</span>
      </div>
      {projects.length === 0 ? (
        <p className="empty">No projects need attention</p>
      ) : (
        <ul className="dashboard-list">
          {projects.map((project) => (
            <li key={project.id} className="dash-item">
              <div className="dash-item-main">
                <a href={`#/projects/${project.id}`}>{project.name}</a>
                <span className="dash-item-meta">
                  {project.reasons
                    .map((reason) =>
                      reason.type === 'PAST_EXPECTED_COMPLETION'
                        ? 'Past expected completion date'
                        : `${reason.count} overdue ${reason.count === 1 ? 'item' : 'items'}`,
                    )
                    .join(' · ')}
                </span>
              </div>
              <div className="dash-item-side">
                <HealthBadge health={project.health} />
                <ProgressMeter progress={project.progress} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Deadline groups with filters and sorting (FR-018 to FR-021). Choices live only in this component, so they reset
// on every visit (decision D4).
function DeadlineGroups({ items }: { items: DashboardItem[] }) {
  const [group, setGroup] = useState<Group | 'ALL'>('OVERDUE');
  const [projectId, setProjectId] = useState('');
  const [responsible, setResponsible] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>('DEADLINE');

  const filtered = items.filter(
    (item) =>
      (!projectId || item.project.id === projectId) &&
      (!responsible || responsibleKey(item) === responsible) &&
      (!status || item.status === status),
  );
  const inGroup = (key: Group | 'ALL') => filtered.filter((item) => key === 'ALL' || item.group === key);
  const chosen = GROUPS.find((entry) => entry.key === group)!;
  const rows = sortItems(inGroup(group), sort);
  const groupHasItems = items.some((item) => group === 'ALL' || item.group === group);
  const projects = uniqueById(items.map((item) => item.project));
  const vendors = uniqueById(items.flatMap((item) => (item.responsible.vendor ? [item.responsible.vendor] : [])));

  return (
    <section className="card grid dashboard-panel deadline-groups" aria-labelledby="dashboard-deadlines">
      <div className="panel-heading">
        <h2 id="dashboard-deadlines">{chosen.label}</h2>
        <span className="count-badge" aria-hidden="true">{rows.length}</span>
      </div>
      <div className="group-switch" role="radiogroup" aria-label="Deadline group">
        {GROUPS.map((entry) => (
          <label key={entry.key} className={`group-option${entry.key === group ? ' is-selected' : ''}`}>
            <input type="radio" name="deadline-group" value={entry.key} checked={entry.key === group} onChange={() => setGroup(entry.key)} />
            <span>{entry.label} ({inGroup(entry.key).length})</span>
          </label>
        ))}
      </div>
      <fieldset className="dashboard-filters">
        <legend>Filter and sort</legend>
        <label>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Any</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          Responsible party
          <select value={responsible} onChange={(event) => setResponsible(event.target.value)}>
            <option value="">Any</option>
            <option value="FIRM_TEAM">Firm team</option>
            <option value="NONE">None</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any</option>
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="DEADLINE">Deadline</option>
            <option value="PROJECT">Project</option>
            <option value="UPDATE">Most recent update</option>
          </select>
        </label>
      </fieldset>
      {rows.length === 0 ? (
        <p className="empty">{groupHasItems ? 'No items match these filters' : chosen.empty}</p>
      ) : (
        <ul className="dashboard-list">
          {rows.map((item) => (
            <li key={item.id} className="dash-item">
              <div className="dash-item-main">
                <a href={`#/projects/${item.project.id}?item=${item.id}`}>{item.name}</a>
                <span className="dash-item-meta">
                  {TYPE_LABEL[item.item_type] ?? item.item_type} · <a href={`#/projects/${item.project.id}`}>{item.project.name}</a> ·{' '}
                  {item.responsible.vendor ? <a href={`#/vendors/${item.responsible.vendor.id}`}>{item.responsible.label}</a> : item.responsible.label}
                </span>
              </div>
              <div className="dash-item-side">
                <span>Deadline {item.deadline}</span>
                <span>{STATUS_LABEL[item.status] ?? item.status}</span>
                {item.days_overdue !== null ? <strong className="flag flag-overdue">{days(item.days_overdue)} overdue</strong> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
      {data ? <AttentionProjects projects={data.attention_projects ?? []} /> : null}
      {data ? <DeadlineGroups items={data.items ?? []} /> : null}
      {data ? <div className="dashboard-grid">
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
