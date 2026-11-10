// Feature 005 FR-005: the Vendors and Projects lists remember only their sort and Active/Archived view, on this
// browser. Search text and filters are never stored. Anything unreadable or no longer valid falls back to defaults.
export type ListView = 'active' | 'archived';
export interface ListPrefs { sort: string; view: ListView }

export function readListPrefs(key: string, sorts: readonly string[], defaults: ListPrefs): ListPrefs {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Partial<ListPrefs> | null;
    return {
      sort: stored && typeof stored.sort === 'string' && sorts.includes(stored.sort) ? stored.sort : defaults.sort,
      view: stored && (stored.view === 'active' || stored.view === 'archived') ? stored.view : defaults.view,
    };
  } catch {
    return defaults;
  }
}

export function writeListPrefs(key: string, prefs: ListPrefs): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ sort: prefs.sort, view: prefs.view }));
  } catch {
    // Storage may be blocked or full; the list still works with its current choice.
  }
}
