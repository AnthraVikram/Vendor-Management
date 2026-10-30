import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdvancesSection } from './advances-section';
import { DocumentsSection } from './documents-section';
import { HistoryPanel } from './history-panel';
import { ProjectTimeline } from './project-timeline';
import { ArchivedBadge, ProjectStatusBadge } from '../badges';

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

  if (!pricing) return <p className={error ? 'error' : 'meta'}>{error || 'Loading pricing'}</p>;
  return (
    <div className="grid schedule-pricing">
      <div className="pricing-current">
        {pricing.current_price ? <p className="pricing-value">Fixed price: {pricing.current_price.amount}</p> : null}
        {pricing.current_file ? (
          <p className="pricing-value">
            Costing sheet: {pricing.current_file.original_filename}{' '}
            <a href={`/api/schedules/${scheduleId}/costing-sheets/${pricing.current_file.id}`}>Open costing sheet</a>
          </p>
        ) : null}
        {!pricing.current_price && !pricing.current_file ? <span className="status-badge status-muted">Unpriced</span> : null}
        {pricing.pricing_mode === 'FIXED' ? <button type="button" className="secondary small" onClick={() => clear('price/clear')}>Clear price</button> : null}
        {pricing.pricing_mode === 'FILE' ? <button type="button" className="secondary small" onClick={() => clear('costing-sheet/clear')}>Clear costing sheet</button> : null}
      </div>
      {pricing.price_history.length > 0 ? (
        <ul className="records meta pricing-history" aria-label="Price history">
          {pricing.price_history.map((entry) => (
            <li key={entry.id}>{entry.amount} · {entry.kind.toLowerCase()} · {entry.author.name} · {day(entry.created_at)}</li>
          ))}
        </ul>
      ) : null}
      {pricing.file_history.length > 0 ? (
        <ul className="records meta pricing-history" aria-label="Costing sheet history">
          {pricing.file_history.map((file) => (
            <li key={file.id}>
              <a href={`/api/schedules/${scheduleId}/costing-sheets/${file.id}`}>{file.original_filename}</a> · {file.author.name} · {day(file.created_at)}
              {file.archived && file.archived_by && file.archived_at ? ` · cleared or replaced by ${file.archived_by.name} · ${day(file.archived_at)}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
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
    <form className="card form-2col" aria-label="Schedule form" onSubmit={submit}>
      <h3 className="span-2">Schedule work</h3>
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
      <label>Team size<input aria-label="Team size" inputMode="numeric" value={teamSize} onChange={(event) => setTeamSize(event.target.value)} /></label>
      <div className="form-actions">
        <button type="submit">Save schedule</button>
        {message ? <p role="status">{message}</p> : null}
      </div>
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

  if (!project) return <p className={error ? 'error' : 'meta'}>{error || 'Loading project'}</p>;
  const vendorName = (vendorIdOfSchedule: string) => project.links.find((link) => link.vendor_id === vendorIdOfSchedule)?.vendor_name;
  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Project</p>
          <h1>{project.name}</h1>
          <div className="page-meta">
            <ProjectStatusBadge status={project.status} />
            {project.archived ? <ArchivedBadge /> : null}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className={project.archived ? 'secondary' : 'danger'} onClick={async () => {
            await api(`/api/projects/${id}/${project.archived ? 'restore' : 'archive'}`, { method: 'POST' });
            load();
          }}>{project.archived ? 'Restore project' : 'Archive project'}</button>
        </div>
      </header>

      <div className="section">
        <div className="section-heading">
          <div>
            <h2>Links</h2>
            <span className="count-badge">{project.links.length}</span>
          </div>
          <p>Vendors working on this project</p>
        </div>
        {project.links.length > 0 ? (
          <div className="card-list">
            {project.links.map((link) => (
              <article className="card grid link-card" key={link.id}>
                <div className="card-heading">
                  <p><strong>{link.vendor_name}</strong></p>
                  {link.vendor_archived ? <ArchivedBadge /> : null}
                </div>
                {link.role_on_project || link.scope_of_work || link.note ? (
                  <p className="meta">{[link.role_on_project, link.scope_of_work, link.note].filter(Boolean).join(' · ')}</p>
                ) : null}
                <button type="button" className="danger small" onClick={() => removeLink(link.id)}>Remove link</button>
              </article>
            ))}
          </div>
        ) : <p className="empty">No vendors linked yet.</p>}
        <form className="card form-2col" onSubmit={addLink} aria-label="Link a vendor">
          <h3 className="span-2">Link a vendor</h3>
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
          <div className="form-actions">
            <button type="submit">Link vendor</button>
          </div>
        </form>
      </div>

      <div className="section">
        <div className="section-heading">
          <div>
            <h2>Schedules</h2>
            <span className="count-badge">{project.schedules.length}</span>
          </div>
          <p>Booked work and how each task is priced</p>
        </div>
        {project.schedules.length > 0 ? (
          <div className="card-list">
            {project.schedules.map((schedule) => (
              <article className={`card grid schedule-card${schedule.conflicts.length > 0 ? ' has-conflict' : ''}`} key={schedule.id} aria-label={`Schedule ${schedule.task}`}>
                <div className="schedule-head">
                  <h3>{schedule.task}</h3>
                  {vendorName(schedule.vendor_id) ? <p className="meta">{vendorName(schedule.vendor_id)}</p> : null}
                </div>
                <ul className="schedule-facts" aria-label="When">
                  <li>{schedule.work_date}</li>
                  <li>{schedule.start_time}-{schedule.end_time}</li>
                  <li>team {schedule.required_team_size}</li>
                </ul>
                {schedule.conflicts.length > 0 ? <p className="notice notice-conflict">Conflicts with {schedule.conflicts.map((conflict) => `${conflict.task} (${conflict.project_name})`).join(', ')}</p> : null}
                <SchedulePricing scheduleId={schedule.id} version={version} onChanged={load} />
              </article>
            ))}
          </div>
        ) : <p className="empty">No schedules yet.</p>}
        <ScheduleForm projectId={id} vendors={project.links.map((link) => ({ id: link.vendor_id, name: link.vendor_name }))} onSaved={load} />
        <div className="two-up">
          <form className="card grid" onSubmit={savePrice} aria-label="Fixed price">
            <h3>Fixed price</h3>
            <label>
              Schedule
              <select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
                {project.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.task}</option>)}
              </select>
            </label>
            <label>Amount<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <div className="form-actions"><button type="submit">Save price</button></div>
          </form>
          <form className="card grid" onSubmit={upload} aria-label="Costing sheet">
            <h3>Costing sheet</h3>
            <p className="meta">Attach a spreadsheet or PDF to the schedule chosen under Fixed price.</p>
            <label className="dropzone">
              <span>Spreadsheet or PDF</span>
              <input name="file" type="file" aria-label="Costing sheet file" />
            </label>
            <div className="form-actions"><button type="submit">Attach file</button></div>
          </form>
        </div>
      </div>
      <AdvancesSection projectId={id} version={version} />
      <DocumentsSection parent="projects" parentId={id} parentArchived={project.archived} />
      <ProjectTimeline
        projectId={id}
        linkedVendors={project.links.map((link) => ({ id: link.vendor_id, name: link.vendor_name, archived: link.vendor_archived }))}
        version={version}
        itemId={itemId}
      />
      {/* Last, as on the vendor page: the record's own history sits below everything it describes. */}
      <div className="section">
        <div className="section-heading">
          <div><h2>History</h2></div>
          <p>Who created and changed this project</p>
        </div>
        <HistoryPanel target="project_id" id={id} label="Project history" />
      </div>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
    </section>
  );
}
