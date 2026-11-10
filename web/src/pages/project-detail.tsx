import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdvancesSection } from './advances-section';
import { DocumentsSection } from './documents-section';
import { HistoryPanel } from './history-panel';
import { ProjectSections, RemovedSection, Section } from './project-sections';
import { ProjectTimeline } from './project-timeline';
import { ApiError } from '../api/client';
import { ArchivedBadge, AssignmentStatusBadge, HealthBadge, ProgressMeter, ProjectStatusBadge } from '../badges';
import { formatDate, formatDateTime } from '../time';
import { Skeleton } from '../ui/skeleton';
import { notify } from '../notify';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { useUnsavedGuard } from '../ui/unsaved-guard';

interface LinkRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_archived: boolean;
  vendor_phone?: string;
  vendor_contact_person?: string | null;
  vendor_categories?: { id: string; name: string }[];
  assignment_status?: string;
  role_on_project: string | null;
  scope_of_work: string | null;
  note: string | null;
}
// A removed assignment, kept read-only for history (Feature 004 FR-013). It has no status and no actions.
interface PastVendorRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_archived: boolean;
  role_on_project: string | null;
  scope_of_work: string | null;
  note: string | null;
  removed_at: string;
  removed_by: { id: string; name: string };
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
interface UpcomingItem { id: string; name: string; item_type: string; deadline: string; status: string }
interface ProjectDetailData {
  id: string;
  name: string;
  status: string;
  archived: boolean;
  client_name?: string | null;
  site_location?: string | null;
  description?: string | null;
  start_date?: string | null;
  expected_completion_date?: string | null;
  health?: string;
  progress?: { done: number; total: number };
  overdue_count?: number;
  after_completion_count?: number;
  upcoming?: UpcomingItem[];
  completed_on?: string | null;
  links: LinkRow[];
  past_links?: PastVendorRow[];
  schedules: ScheduleRow[];
  // Feature 005: absent on responses from before the sections API, so the page still renders.
  sections?: Section[];
  removed_sections?: RemovedSection[];
  sections_version?: string;
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

  if (!pricing) return error ? <p className="error">{error}</p> : <Skeleton label="Loading pricing" rows={2} />;
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
            <li key={entry.id}>{entry.amount} · {entry.kind.toLowerCase()} · {entry.author.name} · {formatDate(entry.created_at)}</li>
          ))}
        </ul>
      ) : null}
      {pricing.file_history.length > 0 ? (
        <ul className="records meta pricing-history" aria-label="Costing sheet history">
          {pricing.file_history.map((file) => (
            <li key={file.id}>
              <a href={`/api/schedules/${scheduleId}/costing-sheets/${file.id}`}>{file.original_filename}</a> · {file.author.name} · {formatDate(file.created_at)}
              {file.archived && file.archived_by && file.archived_at ? ` · cleared or replaced by ${file.archived_by.name} · ${formatDate(file.archived_at)}` : ''}
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

function NotSet() {
  return <span className="muted">Not set</span>;
}

// The project at a glance (Feature 004 FR-009a): dates, health, progress, overdue count and the next open items.
function ProjectOverview({ project }: { project: ProjectDetailData }) {
  const overdue = project.overdue_count ?? 0;
  const afterCompletion = project.after_completion_count ?? 0;
  const upcoming = project.upcoming ?? [];
  return (
    <section className="section" aria-labelledby="project-overview-heading">
      <div className="section-heading">
        <div><h2 id="project-overview-heading">Overview</h2></div>
      </div>
      <div className="card grid">
        <dl className="facts">
          <div className="fact"><dt>Status</dt><dd><ProjectStatusBadge status={project.status} /></dd></div>
          <div className="fact"><dt>Client</dt><dd>{project.client_name || <NotSet />}</dd></div>
          <div className="fact"><dt>Site</dt><dd>{project.site_location || <NotSet />}</dd></div>
          <div className="fact"><dt>Start date</dt><dd>{project.start_date ? formatDate(project.start_date) : <NotSet />}</dd></div>
          <div className="fact"><dt>Project expected completion</dt><dd>{project.expected_completion_date ? formatDate(project.expected_completion_date) : <NotSet />}</dd></div>
          {project.health ? <div className="fact"><dt>Health</dt><dd><HealthBadge health={project.health} /></dd></div> : null}
          {project.status === 'COMPLETED' ? (
            <div className="fact"><dt>Completion</dt><dd>{project.completed_on ? `Completed on ${formatDate(project.completed_on)}` : 'Completed'}</dd></div>
          ) : null}
          {project.progress ? <div className="fact"><dt>Progress</dt><dd><ProgressMeter progress={project.progress} /></dd></div> : null}
          <div className="fact"><dt>Overdue</dt><dd>{overdue > 0 ? `${overdue} overdue ${overdue === 1 ? 'item' : 'items'}` : 'No overdue items'}</dd></div>
        </dl>
        {afterCompletion > 0 ? (
          <p className="notice notice-warning">
            {afterCompletion === 1 ? '1 item is' : `${afterCompletion} items are`} due after the expected completion date
          </p>
        ) : null}
        {upcoming.length > 0 ? (
          <>
            <h3>Next items</h3>
            <ul className="plain-list" aria-label="Upcoming items">
              {upcoming.map((item) => (
                <li key={item.id}>
                  <a href={`#/projects/${project.id}?item=${item.id}`}>{item.name}</a>{' '}
                  <span className="muted">Deadline</span> {formatDate(item.deadline)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}

// Every project field (Feature 001 FR-023, task T078) plus the two Feature 004 dates.
function EditProjectForm({ project, onSaved }: { project: ProjectDetailData; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.client_name ?? '');
  const [siteLocation, setSiteLocation] = useState(project.site_location ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState(project.status);
  const [startDate, setStartDate] = useState(project.start_date ?? '');
  const [expectedCompletionDate, setExpectedCompletionDate] = useState(project.expected_completion_date ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  // Feature 005 FR-007: typed changes not yet saved keep the person from leaving without a warning.
  const dirty =
    name !== project.name ||
    clientName !== (project.client_name ?? '') ||
    siteLocation !== (project.site_location ?? '') ||
    description !== (project.description ?? '') ||
    status !== project.status ||
    startDate !== (project.start_date ?? '') ||
    expectedCompletionDate !== (project.expected_completion_date ?? '');
  useUnsavedGuard(dirty);

  async function save(event: FormEvent) {
    event.preventDefault();
    setFields({});
    setMessage('');
    try {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
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
      notify('Project updated');
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setMessage(caught instanceof Error ? caught.message : 'Could not save the project.');
    }
  }

  return (
    <form className="card form-2col" onSubmit={save} aria-label="Edit project">
      <h3 className="span-2">Edit project</h3>
      <fieldset className="form-section span-2">
        <legend>Basics</legend>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fields.name)} /></label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="PLANNED">Planned</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        {fields.name ? <span className="error field-error">{fields.name}</span> : null}
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
          {fields.start_date ? <span className="error field-error">{fields.start_date}</span> : null}
        </div>
        <div className="field">
          <label>
            Expected completion date
            <input type="date" value={expectedCompletionDate} onChange={(event) => setExpectedCompletionDate(event.target.value)} aria-invalid={Boolean(fields.expected_completion_date)} />
          </label>
          {fields.expected_completion_date ? <span className="error field-error">{fields.expected_completion_date}</span> : null}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="submit">Save changes</button>
      </div>
      {message ? <p className="error form-error" role="alert">{message}</p> : null}
    </form>
  );
}

// onTitle passes the project's name to the breadcrumbs (Feature 005 FR-038).
export function ProjectDetail({ id, itemId, onTitle }: { id: string; itemId?: string; onTitle?: (name: string) => void }) {
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
      onTitle?.(row.name);
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
    notify('Vendor assigned to project');
    load();
  }

  // Feature 005 FR-043: removing a vendor from the project asks first.
  const [removingLink, setRemovingLink] = useState<LinkRow | null>(null);

  async function removeLink(linkId: string) {
    await api(`/api/links/${linkId}`, { method: 'DELETE' });
    notify('Vendor removed from project');
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

  // Feature 005 FR-028: archiving asks first and explains nothing is deleted; restoring does not ask.
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function setArchived(archived: boolean) {
    await api(`/api/projects/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' });
    notify(archived ? 'Project archived' : 'Project restored');
    load();
  }

  if (!project) return error ? <p className="error">{error}</p> : <Skeleton label="Loading project" rows={6} />;
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
          <button type="button" className={project.archived ? 'secondary' : 'danger'} onClick={() => (project.archived ? setArchived(false) : setConfirmArchive(true))}>
            {project.archived ? 'Restore project' : 'Archive project'}
          </button>
        </div>
      </header>
      {project.archived ? <p className="notice archived-note">Archived records are kept and can be restored.</p> : null}
      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${project.name}?`}
        message="It will be hidden from active lists. Nothing is deleted: its sections, vendors, timeline, documents and history stay, and it can be restored at any time."
        confirmLabel="Archive project"
        danger
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false);
          setArchived(true);
        }}
      />

      <ProjectOverview project={project} />
      {/* Keyed by the load count, so the form shows the saved values after every reload. */}
      <EditProjectForm key={version} project={project} onSaved={load} />

      <ProjectSections
        project={{ ...project, sections: project.sections ?? [], removed_sections: project.removed_sections ?? [], sections_version: project.sections_version ?? '' }}
        vendors={vendors}
        onChanged={load}
      />

      <section className="section" aria-labelledby="project-vendors-heading">
        <div className="section-heading">
          <div>
            <h2 id="project-vendors-heading">Vendors</h2>
            <span className="count-badge">{project.links.length}</span>
          </div>
          <p>Vendors working on this project</p>
        </div>
        {project.links.length > 0 ? (
          <div className="card-list">
            {project.links.map((link) => (
              <article className={`card grid vendor-card${link.vendor_archived ? ' is-archived' : ''}`} key={link.id}>
                <div className="card-heading">
                  <p><strong><a href={`#/vendors/${link.vendor_id}`}>{link.vendor_name}</a></strong></p>
                  {link.vendor_archived ? <ArchivedBadge /> : null}
                  {link.assignment_status ? <AssignmentStatusBadge status={link.assignment_status} /> : null}
                </div>
                <dl className="facts">
                  <div className="fact"><dt>Phone</dt><dd>{link.vendor_phone ?? <span className="muted">Not set</span>}</dd></div>
                  <div className="fact"><dt>Contact person</dt><dd>{link.vendor_contact_person || <span className="muted">No contact person</span>}</dd></div>
                  <div className="fact"><dt>Categories</dt><dd>{(link.vendor_categories ?? []).map((category) => category.name).join(', ')}</dd></div>
                </dl>
                {link.role_on_project || link.scope_of_work || link.note ? (
                  <p className="meta">{[link.role_on_project, link.scope_of_work, link.note].filter(Boolean).join(' · ')}</p>
                ) : null}
                <button type="button" className="danger small" onClick={() => setRemovingLink(link)}>Remove from project</button>
              </article>
            ))}
          </div>
        ) : <p className="empty">No vendors are assigned to this project yet</p>}
        <ConfirmDialog
          open={removingLink !== null}
          title={`Remove ${removingLink?.vendor_name ?? ''} from ${project.name}?`}
          message={`${removingLink?.vendor_name ?? ''} will be taken off this project and off every section of it. The assignment is kept under Past vendors with its history.`}
          confirmLabel="Remove from project"
          danger
          onCancel={() => setRemovingLink(null)}
          onConfirm={() => {
            const link = removingLink!;
            setRemovingLink(null);
            removeLink(link.id);
          }}
        />
        <form className="card form-2col" onSubmit={addLink} aria-label="Assign a vendor">
          <h3 className="span-2">Assign a vendor</h3>
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
            <button type="submit">Assign vendor</button>
          </div>
        </form>
      </section>

      <section className="section" aria-labelledby="project-past-vendors-heading">
        <div className="section-heading">
          <div><h2 id="project-past-vendors-heading">Past vendors</h2></div>
          <p>Vendors removed from this project. Kept for reference and cannot be changed.</p>
        </div>
        {(project.past_links ?? []).length > 0 ? (
          <ul className="card-list plain-list">
            {(project.past_links ?? []).map((link) => (
              <li className="card grid past-card" key={link.id}>
                <div className="card-heading">
                  <p><strong><a href={`#/vendors/${link.vendor_id}`}>{link.vendor_name}</a></strong></p>
                  {link.vendor_archived ? <ArchivedBadge /> : null}
                </div>
                {link.role_on_project || link.scope_of_work || link.note ? (
                  <p className="meta">{[link.role_on_project, link.scope_of_work, link.note].filter(Boolean).join(' · ')}</p>
                ) : null}
                <p className="meta">Removed by {link.removed_by.name} on {formatDateTime(link.removed_at)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="empty">No past vendors</p>}
      </section>

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
                  <li>{formatDate(schedule.work_date)}</li>
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
