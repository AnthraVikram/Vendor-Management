import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

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

function when(value: string): string {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

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
  return message ? <span className="error">{message}</span> : null;
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
  return (
    <form className="card grid" onSubmit={submit} aria-label={item ? `Edit ${item.name}` : 'Add timeline item'}>
      <h3>{item ? `Edit ${item.name}` : 'Add timeline item'}</h3>
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
      <div className="row">
        <button type="submit">Save item</button>
        {onCancel ? <button type="button" className="secondary" onClick={onCancel}>Cancel</button> : null}
      </div>
      {fields.body ? <p className="error">{fields.body}</p> : null}
      {message ? <p className="error">{message}</p> : null}
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
    <form className="row" onSubmit={submit} aria-label={`Record progress on ${itemName}`}>
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
      <button type="submit">Save update</button>
      {message ? <p className="error">{message}</p> : null}
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
  if (rows.length === 0) return <p>No delays or coordination issues.</p>;
  return (
    <ul className="records">
      {rows.map((row) => (
        <li key={row.key}>
          <strong>{row.kind}</strong>{showItem ? ` · ${row.item ? row.item.name : 'Whole project'}` : ''}: {row.text}
          {row.vendors ? ` · Vendors: ${row.vendors}` : ''} · {row.by.name}, {when(row.at)}
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
    <form className="card grid" onSubmit={submit} aria-label="Record delay">
      <h3>Record delay</h3>
      <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <ItemChoice items={items} value={itemId} onChange={setItemId} />
      <button type="submit">Record delay</button>
      {message ? <p className="error">{message}</p> : null}
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
    <form className="card grid" onSubmit={submit} aria-label="Record coordination issue">
      <h3>Record coordination issue</h3>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <ItemChoice items={items} value={itemId} onChange={setItemId} />
      <fieldset className="row">
        <legend>Vendors involved</legend>
        {vendors.length === 0 ? <span>No linked vendors.</span> : vendors.map((vendor) => (
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
      {message ? <p className="error">{message}</p> : null}
    </form>
  );
}

function ItemHistory({ itemId, version }: { itemId: string; version: number }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ItemDetail>(`/api/timeline-items/${itemId}`).then(setDetail).catch((caught: Error) => setError(caught.message));
  }, [itemId, version]);

  if (!detail) return <p>{error || 'Loading history'}</p>;
  return (
    <div className="grid history">
      <h4>Progress updates</h4>
      {detail.progress_updates.length === 0 ? <p>No progress updates yet.</p> : (
        <ul>
          {detail.progress_updates.map((update) => (
            <li key={update.id}>
              {statusLabel[update.status]}{update.note ? `: ${update.note}` : ''}, by {update.created_by.name}, {when(update.created_at)}
            </li>
          ))}
        </ul>
      )}
      <h4>Date changes</h4>
      {detail.date_changes.length === 0 ? <p>No date changes.</p> : (
        <ul>
          {detail.date_changes.map((change) => (
            <li key={change.id}>
              {change.field === 'DEADLINE' ? 'Deadline' : 'Planned date'}: {change.old_value ?? 'none'} → {change.new_value ?? 'none'}, by {change.created_by.name}, {when(change.created_at)}
            </li>
          ))}
        </ul>
      )}
      <h4>Responsible party changes</h4>
      {detail.responsible_changes.length === 0 ? <p>No responsible party changes.</p> : (
        <ul>
          {detail.responsible_changes.map((change) => (
            <li key={change.id}>
              {responsibleText(change.old)} → {responsibleText(change.new)}
              {change.cause === 'LINK_REMOVED' ? ' (vendor link removed)' : ''}, by {change.created_by.name}, {when(change.created_at)}
            </li>
          ))}
        </ul>
      )}
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
      className={`card grid timeline-item${highlighted ? ' highlighted' : ''}`}
      id={`timeline-item-${item.id}`}
      aria-label={`Timeline item ${item.name}`}
    >
      <div className="item-heading">
        <strong>{item.name}</strong>
        <span>{typeLabel[item.item_type]}</span>
      </div>
      <FlagBadges flags={item.flags} />
      <dl className="facts">
        <div><dt>Deadline</dt><dd>{item.deadline}</dd></div>
        <div><dt>Planned date</dt><dd>{item.planned_date ?? 'None'}</dd></div>
        <div><dt>Responsible</dt><dd>{responsibleText(item.responsible)}</dd></div>
        <div><dt>Status</dt><dd>{statusLabel[item.status]}{item.done_on ? `, done on ${item.done_on}` : ''}</dd></div>
        <div><dt>Last update</dt><dd>{item.last_update_on ?? 'None yet'}</dd></div>
      </dl>
      {item.description ? <p>{item.description}</p> : null}
      <div className="row">
        {!readOnly && !item.archived ? <button type="button" className="secondary" onClick={() => setEditing((current) => !current)}>Edit</button> : null}
        {!readOnly ? (
          <button type="button" className="secondary" onClick={() => setArchived(!item.archived)}>{item.archived ? 'Restore' : 'Archive'}</button>
        ) : null}
        <button type="button" className="secondary" onClick={() => setShowHistory((current) => !current)}>
          {showHistory ? 'Hide history' : 'Show history'}
        </button>
      </div>
      {!readOnly && !item.archived ? <ProgressForm itemId={item.id} itemName={item.name} onSaved={onChanged} /> : null}
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
      {delays.length + issues.length > 0 ? <RecordList delays={delays} issues={issues} showItem={false} /> : null}
      {showHistory ? <ItemHistory itemId={item.id} version={version} /> : null}
      {error ? <p className="error">{error}</p> : null}
    </article>
  );
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

  if (!timeline) return <p>{error || 'Loading timeline'}</p>;
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
    <section className="grid" aria-label="Timeline">
      <h2>Timeline</h2>
      {readOnly ? <p className="notice">This project is archived. Its timeline is read-only.</p> : null}
      {timeline.items.length === 0 ? <p>No timeline items yet.</p> : timeline.items.map(card)}
      {!readOnly ? <ItemForm projectId={projectId} vendors={activeVendors} onSaved={load} /> : null}
      <h2>Delays and coordination issues</h2>
      <RecordList delays={timeline.delays} issues={timeline.coordination_issues} showItem />
      {!readOnly ? (
        <div className="two-up">
          <DelayForm projectId={projectId} items={timeline.items} onSaved={load} />
          <IssueForm projectId={projectId} items={timeline.items} vendors={linkedVendors} onSaved={load} />
        </div>
      ) : null}
      <details className="card" open={archivedOpen} onToggle={(event) => setArchivedOpen(event.currentTarget.open)}>
        <summary>Archived items ({timeline.archived_items.length})</summary>
        <div className="grid">
          {timeline.archived_items.length === 0 ? <p>No archived items.</p> : timeline.archived_items.map(card)}
        </div>
      </details>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
