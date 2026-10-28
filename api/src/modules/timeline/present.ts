import type { Prisma, ResponsibleKind } from '@prisma/client';
import { fromDateColumn, indiaDateOf, todayInIndia } from '../../lib/india-date';
import { flagsFor, type TimelineFlag } from '../../lib/timeline-flags';

const author = { select: { id: true, name: true } } as const;
const vendorSummary = { select: { id: true, name: true, archived: true } } as const;

export const itemInclude = {
  responsibleVendor: vendorSummary,
  progressUpdates: { orderBy: { seq: 'desc' }, take: 1 },
} satisfies Prisma.TimelineItemInclude;

export const itemDetailInclude = {
  responsibleVendor: vendorSummary,
  progressUpdates: { orderBy: { seq: 'desc' }, include: { createdBy: author } },
  dateChanges: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { createdBy: author } },
  responsibleChanges: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { createdBy: author, oldVendor: vendorSummary, newVendor: vendorSummary },
  },
} satisfies Prisma.TimelineItemInclude;

export const delayInclude = {
  timelineItem: { select: { id: true, name: true } },
  createdBy: author,
} satisfies Prisma.DelayInclude;

export const issueInclude = {
  timelineItem: { select: { id: true, name: true } },
  createdBy: author,
  vendors: { include: { vendor: vendorSummary } },
} satisfies Prisma.CoordinationIssueInclude;

export const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

type ItemRow = Prisma.TimelineItemGetPayload<{ include: typeof itemInclude }>;
type DateChangeRow = Prisma.TimelineDateChangeGetPayload<{ include: { createdBy: typeof author } }>;
type ResponsibleChangeRow = Prisma.TimelineResponsibleChangeGetPayload<{
  include: { createdBy: typeof author; oldVendor: typeof vendorSummary; newVendor: typeof vendorSummary };
}>;
type DelayRow = Prisma.DelayGetPayload<{ include: typeof delayInclude }>;
type IssueRow = Prisma.CoordinationIssueGetPayload<{ include: typeof issueInclude }>;
type ProgressRow = Prisma.TimelineProgressUpdateGetPayload<{ include: { createdBy: typeof author } }>;
type VendorSummary = { id: string; name: string; archived: boolean };

export function presentAuthor(person: { id: string; name: string }) {
  return { id: person.id, name: person.name };
}

export function presentResponsible(kind: ResponsibleKind, vendor: VendorSummary | null, noneLabel = 'No responsible party') {
  if (kind === 'VENDOR' && vendor) {
    return { kind, vendor: { id: vendor.id, name: vendor.name, archived: vendor.archived }, label: vendor.name };
  }
  return { kind, vendor: null, label: kind === 'FIRM_TEAM' ? 'Firm team' : noneLabel };
}

export function currentState(item: Pick<ItemRow, 'progressUpdates'>) {
  const latest = item.progressUpdates[0];
  const status = latest?.status ?? 'NOT_STARTED';
  const lastUpdateOn = latest ? indiaDateOf(latest.createdAt) : null;
  return { status, lastUpdateOn, doneOn: status === 'DONE' ? lastUpdateOn : null };
}

export function flagsOf(item: ItemRow, today: string = todayInIndia()): TimelineFlag[] {
  const state = currentState(item);
  return flagsFor(
    { status: state.status, archived: item.archived, deadline: fromDateColumn(item.deadline), lastUpdateOn: state.lastUpdateOn },
    today,
  );
}

export function presentItem(item: ItemRow) {
  const state = currentState(item);
  return {
    id: item.id,
    project_id: item.projectId,
    item_type: item.itemType,
    name: item.name,
    description: item.description,
    planned_date: item.plannedDate ? fromDateColumn(item.plannedDate) : null,
    deadline: fromDateColumn(item.deadline),
    responsible: presentResponsible(item.responsibleKind, item.responsibleVendor),
    status: state.status,
    last_update_on: state.lastUpdateOn,
    done_on: state.doneOn,
    archived: item.archived,
    flags: flagsOf(item),
  };
}

export function presentProgressUpdate(row: ProgressRow) {
  return {
    id: row.id,
    status: row.status,
    note: row.note,
    created_at: row.createdAt,
    created_by: presentAuthor(row.createdBy),
  };
}

export function presentDateChange(row: DateChangeRow) {
  return {
    id: row.id,
    field: row.field,
    old_value: row.oldValue ? fromDateColumn(row.oldValue) : null,
    new_value: row.newValue ? fromDateColumn(row.newValue) : null,
    created_at: row.createdAt,
    created_by: presentAuthor(row.createdBy),
  };
}

export function presentResponsibleChange(row: ResponsibleChangeRow) {
  return {
    id: row.id,
    old: presentResponsible(row.oldKind, row.oldVendor),
    new: presentResponsible(row.newKind, row.newVendor),
    cause: row.cause,
    created_at: row.createdAt,
    created_by: presentAuthor(row.createdBy),
  };
}

export function presentDelay(row: DelayRow) {
  return {
    id: row.id,
    project_id: row.projectId,
    timeline_item: row.timelineItem ? { id: row.timelineItem.id, name: row.timelineItem.name } : null,
    reason: row.reason,
    created_at: row.createdAt,
    created_by: presentAuthor(row.createdBy),
  };
}

export function presentIssue(row: IssueRow) {
  return {
    id: row.id,
    project_id: row.projectId,
    timeline_item: row.timelineItem ? { id: row.timelineItem.id, name: row.timelineItem.name } : null,
    description: row.description,
    vendors: row.vendors
      .map((entry) => ({ id: entry.vendor.id, name: entry.vendor.name, archived: entry.vendor.archived }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    created_at: row.createdAt,
    created_by: presentAuthor(row.createdBy),
  };
}
