import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

interface LinkRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  role_on_project: string | null;
  scope_of_work: string | null;
  note: string | null;
}
interface ScheduleRow {
  id: string;
  vendor_id: string;
  task: string;
  work_date: string;
  start_time: string;
  end_time: string;
  required_team_size: number;
  pricing_mode: string;
  conflicts: { id: string; task: string; project_name: string }[];
}
interface ProjectDetailData {
  id: string;
  name: string;
  status: string;
  archived: boolean;
  links: LinkRow[];
  schedules: ScheduleRow[];
}
interface VendorOption { id: string; name: string }

export function ScheduleForm({ projectId, vendors, onSaved }: { projectId: string; vendors: VendorOption[]; onSaved: () => void }) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const [task, setTask] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [teamSize, setTeamSize] = useState('2');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await api<{ conflicts: { task: string }[] }>(`/api/projects/${projectId}/schedules`, {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: vendorId,
        task,
        work_date: date,
        start_time: start,
        end_time: end,
        required_team_size: Number(teamSize),
      }),
    });
    setMessage(saved.conflicts.length > 0 ? `Saved with ${saved.conflicts.length} conflict(s).` : 'Saved.');
    onSaved();
  }

  return (
    <form className="card grid" aria-label="Schedule form" onSubmit={submit}>
      <h2>Schedule work</h2>
      <label>
        Vendor
        <select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>
      </label>
      <label>Task<input aria-label="Task" value={task} onChange={(event) => setTask(event.target.value)} /></label>
      <label>Date<input aria-label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Start<input aria-label="Start" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label>End<input aria-label="End" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      <label>Team size<input aria-label="Team size" value={teamSize} onChange={(event) => setTeamSize(event.target.value)} /></label>
      <button type="submit">Save schedule</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<ProjectDetailData | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [role, setRole] = useState('');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<ProjectDetailData>(`/api/projects/${id}`).then((row) => {
      setProject(row);
      setScheduleId((current) => current || row.schedules[0]?.id || '');
    }).catch((caught: Error) => setError(caught.message));
  }

  useEffect(() => {
    load();
    api<VendorOption[]>('/api/vendors').then(setVendors).catch((caught: Error) => setError(caught.message));
  }, [id]);

  async function addLink(event: FormEvent) {
    event.preventDefault();
    await api(`/api/projects/${id}/links`, {
      method: 'POST',
      body: JSON.stringify({ vendor_id: vendorId, role_on_project: role, scope_of_work: scope, note }),
    });
    load();
  }

  async function removeLink(linkId: string) {
    await api(`/api/links/${linkId}`, { method: 'DELETE' });
    load();
  }

  async function savePrice(event: FormEvent) {
    event.preventDefault();
    await api(`/api/schedules/${scheduleId}/price`, { method: 'PUT', body: JSON.stringify({ amount: price }) });
    setPrice('');
    load();
  }

  async function openSheet(idToOpen: string) {
    const detail = await api<{ current_file: { id: string } | null }>(`/api/schedules/${idToOpen}`);
    if (detail.current_file) window.location.assign(`/api/schedules/${idToOpen}/costing-sheets/${detail.current_file.id}`);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api(`/api/schedules/${scheduleId}/costing-sheet`, { method: 'POST', body: data });
    load();
  }

  if (!project) return <p>{error || 'Loading project'}</p>;
  return (
    <section className="grid">
      <h1>{project.name}</h1>
      <p>{project.status}</p>
      <button type="button" className="secondary" onClick={async () => {
        await api(`/api/projects/${id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
        load();
      }}>{project.archived ? 'Restore project' : 'Archive project'}</button>
      <h2>Links</h2>
      {project.links.map((link) => (
        <article className="card" key={link.id}>
          <p>{link.vendor_name}</p>
          <p>{link.role_on_project} {link.scope_of_work} {link.note}</p>
          <button type="button" className="secondary" onClick={() => removeLink(link.id)}>Remove link</button>
        </article>
      ))}
      <form className="card grid" onSubmit={addLink}>
        <label>
          Vendor
          <select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Choose</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <label>Role<input value={role} onChange={(event) => setRole(event.target.value)} /></label>
        <label>Scope<input value={scope} onChange={(event) => setScope(event.target.value)} /></label>
        <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button type="submit">Link vendor</button>
      </form>
      <h2>Schedules</h2>
      {project.schedules.map((schedule) => (
        <article className="card" key={schedule.id}>
          <p>{schedule.task} {schedule.work_date} {schedule.start_time}-{schedule.end_time} team {schedule.required_team_size}</p>
          <p>Pricing: {schedule.pricing_mode}</p>
          {schedule.conflicts.length > 0 ? <p>Conflicts with {schedule.conflicts.map((conflict) => `${conflict.task} (${conflict.project_name})`).join(', ')}</p> : null}
          {schedule.pricing_mode === 'FILE' ? <button type="button" onClick={() => openSheet(schedule.id)}>Open costing sheet</button> : null}
        </article>
      ))}
      <ScheduleForm projectId={id} vendors={project.links.map((link) => ({ id: link.vendor_id, name: link.vendor_name }))} onSaved={load} />
      <form className="card grid" onSubmit={savePrice}>
        <h2>Fixed price</h2>
        <label>
          Schedule
          <select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
            {project.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.task}</option>)}
          </select>
        </label>
        <label>Amount<input value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <button type="submit">Save price</button>
      </form>
      <form className="card grid" onSubmit={upload}>
        <h2>Costing sheet</h2>
        <input name="file" type="file" />
        <button type="submit">Attach file</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
