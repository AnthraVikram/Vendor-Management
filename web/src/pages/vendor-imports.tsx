import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { HistoryPanel } from './history-panel';
import { istDateTime } from '../time';

interface Run {
  id: string;
  file_name: string;
  created_at: string;
  created_by: { id: string; name: string };
  imported_count: number;
  skipped_count: number;
  rejected_count: number;
}

interface RunDetail {
  run: Run;
  rows: { row_number: number; outcome: 'IMPORTED' | 'SKIPPED' | 'REJECTED'; vendor_id: string | null; reasons: string[] }[];
}

const OUTCOMES: Record<RunDetail['rows'][number]['outcome'], string> = {
  IMPORTED: 'Imported',
  SKIPPED: 'Skipped',
  REJECTED: 'Rejected',
};

// The import history (FR-010, US2-9): every confirmed import, and one import's row outcomes.
export function VendorImports({ runId }: { runId?: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [openRunId, setOpenRunId] = useState<string | undefined>(runId);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Run[]>('/api/vendor-imports')
      .then(setRuns)
      .catch((caught: Error) => setError(caught.message));
  }, []);

  useEffect(() => {
    setDetail(null);
    if (!openRunId) return;
    api<RunDetail>(`/api/vendor-imports/${openRunId}`)
      .then(setDetail)
      .catch((caught: Error) => setError(caught.message));
  }, [openRunId]);

  return (
    <section className="grid">
      <h1>Import history</h1>
      <p><a href="#/vendors/import">Import vendors</a></p>
      {error ? <p className="error">{error}</p> : null}
      {runs && runs.length === 0 ? <p>No imports yet.</p> : null}
      {runs && runs.length > 0 ? (
        <div className="table-wrap">
          <table aria-label="Import runs">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>File</th>
                <th>Counts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td data-label="When">{istDateTime(run.created_at)}</td>
                  <td data-label="By">{run.created_by.name}</td>
                  <td data-label="File">{run.file_name}</td>
                  <td data-label="Counts">Imported {run.imported_count} · Skipped {run.skipped_count} · Rejected {run.rejected_count}</td>
                  <td data-label="">
                    <button type="button" className="secondary" aria-label={`View ${run.file_name}`} onClick={() => setOpenRunId(run.id)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <section className="card grid" aria-label="Import run">
          <h2>{detail.run.file_name}</h2>
          <p>
            Imported by {detail.run.created_by.name} on {istDateTime(detail.run.created_at)}: imported {detail.run.imported_count}, skipped{' '}
            {detail.run.skipped_count}, rejected {detail.run.rejected_count}.
          </p>
          <div className="table-wrap">
            <table aria-label="Run rows">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Outcome</th>
                  <th>Reasons</th>
                  <th>Vendor</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((row) => (
                  <tr key={row.row_number}>
                    <td data-label="Row">{row.row_number}</td>
                    <td data-label="Outcome">{OUTCOMES[row.outcome]}</td>
                    <td data-label="Reasons">{row.reasons.join(' ')}</td>
                    <td data-label="Vendor">{row.vendor_id ? <a href={`#/vendors/${row.vendor_id}`}>Open vendor</a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <HistoryPanel key={detail.run.id} target="import_run_id" id={detail.run.id} label="Import run history" />
        </section>
      ) : null}
    </section>
  );
}
