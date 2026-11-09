import { prisma } from '../../db';
import { assignmentStatus, type AssignmentStatus } from '../../lib/assignment-status';
import { currentState, flagsOf, itemInclude } from '../timeline/present';

// Assignment status per (vendor, project) pair, worked out from the vendor's non-archived items on that project
// (FR-010). Items with Firm team or no responsible party count for no vendor (FR-011).
export async function assignmentStatuses(where: { vendorId: string } | { projectId: string }): Promise<(vendorId: string, projectId: string) => AssignmentStatus> {
  const items = await prisma.timelineItem.findMany({
    where: {
      archived: false,
      responsibleKind: 'VENDOR',
      ...('vendorId' in where ? { responsibleVendorId: where.vendorId } : { projectId: where.projectId }),
    },
    include: itemInclude,
  });
  const byPair = new Map<string, { status: ReturnType<typeof currentState>['status']; overdue: boolean }[]>();
  for (const item of items) {
    const key = `${item.responsibleVendorId}:${item.projectId}`;
    const entries = byPair.get(key) ?? [];
    entries.push({ status: currentState(item).status, overdue: flagsOf(item).some((flag) => flag.type === 'OVERDUE') });
    byPair.set(key, entries);
  }
  return (vendorId, projectId) => assignmentStatus(byPair.get(`${vendorId}:${projectId}`) ?? []);
}
