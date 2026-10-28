const DAY_MS = 86_400_000;

const indiaCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function indiaDateOf(timestamp: Date): string {
  return indiaCalendar.format(timestamp);
}

export function todayInIndia(now: Date = new Date()): string {
  return indiaDateOf(now);
}

function utcMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(utcMidnight(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

export function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}
