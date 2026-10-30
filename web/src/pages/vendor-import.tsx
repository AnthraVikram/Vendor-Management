import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';

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
      <h1>Import vendors</h1>
      <p className="row">
        <a href="/api/vendor-imports/template?format=xlsx">Download Excel template</a>
        <a href="/api/vendor-imports/template?format=csv">Download CSV template</a>
        <a href="#/vendor-imports">Import history</a>
      </p>
      <form className="card row" onSubmit={upload}>
        <label>
          Spreadsheet file
          <input type="file" accept=".xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button type="submit" disabled={busy === 'upload'}>Preview</button>
      </form>
      {message ? <p className="error" role="alert">{message}</p> : null}

      {preview ? (
        <div className="grid">
          <p>
            {preview.file_name}: {preview.counts.ready} ready, {preview.counts.possible_duplicate} possible duplicates, {preview.counts.rejected} rejected.
          </p>
          {preview.ignored_headings.length > 0 ? <p className="notice">Ignored columns: {preview.ignored_headings.join(', ')}</p> : null}
          <p>Confirm before {new Date(preview.expires_at).toLocaleTimeString()} or upload again.</p>
          <div className="table-wrap">
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
                {preview.rows.map((row) => (
                  <tr key={row.row_number}>
                    <td data-label="Row">{row.row_number}</td>
                    <td data-label="Name">{row.name}</td>
                    <td data-label="Outcome"><span className={BADGES[row.outcome].className}>{BADGES[row.outcome].label}</span></td>
                    <td data-label="Reasons">{row.reasons.join(' ')}</td>
                    <td data-label="Matches">{row.matches.map(matchText).join(', ')}</td>
                    <td data-label="Import anyway">
                      {row.outcome === 'POSSIBLE_DUPLICATE' ? (
                        <input
                          type="checkbox"
                          aria-label={`Import row ${row.row_number} anyway`}
                          checked={approved.includes(row.row_number)}
                          onChange={(event) => toggle(row.row_number, event.target.checked)}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" onClick={confirm} disabled={busy !== null}>Confirm import</button>
            <button type="button" className="secondary" onClick={cancel} disabled={busy !== null}>Cancel preview</button>
          </div>
        </div>
      ) : null}

      {summary ? (
        <section className="card grid" aria-label="Import summary">
          <h2>Import summary</h2>
          <ul className="row">
            <li>Imported {summary.run.imported_count}</li>
            <li>Skipped {summary.run.skipped_count}</li>
            <li>Rejected {summary.run.rejected_count}</li>
          </ul>
          {notImported.length > 0 ? (
            <ul className="records">
              {notImported.map((row) => <li key={row.row_number}>Row {row.row_number}: {row.reasons.join(' ')}</li>)}
            </ul>
          ) : null}
          <a href={`#/vendor-imports?run=${summary.run.id}`}>View this import in the history</a>
        </section>
      ) : null}
    </section>
  );
}
