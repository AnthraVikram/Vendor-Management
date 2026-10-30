import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { DocumentsSection } from './documents-section';
import { HistoryPanel } from './history-panel';
import { istDate } from '../time';
import { ArchivedBadge, AvailabilityBadge } from '../badges';

interface VendorDetail {
  id: string;
  name: string;
  phone: string;
  archived: boolean;
  availability: string | null;
  rates: { label: string; amount: string; unit: string }[];
  notes: { id: string; note_type: string; body: string }[];
  current_rating: { score: number } | null;
  import_run?: { id: string; file_name: string; created_at: string } | null;
}

export function VendorDetail({ id }: { id: string }) {
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [note, setNote] = useState('');
  const [score, setScore] = useState('5');
  const [error, setError] = useState('');

  function load() {
    api<VendorDetail>(`/api/vendors/${id}`).then(setVendor).catch((caught: Error) => setError(caught.message));
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

  async function toggleArchive() {
    await api(`/api/vendors/${id}/${vendor?.archived ? 'restore' : 'archive'}`, { method: 'POST' });
    load();
  }

  if (!vendor) return <p>{error || 'Loading vendor'}</p>;
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
          <button type="button" className={vendor.archived ? 'secondary' : 'danger'} onClick={toggleArchive}>{vendor.archived ? 'Restore' : 'Archive'}</button>
        </div>
      </header>
      {vendor.import_run ? (
        <p className="meta">
          <a href={`#/vendor-imports?run=${vendor.import_run.id}`}>
            Imported in {vendor.import_run.file_name} on {istDate(vendor.import_run.created_at)}
          </a>
        </p>
      ) : null}
      <div className="detail-grid">
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
