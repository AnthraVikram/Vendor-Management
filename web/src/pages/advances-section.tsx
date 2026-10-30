import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { HistoryPanel } from './history-panel';
import { istDateTime } from '../time';

interface Person {
  id: string;
  name: string;
}

interface Reversal {
  id: string;
  amount: string;
  reason: string;
  created_at: string;
  created_by: Person;
}

interface Advance {
  id: string;
  amount: string;
  received_on: string;
  payment_method: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  created_by: Person;
  reversal: Reversal | null;
}

interface AdvancesResponse {
  project: { id: string; name: string; client_name: string | null; archived: boolean };
  net_amount: string;
  advances: Advance[];
}

// Only these roles see the record and reverse controls. The server enforces the same rule (FR-017).
const RECORDERS = ['ADMINISTRATOR', 'ACCOUNTANT'];

const METHODS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  OTHER: 'Other',
};

function rupees(amount: string): string {
  return `₹${amount}`;
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="error">{message}</span> : null;
}

function RecordForm({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFields({});
    setError('');
    try {
      await api(`/api/projects/${projectId}/client-advances`, {
        method: 'POST',
        body: JSON.stringify({ amount, received_on: receivedOn, payment_method: method || null, reference, note }),
      });
      setAmount('');
      setReceivedOn('');
      setMethod('');
      setReference('');
      setNote('');
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.fields) setFields(caught.body.fields);
      else setError(caught instanceof Error ? caught.message : 'The advance was not recorded.');
    }
  }

  return (
    <form className="card grid" onSubmit={submit}>
      <h3>Record an advance</h3>
      <label>
        Amount
        <input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(fields.amount)} />
      </label>
      <FieldError message={fields.amount} />
      <label>
        Date received
        <input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} aria-invalid={Boolean(fields.received_on)} />
      </label>
      <FieldError message={fields.received_on} />
      <label>
        Payment method
        <select value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="">Not given</option>
          {Object.entries(METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Reference<input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
      <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">Record advance</button>
    </form>
  );
}

function ReverseForm({ advanceId, onSaved }: { advanceId: string; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/client-advances/${advanceId}/reversal`, { method: 'POST', body: JSON.stringify({ reason }) });
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) setError(caught.body.fields?.reason ?? caught.message);
      else setError('The advance was not reversed.');
    }
  }

  return (
    <form className="row" onSubmit={submit}>
      <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={Boolean(error)} /></label>
      <button type="submit" className="secondary">Reverse</button>
      <FieldError message={error} />
    </form>
  );
}

export function AdvancesSection({ projectId, version = 0 }: { projectId: string; version?: number }) {
  const [data, setData] = useState<AdvancesResponse | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<AdvancesResponse>(`/api/projects/${projectId}/client-advances`)
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Client advances could not be loaded.'));
  }, [projectId]);

  useEffect(() => {
    api<{ role: string }>('/api/auth/me')
      .then((me) => setRole(me.role))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const canRecord = role !== null && RECORDERS.includes(role);

  return (
    <section className="grid" aria-label="Client advances">
      <h2>Client advances</h2>
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <>
          {data.project.client_name ? <p>Client: {data.project.client_name}</p> : null}
          <p>Net client advances received (not reversed): {rupees(data.net_amount)}</p>
          <ul className="grid" aria-label="Advances">
            {data.advances.map((advance) => (
              <li className="card" key={advance.id}>
                <p>
                  {advance.received_on} · {rupees(advance.amount)}
                  {advance.payment_method ? ` · ${METHODS[advance.payment_method] ?? advance.payment_method}` : ''}
                  {advance.reference ? ` · ${advance.reference}` : ''}
                  {advance.note ? ` · ${advance.note}` : ''}
                </p>
                <p>Recorded by {advance.created_by.name} · {istDateTime(advance.created_at)}</p>
                {advance.reversal ? (
                  <p>
                    <strong>Reversed</strong> {rupees(advance.reversal.amount)} by {advance.reversal.created_by.name} ·{' '}
                    {istDateTime(advance.reversal.created_at)} · Reason: {advance.reversal.reason}
                  </p>
                ) : canRecord ? (
                  <ReverseForm advanceId={advance.id} onSaved={load} />
                ) : null}
                <HistoryPanel target="client_advance_id" id={advance.id} label={`History of the advance received ${advance.received_on}`} />
              </li>
            ))}
          </ul>
          {data.advances.length === 0 ? <p>No client advances recorded yet.</p> : null}
          {canRecord && !data.project.archived ? <RecordForm projectId={projectId} onSaved={load} /> : null}
        </>
      ) : null}
    </section>
  );
}
