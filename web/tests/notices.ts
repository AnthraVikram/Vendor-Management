// Collects the confirmations pages send through notify() (Feature 004 FR-026) while a test runs.
export function collectNotices(): string[] {
  const seen: string[] = [];
  window.addEventListener('notify', (event) => seen.push((event as CustomEvent<string>).detail));
  return seen;
}
