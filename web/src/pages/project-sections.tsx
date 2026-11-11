import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { ArchivedBadge } from '../badges';
import { notify } from '../notify';
import { formatDateTime } from '../time';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Tooltip } from '../ui/tooltip';
import { useUnsavedGuard } from '../ui/unsaved-guard';

// Feature 005 US2: a project's own sections and the vendors responsible for each (FR-008 to FR-019).

export interface SectionAssignment {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_archived: boolean;
  vendor_phone: string;
  vendor_contact_person: string | null;
  vendor_categories: { id: string; name: string }[];
  role_in_section: string | null;
}
export interface Section { id: string; name: string; position: number; description: string | null; notes: string | null; assignments: SectionAssignment[] }
export interface RemovedSection {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  removed_at: string;
  removed_by: { id: string; name: string } | null;
  past_assignments: { vendor_id: string; vendor_name: string; role_in_section: string | null }[];
}
export interface SectionsProject {
  id: string;
  archived: boolean;
  links: { vendor_id: string }[];
  sections: Section[];
  removed_sections: RemovedSection[];
  sections_version: string;
}

const SHORT_DESCRIPTION = 240;

function message(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

export function ProjectSections({ project, vendors, onChanged }: { project: SectionsProject; vendors: { id: string; name: string }[]; onChanged: () => void }) {
  const [order, setOrder] = useState(project.sections);
  const [version, setVersion] = useState(project.sections_version);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [removing, setRemoving] = useState<Section | null>(null);
  const editable = !project.archived;
  const reordered = order.map((section) => section.id).join() !== project.sections.map((section) => section.id).join();

  useEffect(() => {
    setOrder(project.sections);
    setVersion(project.sections_version);
  }, [project.sections, project.sections_version]);

  // Runs one change, then reloads the project; refusals are shown in plain words (Feature 004 FR-027).
  async function run(action: () => Promise<unknown>, done: string, fallback: string) {
    setError('');
    setNotice('');
    try {
      await action();
      if (done) notify(done);
      onChanged();
      return true;
    } catch (caught) {
      setError(message(caught, fallback));
      return false;
    }
  }

  function move(index: number, by: -1 | 1) {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setOrder(next);
  }

  async function saveOrder() {
    setError('');
    setNotice('');
    try {
      await api(`/api/projects/${project.id}/sections/order`, {
        method: 'PUT',
        body: JSON.stringify({ section_ids: order.map((section) => section.id), sections_version: version }),
      });
      notify('Section order saved');
      onChanged();
    } catch (caught) {
      const body = caught instanceof ApiError ? (caught.body as { code?: string; sections?: Section[]; sections_version?: string }) : undefined;
      if (body?.code === 'SECTIONS_CHANGED' && body.sections) {
        setOrder(body.sections);
        setVersion(body.sections_version ?? '');
        setNotice('Someone else changed the order. This is the current order.');
      } else {
        setError(message(caught, 'The order was not saved.'));
      }
    }
  }

  async function addSection(event: FormEvent) {
    event.preventDefault();
    const added = await run(
      () => api(`/api/projects/${project.id}/sections`, { method: 'POST', body: JSON.stringify({ name: newName }) }),
      'Section added',
      'The section was not added.',
    );
    if (added) setNewName('');
  }

  return (
    <section className="section project-sections" aria-labelledby="project-sections-heading">
      <div className="section-heading">
        <h2 id="project-sections-heading">Sections</h2>
        {editable && reordered ? (
          <div className="form-actions">
            <button type="button" onClick={saveOrder}>Save order</button>
            <button type="button" className="secondary" onClick={() => setOrder(project.sections)}>Undo order</button>
          </div>
        ) : null}
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      {order.length === 0 ? (
        <div className="empty-box">
          <p className="empty">This project has no sections yet</p>
          {editable ? (
            <div className="form-actions">
              <button
                type="button"
                onClick={() => run(() => api(`/api/projects/${project.id}/sections/blueprint`, { method: 'POST' }), 'Standard blueprint added', 'The blueprint was not added.')}
              >
                Use the standard blueprint
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="section-cards">
          {order.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              editable={editable}
              first={index === 0}
              last={index === order.length - 1}
              onMove={(by) => move(index, by)}
              onRemove={() => setRemoving(section)}
              project={project}
              vendors={vendors}
              run={run}
            />
          ))}
        </div>
      )}
      {editable ? (
        <form className="card inline-form" onSubmit={addSection} aria-label="Add a section">
          <label>New section name<input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} /></label>
          <button type="submit">Add section</button>
        </form>
      ) : null}
      {project.removed_sections.length > 0 ? (
        <details className="archived-items" role="group" aria-label={`Removed sections (${project.removed_sections.length})`}>
          <summary>Removed sections ({project.removed_sections.length})</summary>
          <ul className="removed-sections">
            {project.removed_sections.map((section) => (
              <li key={section.id}>
                <strong>{section.name}</strong>
                <span className="meta"> Removed by {section.removed_by?.name ?? 'someone'}, {formatDateTime(section.removed_at)}</span>
                {editable ? (
                  <button
                    type="button"
                    className="secondary small"
                    aria-label={`Restore ${section.name}`}
                    onClick={() => run(() => api(`/api/sections/${section.id}/restore`, { method: 'POST' }), 'Section restored', 'The section was not restored.')}
                  >
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        message={
          removing && removing.assignments.length > 0
            ? `Its vendors (${removing.assignments.map((row) => row.vendor_name).join(', ')}) will be taken off this section. The section is kept under Removed sections and can be restored.`
            : 'The section is kept under Removed sections and can be restored.'
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const section = removing!;
          setRemoving(null);
          run(() => api(`/api/sections/${section.id}`, { method: 'DELETE' }), 'Section removed', 'The section was not removed.');
        }}
      />
    </section>
  );
}

function SectionCard({
  section,
  editable,
  first,
  last,
  onMove,
  onRemove,
  project,
  vendors,
  run,
}: {
  section: Section;
  editable: boolean;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  project: SectionsProject;
  vendors: { id: string; name: string }[];
  run: (action: () => Promise<unknown>, done: string, fallback: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'text'>('view');
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState(section.name);
  const [description, setDescription] = useState(section.description ?? '');
  const [notes, setNotes] = useState(section.notes ?? '');
  const [expanded, setExpanded] = useState(false);
  const dirty =
    (mode === 'rename' && name !== section.name) ||
    (mode === 'text' && (description !== (section.description ?? '') || notes !== (section.notes ?? '')));
  useUnsavedGuard(dirty);

  function cancel() {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setName(section.name);
    setDescription(section.description ?? '');
    setNotes(section.notes ?? '');
    setMode('view');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const body = mode === 'rename' ? { name } : { description, notes };
    const saved = await run(
      () => api(`/api/sections/${section.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      mode === 'rename' ? 'Section renamed' : 'Section updated',
      'The section was not saved.',
    );
    if (saved) setMode('view');
  }

  const longText = (section.description ?? '').length > SHORT_DESCRIPTION;
  const shownDescription = longText && !expanded ? `${section.description!.slice(0, SHORT_DESCRIPTION).trimEnd()}…` : section.description;

  return (
    <article className="card section-card" aria-label={section.name}>
      <div className="section-card-head">
        {mode === 'rename' ? (
          <form className="inline-form" onSubmit={save}>
            <label>Section name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={cancel}>Cancel</button>
          </form>
        ) : (
          <h3 ref={heading} tabIndex={-1}>{section.name}</h3>
        )}
        {editable && mode === 'view' ? (
          <div className="section-card-actions">
            <Tooltip label={`Move ${section.name} up`}>
              <button type="button" className="secondary small" aria-label={`Move ${section.name} up`} disabled={first} onClick={() => onMove(-1)}>↑</button>
            </Tooltip>
            <Tooltip label={`Move ${section.name} down`}>
              <button type="button" className="secondary small" aria-label={`Move ${section.name} down`} disabled={last} onClick={() => onMove(1)}>↓</button>
            </Tooltip>
            <button type="button" className="secondary small" onClick={() => setMode('rename')}>Rename</button>
            <button type="button" className="secondary small" onClick={() => setMode('text')}>Edit text</button>
            <button type="button" className="danger small" onClick={onRemove}>Remove section</button>
          </div>
        ) : null}
      </div>
      {mode === 'text' ? (
        <form className="grid" onSubmit={save}>
          <label>Description<textarea value={description} maxLength={5000} rows={4} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Notes<textarea value={notes} maxLength={5000} rows={3} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="form-actions">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={cancel}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          {section.description ? (
            <p className="section-description">
              {shownDescription}{' '}
              {longText ? (
                <button type="button" className="link-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}</button>
              ) : null}
            </p>
          ) : null}
          {section.notes ? <p className="section-notes"><span className="meta">Notes:</span> {section.notes}</p> : null}
        </>
      )}
      {section.assignments.length > 0 ? (
        <ul className="section-vendors">
          {section.assignments.map((assignment) => (
            <AssignmentRow key={assignment.id} assignment={assignment} section={section} editable={editable} run={run} onRemoved={() => heading.current?.focus()} />
          ))}
        </ul>
      ) : (
        <p className="meta">No vendor is assigned to this section yet.</p>
      )}
      {editable ? <AssignForm section={section} project={project} vendors={vendors} run={run} /> : null}
    </article>
  );
}

function AssignmentRow({
  assignment,
  section,
  editable,
  run,
  onRemoved,
}: {
  assignment: SectionAssignment;
  section: Section;
  editable: boolean;
  run: (action: () => Promise<unknown>, done: string, fallback: string) => Promise<boolean>;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [role, setRole] = useState(assignment.role_in_section ?? '');
  const dirty = editing && role !== (assignment.role_in_section ?? '');
  useUnsavedGuard(dirty);

  async function save(event: FormEvent) {
    event.preventDefault();
    const saved = await run(
      () => api(`/api/section-assignments/${assignment.id}`, { method: 'PATCH', body: JSON.stringify({ role_in_section: role }) }),
      'Role updated',
      'The role was not saved.',
    );
    if (saved) setEditing(false);
  }

  function cancel() {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setRole(assignment.role_in_section ?? '');
    setEditing(false);
  }

  return (
    <li className={assignment.vendor_archived ? 'is-archived' : undefined}>
      <div className="section-vendor-main">
        <a href={`#/vendors/${assignment.vendor_id}`}>{assignment.vendor_name}</a>
        {assignment.vendor_archived ? <ArchivedBadge /> : null}
        <span className="meta">
          {[assignment.vendor_phone, assignment.vendor_contact_person, assignment.vendor_categories.map((category) => category.name).join(', ')].filter(Boolean).join(' · ')}
        </span>
        {editing ? (
          <form className="inline-form" onSubmit={save}>
            <label>Role of {assignment.vendor_name}<input value={role} maxLength={120} onChange={(event) => setRole(event.target.value)} /></label>
            <button type="submit">Save role</button>
            <button type="button" className="secondary" onClick={cancel}>Cancel</button>
          </form>
        ) : assignment.role_in_section ? (
          <span className="section-role">{assignment.role_in_section}</span>
        ) : null}
      </div>
      {editable && !editing ? (
        <div className="section-card-actions">
          <button type="button" className="secondary small" aria-label={`Edit role of ${assignment.vendor_name}`} onClick={() => setEditing(true)}>Edit role</button>
          <button
            type="button"
            className="danger small"
            aria-label={`Remove ${assignment.vendor_name} from ${section.name}`}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </button>
        </div>
      ) : null}
      {/* Feature 005 FR-043: removing a vendor from a section asks first. */}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${assignment.vendor_name} from ${section.name}?`}
        message={`${assignment.vendor_name} will no longer be assigned to ${section.name}. The vendor stays on the project and in any other sections, and the assignment is kept in the history.`}
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          // The removed row's button goes with it, so focus moves to the section heading (NFR-003, T048 O1).
          run(() => api(`/api/section-assignments/${assignment.id}`, { method: 'DELETE' }), `Vendor removed from ${section.name}`, 'The vendor was not removed.')
            .then((removed) => removed && onRemoved());
        }}
      />
    </li>
  );
}

function AssignForm({
  section,
  project,
  vendors,
  run,
}: {
  section: Section;
  project: SectionsProject;
  vendors: { id: string; name: string }[];
  run: (action: () => Promise<unknown>, done: string, fallback: string) => Promise<boolean>;
}) {
  const [vendorId, setVendorId] = useState('');
  const [role, setRole] = useState('');
  const onProject = new Set(project.links.map((link) => link.vendor_id));
  const inSection = new Set(section.assignments.map((assignment) => assignment.vendor_id));
  const choices = vendors.filter((vendor) => !inSection.has(vendor.id));
  const chosen = vendors.find((vendor) => vendor.id === vendorId);

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!vendorId) return;
    const body = { vendor_id: vendorId, ...(role.trim() ? { role_in_section: role.trim() } : {}) };
    let created = false;
    const saved = await run(
      async () => {
        const result = await api<{ project_assignment_created: boolean }>(`/api/sections/${section.id}/assignments`, { method: 'POST', body: JSON.stringify(body) });
        created = result.project_assignment_created;
      },
      // Replaced below once the answer says whether the project assignment was created too (FR-015a).
      '',
      'The vendor was not assigned.',
    );
    if (saved) {
      notify(created ? `Vendor assigned to project and to ${section.name}` : `Vendor assigned to ${section.name}`);
      setVendorId('');
      setRole('');
    }
  }

  return (
    <form className="inline-form section-assign" onSubmit={assign}>
      <label>
        Vendor
        <select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
          <option value="">Choose a vendor</option>
          <optgroup label="On this project">
            {choices.filter((vendor) => onProject.has(vendor.id)).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </optgroup>
          <optgroup label="Other vendors">
            {choices.filter((vendor) => !onProject.has(vendor.id)).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </optgroup>
        </select>
      </label>
      <label>Role in this section<input value={role} maxLength={120} onChange={(event) => setRole(event.target.value)} /></label>
      <button type="submit" disabled={!vendorId}>Assign</button>
      {chosen && !onProject.has(chosen.id) ? <p className="meta span-all">{chosen.name} is not on this project yet and will be added to it.</p> : null}
    </form>
  );
}
