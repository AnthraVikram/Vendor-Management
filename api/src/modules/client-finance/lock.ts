import type { Prisma, StaffRole } from '@prisma/client';
import { HttpError } from '../../lib/http';
import { FINANCE_REVIEWERS } from '../../lib/permissions';

// Every client-finance write starts its transaction by locking the project row (research R4). This serialises the
// rules that depend on derived state: one active revision, one current PO per approval, overpayment, duplicates.
export type LockedProject = { id: string; archived: boolean; client_name: string | null };

export async function lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<LockedProject> {
  const rows = await tx.$queryRaw<LockedProject[]>`
    SELECT id, archived, client_name FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new HttpError(404, 'Project not found.');
  return rows[0];
}

// The only corrections allowed on an archived project (FR-010, OQ-26).
export type ArchivedAllowed = 'REVERSE_RECEIPT' | 'REJECT_RECEIPT' | 'REJECT_PO' | 'CANCEL_PO';

export function assertWritable(project: LockedProject, action: ArchivedAllowed | 'OTHER' = 'OTHER'): void {
  if (project.archived && action === 'OTHER') {
    throw new HttpError(409, 'This project is archived. Its client financial records are read-only until it is restored.', {
      code: 'PROJECT_ARCHIVED',
    });
  }
}

// FR-007: refuse when the state changed since the person loaded it; the body names the current state.
export function assertExpected(current: string, expected: string | undefined): void {
  if (expected !== undefined && expected !== current) {
    throw new HttpError(409, `This record changed since you opened it. It is now ${label(current)}.`, {
      code: 'STALE',
      extra: { current_state: current },
    });
  }
}

export function isReviewer(role: StaffRole): boolean {
  return FINANCE_REVIEWERS.includes(role);
}

export function assertReviewer(staff: { role: StaffRole }, message = 'Only an Administrator or an Accountant can do this.'): void {
  if (!isReviewer(staff.role)) throw new HttpError(403, message, { code: 'ROLE_NOT_ALLOWED' });
}

// Office Team may act only on records they created (recorded creator, FR-006); reviewers on any.
export function assertOwnerOrReviewer(staff: { id: string; role: StaffRole }, createdById: string, message: string): void {
  if (!isReviewer(staff.role) && staff.id !== createdById) throw new HttpError(403, message, { code: 'ROLE_NOT_ALLOWED' });
}

export function invalidTransition(current: string, message?: string): HttpError {
  return new HttpError(409, message ?? `This is not allowed while the record is ${label(current)}.`, {
    code: 'INVALID_TRANSITION',
    extra: { current_state: current },
  });
}

export function label(state: string): string {
  return state.toLowerCase().replace(/_/g, ' ');
}
