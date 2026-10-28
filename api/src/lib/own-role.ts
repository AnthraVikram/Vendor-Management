import type { StaffRole } from '@prisma/client';

export function changesOwnRole(input: {
  callerId: string;
  targetId: string;
  currentRole: StaffRole;
  nextRole: StaffRole | undefined;
}): boolean {
  return input.callerId === input.targetId && input.nextRole !== undefined && input.nextRole !== input.currentRole;
}
