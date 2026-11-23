import { FormEvent, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { formatDate, formatDateTime } from '../../time';
import { HistoryPanel } from '../history-panel';
import { Attachments } from './attachments';
import { DocumentChoice, ReasonAction } from './controls';
import { inclGst, STATE_LABELS } from './money';
import { type Approval, type ClientFinance, isReviewer, type PurchaseOrder, type Role } from './types';

const WARNINGS: Record<string, string> = { DUPLICATE_PO_NUMBER: 'confirm_duplicate', PENDING_REVISION: 'confirm_pending_revision' };

// FR-029, FR-029a, FR-032a: a PO against the current approval at its exact amount; each warning is confirmed
// explicitly and the request is sent again with the confirmation.
function EntryForm({ approval, projectId, role, onSaved }: { approval: Approval; projectId: string; role: Role; onSaved: () => void }) {
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [amount, setAmount] = useState(approval.amount);
  const [note, setNote] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [warning, setWarning] = useState<{ code: string; message: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function save(confirmations: Record<string, boolean>) {
    setFields({});
    setError('');
    try {
      await api(`/api/projects/${projectId}/purchase-orders`, {
        method: 'POST',
        body: JSON.stringify({ client_approval_id: approval.id, po_number: poNumber, po_date: poDate, amount, ...(note.trim() ? { note } : {}), ...(documentIds.length ? { document_ids: documentIds } : {}), ...confirmations }),
      });
      setWarning(null);
      setConfirmed({});
      setPoNumber('');
      setPoDate('');
      setNote('');
      setDocumentIds([]);
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.code && WARNINGS[caught.body.code]) setWarning({ code: caught.body.code, message: caught.message });
      else if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setError(caught instanceof Error ? caught.message : 'The PO was not saved.');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(confirmed);
  }

  function confirmWarning() {
    const next = { ...confirmed, [WARNINGS[warning!.code]]: true };
    setConfirmed(next);
    setWarning(null);
    void save(next);
  }

  return (
    <form className="card form-2col" onSubmit={submit} aria-label="Enter a purchase order">
      <p className="span-2 meta">
        For the approved quotation, revision {approval.revision_number}. The PO amount must equal the approved amount exactly.
        {isReviewer(role) ? ' Your PO counts as verified when saved. A Purchase order document is required: choose it below.' : ''}
      </p>
      <label>PO number<input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} aria-invalid={Boolean(fields.po_number)} /></label>
      <label>PO date<input type="date" value={poDate} onChange={(event) => setPoDate(event.target.value)} aria-invalid={Boolean(fields.po_date)} /></label>
      <label>PO amount (incl. GST)<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(fields.amount)} /></label>
      <label>PO note<input value={note} onChange={(event) => setNote(event.target.value)} aria-invalid={Boolean(fields.note)} /></label>
      <DocumentChoice projectId={projectId} chosen={documentIds} onChange={setDocumentIds} />
      {Object.values(fields).map((message) => <p key={message} className="error span-2" role="alert">{message}</p>)}
      {error ? <p className="error span-2" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="submit">{isReviewer(role) ? 'Save PO' : 'Submit PO for verification'}</button></div>
      <ConfirmDialog
        open={warning !== null}
        title={warning?.code === 'PENDING_REVISION' ? 'A newer revision is pending' : 'Possible duplicate PO number'}
        message={warning?.message ?? ''}
        confirmLabel="Record anyway"
        onConfirm={confirmWarning}
        onCancel={() => setWarning(null)}
      />
    </form>
  );
}

function PoItem({ po, data, role, meId, onChanged }: { po: PurchaseOrder; data: ClientFinance; role: Role; meId: string; onChanged: () => void }) {
  const [error, setError] = useState('');
  const reviewer = isReviewer(role);
  const archived = data.project.archived;
  const submitted = po.state === 'SUBMITTED';
  const send = async (action: string, body: Record<string, unknown>) => {
    await api(`/api/purchase-orders/${po.id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
    onChanged();
  };

  return (
    <li className="card" id={`client-po-${po.id}`}>
      <div className="advance-main">
        <div>
          <p className="advance-date">PO {po.po_number} · {formatDate(po.po_date)}</p>
          <p className="meta">
            For the approved quotation, revision {po.approval.revision_number}
            {po.label ? ` · ${po.label}` : ''}
            {po.note ? ` · ${po.note}` : ''}
          </p>
        </div>
        <div className="advance-money">
          <p className="advance-amount">{inclGst(po.amount)}</p>
          <span className="status-badge">{STATE_LABELS[po.state]}</span>
        </div>
      </div>
      <p className="meta">Entered by {po.created_by.name} · {formatDateTime(po.created_at)}</p>
      {po.decision ? (
        <p className="meta">{STATE_LABELS[po.decision.decision]} by {po.decision.created_by.name}{po.decision.reason ? ` · Reason: ${po.decision.reason}` : ''}</p>
      ) : null}
      {po.cancellation ? <p className="meta">Cancelled by {po.cancellation.created_by.name} · Reason: {po.cancellation.reason}</p> : null}
      <div className="inline-actions">
        {submitted && reviewer && !archived ? (
          <button type="button" className="small" onClick={() => send('verification', { expected_state: 'SUBMITTED' }).catch((caught: Error) => setError(caught.message))}>Verify</button>
        ) : null}
        {submitted && reviewer ? <ReasonAction label="Reject" onSubmit={(reason) => send('rejection', { reason, expected_state: 'SUBMITTED' })} /> : null}
        {submitted && !archived && (reviewer || po.created_by.id === meId) ? <ReasonAction label="Withdraw" onSubmit={(reason) => send('withdrawal', { reason, expected_state: 'SUBMITTED' })} /> : null}
        {po.state === 'VERIFIED' && reviewer ? <ReasonAction label="Cancel PO" danger onSubmit={(reason) => send('cancellation', { reason, expected_state: 'VERIFIED' })} /> : null}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Attachments
        record={{ kind: 'purchase_order', id: po.id }}
        attachments={po.attachments}
        projectId={data.project.id}
        canAttach={!archived && (submitted || reviewer)}
        canRemove={(attachment) => !archived && submitted && (reviewer || attachment.created_by.id === meId)}
        onChanged={onChanged}
      />
      <HistoryPanel target="client_purchase_order_id" id={po.id} label={`History of PO ${po.po_number}`} />
    </li>
  );
}

// The client's purchase orders (FR-029 to FR-033).
export function PurchaseOrders({ data, role, meId, onChanged }: { data: ClientFinance; role: Role; meId: string; onChanged: () => void }) {
  const authoritative = data.approvals.find((approval) => approval.authoritative) ?? null;
  return (
    <section className="grid" aria-label="Client purchase orders">
      <h3>Purchase orders</h3>
      {data.current_po ? <p>Current PO: {data.current_po.po_number}</p> : data.current_po_text ? <p>{data.current_po_text}</p> : null}
      {data.purchase_orders.length ? (
        <ul className="grid" aria-label="Purchase orders">
          {data.purchase_orders.map((po) => <PoItem key={po.id} po={po} data={data} role={role} meId={meId} onChanged={onChanged} />)}
        </ul>
      ) : null}
      {!authoritative ? (
        <p className="empty">A purchase order can be entered once the client quotation is approved.</p>
      ) : !data.project.archived ? (
        <EntryForm approval={authoritative} projectId={data.project.id} role={role} onSaved={onChanged} />
      ) : null}
    </section>
  );
}
