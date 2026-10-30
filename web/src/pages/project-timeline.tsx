import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { istDateTime } from '../time';

type ResponsibleKind = 'NONE' | 'VENDOR' | 'FIRM_TEAM';
type Status = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

interface Person { id: string; name: string }
interface VendorOption { id: string; name: string; archived?: boolean }
interface Responsible { kind: ResponsibleKind; vendor: { id: string; name: string; archived: boolean } | null; label: string }
type Flag =
  | { type: 'OVERDUE'; days_overdue: number }
  | { type: 'DUE_SOON' }
  | { type: 'MISSING_UPDATE'; last_update_on: string };
export interface ItemSummary {
  id: string;
  item_type: 'MILESTONE' | 'ACTIVITY';
  name: string;
  description: string | null;
  planned_date: string | null;
  deadline: string;
  responsible: Responsible;
  status: Status;
  last_update_on: string | null;
  done_on: string | null;
  archived: boolean;
  flags: Flag[];
}
interface DateChange { id: string; field: 'PLANNED_DATE' | 'DEADLINE'; old_value: string | null; new_value: string | null; created_at: string; created_by: Person }
interface ResponsibleChange { id: string; old: Responsible; new: Responsible; cause: 'EDIT' | 'LINK_REMOVED'; created_at: string; created_by: Person }
interface ProgressUpdate { id: string; status: Status; note: string | null; created_at: string; created_by: Person }
interface ItemDetail extends ItemSummary {
  progress_updates: ProgressUpdate[];
  date_changes: DateChange[];
  responsible_changes: ResponsibleChange[];
}
interface Delay { id: string; timeline_item: { id: string; name: string } | null; reason: string; created_at: string; created_by: Person }
interface Issue {
  id: string;
  timeline_item: { id: string; name: string } | null;
  description: string;
  vendors: { id: string; name: string; archived: boolean }[];
  created_at: string;
  created_by: Person;
}
interface TimelineData {
  project: { id: string; name: string; archived: boolean };
  items: ItemSummary[];
  archived_items: ItemSummary[];
  delays: Delay[];
  coordination_issues: Issue[];
}

const typeLabel = { MILESTONE: 'Milestone', ACTIVITY: 'Activity' } as const;
const statusLabel: Record<Status, string> = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done' };

// Recorded times in India Standard Time, in the same "YYYY-MM-DD HH:mm IST" form as the rest of the app.
const when = istDateTime;
const statusClass: Record<Status, string> = { NOT_STARTED: 'status-not-started', IN_PROGRESS: 'status-in-progress', DONE: 'status-done' };

function responsibleText(responsible: Responsible): string {
  return responsible.vendor?.archived ? `${responsible.label} (archived)` : responsible.label;
}

export function flagText(flag: Flag): string {
  if (flag.type === 'OVERDUE') return `Overdue by ${flag.days_overdue} ${flag.days_overdue === 1 ? 'day' : 'days'}`;
  if (flag.type === 'DUE_SOON') return 'Due soon';
  return `Missing update since ${flag.last_update_on}`;
}

export function FlagBadges({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="flags" aria-label="Flags">
      {flags.map((flag) => <li key={flag.type} className={`flag flag-${flag.type.toLowerCase().replace('_', '-')}`}>{flagText(flag)}</li>)}
    </ul>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error" role="alert">{message}</span> : null;
}

function responsibleValue(responsible?: Responsible): string {
  if (!responsible || responsible.kind === 'NONE') return 'NONE';
  if (responsible.kind === 'FIRM_TEAM') return 'FIRM_TEAM';
  return `vendor:${responsible.vendor?.id ?? ''}`;
}

function responsibleBody(value: string): { kind: ResponsibleKind; vendor_id?: string } {
  if (value.startsWith('vendor:')) return { kind: 'VENDOR', vendor_id: value.slice('vendor:'.length) };
  return { kind: value as ResponsibleKind };
}

export function ItemForm({
  projectId,
  vendors,
  item,
  onSaved,
  onCancel,
}: {
  projectId: string;
  vendors: VendorOption[];
  item?: ItemSummary;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [itemType, setItemType] = useState<string>(item?.item_type ?? 'MILESTONE');
  const [name, setName] = useState(item?.name ?? '');
  const [plannedDate, setPlannedDate] = useState(item?.planned_date ?? '');
  const [deadline, setDeadline] = useState(item?.deadline ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [responsible, setResponsible] = useState(responsibleValue(item?.responsible));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const keptVendor = item?.responsible.vendor && !vendors.some((vendor) => vendor.id === item.responsible.vendor?.id)
    ? item.responsible.vendor
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFields({});
    setMessage('');
    const body: Record<string, unknown> = { item_type: itemType, name };
    if (item) {
      body.planned_date = plannedDate || null;
      body.deadline = deadline;
      body.description = description || null;
    } else {
      if (plannedDate) body.planned_date = plannedDate;
      if (deadline) body.deadline = deadline;
      if (description) body.description = description;
    }
    if (!item || responsible !== responsibleValue(item.responsible)) body.responsible = responsibleBody(responsible);
    try {
      await api(item ? `/api/timeline-items/${item.id}` : `/api/projects/${projectId}/timeline-items`, {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      if (!item) {
        setName('');
        setPlannedDate('');
        setDeadline('');
        setDescription('');
        setResponsible('NONE');
      }
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setMessage(caught instanceof Error ? caught.message : 'Could not save the item.');
    }
  }

  const responsibleError = fields['responsible.vendor_id'] ?? fields['responsible.kind'] ?? fields.responsible;
  // Inside an item card the item's name is already a level-3 heading, so the edit form sits one level below it.
  const Heading = item ? 'h4' : 'h3';
  return (
    <form className={`card grid timeline-form${item ? ' is-editing' : ''}`} onSubmit={submit} aria-label={item ? `Edit ${item.name}` : 'Add timeline item'}>
      <Heading>{item ? `Edit ${item.name}` : 'Add timeline item'}</Heading>
      <div className="form-grid">
        <div className="field">
          <label>
            Type
            <select value={itemType} onChange={(event) => setItemType(event.target.value)} aria-invalid={Boolean(fields.item_type)}>
              <option value="MILESTONE">Milestone</option>
              <option value="ACTIVITY">Activity</option>
            </select>
          </label>
          <FieldError message={fields.item_type} />
        </div>
        <div className="field">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fields.name)} />
          </label>
          <FieldError message={fields.name} />
        </div>
        <div className="field">
          <label>
            Planned date
            <input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} aria-invalid={Boolean(fields.planned_date)} />
          </label>
          <FieldError message={fields.planned_date} />
        </div>
        <div className="field">
          <label>
            Deadline
            <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} aria-invalid={Boolean(fields.deadline)} />
          </label>
          <FieldError message={fields.deadline} />
        </div>
        <div className="field">
          <label>
            Responsible
            <select value={responsible} onChange={(event) => setResponsible(event.target.value)} aria-invalid={Boolean(responsibleError)}>
              <option value="NONE">No responsible party</option>
              <option value="FIRM_TEAM">Firm team</option>
              {keptVendor ? <option value={`vendor:${keptVendor.id}`}>{keptVendor.name} (archived)</option> : null}
              {vendors.map((vendor) => <option key={vendor.id} value={`vendor:${vendor.id}`}>{vendor.name}</option>)}
            </select>
          </label>
          <FieldError message={responsibleError} />
        </div>
        <div className="field">
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={Boolean(fields.description)} />
          </label>
          <FieldError message={fields.description} />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit">Save item</button>
        {onCancel ? <button type="button" className="secondary" onClick={onCancel}>Cancel</button> : null}
      </div>
      {fields.body ? <p className="error form-error" role="alert">{fields.body}</p> : null}
      {message ? <p className="error form-error" role="alert">{message}</p> : null}
    </form>
  );
}

export function ProgressForm({ itemId, itemName, onSaved }: { itemId: string; itemName: string; onSaved: () => void }) {
  const [status, setStatus] = useState<Status>('IN_PROGRESS');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api(`/api/timeline-items/${itemId}/progress-updates`, {
        method: 'POST',
        body: JSON.stringify(note ? { status, note } : { status }),
      });
      setNote('');
      onSaved();
    } catch (caught) {
      const fields = caught instanceof ApiError ? caught.body.fields : undefined;
      setMessage(fields?.status ?? (caught instanceof Error ? caught.message : 'Could not save the update.'));
    }
  }

  return (
    <form className="progress-form" onSubmit={submit} aria-label={`Record progress on ${itemName}`}>
      <span className="progress-form-title" aria-hidden="true">Record progress</span>
      <label>
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
        </select>
      </label>
      <label>
        Note
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="submit" className="small">Save update</button>
      {message ? <p className="error form-error" role="alert">{message}</p> : null}
    </form>
  );
}

function RecordList({ delays, issues, showItem }: { delays: Delay[]; issues: Issue[]; showItem: boolean }) {
  const rows = [
    ...delays.map((delay) => ({
      key: `d-${delay.id}`,
      at: delay.created_at,
      kind: 'Delay',
      text: delay.reason,
      item: delay.timeline_item,
      vendors: '',
      by: delay.created_by,
    })),
    ...issues.map((issue) => ({
      key: `i-${issue.id}`,
      at: issue.created_at,
      kind: 'Coordination issue',
      text: issue.description,
      item: issue.timeline_item,
      vendors: issue.vendors.map((vendor) => (vendor.archived ? `${vendor.name} (archived)` : vendor.name)).join(', '),
      by: issue.created_by,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return <p className="empty">No delays or coordination issues.</p>;
  return (
    <ul className="records record-list" aria-label={showItem ? 'Delays and coordination issues' : 'Delays and issues on this item'}>
      {rows.map((row) => (
        <li key={row.key} className={`record ${row.kind === 'Delay' ? 'record-delay' : 'record-issue'}`}>
          <p className="record-head">
            <strong className="record-kind">{row.kind}</strong>
            {showItem ? <span className="record-item">{row.item ? row.item.name : 'Whole project'}</span> : null}
          </p>
          <p className="record-text">{row.text}</p>
          {row.vendors ? <p className="record-vendors">Vendors: {row.vendors}</p> : null}
          <p className="meta">{row.by.name} · {when(row.at)}</p>
        </li>
      ))}
    </ul>
  );
}

function ItemChoice({ items, value, onChange }: { items: ItemSummary[]; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Timeline item
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Whole project</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  );
}

export function DelayForm({ projectId, items, onSaved }: { projectId: string; items: ItemSummary[]; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [itemId, setItemId] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api(`/api/projects/${projectId}/delays`, {
        method: 'POST',
        body: JSON.stringify(itemId ? { reason, timeline_item_id: itemId } : { reason }),
      });
      setReason('');
      setItemId('');
      onSaved();
    } catch (caught) {
      const fields = caught instanceof ApiError ? caught.body.fields : undefined;
      setMessage(fields?.reason ?? (caught instanceof Error ? caught.message : 'Could not record the delay.'));
    }
  }

  return (
    <form className="card grid record-form" onSubmit={submit} aria-label="Record delay">
      <h3>Record delay</h3>
      <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <ItemChoice items={items} value={itemId} onChange={setItemId} />
      <button type="submit">Record delay</button>
      {message ? <p className="error form-error" role="alert">{message}</p> : null}
    </form>
  );
}

export function IssueForm({
  projectId,
  items,
  vendors,
  onSaved,
}: {
  projectId: string;
  items: ItemSummary[];
  vendors: VendorOption[];
  onSaved: () => void;
}) {
  const [description, setDescription] = useState('');
  const [itemId, setItemId] = useState('');
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    const body: Record<string, unknown> = { description, vendor_ids: vendorIds };
    if (itemId) body.timeline_item_id = itemId;
    try {
      await api(`/api/projects/${projectId}/coordination-issues`, { method: 'POST', body: JSON.stringify(body) });
      setDescription('');
      setItemId('');
      setVendorIds([]);
      onSaved();
    } catch (caught) {
      const fields = caught instanceof ApiError ? caught.body.fields : undefined;
      setMessage(fields?.description ?? (caught instanceof Error ? caught.message : 'Could not record the issue.'));
    }
  }

  return (
    <form className="card grid record-form" onSubmit={submit} aria-label="Record coordination issue">
      <h3>Record coordination issue</h3>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <ItemChoice items={items} value={itemId} onChange={setItemId} />
      <fieldset className="check-group">
        <legend>Vendors involved</legend>
        {vendors.length === 0 ? <span className="empty">No linked vendors.</span> : vendors.map((vendor) => (
          <label key={vendor.id} className="check">
            <input
              type="checkbox"
              checked={vendorIds.includes(vendor.id)}
              onChange={(event) =>
                setVendorIds((current) => (event.target.checked ? [...current, vendor.id] : current.filter((id) => id !== vendor.id)))
              }
            />
            {vendor.archived ? `${vendor.name} (archived)` : vendor.name}
          </label>
        ))}
      </fieldset>
      <button type="submit">Record issue</button>
      {message ? <p className="error form-error" role="alert">{message}</p> : null}
    </form>
  );
}

function ItemHistory({ id, itemId, version }: { id: string; itemId: string; version: number }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ItemDetail>(`/api/timeline-items/${itemId}`).then(setDetail).catch((caught: Error) => setError(caught.message));
  }, [itemId, version]);

  if (!detail) return <p id={id} className={error ? 'error' : 'meta'}>{error || 'Loading history'}</p>;
  return (
    <div id={id} className="grid history item-history">
      <div className="item-history-group">
        <h4>Progress updates</h4>
        {detail.progress_updates.length === 0 ? <p className="empty">No progress updates yet.</p> : (
          <ul className="history-timeline">
            {detail.progress_updates.map((update) => (
              <li key={update.id} className={`history-entry progress-${update.status.toLowerCase().replace('_', '-')}`}>
                <p className="history-head">
                  <strong className="history-action">{statusLabel[update.status]}</strong> · {update.created_by.name} · <span className="history-when">{when(update.created_at)}</span>
                </p>
                {update.note ? <p className="history-detail"><span className="history-value">{update.note}</span></p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="item-history-group">
        <h4>Date changes</h4>
        {detail.date_changes.length === 0 ? <p className="empty">No date changes.</p> : (
          <ul className="history-timeline">
            {detail.date_changes.map((change) => (
              <li key={change.id} className="history-entry action-edited">
                <p className="history-head">
                  <strong className="history-action">{change.field === 'DEADLINE' ? 'Deadline' : 'Planned date'}</strong> · {change.created_by.name} · <span className="history-when">{when(change.created_at)}</span>
                </p>
                <p className="history-change">
                  <span className="history-from">{change.old_value ?? 'none'}</span> → <span className="history-to">{change.new_value ?? 'none'}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="item-history-group">
        <h4>Responsible party changes</h4>
        {detail.responsible_changes.length === 0 ? <p className="empty">No responsible party changes.</p> : (
          <ul className="history-timeline">
            {detail.responsible_changes.map((change) => (
              <li key={change.id} className="history-entry action-edited">
                <p className="history-head">
                  <strong className="history-action">Responsible party</strong> · {change.created_by.name} · <span className="history-when">{when(change.created_at)}</span>
                </p>
                <p className="history-change">
                  <span className="history-from">{responsibleText(change.old)}</span> → <span className="history-to">{responsibleText(change.new)}</span>
                  {change.cause === 'LINK_REMOVED' ? ' (vendor link removed)' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  projectId,
  vendors,
  readOnly,
  version,
  delays,
  issues,
  highlighted,
  onChanged,
}: {
  highlighted: boolean;
  item: ItemSummary;
  projectId: string;
  vendors: VendorOption[];
  readOnly: boolean;
  version: number;
  delays: Delay[];
  issues: Issue[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLElement>(null);
  const historyId = `timeline-item-history-${item.id}`;
  const overdue = item.flags.some((flag) => flag.type === 'OVERDUE');

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  async function setArchived(archived: boolean) {
    setError('');
    try {
      await api(`/api/timeline-items/${item.id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the item.');
    }
  }

  return (
    <article
      ref={ref}
      className={`card grid timeline-item ${statusClass[item.status]}${overdue ? ' is-overdue' : ''}${item.archived ? ' is-archived' : ''}${highlighted ? ' highlighted' : ''}`}
      id={`timeline-item-${item.id}`}
      aria-label={`Timeline item ${item.name}`}
    >
      <div className="item-heading">
        <div className="item-title">
          <span className="type-tag">{typeLabel[item.item_type]}</span>
          <h3>{item.name}</h3>
        </div>
        <div className="item-badges">
          <span className={`status-badge ${statusClass[item.status]}`}>{statusLabel[item.status]}</span>
          {item.archived ? <span className="status-badge status-archived">Archived</span> : null}
        </div>
      </div>
      <FlagBadges flags={item.flags} />
      <dl className="facts timeline-facts">
        <div className="fact-deadline"><dt>Deadline</dt><dd>{item.deadline}</dd></div>
        <div><dt>Planned date</dt><dd>{item.planned_date ?? 'None'}</dd></div>
        <div><dt>Responsible</dt><dd>{responsibleText(item.responsible)}</dd></div>
        <div><dt>Status</dt><dd>{statusLabel[item.status]}{item.done_on ? `, done on ${item.done_on}` : ''}</dd></div>
        <div><dt>Last update</dt><dd>{item.last_update_on ?? 'None yet'}</dd></div>
      </dl>
      {item.description ? <p className="item-description">{item.description}</p> : null}
      {delays.length + issues.length > 0 ? <RecordList delays={delays} issues={issues} showItem={false} /> : null}
      {!readOnly && !item.archived ? <ProgressForm itemId={item.id} itemName={item.name} onSaved={onChanged} /> : null}
      <div className="item-actions">
        <button
          type="button"
          className="secondary small history-toggle"
          aria-expanded={showHistory}
          aria-controls={showHistory ? historyId : undefined}
          onClick={() => setShowHistory((current) => !current)}
        >
          <span className="chevron" aria-hidden="true" />
          {showHistory ? 'Hide history' : 'Show history'}
        </button>
        {!readOnly && !item.archived ? (
          <button type="button" className="secondary small" aria-expanded={editing} onClick={() => setEditing((current) => !current)}>Edit</button>
        ) : null}
        {!readOnly ? (
          <button type="button" className={item.archived ? 'secondary small' : 'danger small'} onClick={() => setArchived(!item.archived)}>{item.archived ? 'Restore' : 'Archive'}</button>
        ) : null}
      </div>
      {editing ? (
        <ItemForm
          projectId={projectId}
          vendors={vendors}
          item={item}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : null}
      {showHistory ? <ItemHistory id={historyId} itemId={item.id} version={version} /> : null}
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
    </article>
  );
}

// "2 overdue · 1 due soon": how many items carry each flag, for the section heading.
function flagSummary(items: ItemSummary[]): string {
  const count = (type: Flag['type']) => items.filter((item) => item.flags.some((flag) => flag.type === type)).length;
  const parts: string[] = [];
  if (count('OVERDUE') > 0) parts.push(`${count('OVERDUE')} overdue`);
  if (count('DUE_SOON') > 0) parts.push(`${count('DUE_SOON')} due soon`);
  if (count('MISSING_UPDATE') > 0) parts.push(`${count('MISSING_UPDATE')} missing an update`);
  return parts.length > 0 ? parts.join(' · ') : 'Milestones, activities, deadlines and progress';
}

export function ProjectTimeline({
  projectId,
  linkedVendors,
  version: outerVersion = 0,
  itemId,
}: {
  projectId: string;
  linkedVendors: VendorOption[];
  version?: number;
  itemId?: string;
}) {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');

  function load() {
    api<TimelineData>(`/api/projects/${projectId}/timeline`)
      .then((row) => {
        setTimeline(row);
        if (itemId && row.archived_items.some((item) => item.id === itemId)) setArchivedOpen(true);
        setVersion((current) => current + 1);
      })
      .catch((caught: Error) => setError(caught.message));
  }

  useEffect(() => {
    load();
  }, [projectId, outerVersion]);

  if (!timeline) return <p className={error ? 'error' : 'meta'}>{error || 'Loading timeline'}</p>;
  const readOnly = timeline.project.archived;
  const activeVendors = linkedVendors.filter((vendor) => !vendor.archived);
  const card = (item: ItemSummary) => (
    <ItemCard
      key={item.id}
      item={item}
      projectId={projectId}
      vendors={activeVendors}
      readOnly={readOnly}
      version={version}
      delays={timeline.delays.filter((delay) => delay.timeline_item?.id === item.id)}
      issues={timeline.coordination_issues.filter((issue) => issue.timeline_item?.id === item.id)}
      highlighted={item.id === itemId}
      onChanged={load}
    />
  );

  return (
    <section className="section timeline-section" aria-label="Timeline">
      <div className="section-heading">
        <div>
          <h2>Timeline</h2>
          <span className="count-badge">{timeline.items.length}</span>
        </div>
        <p>{flagSummary(timeline.items)}</p>
      </div>
      {readOnly ? <p className="notice">This project is archived. Its timeline is read-only.</p> : null}
      {timeline.items.length === 0 ? (
        <div className="empty-box"><p className="empty">No timeline items yet.</p></div>
      ) : (
        <ol className="timeline-track" aria-label="Timeline items">
          {timeline.items.map((item) => (
            <li key={item.id} className={`timeline-node ${statusClass[item.status]}${item.flags.some((flag) => flag.type === 'OVERDUE') ? ' is-overdue' : ''}`}>
              {card(item)}
            </li>
          ))}
        </ol>
      )}
      {!readOnly ? <ItemForm projectId={projectId} vendors={activeVendors} onSaved={load} /> : null}

      <div className="section-heading">
        <div>
          <h2>Delays and coordination issues</h2>
          <span className="count-badge">{timeline.delays.length + timeline.coordination_issues.length}</span>
        </div>
        <p>Recorded against the whole project or one item</p>
      </div>
      <RecordList delays={timeline.delays} issues={timeline.coordination_issues} showItem />
      {!readOnly ? (
        <div className="two-up">
          <DelayForm projectId={projectId} items={timeline.items} onSaved={load} />
          <IssueForm projectId={projectId} items={timeline.items} vendors={linkedVendors} onSaved={load} />
        </div>
      ) : null}
      <details className="card archived-items" open={archivedOpen} onToggle={(event) => setArchivedOpen(event.currentTarget.open)}>
        <summary>Archived items ({timeline.archived_items.length})</summary>
        <div className="grid">
          {timeline.archived_items.length === 0 ? <p className="empty">No archived items.</p> : timeline.archived_items.map(card)}
        </div>
      </details>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
    </section>
  );
}
