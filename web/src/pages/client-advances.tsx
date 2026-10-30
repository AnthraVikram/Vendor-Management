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
      <h1>{TITLES[scope]}</h1>
      <p><a href="#/dashboard">Back to the dashboard</a></p>
      {error ? <p className="error">{error}</p> : null}
      {advances && advances.length > 0 ? (
        <ul className="grid" aria-label="Client advances">
          {advances.map((advance) => (
            <li className="card" key={advance.id}>
              <p>
                <a href={`#/projects/${advance.project.id}`}>{advance.project.name}</a>
                {advance.project.archived ? ' (archived)' : ''}
                {advance.project.client_name ? ` · ${advance.project.client_name}` : ''}
              </p>
              <p>
                {advance.received_on} · ₹{advance.amount}
                {advance.reference ? ` · ${advance.reference}` : ''}
                {advance.note ? ` · ${advance.note}` : ''} · recorded by {advance.created_by.name}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {advances && advances.length === 0 ? <p>No client advances to show.</p> : null}
    </section>
  );
}
