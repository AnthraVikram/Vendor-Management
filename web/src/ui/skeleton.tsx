// Placeholder rows in the shape of a list while it loads (Feature 005 FR-039). The label tells screen readers what is
// loading; the grey bars are decoration.
export function Skeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="skeleton-row" aria-hidden="true" />
      ))}
    </div>
  );
}
