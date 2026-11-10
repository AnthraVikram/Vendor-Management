import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, apiWithHeaders } from '../api/client';
import { ArchivedBadge, HealthBadge, ProgressMeter, ProjectStatusBadge } from '../badges';
import { ListView, readListPrefs, writeListPrefs } from '../list-prefs';
import { notify } from '../notify';
import { countHeader, ViewSwitch } from '../ui/list-controls';
import { formatDate } from '../time';
import { Skeleton } from '../ui/skeleton';
import { useUnsavedGuard } from '../ui/unsaved-guard';

interface Project {
  id: string;
  name: string;
  status: string;
  archived: boolean;
  client_name?: string | null;
  site_location?: string | null;
  start_date?: string | null;
  expected_completion_date?: string | null;
  vendor_count?: number;
  progress?: { done: number; total: number };
  overdue_count?: number;
  next_deadline?: string | null;
  health?: string;
}

const STATUS_NAMES: Record<string, string> = { PLANNED: 'Planned', ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed' };

// Feature 005 FR-004: list sorts; ties keep name order.
const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'expected_completion', label: 'Expected completion' },
  { value: 'progress', label: 'Progress (lowest first)' },
] as const;
const PREFS_KEY = 'vm.list.projects';
const PAGE_SIZE = 50;

function NotSet() {
  return <span className="muted">Not set</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error field-error">{message}</span> : null;
}

// `status` comes from a dashboard tile (#/projects?status=ACTIVE) and narrows the list to that status. `progress`
// comes from the dashboard's "Projects in progress" count (#/projects?progress=in_progress, Feature 005 FR-021).
export function Projects({
  openProject,
  status: statusFilter,
  progress: progressFilter,
  add = false,
  view: linkedView,
}: {
  openProject: (id: string) => void;
  status?: string;
  progress?: string;
  add?: boolean;
  view?: ListView;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [narrowed, setNarrowed] = useState(false);
  const [q, setQ] = useState('');
  const [hasOverdue, setHasOverdue] = useState(false);
  const [dueWithinWeek, setDueWithinWeek] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    const remembered = readListPrefs(PREFS_KEY, SORTS.map((option) => option.value), { sort: 'name', view: 'active' });
    return linkedView ? { ...remembered, view: linkedView } : remembered;
  });
  const [counts, setCounts] = useState({ total: 0, active: 0, archived: 0 });
  const [formOpen, setFormOpen] = useState(add);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [siteLocation, setSiteLocation] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('PLANNED');
  const [startDate, setStartDate] = useState('');
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const progressInLink = progressFilter === 'in_progress' ? progressFilter : undefined;
  const dirty = formOpen && [name, clientName, siteLocation, description, startDate, expectedCompletionDate].some((value) => value.trim() !== '');
  useUnsavedGuard(dirty);

  // Loads the first page, or the next with `more`. Sort and view come from the remembered choice (FR-005).
  function load(options: { more?: boolean; view?: ListView; sort?: string } = {}) {
    const view = options.view ?? prefs.view;
    const sort = options.sort ?? prefs.sort;
    const offset = options.more ? projects.length : 0;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (progressInLink) params.set('progress', progressInLink);
    if (q.trim()) params.set('q', q.trim());
    if (hasOverdue) params.set('has_overdue', 'true');
    if (dueWithinWeek) params.set('due_within_7', 'true');
    if (view !== 'active') params.set('view', view);
    if (sort !== 'name') params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    if (offset) params.set('offset', String(offset));
    apiWithHeaders<Project[]>(`/api/projects?${params}`)
      .then(({ data: rows, headers }) => {
        const shown = options.more ? [...projects, ...rows] : rows;
        setProjects(shown);
        setCounts({
          total: countHeader(headers, 'X-Total-Count', shown.length),
          active: countHeader(headers, 'X-Active-Count', view === 'active' ? shown.length : 0),
          archived: countHeader(headers, 'X-Archived-Count', view === 'archived' ? shown.length : 0),
        });
        setNarrowed(Boolean(statusFilter || progressInLink || q.trim() || hasOverdue || dueWithinWeek));
        setLoaded(true);
      })
      .catch((caught: Error) => setError(caught.message));
  }

  function changePrefs(next: { view?: ListView; sort?: string }) {
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    writeListPrefs(PREFS_KEY, updated);
    load(next);
  }

  useEffect(() => {
    if (!formOpen) return;
    nameInput.current?.focus();
    nameInput.current?.scrollIntoView?.({ block: 'nearest' });
  }, [formOpen]);

  function closeForm() {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    for (const clear of [setName, setClientName, setSiteLocation, setDescription, setStartDate, setExpectedCompletionDate]) clear('');
    setFields({});
    setFormOpen(false);
  }

  useEffect(() => { load(); }, []);

  function filter(event: FormEvent) {
    event.preventDefault();
    load();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setFields({});
    try {
      await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          client_name: clientName,
          site_location: siteLocation,
          description,
          status,
          start_date: startDate || null,
          expected_completion_date: expectedCompletionDate || null,
        }),
      });
      for (const clear of [setName, setClientName, setSiteLocation, setDescription, setStartDate, setExpectedCompletionDate]) clear('');
      notify('Project created');
      load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setError(caught instanceof Error ? caught.message : 'Could not save the project.');
    }
  }

  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Work</p>
          <h1>Projects</h1>
          <p className="page-subtitle">Every project with its dates, progress and health. Open one for vendors, schedules, advances, and documents.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => setFormOpen(true)} aria-expanded={formOpen} aria-controls="add-project-form">Add project</button>
        </div>
      </header>
      {statusFilter ? (
        <p className="notice">
          Showing {STATUS_NAMES[statusFilter] ?? statusFilter} projects only. <a href="#/projects">Show all projects</a>
        </p>
      ) : null}
      {progressInLink ? (
        <p className="notice">
          Showing projects in progress only. <a href="#/projects">Show all projects</a>
        </p>
      ) : null}
      <form className="card filter-bar" onSubmit={filter} aria-label="Project filters">
        <label className="search">
          Search projects
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, client or site" />
        </label>
        <div className="form-actions">
          <label className="check">
            <input type="checkbox" checked={hasOverdue} onChange={(event) => setHasOverdue(event.target.checked)} />
            <span>Has overdue items</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={dueWithinWeek} onChange={(event) => setDueWithinWeek(event.target.checked)} />
            <span>Has items due in the next 7 days</span>
          </label>
          <button type="submit">Apply filters</button>
        </div>
      </form>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      <div className="section">
        <div className="section-heading">
          <div>
            <h2>Project list</h2>
            <span className="count-badge">{counts.total === 1 ? '1 project' : `${counts.total} projects`}</span>
          </div>
          <div className="list-controls">
            <ViewSwitch view={prefs.view} active={counts.active} archived={counts.archived} onChange={(view) => changePrefs({ view })} />
            <label className="sort-select">
              Sort by
              <select value={prefs.sort} onChange={(event) => changePrefs({ sort: event.target.value })}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {prefs.view === 'archived' ? <p className="notice archived-note">Archived records are kept and can be restored.</p> : null}
        {!loaded ? (
          <Skeleton label="Loading projects" />
        ) : projects.length > 0 ? (
          <div className="table-wrap list-table">
            <table aria-label="Projects">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Start date</th>
                  <th>Expected completion</th>
                  <th>Vendors</th>
                  <th>Progress</th>
                  <th>Health</th>
                  <th>Overdue</th>
                  <th>Next deadline</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className={project.archived ? 'is-archived' : undefined}>
                    <td data-label="Project"><button type="button" className="link-button" onClick={() => openProject(project.id)}>{project.name}</button></td>
                    <td data-label="Client">{project.client_name ?? <NotSet />}</td>
                    <td data-label="Site">{project.site_location ?? <NotSet />}</td>
                    <td data-label="Status">
                      <span className="page-meta">
                        <ProjectStatusBadge status={project.status} />
                        {project.archived ? <ArchivedBadge /> : null}
                      </span>
                    </td>
                    <td data-label="Start date">{project.start_date ? formatDate(project.start_date) : <NotSet />}</td>
                    <td data-label="Expected completion">{project.expected_completion_date ? formatDate(project.expected_completion_date) : <NotSet />}</td>
                    <td data-label="Vendors">{project.vendor_count === 1 ? '1 vendor' : `${project.vendor_count ?? 0} vendors`}</td>
                    <td data-label="Progress">{project.progress ? <ProgressMeter progress={project.progress} /> : null}</td>
                    <td data-label="Health">{project.health ? <HealthBadge health={project.health} /> : null}</td>
                    <td data-label="Overdue">{project.overdue_count ? `${project.overdue_count} overdue` : <span className="muted">None</span>}</td>
                    <td data-label="Next deadline">{project.next_deadline ? formatDate(project.next_deadline) : <span className="muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {projects.length < counts.total ? (
              <div className="show-more">
                <button type="button" className="secondary" onClick={() => load({ more: true })}>Show more</button>
              </div>
            ) : null}
          </div>
        ) : narrowed ? (
          <p className="empty">No projects match your search and filters</p>
        ) : (
          <div className="empty-box">
            <p className="empty">No projects have been created yet</p>
            <div className="form-actions">
              <button type="button" onClick={() => setFormOpen(true)}>Add a project</button>
            </div>
          </div>
        )}
      </div>
      {formOpen ? (
        <form id="add-project-form" className="card form-2col" onSubmit={create} aria-label="Add project">
          <h2 className="span-2">Add project</h2>
          <fieldset className="form-section span-2">
            <legend>Basics</legend>
            <label>Name<input ref={nameInput} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fields.name)} /></label>
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="PLANNED">Planned</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On hold</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </label>
            <FieldError message={fields.name} />
            <label className="span-2">Description<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          </fieldset>
          <fieldset className="form-section span-2">
            <legend>Client</legend>
            <label>Client name<input value={clientName} onChange={(event) => setClientName(event.target.value)} /></label>
            <label>Site location<input value={siteLocation} onChange={(event) => setSiteLocation(event.target.value)} /></label>
          </fieldset>
          <fieldset className="form-section span-2">
            <legend>Dates</legend>
            <div className="field">
              <label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-invalid={Boolean(fields.start_date)} /></label>
              <FieldError message={fields.start_date} />
            </div>
            <div className="field">
              <label>
                Expected completion date
                <input type="date" value={expectedCompletionDate} onChange={(event) => setExpectedCompletionDate(event.target.value)} aria-invalid={Boolean(fields.expected_completion_date)} />
              </label>
              <FieldError message={fields.expected_completion_date} />
            </div>
          </fieldset>
          <div className="form-actions span-2">
            <button type="submit">Save project</button>
            <button type="button" className="secondary" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
