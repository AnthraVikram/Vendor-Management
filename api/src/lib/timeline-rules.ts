import { HttpError } from './http';

export function checkPlannedDate(
  plannedDate: string | null | undefined,
  deadline: string | null | undefined,
): Record<string, string> {
  if (plannedDate && deadline && plannedDate > deadline) {
    return { planned_date: 'Planned date cannot be later than the deadline.' };
  }
  return {};
}

export function checkResponsibleShape(responsible: {
  kind: 'NONE' | 'VENDOR' | 'FIRM_TEAM';
  vendor_id?: string | null;
}): Record<string, string> {
  if (responsible.kind === 'VENDOR' && !responsible.vendor_id) {
    return { 'responsible.vendor_id': 'Choose the responsible vendor.' };
  }
  if (responsible.kind !== 'VENDOR' && responsible.vendor_id) {
    return { 'responsible.vendor_id': 'A vendor can only be given when the responsible party is a vendor.' };
  }
  return {};
}

export function assertProjectWritable(project: { archived: boolean }): void {
  if (project.archived) {
    throw new HttpError(409, 'This project is archived. Its timeline is read-only.', { code: 'PROJECT_ARCHIVED' });
  }
}

export function assertItemWritable(item: { archived: boolean }): void {
  if (item.archived) {
    throw new HttpError(409, 'This item is archived. Restore it first.', { code: 'ITEM_ARCHIVED' });
  }
}
