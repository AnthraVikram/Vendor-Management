import { useEffect } from 'react';

// Protects unsaved form changes (Feature 005 FR-007). A form with changes registers itself; anything that leaves the
// page (navigation, sign out, switch user) calls canLeave() first, and closing the tab gets the browser's own warning.
const dirtyForms = new Set<symbol>();

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave without saving them?';

export function canLeave(): boolean {
  return dirtyForms.size === 0 || window.confirm(UNSAVED_MESSAGE);
}

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    const token = Symbol('unsaved form');
    dirtyForms.add(token);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      dirtyForms.delete(token);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);
}
