import { FormEvent, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { formatDateTime } from '../../time';
import type { Attachment } from './types';

type RecordRef = { kind: 'revision' | 'approval' | 'purchase_order' | 'receipt'; id: string };

// Documents attached to one financial record (FR-041 to FR-042f). Attaching and removing are separate recorded
// actions; the server decides who may do either (FR-042b, FR-042d), and these controls only follow that rule.
export function Attachments({
  record,
  attachments,
  projectId,
  canAttach,
  canRemove,
  onChanged,
}: {
  record: RecordRef;
  attachments: Attachment[];
  projectId: string;
  canAttach: boolean;
  canRemove: (attachment: Attachment) => boolean;
  onChanged: () => void;
}) {
  const [documents, setDocuments] = useState<{ id: string; title: string; archived: boolean }[] | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [supersedes, setSupersedes] = useState('');
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [error, setError] = useState('');
  const current = attachments.filter((attachment) => attachment.current);
  const removed = attachments.filter((attachment) => !attachment.current);

  function openPicker() {
    api<{ id: string; title: string; archived: boolean }[]>(`/api/projects/${projectId}/documents`)
      .then(setDocuments)
      .catch((caught: Error) => setError(caught.message));
  }

  async function attach(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/financial-attachments', {
        method: 'POST',
        body: JSON.stringify({
          record,
          document_id: documentId,
          ...(supersedes ? { supersedes_attachment_id: supersedes, supersede_reason: reason } : {}),
        }),
      });
      setDocuments(null);
      setDocumentId('');
      setSupersedes('');
      setReason('');
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? (Object.values(caught.body.fields ?? {})[0] ?? caught.message) : 'The document was not attached.');
    }
  }

  async function remove(event: FormEvent, attachmentId: string) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/financial-attachments/${attachmentId}/removal`, { method: 'POST', body: JSON.stringify({ reason: removeReason }) });
      setRemoving(null);
      setRemoveReason('');
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? (caught.body.fields?.reason ?? caught.message) : 'The attachment was not removed.');
    }
  }

  return (
    <div className="attachments">
      {current.length ? (
        <ul className="attachment-list" aria-label="Attached documents">
          {current.map((attachment) => (
            <li key={attachment.id}>
              <a href={`/api/documents/${attachment.document.id}/file`}>{attachment.document.title}</a>
              {attachment.document.archived ? <span className="status-badge"> Archived</span> : null}
              {attachment.superseded_by ? <span className="meta"> · Superseded by {attachment.superseded_by.document.title}</span> : null}
              {attachment.supersede_reason ? <span className="meta"> · Correction: {attachment.supersede_reason}</span> : null}
              <span className="meta"> · {attachment.created_by.name} · {formatDateTime(attachment.created_at)}</span>
              {canRemove(attachment) && !attachment.superseded_by && !attachment.supersedes_attachment_id ? (
                removing === attachment.id ? (
                  <form className="inline-form" onSubmit={(event) => remove(event, attachment.id)}>
                    <label>Reason for removing<input value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} /></label>
                    <button type="submit" className="secondary small">Remove</button>
                  </form>
                ) : (
                  <button type="button" className="secondary small" onClick={() => setRemoving(attachment.id)}>Remove {attachment.document.title}</button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {removed.length ? (
        <details>
          <summary>Removed attachments ({removed.length})</summary>
          <ul aria-label="Removed attachments">
            {removed.map((attachment) => (
              <li key={attachment.id}>
                <a href={`/api/documents/${attachment.document.id}/file`}>{attachment.document.title}</a>
                <span className="meta"> · removed by {attachment.removal!.created_by.name} · {formatDateTime(attachment.removal!.created_at)} · Reason: {attachment.removal!.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {canAttach ? (
        documents ? (
          <form className="inline-form" onSubmit={attach} aria-label="Attach a document">
            <label>
              Document
              <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
                <option value="">Choose</option>
                {documents.filter((document) => !document.archived).map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
              </select>
            </label>
            {current.length ? (
              <label>
                Corrects
                <select value={supersedes} onChange={(event) => setSupersedes(event.target.value)}>
                  <option value="">Nothing (a new document)</option>
                  {current.filter((attachment) => !attachment.superseded_by).map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.document.title}</option>)}
                </select>
              </label>
            ) : null}
            {supersedes ? <label>Reason for the correction<input value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}
            <button type="submit" className="secondary small">Attach</button>
          </form>
        ) : (
          <button type="button" className="secondary small" onClick={openPicker}>Attach a document</button>
        )
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
