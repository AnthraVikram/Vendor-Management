// FR-026: pages announce a successful action; the app shell shows it in its one status region.
export function notify(message: string) {
  window.dispatchEvent(new CustomEvent('notify', { detail: message }));
}
