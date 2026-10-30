import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdvancesSection } from './advances-section';
import { DocumentsSection } from './documents-section';
import { HistoryPanel } from './history-panel';
import { ProjectTimeline } from './project-timeline';

interface LinkRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_archived: boolean;
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
interface Person { id: string; name: string }
interface PriceEntry { id: string; amount: string; kind: string; created_at: string; author: Person }
interface FileEntry {
  id: string;
  original_filename: string;
  archived: boolean;
  created_at: string;
  author: Person;
  archived_at: string | null;
  archived_by: Person | null;
}
interface SchedulePricingData {
  pricing_mode: string;
  current_price: { amount: string } | null;
  price_history: PriceEntry[];
  current_file: { id: string; original_filename: string } | null;
  file_history: FileEntry[];
}

function day(value: string): string {
  return value.slice(0, 10);
}

function SchedulePricing({ scheduleId, version, onChanged }: { scheduleId: string; version: number; onChanged: () => void }) {
  const [pricing, setPricing] = useState<SchedulePricingData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<SchedulePricingData>(`/api/schedules/${scheduleId}`).then(setPricing).catch((caught: Error) => setError(caught.message));
  }, [scheduleId, version]);

  async function clear(path: 'price/clear' | 'costing-sheet/clear') {
    setError('');
    try {
      setPricing(await api<SchedulePricingData>(`/api/schedules/${scheduleId}/${path}`, { method: 'POST' }));
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not clear the pricing method');
    }
  }

  if (!pricing) return <p>{error || 'Loading pricing'}</p>;
  return (
    <div className="grid">
      {pricing.current_price ? <p>Fixed price: {pricing.current_price.amount}</p> : null}
      {pricing.current_file ? (
        <p>
          Costing sheet: {pricing.current_file.original_filename}{' '}
          <a href={`/api/schedules/${scheduleId}/costing-sheets/${pricing.current_file.id}`}>Open costing sheet</a>
        </p>
      ) : null}
      {!pricing.current_price && !pricing.current_file ? <p>Unpriced</p> : null}
      {pricing.pricing_mode === 'FIXED' ? <button type="button" className="secondary" onClick={() => clear('price/clear')}>Clear price</button> : null}
      {pricing.pricing_mode === 'FILE' ? <button type="button" className="secondary" onClick={() => clear('costing-sheet/clear')}>Clear costing sheet</button> : null}
      {pricing.price_history.length > 0 ? (
        <ul aria-label="Price history">
          {pricing.price_history.map((entry) => (
            <li key={entry.id}>{entry.amount} · {entry.kind.toLowerCase()} · {entry.author.name} · {day(entry.created_at)}</li>
          ))}
        </ul>
      ) : null}
      {pricing.file_history.length > 0 ? (
        <ul aria-label="Costing sheet history">
          {pricing.file_history.map((file) => (
            <li key={file.id}>
              <a href={`/api/schedules/${scheduleId}/costing-sheets/${file.id}`}>{file.original_filename}</a> · {file.author.name} · {day(file.created_at)}
              {file.archived && file.archived_by && file.archived_at ? ` · cleared or replaced by ${file.archived_by.name} · ${day(file.archived_at)}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

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

export function ProjectDetail({ id, itemId }: { id: string; itemId?: string }) {
  const [project, setProject] = useState<ProjectDetailData | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [role, setRole] = useState('');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');

  function load() {
    api<ProjectDetailData>(`/api/projects/${id}`).then((row) => {
      setProject(row);
      setVersion((current) => current + 1);
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
        <article className="card" key={schedule.id} aria-label={`Schedule ${schedule.task}`}>
          <p>{schedule.task} {schedule.work_date} {schedule.start_time}-{schedule.end_time} team {schedule.required_team_size}</p>
          {schedule.conflicts.length > 0 ? <p>Conflicts with {schedule.conflicts.map((conflict) => `${conflict.task} (${conflict.project_name})`).join(', ')}</p> : null}
          <SchedulePricing scheduleId={schedule.id} version={version} onChanged={load} />
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
      <AdvancesSection projectId={id} version={version} />
      <DocumentsSection parent="projects" parentId={id} parentArchived={project.archived} />
      <HistoryPanel target="project_id" id={id} label="Project history" />
      <ProjectTimeline
        projectId={id}
        linkedVendors={project.links.map((link) => ({ id: link.vendor_id, name: link.vendor_name, archived: link.vendor_archived }))}
        version={version}
        itemId={itemId}
      />
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
