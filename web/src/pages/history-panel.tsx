import { useEffect, useRef, useState } from 'react';
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

// Stored details come back in the database's key order; known ones are shown in a fixed, readable order.
const DETAIL_ORDER = ['imported_count', 'skipped_count', 'rejected_count', 'amount', 'received_on', 'reason', 'title', 'original_filename', 'import_run_id'];
const detailRank = (key: string) => (DETAIL_ORDER.includes(key) ? DETAIL_ORDER.indexOf(key) : DETAIL_ORDER.length);

function Details({ details }: { details: Record<string, unknown> }) {
  return (
    <>
      {Object.entries(details).sort(([a], [b]) => detailRank(a) - detailRank(b)).map(([key, raw]) =>
        key === 'import_run_id' ? (
          <p key={key} className="history-detail"><a href={`#/vendor-imports?run=${String(raw)}`}>From an import</a></p>
        ) : (
          <p key={key} className="history-detail">
            <span className="history-field">{fieldName(key)}</span>: <span className="history-value">{key === 'amount' ? `₹${String(raw)}` : value(raw)}</span>
          </p>
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
  // The record this panel currently belongs to. A page can reuse the panel for another record (for example,
  // moving from one vendor to the next), so it closes, forgets what it loaded, and ignores late replies.
  const current = useRef(`${target}:${id}`);

  useEffect(() => {
    current.current = `${target}:${id}`;
    setOpen(false);
    setHistory(null);
    setError('');
  }, [target, id]);

  function toggle() {
    if (!open) {
      const requestedFor = `${target}:${id}`;
      setError('');
      api<History>(`/api/history?${target}=${encodeURIComponent(id)}`)
        .then((loaded) => {
          if (current.current === requestedFor) setHistory(loaded);
        })
        .catch((caught: Error) => {
          if (current.current === requestedFor) setError(caught.message);
        });
    }
    setOpen(!open);
  }

  return (
    <section className={`history-panel${open ? ' is-open' : ''}`} aria-label={label}>
      <button type="button" className="secondary small history-toggle" aria-expanded={open} onClick={toggle}>
        <span className="chevron" aria-hidden="true" />
        {open ? 'Hide history' : 'Show history'}
      </button>
      {open && error ? <p className="error form-error" role="alert">{error}</p> : null}
      {open && history ? (
        <div className="grid history">
          <div className="history-record">
            <p>Created by {history.record.created_by.name} on {when(history.record.created_at)}</p>
            <p>Last updated by {history.record.updated_by.name} on {when(history.record.updated_at)}</p>
          </div>
          {history.entries.length === 0 ? (
            <p className="empty">No changes recorded since history began.</p>
          ) : (
            <ul className="history-timeline" aria-label="History entries">
              {history.entries.map((entry) => (
                <li key={entry.id} className={`history-entry action-${entry.action.toLowerCase()}`}>
                  <p className="history-head">
                    <strong className="history-action">{ACTIONS[entry.action] ?? entry.action}</strong> · {entry.created_by.name} · <span className="history-when">{when(entry.created_at)}</span>
                  </p>
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <p key={field} className="history-change">
                      <span className="history-field">{fieldName(field)}</span>: <span className="history-from">{value(change.from)}</span> → <span className="history-to">{value(change.to)}</span>
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
