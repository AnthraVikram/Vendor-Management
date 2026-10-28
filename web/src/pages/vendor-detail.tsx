import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

interface VendorDetail {
  id: string;
  name: string;
  phone: string;
  archived: boolean;
  availability: string | null;
  rates: { label: string; amount: string; unit: string }[];
  notes: { id: string; note_type: string; body: string }[];
  current_rating: { score: number } | null;
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
      <h1>{vendor.name}</h1>
      <p>{vendor.phone}</p>
      <p>Availability: {vendor.availability ?? 'Not set'}</p>
      <h2>Indicative rates</h2>
      <ul>
        {vendor.rates.map((rate) => (
          <li key={rate.label}>{rate.label}: {rate.amount} / {rate.unit}</li>
        ))}
      </ul>
      <p>Current rating: {vendor.current_rating?.score ?? 'None'}</p>
      <form onSubmit={addRating} className="row">
        <label>Score<input value={score} onChange={(event) => setScore(event.target.value)} /></label>
        <button type="submit">Save rating</button>
      </form>
      <ul>{vendor.notes.map((item) => <li key={item.id}>{item.note_type}: {item.body}</li>)}</ul>
      <form onSubmit={addNote} className="row">
        <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button type="submit">Add note</button>
      </form>
      <button type="button" className="secondary" onClick={toggleArchive}>{vendor.archived ? 'Restore' : 'Archive'}</button>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
