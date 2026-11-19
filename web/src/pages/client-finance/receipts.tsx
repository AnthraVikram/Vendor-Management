import { FormEvent, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { formatDate, formatDateTime } from '../../time';
import { HistoryPanel } from '../history-panel';
import { Attachments } from './attachments';
import { DocumentChoice, ReasonAction } from './controls';
import { inclGst, inr, METHODS, newSubmissionId, RECEIPT_TYPES, STATE_LABELS } from './money';
import { type ClientFinance, isReviewer, type Receipt, type Role } from './types';

type Overpayment = { approved_amount: string; verified_receipts: string; receipt_amount: string; excess: string };

function overpaymentOf(caught: unknown): Overpayment | null {
  if (caught instanceof ApiError && caught.body.code === 'OVERPAYMENT_CONFIRMATION_REQUIRED') return caught.body as unknown as Overpayment;
  return null;
}

const overpaymentMessage = (figures: Overpayment) =>
  `Approved amount ${inr(figures.approved_amount)}, verified receipts ${inr(figures.verified_receipts)}, this receipt ${inr(figures.receipt_amount)}. ` +
  `Saving it makes the client overpaid by ${inr(figures.excess)} (incl. GST).`;

// The receipt entry form (FR-016, FR-017). Each new receipt gets one submission ID, reused for retries and for the
// confirmed repeat after an overpayment warning, and replaced only after a save (research R13).
function EntryForm({ data, role, onSaved }: { data: ClientFinance; role: Role; onSaved: () => void }) {
  const projectId = data.project.id;
  const submissionId = useRef(newSubmissionId());
  const [receiptType, setReceiptType] = useState('ADVANCE');
  const [amount, setAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<Overpayment | null>(null);

  const verifiedPos = data.purchase_orders.filter((po) => po.state === 'VERIFIED');

  async function save(confirm: boolean) {
    setFields({});
    setError('');
    const [kind, id] = link.split(':');
    try {
      await api(`/api/projects/${projectId}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          submission_id: submissionId.current,
          receipt_type: receiptType,
          amount,
          received_on: receivedOn,
          payment_method: method || null,
          reference,
          note,
          ...(kind === 'approval' ? { client_approval_id: id } : kind === 'po' ? { client_purchase_order_id: id } : {}),
          ...(documentIds.length ? { document_ids: documentIds } : {}),
          ...(confirm ? { confirm_overpayment: true } : {}),
        }),
      });
      submissionId.current = newSubmissionId();
      setWarning(null);
      setAmount('');
      setReceivedOn('');
      setMethod('');
      setReference('');
      setNote('');
      setLink('');
      setDocumentIds([]);
      onSaved();
    } catch (caught) {
      const figures = overpaymentOf(caught);
      if (figures) setWarning(figures);
      else if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setError(caught instanceof Error ? caught.message : 'The receipt was not saved.');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(false);
  }

  return (
    <form className="card form-2col advance-form" onSubmit={submit} aria-label="Enter a receipt">
      <div className="span-2 form-intro">
        <h3>Enter a receipt</h3>
        <p className="meta">
          {isReviewer(role)
            ? 'Money received from the client. Your entry counts as verified when saved.'
            : 'Money received from the client. Your entry waits for an Administrator or Accountant to verify it.'}{' '}
          Amounts include GST. A saved receipt is never edited; a mistake is corrected by reversing or withdrawing it.
        </p>
      </div>
      <label>
        Receipt type
        <select value={receiptType} onChange={(event) => setReceiptType(event.target.value)}>
          {Object.entries(RECEIPT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="field">
        <label>
          Amount (incl. GST)
          <input value={amount} inputMode="decimal" placeholder="50000.00" onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(fields.amount)} />
        </label>
        {fields.amount ? <span className="error" role="alert">{fields.amount}</span> : null}
      </div>
      <div className="field">
        <label>
          Date received
          <input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} aria-invalid={Boolean(fields.received_on)} />
        </label>
        {fields.received_on ? <span className="error" role="alert">{fields.received_on}</span> : null}
      </div>
      <label>
        Payment method
        <select value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="">Not given</option>
          {Object.entries(METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Reference<input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
      <label>
        Relates to
        <select value={link} onChange={(event) => setLink(event.target.value)}>
          <option value="">Nothing in particular</option>
          {data.approvals.map((approval) => <option key={approval.id} value={`approval:${approval.id}`}>Approved quotation, revision {approval.revision_number}</option>)}
          {verifiedPos.map((po) => <option key={po.id} value={`po:${po.id}`}>PO {po.po_number}</option>)}
        </select>
      </label>
      <label className="span-2">Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <DocumentChoice projectId={projectId} chosen={documentIds} onChange={setDocumentIds} />
      {error ? <p className="error form-error span-2" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit">{isReviewer(role) ? 'Save receipt' : 'Submit for verification'}</button>
      </div>
      <ConfirmDialog
        open={warning !== null}
        title="This receipt overpays the client"
        message={warning ? overpaymentMessage(warning) : ''}
        confirmLabel="Save anyway"
        onConfirm={() => void save(true)}
        onCancel={() => setWarning(null)}
      />
    </form>
  );
}

function ReceiptItem({ receipt, data, role, meId, onChanged }: { receipt: Receipt; data: ClientFinance; role: Role; meId: string; onChanged: () => void }) {
  const [warning, setWarning] = useState<Overpayment | null>(null);
  const [error, setError] = useState('');
  const reviewer = isReviewer(role);
  const archived = data.project.archived;
  const submitted = receipt.state === 'SUBMITTED';

  async function verify(confirm: boolean) {
    setError('');
    try {
      await api(`/api/receipts/${receipt.id}/verification`, { method: 'POST', body: JSON.stringify({ expected_state: 'SUBMITTED', ...(confirm ? { confirm_overpayment: true } : {}) }) });
      setWarning(null);
      onChanged();
    } catch (caught) {
      const figures = overpaymentOf(caught);
      if (figures) setWarning(figures);
      else setError(caught instanceof Error ? caught.message : 'Not verified.');
    }
  }

  const decide = (action: 'rejection' | 'withdrawal') => async (reason: string) => {
    await api(`/api/receipts/${receipt.id}/${action}`, { method: 'POST', body: JSON.stringify({ reason, expected_state: 'SUBMITTED' }) });
    onChanged();
  };
  const reverse = async (reason: string) => {
    await api(`/api/client-advances/${receipt.id}/reversal`, { method: 'POST', body: JSON.stringify({ reason }) });
    onChanged();
  };

  const linkText = receipt.link
    ? receipt.link.kind === 'approval'
      ? `For the approved quotation, revision ${receipt.link.revision_number}`
      : `For PO ${receipt.link.po_number}`
    : null;

  return (
    <li className={`card advance${receipt.state === 'REVERSED' ? ' advance-reversed' : ''}`} id={`client-receipt-${receipt.id}`}>
      <div className="advance-main">
        <div className="advance-what">
          <p className="advance-date">{formatDate(receipt.received_on)} · {RECEIPT_TYPES[receipt.receipt_type]}</p>
          <p className="meta">
            {receipt.payment_method ? (METHODS[receipt.payment_method] ?? receipt.payment_method) : 'Method not given'}
            {receipt.reference ? ` · ${receipt.reference}` : ''}
            {receipt.note ? ` · ${receipt.note}` : ''}
            {linkText ? ` · ${linkText}` : ''}
          </p>
        </div>
        <div className="advance-money">
          <p className="advance-amount">{inclGst(receipt.amount)}</p>
          <span className="status-badge">{STATE_LABELS[receipt.state]}</span>
        </div>
      </div>
      <p className="meta">
        {receipt.recorded_under === 'FEATURE_003' ? 'Recorded under Feature 003 · ' : ''}
        Entered by {receipt.created_by.name} · {formatDateTime(receipt.created_at)}
      </p>
      {receipt.decision ? (
        <p className="meta">
          {STATE_LABELS[receipt.decision.decision]} by {receipt.decision.created_by.name} · {formatDateTime(receipt.decision.created_at)}
          {receipt.decision.reason ? ` · Reason: ${receipt.decision.reason}` : ''}
        </p>
      ) : null}
      {receipt.reversal ? (
        <div className="reversal-detail">
          <p>
            <strong>Reversed</strong> {inr(receipt.reversal.amount)} by {receipt.reversal.created_by.name} · {formatDateTime(receipt.reversal.created_at)} · Reason: {receipt.reversal.reason}
          </p>
        </div>
      ) : null}
      <div className="inline-actions">
        {submitted && reviewer && !archived ? <button type="button" className="small" onClick={() => void verify(false)}>Verify</button> : null}
        {submitted && reviewer ? <ReasonAction label="Reject" onSubmit={decide('rejection')} /> : null}
        {submitted && !archived && (reviewer || receipt.created_by.id === meId) ? <ReasonAction label="Withdraw" onSubmit={decide('withdrawal')} /> : null}
        {receipt.state === 'VERIFIED' && reviewer ? <ReasonAction label="Reverse" danger onSubmit={reverse} /> : null}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Attachments
        record={{ kind: 'receipt', id: receipt.id }}
        attachments={receipt.attachments}
        projectId={data.project.id}
        canAttach={!archived && (submitted || reviewer)}
        canRemove={(attachment) => !archived && submitted && (reviewer || attachment.created_by.id === meId)}
        onChanged={onChanged}
      />
      <HistoryPanel target="client_advance_id" id={receipt.id} label={`History of the receipt of ${formatDate(receipt.received_on)}`} />
      <ConfirmDialog
        open={warning !== null}
        title="Verifying this receipt overpays the client"
        message={warning ? overpaymentMessage(warning) : ''}
        confirmLabel="Verify anyway"
        onConfirm={() => void verify(true)}
        onCancel={() => setWarning(null)}
      />
    </li>
  );
}

// Client receipts, Feature 003 advances included (FR-013, FR-016 to FR-021, FR-043, FR-044).
export function Receipts({ data, role, meId, onChanged }: { data: ClientFinance; role: Role; meId: string; onChanged: () => void }) {
  return (
    <section className="grid" aria-label="Client receipts">
      <h3>Receipts</h3>
      {data.receipts.length ? (
        <ul className="grid" aria-label="Receipts">
          {data.receipts.map((receipt) => (
            <ReceiptItem key={receipt.id} receipt={receipt} data={data} role={role} meId={meId} onChanged={onChanged} />
          ))}
        </ul>
      ) : (
        <p className="empty">No client receipts recorded yet.</p>
      )}
      {data.project.archived ? (
        <p className="notice">This project is archived. New receipts cannot be entered; verified receipts can still be reversed and receipts awaiting verification rejected.</p>
      ) : (
        <EntryForm data={data} role={role} onSaved={onChanged} />
      )}
    </section>
  );
}
