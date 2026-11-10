import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';

// Feature 005: how sections and section assignments are read and shown (contracts/http-api.md, Sections).

type Db = Prisma.TransactionClient | typeof prisma;

const vendorSelect = {
  id: true,
  name: true,
  archived: true,
  phone: true,
  contactPerson: true,
  categories: { select: { category: { select: { id: true, name: true } } } },
} as const;

const sectionInclude = {
  updatedBy: { select: { id: true, name: true } },
  removedBy: { select: { id: true, name: true } },
  assignments: { include: { vendor: { select: vendorSelect } }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};

type SectionRow = Prisma.ProjectSectionGetPayload<{ include: typeof sectionInclude }>;
type AssignmentRow = SectionRow['assignments'][number];

export function presentAssignment(row: AssignmentRow) {
  return {
    id: row.id,
    vendor_id: row.vendor.id,
    vendor_name: row.vendor.name,
    vendor_archived: row.vendor.archived,
    vendor_phone: row.vendor.phone,
    vendor_contact_person: row.vendor.contactPerson,
    vendor_categories: row.vendor.categories.map((entry) => entry.category),
    role_in_section: row.roleInSection,
  };
}

function presentSection(row: SectionRow) {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    description: row.description,
    notes: row.notes,
    updated_at: row.updatedAt.toISOString(),
    updated_by: row.updatedBy,
    assignments: row.assignments.filter((assignment) => !assignment.removedAt).map(presentAssignment),
  };
}

// One section, as returned after a change to it.
export async function sectionById(db: Db, id: string) {
  return presentSection(await db.projectSection.findUniqueOrThrow({ where: { id }, include: sectionInclude }));
}

// Current sections in order, removed ones newest first, and the version a reorder must quote (research §5).
export async function sectionsPayload(db: Db, projectId: string) {
  const rows = await db.projectSection.findMany({ where: { projectId }, include: sectionInclude, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  const current = rows.filter((row) => !row.removedAt);
  const removed = rows.filter((row) => row.removedAt).sort((a, b) => b.removedAt!.getTime() - a.removedAt!.getTime());
  const latest = rows.reduce<Date | null>((max, row) => (!max || row.updatedAt > max ? row.updatedAt : max), null);
  return {
    sections: current.map(presentSection),
    removed_sections: removed.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      notes: row.notes,
      removed_at: row.removedAt!.toISOString(),
      removed_by: row.removedBy,
      past_assignments: row.assignments.map((assignment) => ({
        vendor_id: assignment.vendor.id,
        vendor_name: assignment.vendor.name,
        role_in_section: assignment.roleInSection,
        removed_at: assignment.removedAt?.toISOString() ?? null,
      })),
    })),
    sections_version: latest?.toISOString() ?? '',
  };
}

// A vendor's current sections per project, in section order (FR-018), keyed `${vendorId}:${projectId}`.
export async function currentSectionsOf(where: { vendorId?: string; projectId?: string }) {
  const rows = await prisma.sectionAssignment.findMany({
    where: {
      removedAt: null,
      ...(where.vendorId ? { vendorId: where.vendorId } : {}),
      section: { removedAt: null, ...(where.projectId ? { projectId: where.projectId } : {}) },
    },
    include: { section: { select: { id: true, name: true, position: true, projectId: true } } },
  });
  rows.sort((a, b) => a.section.position - b.section.position);
  const byPair = new Map<string, { id: string; name: string; role_in_section: string | null }[]>();
  for (const row of rows) {
    const key = `${row.vendorId}:${row.section.projectId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), { id: row.section.id, name: row.section.name, role_in_section: row.roleInSection }]);
  }
  return (vendorId: string, projectId: string) => byPair.get(`${vendorId}:${projectId}`) ?? [];
}
