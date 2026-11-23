import { useState } from 'react';
import { api, ApiError } from '../../api/client';

// The Feature 006 document types (FR-041), named so the right document is easy to pick.
const FINANCE_TYPES: Record<string, string> = { QUOTATION: 'Quotation', PURCHASE_ORDER: 'Purchase order', PAYMENT_PROOF: 'Payment proof' };

type ProjectDocument = { id: string; title: string; document_type: string; archived: boolean };

// Project documents chosen to go with a new record (FR-016, FR-030). The list loads only when asked for; archived
// documents are not offered (FR-042f). The server still checks every rule.
export function DocumentChoice({ projectId, chosen, onChange }: { projectId: string; chosen: string[]; onChange: (ids: string[]) => void }) {
  const [documents, setDocuments] = useState<ProjectDocument[] | null>(null);
  const [error, setError] = useState('');

  if (!documents) {
    return (
      <div className="span-2">
        <button
          type="button"
          className="secondary small"
          onClick={() =>
            api<ProjectDocument[]>(`/api/projects/${projectId}/documents`)
              .then((rows) => setDocuments(rows.filter((row) => !row.archived)))
              .catch(() => setError('The project documents could not be loaded.'))
          }
        >
          Choose documents
        </button>
        {error ? <span className="error" role="alert">{error}</span> : null}
      </div>
    );
  }
  return (
    <fieldset className="span-2">
      <legend>Documents to attach</legend>
      {documents.length ? (
        documents.map((document) => (
          <label key={document.id} className="checkbox">
            <input
              type="checkbox"
              checked={chosen.includes(document.id)}
              onChange={(event) => onChange(event.target.checked ? [...chosen, document.id] : chosen.filter((id) => id !== document.id))}
            />
            {FINANCE_TYPES[document.document_type] ? `${document.title} · ${FINANCE_TYPES[document.document_type]}` : document.title}
          </label>
        ))
      ) : (
        <p className="meta">No project documents to attach. Upload one under Documents first.</p>
      )}
    </fieldset>
  );
}

// An action that needs a reason first (FR-018, FR-025, FR-031): the button opens a small reason form. `noteLabel`
// adds an optional note, only for routes that accept one (revision status changes, FR-025).
export function ReasonAction({ label, danger, noteLabel, onSubmit }: { label: string; danger?: boolean; noteLabel?: string; onSubmit: (reason: string, note?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (!open) {
    return <button type="button" className={danger ? 'danger small' : 'secondary small'} onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        onSubmit(reason, note.trim() || undefined).catch((caught) => setError(caught instanceof ApiError ? (caught.body.fields?.reason ?? caught.message) : 'Not saved.'));
      }}
    >
      <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={Boolean(error)} /></label>
      {noteLabel ? <label>{noteLabel}<input value={note} onChange={(event) => setNote(event.target.value)} /></label> : null}
      <button type="submit" className={danger ? 'danger small' : 'secondary small'}>{label}</button>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </form>
  );
}
