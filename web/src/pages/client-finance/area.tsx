import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Skeleton } from '../../ui/skeleton';
import { PurchaseOrders } from './purchase-orders';
import { Quotation } from './quotation';
import { Receipts } from './receipts';
import { ClientFinanceHistory, Summary } from './summary';
import type { ClientFinance, Role } from './types';

// The project's Client finance area (FR-043). It replaces the Client advances section in place: existing advances
// appear among the receipts. Load errors show inline, so the page's toasts are unchanged.
export function ClientFinanceArea({ projectId, version = 0 }: { projectId: string; version?: number }) {
  const [data, setData] = useState<ClientFinance | null>(null);
  const [me, setMe] = useState<{ id: string; role: Role } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<ClientFinance>(`/api/projects/${projectId}/client-finance`)
      .then((response) => {
        // Never let an unexpected reply break the rest of the project page.
        if (!response || !Array.isArray(response.receipts) || !response.summary || !response.project) throw new Error('Client finance could not be loaded.');
        setData(response);
        setError('');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Client finance could not be loaded.'));
  }, [projectId]);

  useEffect(() => {
    api<{ id: string; role: Role }>('/api/auth/me')
      .then((response) => setMe({ id: response.id, role: response.role }))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  return (
    <section className="grid section advances client-finance" aria-label="Client finance">
      <div className="section-heading">
        <div>
          <h2>Client finance</h2>
        </div>
        <p>Quotation, purchase orders and money received from the client. Amounts include GST.</p>
      </div>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      {!data && !error ? <Skeleton label="Loading client finance" rows={3} /> : null}
      {data && me ? (
        <>
          <Summary data={data} />
          <Quotation data={data} role={me.role} meId={me.id} onChanged={load} />
          <PurchaseOrders data={data} role={me.role} meId={me.id} onChanged={load} />
          <Receipts data={data} role={me.role} meId={me.id} onChanged={load} />
          <ClientFinanceHistory projectId={projectId} data={data} />
        </>
      ) : null}
    </section>
  );
}
