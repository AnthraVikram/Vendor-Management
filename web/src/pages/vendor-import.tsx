import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ImportCounts } from '../badges';
import { istDateTime } from '../time';

type Match = { kind: 'VENDOR'; vendor_id: string; vendor_name: string } | { kind: 'ROW'; row_number: number };

interface PreviewRow {
  row_number: number;
  outcome: 'READY' | 'REJECTED' | 'POSSIBLE_DUPLICATE';
  name: string;
  reasons: string[];
  matches: Match[];
}

interface Preview {
  id: string;
  file_name: string;
  expires_at: string;
  ignored_headings: string[];
  counts: { ready: number; rejected: number; possible_duplicate: number };
  rows: PreviewRow[];
}

interface Summary {
  run: { id: string; file_name: string; imported_count: number; skipped_count: number; rejected_count: number };
  rows: { row_number: number; outcome: 'IMPORTED' | 'SKIPPED' | 'REJECTED'; reasons: string[] }[];
}

const BADGES: Record<PreviewRow['outcome'], { label: string; className: string }> = {
  READY: { label: 'Ready', className: 'flag outcome-ready' },
  REJECTED: { label: 'Rejected', className: 'flag outcome-rejected' },
  POSSIBLE_DUPLICATE: { label: 'Possible duplicate', className: 'flag outcome-duplicate' },
};

// Messages the page words itself; any other refusal shows the server's own message, which names the problem.
const MESSAGES: Record<string, string> = {
  PREVIEW_EXPIRED: 'This preview has expired. Upload the file again.',
  PREVIEW_CANCELLED: 'This preview was cancelled. Upload the file again.',
  IMPORT_FAILED: 'The import did not happen. Nothing was saved.',
};

function messageFor(caught: unknown): string {
  if (caught instanceof ApiError) {
    return (caught.body.code && MESSAGES[caught.body.code]) || caught.body.fields?.file || caught.message;
  }
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}

function matchText(match: Match): string {
  return match.kind === 'VENDOR' ? match.vendor_name : `Row ${match.row_number}`;
}

export function VendorImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [approved, setApproved] = useState<number[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'upload' | 'confirm' | 'cancel' | null>(null);

  // A preview that can no longer be confirmed is put away, and the person is told why.
  function endPreview(text: string) {
    setPreview(null);
    setApproved([]);
    setMessage(text);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage('Choose an .xlsx or .csv file.');
      return;
    }
    setBusy('upload');
    setMessage('');
    setSummary(null);
    try {
      const data = new FormData();
      data.append('file', file);
      setPreview(await api<Preview>('/api/vendor-imports/previews', { method: 'POST', body: data }));
      setApproved([]);
    } catch (caught) {
      setPreview(null);
      setMessage(messageFor(caught));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview || busy) return;
    setBusy('confirm');
    setMessage('');
    try {
      const result = await api<Summary>(`/api/vendor-imports/previews/${preview.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ approved_rows: [...approved].sort((a, b) => a - b) }),
      });
      setPreview(null);
      setApproved([]);
      setSummary(result);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.body.code : undefined;
      if (code === 'PREVIEW_EXPIRED' || code === 'PREVIEW_CANCELLED') endPreview(messageFor(caught));
      else setMessage(messageFor(caught));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!preview || busy) return;
    setBusy('cancel');
    try {
      await api(`/api/vendor-imports/previews/${preview.id}/cancel`, { method: 'POST' });
      endPreview('Preview cancelled. Nothing was imported.');
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.body.code : undefined;
      if (code === 'PREVIEW_EXPIRED') endPreview(messageFor(caught));
      else setMessage(messageFor(caught));
    } finally {
      setBusy(null);
    }
  }

  function toggle(rowNumber: number, checked: boolean) {
    setApproved((current) => (checked ? [...current, rowNumber] : current.filter((n) => n !== rowNumber)));
  }

  const notImported = summary ? summary.rows.filter((row) => row.outcome !== 'IMPORTED') : [];

  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Directory</p>
          <h1>Import vendors</h1>
          <p className="page-subtitle">Upload a spreadsheet, review every row, then confirm. Nothing is saved until you confirm.</p>
        </div>
        <div className="page-actions">
          <a className="button secondary" href="#/vendor-imports">Import history</a>
        </div>
      </header>

      <div className="import-steps">
        <div className="card grid import-step">
          <p className="step-label"><span className="step-number">1</span> Start from the template</p>
          <p className="meta">The template has the 16 column headings the import reads. Use .xlsx or .csv, at most 1,000 rows and 25 MB.</p>
          <div className="page-actions">
            <a className="button secondary" href="/api/vendor-imports/template?format=xlsx">Download Excel template</a>
            <a className="button secondary" href="/api/vendor-imports/template?format=csv">Download CSV template</a>
          </div>
        </div>
        <form className="card grid import-step" onSubmit={upload}>
          <p className="step-label"><span className="step-number">2</span> Upload and preview</p>
          <label className="dropzone">
            Spreadsheet file
            <input type="file" accept=".xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <p className="meta">The preview checks every row. Rejected rows are never imported.</p>
          <button type="submit" disabled={busy === 'upload'}>Preview</button>
        </form>
      </div>
      {message ? <p className="error form-error" role="alert">{message}</p> : null}

      {preview ? (
        <div className="section">
          <div className="section-heading">
            <div>
              <h2>Review {preview.file_name}</h2>
            </div>
            <p className="expiry-pill">Confirm before {istDateTime(preview.expires_at)} or upload again.</p>
          </div>
          <ul className="preview-counts">
            <li className="count-ready"><strong>{preview.counts.ready}</strong> ready</li>
            <li className="count-duplicate"><strong>{preview.counts.possible_duplicate}</strong> possible duplicates</li>
            <li className="count-rejected"><strong>{preview.counts.rejected}</strong> rejected</li>
          </ul>
          {preview.ignored_headings.length > 0 ? <p className="notice">Ignored columns: {preview.ignored_headings.join(', ')}</p> : null}
          {preview.counts.possible_duplicate > 0 ? (
            <p className="notice">Possible duplicates match an existing vendor or an earlier row by phone. They are skipped unless you tick Import anyway.</p>
          ) : null}
          <div className="table-wrap preview-table">
            <table aria-label="Preview">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Outcome</th>
                  <th>Reasons</th>
                  <th>Matches</th>
                  <th>Import anyway</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const ticked = approved.includes(row.row_number);
                  const tone = row.outcome === 'POSSIBLE_DUPLICATE' ? (ticked ? 'approved' : 'duplicate') : row.outcome.toLowerCase();
                  return (
                    <tr key={row.row_number} className={`outcome-row-${tone}`}>
                      <td data-label="Row" className="numeric">{row.row_number}</td>
                      <td data-label="Name"><strong>{row.name}</strong></td>
                      <td data-label="Outcome"><span className={BADGES[row.outcome].className}>{BADGES[row.outcome].label}</span></td>
                      <td data-label="Reasons" className="reasons">{row.reasons.join(' ')}</td>
                      <td data-label="Matches">{row.matches.map(matchText).join(', ')}</td>
                      <td data-label="Import anyway">
                        {row.outcome === 'POSSIBLE_DUPLICATE' ? (
                          <label className="check import-anyway">
                            <input
                              type="checkbox"
                              aria-label={`Import row ${row.row_number} anyway`}
                              checked={ticked}
                              onChange={(event) => toggle(row.row_number, event.target.checked)}
                            />
                            <span aria-hidden="true">{ticked ? 'Will import' : 'Import anyway'}</span>
                          </label>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card confirm-bar">
            <div className="grid confirm-text">
              <p>
                <strong>{preview.counts.ready}</strong> ready · <strong>{approved.length}</strong> of {preview.counts.possible_duplicate} possible duplicates ticked
              </p>
              <p className="meta">Each row is checked against the directory again when you confirm. If saving fails, nothing is imported.</p>
            </div>
            <div className="page-actions">
              <button type="button" className="secondary" onClick={cancel} disabled={busy !== null}>Cancel preview</button>
              <button type="button" onClick={confirm} disabled={busy !== null}>Confirm import</button>
            </div>
          </div>
        </div>
      ) : null}

      {summary ? (
        <section className="card grid import-summary" aria-label="Import summary">
          <div className="card-heading">
            <h2>Import summary</h2>
            <span className="meta">{summary.run.file_name}</span>
          </div>
          <ImportCounts imported={summary.run.imported_count} skipped={summary.run.skipped_count} rejected={summary.run.rejected_count} />
          {notImported.length > 0 ? (
            <div className="grid">
              <h3>Rows not imported</h3>
              <ul className="records not-imported">
                {notImported.map((row) => <li key={row.row_number}>Row {row.row_number}: {row.reasons.join(' ')}</li>)}
              </ul>
            </div>
          ) : null}
          <p><a className="button secondary" href={`#/vendor-imports?run=${summary.run.id}`}>View this import in the history</a></p>
        </section>
      ) : null}
    </section>
  );
}
