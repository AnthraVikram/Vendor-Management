import { FormEvent, type ReactNode, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { formatDate, formatDateTime } from '../../time';
import { HistoryPanel } from '../history-panel';
import { Attachments } from './attachments';
import { ReasonAction } from './controls';
import { inclGst, inr } from './money';
import { type ClientFinance, isReviewer, type Revision, type RevisionStatus, type Role } from './types';

const REVISION_WORDS: Record<RevisionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};
const ACTIVE: RevisionStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'];

// Optional fields go into a request only when given, so the strict routes see exactly what was entered.
const optional = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ''));

function fieldError(caught: unknown, fallback: string): { fields: Record<string, string>; error: string } {
  if (caught instanceof ApiError && caught.body.fields) return { fields: caught.body.fields, error: '' };
  return { fields: {}, error: caught instanceof Error ? caught.message : fallback };
}

// FR-022: the project's one quotation, created by any role.
function CreateForm({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [quotationDate, setQuotationDate] = useState('');
  const [note, setNote] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/api/projects/${projectId}/quotation`, {
        method: 'POST',
        body: JSON.stringify({ title, amount, quotation_date: quotationDate, note, ...optional({ validity_date: validityDate }) }),
      });
      onSaved();
    } catch (caught) {
      const result = fieldError(caught, 'The quotation was not created.');
      setFields(result.fields);
      setError(result.error);
    }
  }

  return (
    <form className="card form-2col" onSubmit={submit} aria-label="Create the client quotation">
      <p className="span-2 meta">No client quotation yet. Create it with its first amount; it starts as revision 1 in Draft.</p>
      <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(fields.title)} /></label>
      <label>Quoted amount (incl. GST)<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(fields.amount)} /></label>
      <label>Quotation date<input type="date" value={quotationDate} onChange={(event) => setQuotationDate(event.target.value)} aria-invalid={Boolean(fields.quotation_date)} /></label>
      <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <label>Validity date<input type="date" value={validityDate} onChange={(event) => setValidityDate(event.target.value)} aria-invalid={Boolean(fields.validity_date)} /></label>
      {Object.values(fields).map((message) => <p key={message} className="error span-2" role="alert">{message}</p>)}
      {error ? <p className="error span-2" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="submit">Create quotation</button></div>
    </form>
  );
}

// FR-023, FR-023a: a numbered revision with a reason, only when the newest revision is final.
function AddRevision({ quotationId, newest, onSaved }: { quotationId: string; newest: Revision; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [quotationDate, setQuotationDate] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const blocked = ACTIVE.includes(newest.status);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/api/quotations/${quotationId}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ amount, quotation_date: quotationDate, reason, expected_newest_revision: newest.number, ...optional({ note, validity_date: validityDate }) }),
      });
      setOpen(false);
      onSaved();
    } catch (caught) {
      const result = fieldError(caught, 'The revision was not added.');
      setFields(result.fields);
      setError(result.error);
    }
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="secondary" disabled={blocked} onClick={() => setOpen(true)}>Add revision</button>
        {blocked ? <p className="meta">Revision {newest.number} is {REVISION_WORDS[newest.status]}. A new revision can be added once it is approved, rejected or withdrawn.</p> : null}
      </div>
    );
  }
  return (
    <form className="card form-2col" onSubmit={submit} aria-label="Add a revision">
      <label>New amount (incl. GST)<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(fields.amount)} /></label>
      <label>Quotation date<input type="date" value={quotationDate} onChange={(event) => setQuotationDate(event.target.value)} aria-invalid={Boolean(fields.quotation_date)} /></label>
      <label className="span-2">Reason for the revision<input value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={Boolean(fields.reason)} /></label>
      <label>Validity date<input type="date" value={validityDate} onChange={(event) => setValidityDate(event.target.value)} aria-invalid={Boolean(fields.validity_date)} /></label>
      <label>Revision note<input value={note} onChange={(event) => setNote(event.target.value)} aria-invalid={Boolean(fields.note)} /></label>
      {Object.values(fields).map((message) => <p key={message} className="error span-2" role="alert">{message}</p>)}
      {error ? <p className="error span-2" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="submit">Save revision</button></div>
    </form>
  );
}

// FR-026: reviewers approve the revision under review at its exact amount, optionally attaching documents with the
// approval; a Quotation document must be on the revision or among them (the server enforces it).
function ApproveAction({ revision, projectId, onSaved }: { revision: Revision; projectId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; title: string; archived: boolean }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [acceptanceDate, setAcceptanceDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  function start() {
    setOpen(true);
    api<{ id: string; title: string; archived: boolean }[]>(`/api/projects/${projectId}/documents`)
      .then((rows) => setDocuments(rows.filter((row) => !row.archived)))
      .catch(() => setDocuments([]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/quotation-revisions/${revision.id}/approval`, {
        method: 'POST',
        body: JSON.stringify({
          expected_status: 'UNDER_REVIEW',
          amount: revision.amount,
          ...(chosen.length ? { document_ids: chosen } : {}),
          ...optional({ client_acceptance_date: acceptanceDate, note }),
        }),
      });
      setOpen(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The revision was not approved.');
    }
  }

  if (!open) return <button type="button" className="small" onClick={start}>Approve</button>;
  return (
    <form className="card grid" onSubmit={submit} aria-label="Approve the revision">
      <p>Approve revision {revision.number} at {inclGst(revision.amount)}. The approval cannot be changed afterwards.</p>
      <label>Client acceptance date<input type="date" value={acceptanceDate} onChange={(event) => setAcceptanceDate(event.target.value)} /></label>
      <label>Approval note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {documents.length ? (
        <fieldset>
          <legend>Documents to attach with the approval</legend>
          {documents.map((document) => (
            <label key={document.id} className="checkbox">
              <input
                type="checkbox"
                checked={chosen.includes(document.id)}
                onChange={(event) => setChosen(event.target.checked ? [...chosen, document.id] : chosen.filter((id) => id !== document.id))}
              />
              {document.title}
            </label>
          ))}
        </fieldset>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="submit">Approve revision</button></div>
    </form>
  );
}

function RevisionItem({ revision, data, role, meId, onChanged, extra }: { revision: Revision; data: ClientFinance; role: Role; meId: string; onChanged: () => void; extra?: ReactNode }) {
  const [error, setError] = useState('');
  const reviewer = isReviewer(role);
  const archived = data.project.archived;
  const status = revision.status;

  const change = async (to: RevisionStatus, reason?: string, note?: string) => {
    await api(`/api/quotation-revisions/${revision.id}/status`, { method: 'POST', body: JSON.stringify({ to, expected_status: status, ...(reason ? { reason } : {}), ...(note ? { note } : {}) }) });
    onChanged();
  };
  // FR-025: Submit and Mark under review stay one click; a note typed beforehand is sent with the change.
  const [stepNote, setStepNote] = useState('');
  const run = (to: RevisionStatus) => () =>
    change(to, undefined, stepNote.trim() || undefined)
      .then(() => setStepNote(''))
      .catch((caught: Error) => setError(caught.message));

  // FR-025 and OQ-13: the controls each role may use; the server checks the same rules.
  const canSubmit = status === 'DRAFT';
  const canWithdraw = (status === 'DRAFT' && (reviewer || revision.created_by.id === meId)) || (status === 'SUBMITTED' && reviewer);

  return (
    <li className="card revision" id={`client-revision-${revision.number}`}>
      <div className="advance-main">
        <div>
          <p className="advance-date">Revision {revision.number}{revision.newest ? ' · Newest' : ''}</p>
          <p className="meta">
            Quotation date {formatDate(revision.quotation_date)}
            {revision.validity_date ? ` · Valid until ${formatDate(revision.validity_date)}` : ''}
            {revision.previous_amount ? ` · was ${inr(revision.previous_amount)}` : ''}
            {revision.reason ? ` · Reason: ${revision.reason}` : ''}
            {revision.note ? ` · ${revision.note}` : ''}
          </p>
        </div>
        <div className="advance-money">
          <p className="advance-amount">{inclGst(revision.amount)}</p>
          <span className="status-badge">{REVISION_WORDS[status]}</span>
        </div>
      </div>
      <p className="meta">
        Created by {revision.created_by.name} · {formatDateTime(revision.created_at)}
        {revision.submitted_at ? ` · Submitted ${formatDateTime(revision.submitted_at)}` : ''}
      </p>
      {revision.status_changes.filter((c) => c.reason || c.note).map((c) => (
        <p key={c.created_at + c.to} className="meta">
          {REVISION_WORDS[c.to]} by {c.created_by.name}
          {c.reason ? ` · Reason: ${c.reason}` : ''}
          {c.note ? ` · Note: ${c.note}` : ''}
        </p>
      ))}
      {!archived ? (
        <div className="inline-actions">
          {canSubmit || (status === 'SUBMITTED' && reviewer) ? (
            <label>Note (optional)<input value={stepNote} onChange={(event) => setStepNote(event.target.value)} /></label>
          ) : null}
          {canSubmit ?<button type="button" className="small" onClick={run('SUBMITTED')}>Submit</button> : null}
          {status === 'SUBMITTED' && reviewer ? <button type="button" className="small" onClick={run('UNDER_REVIEW')}>Mark under review</button> : null}
          {status === 'UNDER_REVIEW' && reviewer ? <ReasonAction label="Reject" noteLabel="Status note" onSubmit={(reason, note) => change('REJECTED', reason, note)} /> : null}
          {canWithdraw ? <ReasonAction label="Withdraw" noteLabel="Status note" onSubmit={(reason, note) => change('WITHDRAWN', reason, note)} /> : null}
          {status === 'UNDER_REVIEW' && reviewer && revision.newest ? <ApproveAction revision={revision} projectId={data.project.id} onSaved={onChanged} /> : null}
          {extra}
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Attachments
        record={{ kind: 'revision', id: revision.id }}
        attachments={revision.attachments}
        projectId={data.project.id}
        canAttach={!archived && (ACTIVE.includes(status) || reviewer)}
        canRemove={(attachment) => !archived && ACTIVE.includes(status) && (reviewer || attachment.created_by.id === meId)}
        onChanged={onChanged}
      />
    </li>
  );
}

// The client quotation, its revisions and their statuses (FR-022 to FR-025a).
export function Quotation({
  data,
  role,
  meId,
  onChanged,
  revisionExtra,
}: {
  data: ClientFinance;
  role: Role;
  meId: string;
  onChanged: () => void;
  revisionExtra?: (revision: Revision) => ReactNode;
}) {
  const quotation = data.quotation;
  return (
    <section className="grid" aria-label="Client quotation" id="client-quotation">
      <h3>Quotation</h3>
      {!quotation ? (
        data.project.archived ? <p className="empty">No client quotation.</p> : <CreateForm projectId={data.project.id} onSaved={onChanged} />
      ) : (
        <>
          <p className="meta">
            {quotation.reference} · {quotation.title} · created by {quotation.created_by.name}
          </p>
          <ul className="grid" aria-label="Revisions">
            {quotation.revisions.map((revision) => (
              <RevisionItem key={revision.id} revision={revision} data={data} role={role} meId={meId} onChanged={onChanged} extra={revisionExtra?.(revision)} />
            ))}
          </ul>
          {data.approvals.length ? (
            <ul className="grid" aria-label="Approvals">
              {data.approvals.map((approval) => (
                <li key={approval.id} className="card">
                  <p>
                    <strong>Revision {approval.revision_number} approved at {inclGst(approval.amount)}</strong>
                    {approval.authoritative ? ' · Current approved client amount' : ''}
                  </p>
                  <p className="meta">
                    Approved by {approval.created_by.name} · {formatDateTime(approval.created_at)}
                    {approval.superseded_by ? ` · Superseded by the approval of revision ${approval.superseded_by.revision_number}` : ''}
                  </p>
                  {approval.client_acceptance_date || approval.note ? (
                    <p className="meta">
                      {[approval.client_acceptance_date ? `Client accepted ${formatDate(approval.client_acceptance_date)}` : null, approval.note].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  <Attachments
                    record={{ kind: 'approval', id: approval.id }}
                    attachments={approval.attachments}
                    projectId={data.project.id}
                    canAttach={!data.project.archived && isReviewer(role)}
                    canRemove={() => false}
                    onChanged={onChanged}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {!data.project.archived ? <AddRevision quotationId={quotation.id} newest={quotation.revisions[quotation.revisions.length - 1]} onSaved={onChanged} /> : null}
          <HistoryPanel target="client_quotation_id" id={quotation.id} label="History of the quotation" />
        </>
      )}
    </section>
  );
}
