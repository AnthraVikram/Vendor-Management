import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface StandingAdvance {
  id: string;
  amount: string;
  received_on: string;
  reference: string | null;
  note: string | null;
  created_by: { id: string; name: string };
  project: { id: string; name: string; client_name: string | null; archived: boolean };
}

const TITLES = {
  all: 'Client advances received and not reversed, all projects',
  month: 'Client advances received this month and not reversed',
};

// The standing advances behind a dashboard money tile (US4-6), archived projects included.
export function ClientAdvances({ scope }: { scope: 'all' | 'month' }) {
  const [advances, setAdvances] = useState<StandingAdvance[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<StandingAdvance[]>(`/api/client-advances?scope=${scope}`).then(setAdvances).catch((caught: Error) => setError(caught.message));
  }, [scope]);

  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Client advances</p>
          <h1>{TITLES[scope]}</h1>
          <p className="page-subtitle">The standing advances behind this dashboard figure, archived projects included.</p>
        </div>
        <div className="page-actions">
          <a className="button secondary" href="#/dashboard">Back to the dashboard</a>
        </div>
      </header>
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      {advances && advances.length > 0 ? (
        <div className="section">
          <div className="section-heading">
            <div>
              <h2>Advances</h2>
              <span className="count-badge">{advances.length}</span>
            </div>
          </div>
          <ul className="grid" aria-label="Client advances">
            {advances.map((advance) => (
              <li className="card advance" key={advance.id}>
                <div className="advance-main">
                  <div className="advance-what">
                    <p className="advance-project">
                      <a href={`#/projects/${advance.project.id}`}>{advance.project.name}</a>
                      {advance.project.archived ? <span className="status-badge status-archived">Project archived</span> : null}
                    </p>
                    <p className="meta">{advance.project.client_name ? `Client: ${advance.project.client_name}` : 'Client not set'}</p>
                  </div>
                  <div className="advance-money">
                    <p className="advance-amount">₹{advance.amount}</p>
                  </div>
                </div>
                <p className="meta">
                  Received {advance.received_on}
                  {advance.reference ? ` · ${advance.reference}` : ''}
                  {advance.note ? ` · ${advance.note}` : ''} · recorded by {advance.created_by.name}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {advances && advances.length === 0 ? <p className="empty">No client advances to show.</p> : null}
    </section>
  );
}
