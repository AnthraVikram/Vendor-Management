import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { ArchivedBadge, ProjectStatusBadge } from '../badges';

interface Project { id: string; name: string; status: string; archived: boolean; client_name?: string | null; site_location?: string | null }

const STATUS_NAMES: Record<string, string> = { PLANNED: 'Planned', ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed' };

// `status` comes from a dashboard tile (#/projects?status=ACTIVE) and narrows the list to that status.
export function Projects({ openProject, status: statusFilter }: { openProject: (id: string) => void; status?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('PLANNED');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState('');

  function load(archived = includeArchived) {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (archived) params.set('include_archived', 'true');
    const query = params.toString() ? `?${params}` : '';
    api<Project[]>(`/api/projects${query}`).then(setProjects).catch((caught: Error) => setError(caught.message));
  }

  useEffect(() => { load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await api('/api/projects', { method: 'POST', body: JSON.stringify({ name, status }) });
    setName('');
    load();
  }

  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Work</p>
          <h1>Projects</h1>
          <p className="page-subtitle">Every project with its client and status. Open one for vendors, schedules, advances, and documents.</p>
        </div>
      </header>
      {statusFilter ? (
        <p className="notice">
          Showing {STATUS_NAMES[statusFilter] ?? statusFilter} projects only. <a href="#/projects">Show all projects</a>
        </p>
      ) : null}
      <form className="card inline-form" onSubmit={create} aria-label="Add project">
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="PLANNED">Planned</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <button type="submit">Save project</button>
      </form>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      <div className="section">
        <div className="section-heading">
          <div>
            <h2>Project list</h2>
            <span className="count-badge">{projects.length}</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); load(event.target.checked); }} />
            Include archived
          </label>
        </div>
        {projects.length > 0 ? (
          <div className="table-wrap list-table">
            <table aria-label="Projects">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Site</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td data-label="Project"><button type="button" className="link-button" onClick={() => openProject(project.id)}>{project.name}</button></td>
                    <td data-label="Client">{project.client_name ?? <span className="muted">Not set</span>}</td>
                    <td data-label="Site">{project.site_location ?? <span className="muted">Not set</span>}</td>
                    <td data-label="Status">
                      <span className="page-meta">
                        <ProjectStatusBadge status={project.status} />
                        {project.archived ? <ArchivedBadge /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No projects to show.</p>
        )}
      </div>
    </section>
  );
}
