import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { ArchivedBadge, HealthBadge, ProgressMeter, ProjectStatusBadge } from '../badges';
import { notify } from '../notify';

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

function NotSet() {
  return <span className="muted">Not set</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error field-error">{message}</span> : null;
}

// `status` comes from a dashboard tile (#/projects?status=ACTIVE) and narrows the list to that status.
export function Projects({ openProject, status: statusFilter }: { openProject: (id: string) => void; status?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [narrowed, setNarrowed] = useState(false);
  const [q, setQ] = useState('');
  const [hasOverdue, setHasOverdue] = useState(false);
  const [dueWithinWeek, setDueWithinWeek] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
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

  function load(filters = { q, hasOverdue, dueWithinWeek, includeArchived }) {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.hasOverdue) params.set('has_overdue', 'true');
    if (filters.dueWithinWeek) params.set('due_within_7', 'true');
    if (filters.includeArchived) params.set('include_archived', 'true');
    const query = params.toString() ? `?${params}` : '';
    api<Project[]>(`/api/projects${query}`)
      .then((rows) => {
        setProjects(rows);
        setNarrowed(Boolean(statusFilter || filters.q.trim() || filters.hasOverdue || filters.dueWithinWeek));
        setLoaded(true);
      })
      .catch((caught: Error) => setError(caught.message));
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
      </header>
      {statusFilter ? (
        <p className="notice">
          Showing {STATUS_NAMES[statusFilter] ?? statusFilter} projects only. <a href="#/projects">Show all projects</a>
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
          <label className="check">
            {/* Reloads at once, as it did before Feature 004; the other filters wait for Apply filters. */}
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => {
                setIncludeArchived(event.target.checked);
                load({ q, hasOverdue, dueWithinWeek, includeArchived: event.target.checked });
              }}
            />
            <span>Include archived</span>
          </label>
          <button type="submit">Apply filters</button>
        </div>
      </form>
      <form className="card form-2col" onSubmit={create} aria-label="Add project">
        <h2 className="span-2">Add project</h2>
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
        <label>Client name<input value={clientName} onChange={(event) => setClientName(event.target.value)} /></label>
        <label>Site location<input value={siteLocation} onChange={(event) => setSiteLocation(event.target.value)} /></label>
        <label className="span-2">Description<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
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
        <div className="form-actions">
          <button type="submit">Save project</button>
        </div>
      </form>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      <div className="section">
        <div className="section-heading">
          <div>
            <h2>Project list</h2>
            <span className="count-badge">{projects.length}</span>
          </div>
        </div>
        {!loaded ? (
          <p className="meta">Loading projects</p>
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
                  <tr key={project.id}>
                    <td data-label="Project"><button type="button" className="link-button" onClick={() => openProject(project.id)}>{project.name}</button></td>
                    <td data-label="Client">{project.client_name ?? <NotSet />}</td>
                    <td data-label="Site">{project.site_location ?? <NotSet />}</td>
                    <td data-label="Status">
                      <span className="page-meta">
                        <ProjectStatusBadge status={project.status} />
                        {project.archived ? <ArchivedBadge /> : null}
                      </span>
                    </td>
                    <td data-label="Start date">{project.start_date ?? <NotSet />}</td>
                    <td data-label="Expected completion">{project.expected_completion_date ?? <NotSet />}</td>
                    <td data-label="Vendors">{project.vendor_count === 1 ? '1 vendor' : `${project.vendor_count ?? 0} vendors`}</td>
                    <td data-label="Progress">{project.progress ? <ProgressMeter progress={project.progress} /> : null}</td>
                    <td data-label="Health">{project.health ? <HealthBadge health={project.health} /> : null}</td>
                    <td data-label="Overdue">{project.overdue_count ? `${project.overdue_count} overdue` : <span className="muted">None</span>}</td>
                    <td data-label="Next deadline">{project.next_deadline ?? <span className="muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : narrowed ? (
          <p className="empty">No projects match your search and filters</p>
        ) : (
          <div className="empty-box">
            <p className="empty">No projects have been created yet</p>
            <div className="form-actions">
              <button type="button" onClick={() => nameInput.current?.focus()}>Add project</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
