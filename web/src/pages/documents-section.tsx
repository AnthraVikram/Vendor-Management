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

// The file's extension, shown as a small label beside the document.
function extension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1, dot + 5).toUpperCase() : 'FILE';
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error" role="alert">{message}</span> : null;
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
    <form className="card form-2col upload-form" onSubmit={submit}>
      <div className="span-2 form-intro">
        <h3>Upload a document</h3>
        <p className="meta">PDF, JPG, PNG, Word, or Excel, up to 25 MB. The file's content must match its type.</p>
      </div>
      <div className="field span-2">
        <label className="dropzone">
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
      </div>
      <div className="field">
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(fields.title)} />
        </label>
        <FieldError message={fields.title} />
      </div>
      <div className="field">
        <label>
          Document type
          <select value={type} onChange={(event) => setType(event.target.value)} aria-invalid={Boolean(fields.document_type)}>
            <option value="">Choose</option>
            {Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <FieldError message={fields.document_type} />
      </div>
      <label className="span-2">Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error ? <p className="error form-error span-2" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit">Upload document</button>
      </div>
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
    <section className="grid section" aria-label="Documents section">
      <div className="section-heading">
        <div>
          <h2>Documents</h2>
          {documents ? <span className="count-badge">{documents.length}</span> : null}
        </div>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Show archived
        </label>
      </div>
      {parentArchived ? (
        <p className="notice">This {parent === 'vendors' ? 'vendor' : 'project'} is archived, so its documents are read-only. They can still be downloaded.</p>
      ) : null}
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      {documents && documents.length > 0 ? (
        <ul className="grid" aria-label="Documents">
          {documents.map((document) => (
            <li className={`card document${document.archived ? ' document-archived' : ''}`} key={document.id}>
              <div className="document-main">
                <span className="file-chip" aria-hidden="true">{extension(document.original_filename)}</span>
                <div className="document-body">
                  <p className="document-title">
                    <strong>{document.title}</strong>
                    <span className="status-badge status-planned">{TYPES[document.document_type] ?? document.document_type}</span>
                    {document.archived ? <span className="status-badge status-archived">Archived</span> : null}
                  </p>
                  <p className="meta">
                    {document.original_filename} · {fileSize(document.byte_size)} · <span>Uploaded by {document.created_by.name} · {istDateTime(document.created_at)}</span>
                  </p>
                  {document.note ? <p className="document-note">{document.note}</p> : null}
                </div>
                <div className="document-actions">
                  <a className="button secondary small" href={`/api/documents/${document.id}/file`} aria-label={`Download ${document.original_filename}`}>Download</a>
                  {parentArchived ? null : (
                    <button type="button" className={document.archived ? 'secondary small' : 'danger small'} onClick={() => setArchived(document.id, !document.archived)}>
                      {document.archived ? 'Restore' : 'Archive'}
                    </button>
                  )}
                </div>
              </div>
              <HistoryPanel target="document_id" id={document.id} label={`History of ${document.title}`} />
            </li>
          ))}
        </ul>
      ) : null}
      {documents && documents.length === 0 ? (
        <div className="empty-box">
          <p className="empty">No documents yet.</p>
          {parentArchived ? null : <p className="meta">Upload agreements, drawings, certificates, or photos below.</p>}
        </div>
      ) : null}
      {parentArchived ? null : <UploadForm action={base} onSaved={load} />}
    </section>
  );
}
