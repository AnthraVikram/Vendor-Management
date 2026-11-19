import { type ReactNode, useState } from 'react';
import { api } from '../../api/client';
import { formatDate, formatDateTime } from '../../time';
import { ACTIONS } from '../history-panel';
import { inclGst, inr, RECEIPT_TYPES, STATE_LABELS } from './money';
import type { ClientFinance, Person } from './types';

// FR-034 to FR-037: only the approved amount, the verified receipts total and the outstanding balance or overpayment.
export function Summary({ data }: { data: ClientFinance }) {
  const s = data.summary;
  return (
    <section className="card grid" aria-label="Client balance">
      <h3>Client balance</h3>
      {s.approved_amount ? (
        <>
          <p>Approved client amount {inclGst(s.approved_amount)} (revision {s.approved_revision_number})</p>
          <p>Verified receipts {inclGst(s.verified_receipts)}</p>
          {s.overpaid ? (
            <p>
              <strong>₹0.00 outstanding</strong> · <strong>Overpaid by {inr(s.overpaid)} (incl. GST)</strong>
            </p>
          ) : (
            <p><strong>Outstanding {inclGst(s.outstanding!)}</strong></p>
          )}
          {s.basis_text ? <p className="meta">{s.basis_text}</p> : null}
        </>
      ) : (
        <>
          <p><strong>{s.not_available_reason}</strong></p>
          <p className="meta">Verified receipts {inclGst(s.verified_receipts)}</p>
        </>
      )}
      {data.pending_verification.length ? (
        <>
          <h4>Awaiting verification</h4>
          <ul aria-label="Awaiting verification">
            {data.pending_verification.map((item) => (
              <li key={item.id}>{item.label} · {item.created_by.name} · {formatDateTime(item.created_at)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

interface Entry {
  id: string;
  action: string;
  record: { kind: 'quotation' | 'purchase_order' | 'receipt'; id: string; revision_number?: number | null };
  amount: string | null;
  state: string | null;
  created_at: string;
  created_by: Person;
}

// FR-038: each entry names its record from the data already on the page and links to it there; a record not on the
// page keeps the plain label.
function recordLink(record: Entry['record'], data: ClientFinance): ReactNode {
  let text: string | null = null;
  let anchor = '';
  if (record.kind === 'receipt') {
    const receipt = data.receipts.find((row) => row.id === record.id);
    if (receipt) [text, anchor] = [`${RECEIPT_TYPES[receipt.receipt_type]} received ${formatDate(receipt.received_on)}`, `client-receipt-${receipt.id}`];
  } else if (record.kind === 'purchase_order') {
    const po = data.purchase_orders.find((row) => row.id === record.id);
    if (po) [text, anchor] = [`PO ${po.po_number}`, `client-po-${po.id}`];
  } else if (data.quotation?.id === record.id) {
    [text, anchor] = record.revision_number ? [`Quotation revision ${record.revision_number}`, `client-revision-${record.revision_number}`] : ['Quotation', 'client-quotation'];
  }
  if (text) return <a href={`#${anchor}`}>{text}</a>;
  if (record.kind === 'receipt') return 'Receipt';
  if (record.kind === 'purchase_order') return 'Purchase order';
  return record.revision_number ? `Quotation revision ${record.revision_number}` : 'Quotation';
}

// FR-038: one date-ordered history of every client financial record on the project. It loads only when opened.
export function ClientFinanceHistory({ projectId, data }: { projectId: string; data: ClientFinance }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  function toggle() {
    if (!open) {
      api<{ entries: Entry[] }>(`/api/projects/${projectId}/client-finance/history`)
        .then((response) => setEntries(response.entries))
        .catch((caught: Error) => setError(caught.message));
    }
    setOpen(!open);
  }

  return (
    <section className="grid" aria-label="Client financial history section">
      <button type="button" className="secondary small" aria-expanded={open} onClick={toggle}>
        {open ? 'Hide client financial history' : 'Show client financial history'}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {open && entries ? (
        <ol aria-label="Client financial history">
          {entries.map((entry) => (
            <li key={entry.id}>
              {ACTIONS[entry.action] ?? entry.action} · {recordLink(entry.record, data)}
              {[entry.amount ? inr(entry.amount) : null, entry.state ? STATE_LABELS[entry.state] ?? entry.state : null, entry.created_by.name, formatDateTime(entry.created_at)]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join('')}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
