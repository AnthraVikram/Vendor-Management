import type { HistoryAction, Prisma } from '@prisma/client';
import { stampCreate } from './audit';

// Change history (FR-027). Entries are written in the same transaction as the change they describe.

type Value = unknown;

// Lists compare ignoring order, so they are reported sorted; empty and missing values read as null.
function normalize(value: Value): Value {
  if (Array.isArray(value)) return [...value].map(String).sort();
  if (value === undefined || value === '') return null;
  return value;
}

export function diffFields(
  before: Record<string, Value>,
  after: Record<string, Value>,
  fields: string[],
): Record<string, { from: Value; to: Value }> {
  const changes: Record<string, { from: Value; to: Value }> = {};
  for (const field of fields) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return changes;
}

export type HistoryTarget =
  | { vendorId: string }
  | { projectId: string }
  | { documentId: string }
  | { importRunId: string }
  | { clientAdvanceId: string };

export async function recordHistory(
  tx: Prisma.TransactionClient,
  entry: {
    target: HistoryTarget;
    action: HistoryAction;
    actorId: string;
    changes?: Record<string, unknown>;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { importRunId, ...rest } = entry.target as Record<string, string>;
  await tx.historyEntry.create({
    data: {
      ...rest,
      ...(importRunId ? { vendorImportRunId: importRunId } : {}),
      action: entry.action,
      changes: (entry.changes ?? {}) as Prisma.InputJsonValue,
      details: (entry.details ?? {}) as Prisma.InputJsonValue,
      ...stampCreate(entry.actorId),
    },
  });
}
