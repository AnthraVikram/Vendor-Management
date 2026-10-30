import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Project { id: string; name: string; status: string; archived: boolean }

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
      <h1>Projects</h1>
      {statusFilter ? (
        <p>
          Showing {STATUS_NAMES[statusFilter] ?? statusFilter} projects only. <a href="#/projects">Show all projects</a>
        </p>
      ) : null}
      <form className="card row" onSubmit={create}>
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
      <label>
        Include archived
        <input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); load(event.target.checked); }} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid">
        {projects.map((project) => (
          <article className="card" key={project.id}>
            <button type="button" onClick={() => openProject(project.id)}>{project.name}</button>
            <p>{project.status} {project.archived ? '(archived)' : ''}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
