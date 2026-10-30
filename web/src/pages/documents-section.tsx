import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { HistoryPanel } from './history-panel';
import { istDateTime } from '../time';

interface DocumentItem {
  id: string;
  title: string;
  document_type: string;
  note: string | null;
  original_filename: string;
  media_type: string;
  byte_size: number;
  archived: boolean;
  created_at: string;
  created_by: { id: string; name: string };
}

// Documents are archived, never deleted (FR-016), so there is no delete control here.

const TYPES: Record<string, string> = {
  AGREEMENT: 'Agreement',
  DRAWING: 'Drawing',
  REGISTRATION_CERTIFICATE: 'Registration certificate',
  PHOTO: 'Photo',
  OTHER: 'Other',
};

// The server refuses anything larger (FR-013); checking here saves sending the bytes.
const MAX_BYTES = 25 * 1024 * 1024;

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error">{message}</span> : null;
}

function UploadForm({ action, onSaved }: { action: string; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFields({});
    setError('');
    if (file && file.size > MAX_BYTES) {
      setFields({ file: 'The file must be 25 MB or smaller.' });
      return;
    }
    const data = new FormData();
    if (file) data.append('file', file);
    data.append('title', title);
    data.append('document_type', type);
    data.append('note', note);
    try {
      await api(action, { method: 'POST', body: data });
      setFile(null);
      setFileKey((key) => key + 1);
      setTitle('');
      setType('');
      setNote('');
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setError(caught instanceof Error ? caught.message : 'The document was not uploaded.');
    }
  }

  return (
    <form className="card grid" onSubmit={submit}>
      <h3>Upload a document</h3>
      <label>
        File
        <input
          key={fileKey}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          aria-invalid={Boolean(fields.file)}
        />
      </label>
      <FieldError message={fields.file} />
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(fields.title)} />
      </label>
      <FieldError message={fields.title} />
      <label>
        Document type
        <select value={type} onChange={(event) => setType(event.target.value)} aria-invalid={Boolean(fields.document_type)}>
          <option value="">Choose</option>
          {Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <FieldError message={fields.document_type} />
      <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">Upload document</button>
    </form>
  );
}

export function DocumentsSection({ parent, parentId, parentArchived }: { parent: 'vendors' | 'projects'; parentId: string; parentArchived: boolean }) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');

  const base = `/api/${parent}/${parentId}/documents`;

  const load = useCallback(() => {
    api<DocumentItem[]>(showArchived ? `${base}?include_archived=true` : base)
      .then((response) => {
        setDocuments(response);
        setError('');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Documents could not be loaded.'));
  }, [base, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  async function setArchived(documentId: string, archived: boolean) {
    setError('');
    try {
      await api(`/api/documents/${documentId}/${archived ? 'archive' : 'restore'}`, { method: 'POST' });
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The document was not changed.');
    }
  }

  return (
    <section className="grid" aria-label="Documents section">
      <h2>Documents</h2>
      <label className="check">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived
      </label>
      {error ? <p className="error">{error}</p> : null}
      {documents && documents.length > 0 ? (
        <ul className="grid" aria-label="Documents">
          {documents.map((document) => (
            <li className="card" key={document.id}>
              <p>
                <strong>{document.title}</strong> · {TYPES[document.document_type] ?? document.document_type}
                {document.archived ? ' · Archived' : ''}
              </p>
              <p>
                {document.original_filename} · {fileSize(document.byte_size)} · Uploaded by {document.created_by.name} ·{' '}
                {istDateTime(document.created_at)}
              </p>
              {document.note ? <p>{document.note}</p> : null}
              <div className="row">
                <a href={`/api/documents/${document.id}/file`}>Download {document.original_filename}</a>
                {parentArchived ? null : (
                  <button type="button" className="secondary" onClick={() => setArchived(document.id, !document.archived)}>
                    {document.archived ? 'Restore' : 'Archive'}
                  </button>
                )}
              </div>
              <HistoryPanel target="document_id" id={document.id} label={`History of ${document.title}`} />
            </li>
          ))}
        </ul>
      ) : null}
      {documents && documents.length === 0 ? <p>No documents yet.</p> : null}
      {parentArchived ? null : <UploadForm action={base} onSaved={load} />}
    </section>
  );
}
