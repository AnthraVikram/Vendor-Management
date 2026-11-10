import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { DocumentsSection } from './documents-section';
import { HistoryPanel } from './history-panel';
import { notify } from '../notify';
import { formatDate, formatDateTime } from '../time';
import { Skeleton } from '../ui/skeleton';
import { ArchivedBadge, AssignmentStatusBadge, AvailabilityBadge, ProjectStatusBadge } from '../badges';
import { ConfirmDialog } from '../ui/confirm-dialog';

interface ProjectLink {
  id: string;
  project_id: string;
  project_name: string;
  project_status: string;
  project_archived: boolean;
  role_on_project: string | null;
  scope_of_work: string | null;
  note: string | null;
  assignment_status?: string;
  // Feature 005 FR-018: the sections the vendor works on in this project.
  sections?: { id: string; name: string; role_in_section: string | null }[];
}

// A removed assignment, kept read-only for history (Feature 004 FR-013). It has no status and no actions.
interface PastProjectLink {
  id: string;
  project_id: string;
  project_name: string;
  project_archived: boolean;
  role_on_project: string | null;
  scope_of_work: string | null;
  note: string | null;
  removed_at: string;
  removed_by: { id: string; name: string };
}

interface VendorDetail {
  id: string;
  name: string;
  phone: string;
  archived: boolean;
  availability: string | null;
  contact_person?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  categories?: { id: string; name: string }[];
  services?: string[];
  materials?: string[];
  locations?: string[];
  team_size?: number | null;
  manpower_note?: string | null;
  gst_registered?: boolean;
  gstin?: string | null;
  gst_legal_name?: string | null;
  rates: { label: string; amount: string; unit: string }[];
  notes: { id: string; note_type: string; body: string }[];
  current_rating: { score: number } | null;
  import_run?: { id: string; file_name: string; created_at: string } | null;
  links?: ProjectLink[];
  past_links?: PastProjectLink[];
  project_count?: number;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value ? value : <span className="muted">Not set</span>}</dd>
    </div>
  );
}

function listText(values: string[] | undefined): string | null {
  return values && values.length > 0 ? values.join(', ') : null;
}

function projectCount(count: number): string {
  return `${count} ${count === 1 ? 'project' : 'projects'}`;
}

// onTitle passes the vendor's name to the breadcrumbs (Feature 005 FR-038).
export function VendorDetail({ id, onTitle }: { id: string; onTitle?: (name: string) => void }) {
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [note, setNote] = useState('');
  const [score, setScore] = useState('5');
  const [error, setError] = useState('');

  function load() {
    api<VendorDetail>(`/api/vendors/${id}`).then((row) => {
      setVendor(row);
      onTitle?.(row.name);
    }).catch((caught: Error) => setError(caught.message));
  }

  useEffect(load, [id]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    await api(`/api/vendors/${id}/notes`, { method: 'POST', body: JSON.stringify({ note_type: 'GENERAL', body: note }) });
    setNote('');
    load();
  }

  async function addRating(event: FormEvent) {
    event.preventDefault();
    await api(`/api/vendors/${id}/ratings`, { method: 'POST', body: JSON.stringify({ score: Number(score) }) });
    load();
  }

  // Feature 005 FR-028: archiving asks first and explains nothing is deleted; restoring does not ask.
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function setArchived(archived: boolean) {
    await api(`/api/vendors/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' });
    notify(archived ? 'Vendor archived' : 'Vendor restored');
    load();
  }

  if (!vendor) return error ? <p>{error}</p> : <Skeleton label="Loading vendor" rows={6} />;
  const links = vendor.links ?? [];
  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Vendor</p>
          <h1>{vendor.name}</h1>
          <div className="page-meta">
            <span>{vendor.phone}</span>
            <AvailabilityBadge availability={vendor.availability} />
            {vendor.archived ? <ArchivedBadge /> : null}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className={vendor.archived ? 'secondary' : 'danger'} onClick={() => (vendor.archived ? setArchived(false) : setConfirmArchive(true))}>
            {vendor.archived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </header>
      {vendor.archived ? <p className="notice archived-note">Archived records are kept and can be restored.</p> : null}
      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${vendor.name}?`}
        message="It will be hidden from active lists. Nothing is deleted: its projects, sections, documents and history stay, and it can be restored at any time."
        confirmLabel="Archive vendor"
        danger
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false);
          setArchived(true);
        }}
      />
      {vendor.import_run ? (
        <p className="meta">
          <a href={`#/vendor-imports?run=${vendor.import_run.id}`}>
            Imported in {vendor.import_run.file_name} on {formatDate(vendor.import_run.created_at)}
          </a>
        </p>
      ) : null}
      <div className="detail-grid">
        <div className="card grid">
          <h2>Contact details</h2>
          <dl className="facts">
            <Fact label="Business name" value={vendor.name} />
            <Fact label="Contact person" value={vendor.contact_person} />
            <Fact label="Phone" value={vendor.phone} />
            <Fact label="Alternate phone" value={vendor.alternate_phone} />
            <Fact label="Email" value={vendor.email} />
            <Fact label="Address" value={vendor.address} />
          </dl>
        </div>
        <div className="card grid">
          <h2>What the vendor does</h2>
          <dl className="facts">
            <Fact label="Categories" value={listText(vendor.categories?.map((category) => category.name))} />
            <Fact label="Services" value={listText(vendor.services)} />
            <Fact label="Materials" value={listText(vendor.materials)} />
            <Fact label="Locations served" value={listText(vendor.locations)} />
          </dl>
        </div>
        <div className="card grid">
          <h2>Manpower</h2>
          <dl className="facts">
            <Fact label="Team size" value={vendor.team_size == null ? null : String(vendor.team_size)} />
            <div className="fact">
              <dt>Availability</dt>
              <dd><AvailabilityBadge availability={vendor.availability} /></dd>
            </div>
            <Fact label="Manpower note" value={vendor.manpower_note} />
          </dl>
        </div>
        <div className="card grid">
          <h2>GST details</h2>
          <dl className="facts">
            <Fact label="GST registered" value={vendor.gst_registered ? 'Yes' : 'No'} />
            <Fact label="GSTIN" value={vendor.gstin} />
            <Fact label="Legal name" value={vendor.gst_legal_name} />
          </dl>
        </div>
        <div className="card grid">
          <h2>Indicative rates</h2>
          {vendor.rates.length > 0 ? (
            <ul className="plain-list">
              {vendor.rates.map((rate) => (
                <li key={rate.label}>{rate.label}: {rate.amount} / {rate.unit}</li>
              ))}
            </ul>
          ) : <p className="empty">No rates recorded.</p>}
        </div>
        <div className="card grid">
          <h2>Rating</h2>
          <p>Current rating: <span className="big-number">{vendor.current_rating?.score ?? 'None'}</span></p>
          <form onSubmit={addRating} className="inline-form">
            <label>Score<input value={score} onChange={(event) => setScore(event.target.value)} /></label>
            <button type="submit">Save rating</button>
          </form>
        </div>
        <div className="card grid span-all">
          <h2>Notes</h2>
          {vendor.notes.length > 0 ? (
            <ul className="plain-list">{vendor.notes.map((item) => <li key={item.id}>{item.note_type}: {item.body}</li>)}</ul>
          ) : <p className="empty">No notes yet.</p>}
          <form onSubmit={addNote} className="inline-form">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
            <button type="submit">Add note</button>
          </form>
        </div>
      </div>
      <section className="section" aria-labelledby="vendor-projects-heading">
        <div className="section-heading">
          <div>
            <h2 id="vendor-projects-heading">Projects</h2>
            <span className="count-badge">{projectCount(vendor.project_count ?? 0)}</span>
          </div>
          <p>Projects this vendor is assigned to</p>
        </div>
        {links.length > 0 ? (
          <ul className="card-list plain-list">
            {links.map((link) => (
              <li className="card grid" key={link.id}>
                <div className="card-heading">
                  <p><strong><a href={`#/projects/${link.project_id}`}>{link.project_name}</a></strong></p>
                  <ProjectStatusBadge status={link.project_status} />
                  {link.project_archived ? <ArchivedBadge /> : null}
                  {link.assignment_status ? <AssignmentStatusBadge status={link.assignment_status} /> : null}
                </div>
                {link.role_on_project || link.scope_of_work || link.note ? (
                  <p className="meta">{[link.role_on_project, link.scope_of_work, link.note].filter(Boolean).join(' · ')}</p>
                ) : null}
                {link.sections && link.sections.length > 0 ? (
                  <p className="meta">Sections: {link.sections.map((section) => (section.role_in_section ? `${section.name} (${section.role_in_section})` : section.name)).join(', ')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="empty">This vendor is not assigned to any project yet</p>}
      </section>
      <section className="section" aria-labelledby="vendor-past-projects-heading">
        <div className="section-heading">
          <div><h2 id="vendor-past-projects-heading">Past projects</h2></div>
          <p>Projects this vendor was removed from. Kept for reference and cannot be changed.</p>
        </div>
        {(vendor.past_links ?? []).length > 0 ? (
          <ul className="card-list plain-list">
            {(vendor.past_links ?? []).map((link) => (
              <li className="card grid past-card" key={link.id}>
                <div className="card-heading">
                  <p><strong><a href={`#/projects/${link.project_id}`}>{link.project_name}</a></strong></p>
                  {link.project_archived ? <ArchivedBadge /> : null}
                </div>
                {link.role_on_project || link.scope_of_work || link.note ? (
                  <p className="meta">{[link.role_on_project, link.scope_of_work, link.note].filter(Boolean).join(' · ')}</p>
                ) : null}
                <p className="meta">Removed by {link.removed_by.name} on {formatDateTime(link.removed_at)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="empty">No past projects</p>}
      </section>
      <DocumentsSection parent="vendors" parentId={vendor.id} parentArchived={vendor.archived} />
      <div className="section">
        <div className="section-heading">
          <div><h2>History</h2></div>
          <p>Who created and changed this vendor</p>
        </div>
        <HistoryPanel target="vendor_id" id={vendor.id} label="Vendor history" />
      </div>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
    </section>
  );
}
