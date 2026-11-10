import type { ListView } from '../list-prefs';

// The Active / Archived switch above the Vendors and Projects lists (Feature 005 FR-026). Each option shows its count
// for the current search and filters.
export function ViewSwitch({ view, active, archived, onChange }: { view: ListView; active: number; archived: number; onChange: (view: ListView) => void }) {
  return (
    <div className="view-switch" role="radiogroup" aria-label="Show">
      {(['active', 'archived'] as const).map((option) => (
        <label key={option} className={`view-option${view === option ? ' is-selected' : ''}`}>
          <input type="radio" name="list-view" value={option} checked={view === option} onChange={() => onChange(option)} />
          <span>{option === 'active' ? `Active (${active})` : `Archived (${archived})`}</span>
        </label>
      ))}
    </div>
  );
}

// Reads a count header; falls back when a server or test answer has none.
export function countHeader(headers: { get: (name: string) => string | null }, name: string, fallback: number): number {
  const value = Number(headers.get(name));
  return Number.isInteger(value) && value >= 0 && headers.get(name) !== null ? value : fallback;
}
