// One phone rule for the vendor form and the import (FR-030).

export function phoneKey(text: string | null | undefined): string {
  return (text ?? '').replace(/[\s-]/g, '');
}

type PhoneHolder = { phone?: string | null; alternatePhone?: string | null };

export function phoneMatches<T extends PhoneHolder & { id: string; name: string }>(
  candidate: PhoneHolder,
  others: T[],
): { id: string; name: string }[] {
  const keys = [phoneKey(candidate.phone), phoneKey(candidate.alternatePhone)].filter((key) => key !== '');
  if (keys.length === 0) return [];
  return others
    .filter((other) => [phoneKey(other.phone), phoneKey(other.alternatePhone)].some((key) => key !== '' && keys.includes(key)))
    .map(({ id, name }) => ({ id, name }));
}
