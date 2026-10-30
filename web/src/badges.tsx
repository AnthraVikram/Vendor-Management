// Display-only status badges. They show the same values the pages showed before, as readable words.

const PROJECT_STATUS: Record<string, string> = { PLANNED: 'Planned', ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed' };
const AVAILABILITY: Record<string, string> = { AVAILABLE: 'Available', LIMITED: 'Limited', UNAVAILABLE: 'Unavailable' };

function tone(value: string): string {
  return value.toLowerCase().replace(/_/g, '-');
}

export function projectStatusName(status: string): string {
  return PROJECT_STATUS[status] ?? status;
}

export function ProjectStatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${tone(status)}`}>{projectStatusName(status)}</span>;
}

export function AvailabilityBadge({ availability }: { availability: string | null }) {
  if (!availability) return <span className="status-badge status-muted">Not set</span>;
  return <span className={`status-badge availability-${tone(availability)}`}>{AVAILABILITY[availability] ?? availability}</span>;
}

// Import run counts. Each reads "Imported 2" in the text; CSS shows the number above its word.
export function ImportCounts({ imported, skipped, rejected, compact = false }: { imported: number; skipped: number; rejected: number; compact?: boolean }) {
  return (
    <ul className={`import-counts${compact ? ' compact' : ''}`}>
      <li className="count-imported"><span>Imported</span> <strong>{imported}</strong></li>
      <li className="count-skipped"><span>Skipped</span> <strong>{skipped}</strong></li>
      <li className="count-rejected"><span>Rejected</span> <strong>{rejected}</strong></li>
    </ul>
  );
}

export function ArchivedBadge() {
  return <span className="status-badge status-archived">Archived</span>;
}
