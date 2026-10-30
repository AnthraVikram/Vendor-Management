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

// "YYYY-MM-DD HH:mm IST"
export function istDateTime(iso: string): string {
  const parts = istParts(iso);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} IST`;
}

// "YYYY-MM-DD", the India Standard Time calendar day
export function istDate(iso: string): string {
  const parts = istParts(iso);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
