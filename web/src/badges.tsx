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

const ASSIGNMENT_STATUS: Record<string, string> = {
  NO_ACTIVITIES: 'No activities',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DELAYED: 'Delayed',
  COMPLETED: 'Completed',
};

// Worked out from the vendor's timeline items (Feature 004 FR-010). The hidden prefix tells it apart from the
// project's own status badge for screen readers, since both can read "Completed".
export function AssignmentStatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge assignment-${tone(status)}`}>
      <span className="visually-hidden">Assignment status: </span>
      {ASSIGNMENT_STATUS[status] ?? status}
    </span>
  );
}

const HEALTH: Record<string, string> = { COMPLETED: 'Completed', DELAYED: 'Delayed', ONGOING: 'Ongoing' };

// Project health (Feature 004 FR-017): about the project as a whole, separate from the status staff choose.
export function HealthBadge({ health }: { health: string }) {
  return (
    <span className={`status-badge health-${tone(health)}`}>
      <span className="visually-hidden">Health: </span>
      {HEALTH[health] ?? health}
    </span>
  );
}

// Done items out of all non-archived items (FR-016). The text carries the meaning; the bar only repeats it.
export function ProgressMeter({ progress }: { progress: { done: number; total: number } }) {
  if (progress.total === 0) return <span className="muted">No activities yet</span>;
  const percent = Math.round((progress.done / progress.total) * 100);
  return (
    <span className="progress-meter">
      <span>{progress.done} of {progress.total} items done</span>
      <span className="progress-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
    </span>
  );
}

export function ArchivedBadge() {
  return <span className="status-badge status-archived">Archived</span>;
}
