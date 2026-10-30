import { useState } from 'react';
import { api } from '../api/client';
import { istDateTime } from '../time';

interface Person {
  id: string;
  name: string;
}

interface Entry {
  id: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  details: Record<string, unknown>;
  created_at: string;
  created_by: Person;
}

interface History {
  record: { created_at: string; created_by: Person; updated_at: string; updated_by: Person };
  entries: Entry[];
}

export type HistoryTarget = 'vendor_id' | 'project_id' | 'document_id' | 'import_run_id' | 'client_advance_id';

const ACTIONS: Record<string, string> = {
  CREATED: 'Created',
  EDITED: 'Edited',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
  REVERSED: 'Reversed',
};

// Field and detail names that do not read well when simply un-snake-cased.
const NAMES: Record<string, string> = {
  gstin: 'GSTIN',
  gst_registered: 'GST registered',
  gst_legal_name: 'GST legal name',
  received_on: 'Date received',
  original_filename: 'File',
  imported_count: 'Imported',
  skipped_count: 'Skipped',
  rejected_count: 'Rejected',
};

function fieldName(key: string): string {
  if (NAMES[key]) return NAMES[key];
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function value(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '(blank)';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (Array.isArray(raw)) return raw.length > 0 ? raw.join(', ') : '(none)';
  return String(raw);
}

const when = istDateTime;

function Details({ details }: { details: Record<string, unknown> }) {
  return (
    <>
      {Object.entries(details).map(([key, raw]) =>
        key === 'import_run_id' ? (
          <p key={key}><a href={`#/vendor-imports?run=${String(raw)}`}>From an import</a></p>
        ) : (
          <p key={key}>{fieldName(key)}: {key === 'amount' ? `₹${String(raw)}` : value(raw)}</p>
        ),
      )}
    </>
  );
}

// A collapsible, read-only history (FR-027, FR-028). It loads only when opened. Nothing here edits or removes an entry.
export function HistoryPanel({ target, id, label = 'History' }: { target: HistoryTarget; id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');

  function toggle() {
    if (!open) {
      setError('');
      api<History>(`/api/history?${target}=${encodeURIComponent(id)}`)
        .then(setHistory)
        .catch((caught: Error) => setError(caught.message));
    }
    setOpen(!open);
  }

  return (
    <section className="grid" aria-label={label}>
      <button type="button" className="secondary" aria-expanded={open} onClick={toggle}>
        {open ? 'Hide history' : 'Show history'}
      </button>
      {open && error ? <p className="error">{error}</p> : null}
      {open && history ? (
        <div className="grid history">
          <p>Created by {history.record.created_by.name} on {when(history.record.created_at)}</p>
          <p>Last updated by {history.record.updated_by.name} on {when(history.record.updated_at)}</p>
          {history.entries.length === 0 ? (
            <p>No changes recorded since history began.</p>
          ) : (
            <ul className="grid" aria-label="History entries">
              {history.entries.map((entry) => (
                <li key={entry.id}>
                  <p>
                    <strong>{ACTIONS[entry.action] ?? entry.action}</strong> · {entry.created_by.name} · {when(entry.created_at)}
                  </p>
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <p key={field}>
                      {fieldName(field)}: {value(change.from)} → {value(change.to)}
                    </p>
                  ))}
                  <Details details={entry.details} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
