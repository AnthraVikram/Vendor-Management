// Recorded times are stored in UTC and shown in India Standard Time, where the firm works.

function istParts(iso: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
}

// Feature 005 FR-042: the one display format, "9 Nov 2026" and "9 Nov 2026, 14:05". Inputs and API values stay
// YYYY-MM-DD; only what staff read changes.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayMonthYear(year: string, month: string, day: string): string {
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

// A calendar date ("2026-11-09") is shown as it is; a recorded time is shown on its IST calendar day.
export function formatDate(value: string): string {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return dayMonthYear(plain[1], plain[2], plain[3]);
  const parts = istParts(value);
  return dayMonthYear(parts.year, parts.month, parts.day);
}

export function formatDateTime(iso: string): string {
  const parts = istParts(iso);
  return `${dayMonthYear(parts.year, parts.month, parts.day)}, ${parts.hour}:${parts.minute}`;
}
