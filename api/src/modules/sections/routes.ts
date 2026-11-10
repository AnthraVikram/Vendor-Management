import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { DEFAULT_SECTIONS } from '../../lib/blueprint';
import { diffFields, recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { asyncRoute } from '../async-route';
import { activePair, assignVendorToProject, endSectionAssignments, linkExists, recordOnBoth } from '../links/routes';
import { presentAssignment, sectionById, sectionsPayload } from './present';

// Feature 005 US2: a project's own sections (FR-008 to FR-014, FR-010a) and the vendors assigned to them
// (FR-015 to FR-019). Sections and assignments are removed by flag and kept; nothing here deletes a row.

const text = z.string().max(5000, 'Use 5,000 characters or fewer.').nullable().optional();
const name = z.string().trim().min(1, 'Enter a section name.').max(80, 'Use 80 characters or fewer.');
const addSchema = z.object({ name, description: text, notes: text }).strict();
const patchSchema = z
  .object({ name: name.optional(), description: text, notes: text })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Change the name, description or notes.' });
const orderSchema = z.object({ section_ids: z.array(z.string().uuid()).min(1, 'List every current section once.'), sections_version: z.string() }).strict();
const role = z.string().trim().max(120, 'Use 120 characters or fewer.').nullable().optional();
const assignSchema = z.object({ vendor_id: z.string().uuid('Choose a vendor.'), role_in_section: role }).strict();
const rolePatchSchema = z.object({ role_in_section: role }).strict();

// Empty text is stored as no text.
function blankToNull(value: string | null | undefined) {
  return value === undefined ? undefined : value === null || value.trim() === '' ? null : value;
}

function archivedProject(): HttpError {
  return new HttpError(409, 'An archived project cannot be changed.', { code: 'ARCHIVED' });
}

// Serialises structural changes to one project's sections (add, remove, restore, reorder, blueprint).
async function lockProject(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, archived: true } });
  if (!project) throw new HttpError(404, 'Project not found.');
  if (project.archived) throw archivedProject();
  return project;
}

// Locks the section's project, then the section; refuses a section on an archived project.
async function lockSection(tx: Prisma.TransactionClient, id: string) {
  const found = await tx.projectSection.findUnique({ where: { id }, select: { projectId: true } });
  if (!found) throw new HttpError(404, 'Section not found.');
  const project = await lockProject(tx, found.projectId);
  const section = await tx.projectSection.findUniqueOrThrow({ where: { id } });
  return { section, project };
}

async function assertNameFree(tx: Prisma.TransactionClient, projectId: string, wanted: string, exceptId?: string) {
  const other = await tx.projectSection.findFirst({
    where: { projectId, removedAt: null, name: { equals: wanted, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (other) {
    throw new HttpError(409, `This project already has a section called "${other.name}".`, { code: 'SECTION_NAME_TAKEN' });
  }
}

// Current sections keep positions 0..n-1 in their order (data-model.md, position).
async function renumber(tx: Prisma.TransactionClient, projectId: string, actorId: string, order?: string[]) {
  const current = await tx.projectSection.findMany({ where: { projectId, removedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  const ids = order ?? current.map((row) => row.id);
  for (const [index, id] of ids.entries()) {
    if (current.find((row) => row.id === id)?.position !== index) {
      await tx.projectSection.update({ where: { id }, data: { position: index, ...stampUpdate(actorId) } });
    }
  }
}

function nameConflict(error: unknown): never {
  // A parallel request won the race for project_sections_current_name_key.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'This project already has a section with that name.', { code: 'SECTION_NAME_TAKEN' });
  }
  throw error;
}

// Creates the 15 default sections for a project that has none (FR-012, FR-013). Also used at project creation.
export async function createBlueprint(tx: Prisma.TransactionClient, projectId: string, actorId: string) {
  await tx.projectSection.createMany({
    data: DEFAULT_SECTIONS.map((sectionName, position) => ({ projectId, name: sectionName, position, ...stampCreate(actorId) })),
  });
}

export const sectionRouter = Router();

sectionRouter.post(
  '/projects/:projectId/sections/blueprint',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const payload = await prisma.$transaction(async (tx) => {
      const project = await lockProject(tx, req.params.projectId);
      if (await tx.projectSection.count({ where: { projectId: project.id, removedAt: null } })) {
        throw new HttpError(409, 'This project already has sections.', { code: 'HAS_SECTIONS' });
      }
      await createBlueprint(tx, project.id, actor);
      await recordHistory(tx, { target: { projectId: project.id }, action: 'BLUEPRINT_APPLIED', actorId: actor, details: { sections: [...DEFAULT_SECTIONS] } });
      return sectionsPayload(tx, project.id);
    });
    res.status(201).json(payload);
  }),
);

sectionRouter.post(
  '/projects/:projectId/sections',
  asyncRoute(async (req, res) => {
    const body = addSchema.parse(req.body);
    const actor = req.staff!.id;
    const section = await prisma
      .$transaction(async (tx) => {
        const project = await lockProject(tx, req.params.projectId);
        await assertNameFree(tx, project.id, body.name);
        const count = await tx.projectSection.count({ where: { projectId: project.id, removedAt: null } });
        const created = await tx.projectSection.create({
          data: { projectId: project.id, name: body.name, position: count, description: blankToNull(body.description), notes: blankToNull(body.notes), ...stampCreate(actor) },
        });
        await recordHistory(tx, { target: { projectId: project.id }, action: 'SECTION_ADDED', actorId: actor, details: { section: { id: created.id, name: created.name } } });
        return sectionById(tx, created.id);
      })
      .catch(nameConflict);
    res.status(201).json(section);
  }),
);

sectionRouter.patch(
  '/sections/:id',
  asyncRoute(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const actor = req.staff!.id;
    const section = await prisma
      .$transaction(async (tx) => {
        const { section: existing, project } = await lockSection(tx, req.params.id);
        if (existing.removedAt) throw new HttpError(409, 'This section has been removed. Restore it first.', { code: 'SECTION_REMOVED' });
        if (body.name !== undefined) await assertNameFree(tx, project.id, body.name, existing.id);
        const after = {
          name: body.name ?? existing.name,
          description: body.description === undefined ? existing.description : blankToNull(body.description),
          notes: body.notes === undefined ? existing.notes : blankToNull(body.notes),
        };
        await tx.projectSection.update({ where: { id: existing.id }, data: { ...after, ...stampUpdate(actor) } });
        const details = { section: { id: existing.id, name: after.name } };
        const renamed = diffFields(existing, after, ['name']);
        if (Object.keys(renamed).length) await recordHistory(tx, { target: { projectId: project.id }, action: 'SECTION_RENAMED', actorId: actor, changes: renamed, details });
        const edited = diffFields(existing, after, ['description', 'notes']);
        if (Object.keys(edited).length) await recordHistory(tx, { target: { projectId: project.id }, action: 'SECTION_EDITED', actorId: actor, changes: edited, details });
        return sectionById(tx, existing.id);
      })
      .catch(nameConflict);
    res.json(section);
  }),
);

sectionRouter.put(
  '/projects/:projectId/sections/order',
  asyncRoute(async (req, res) => {
    const body = orderSchema.parse(req.body);
    const actor = req.staff!.id;
    const payload = await prisma.$transaction(async (tx) => {
      const project = await lockProject(tx, req.params.projectId);
      const before = await sectionsPayload(tx, project.id);
      if (body.sections_version !== before.sections_version) {
        throw new HttpError(409, 'Someone else changed this project’s sections. Here is the current order.', {
          code: 'SECTIONS_CHANGED',
          extra: { sections: before.sections, sections_version: before.sections_version },
        });
      }
      const current = before.sections.map((section) => section.id);
      const sameSet = body.section_ids.length === current.length && new Set(body.section_ids).size === current.length && body.section_ids.every((id) => current.includes(id));
      if (!sameSet) throw new HttpError(400, 'Check the highlighted fields.', { fields: { section_ids: 'List every current section once.' } });
      await renumber(tx, project.id, actor, body.section_ids);
      const name = (id: string) => before.sections.find((section) => section.id === id)!.name;
      await recordHistory(tx, {
        target: { projectId: project.id },
        action: 'SECTIONS_REORDERED',
        actorId: actor,
        changes: { order: { from: current.map(name), to: body.section_ids.map(name) } },
      });
      const after = await sectionsPayload(tx, project.id);
      return { sections: after.sections, sections_version: after.sections_version };
    });
    res.json(payload);
  }),
);

sectionRouter.delete(
  '/sections/:id',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const result = await prisma.$transaction(async (tx) => {
      const { section, project } = await lockSection(tx, req.params.id);
      if (section.removedAt) throw new HttpError(409, 'This section has already been removed.', { code: 'ALREADY_REMOVED' });
      const ended = await endSectionAssignments(tx, { sectionId: section.id }, actor);
      const removed = await tx.projectSection.update({
        where: { id: section.id },
        data: { removedAt: new Date(), removedById: actor, ...stampUpdate(actor) },
        include: { removedBy: { select: { id: true, name: true } } },
      });
      await renumber(tx, project.id, actor);
      await recordHistory(tx, {
        target: { projectId: project.id },
        action: 'SECTION_REMOVED',
        actorId: actor,
        details: { section: { id: section.id, name: section.name }, ended_assignments: ended },
      });
      return { removed, ended };
    });
    res.json({ removed_at: result.removed.removedAt!.toISOString(), removed_by: result.removed.removedBy, ended_assignments: result.ended });
  }),
);

sectionRouter.post(
  '/sections/:id/restore',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const section = await prisma
      .$transaction(async (tx) => {
        const { section: existing, project } = await lockSection(tx, req.params.id);
        if (!existing.removedAt) throw new HttpError(409, 'This section has not been removed.', { code: 'NOT_REMOVED' });
        await assertNameFree(tx, project.id, existing.name, existing.id);
        // Placed last; its vendor assignments stay past and are made again by hand (FR-010a).
        const count = await tx.projectSection.count({ where: { projectId: project.id, removedAt: null } });
        await tx.projectSection.update({ where: { id: existing.id }, data: { removedAt: null, removedById: null, position: count, ...stampUpdate(actor) } });
        await recordHistory(tx, { target: { projectId: project.id }, action: 'SECTION_RESTORED', actorId: actor, details: { section: { id: existing.id, name: existing.name } } });
        return sectionById(tx, existing.id);
      })
      .catch(nameConflict);
    res.json(section);
  }),
);

sectionRouter.post(
  '/sections/:id/assignments',
  asyncRoute(async (req, res) => {
    const body = assignSchema.parse(req.body);
    const actor = req.staff!.id;
    const result = await prisma
      .$transaction(async (tx) => {
        const { section } = await lockSection(tx, req.params.id);
        if (section.removedAt) throw new HttpError(409, 'This section has been removed. Restore it first.', { code: 'SECTION_REMOVED' });
        const { vendor, project } = await activePair(body.vendor_id, section.projectId);
        // FR-015a: a vendor not yet on the project is assigned to it in the same save.
        const onProject = await tx.vendorProjectLink.findFirst({ where: { vendorId: vendor.id, projectId: project.id, removedAt: null } });
        if (!onProject) await assignVendorToProject(tx, { vendor, project, actorId: actor });
        const taken = await tx.sectionAssignment.findFirst({ where: { sectionId: section.id, vendorId: vendor.id, removedAt: null } });
        if (taken) throw new HttpError(409, `${vendor.name} is already assigned to ${section.name}.`, { code: 'SECTION_ASSIGNMENT_EXISTS' });
        const created = await tx.sectionAssignment.create({
          data: { sectionId: section.id, vendorId: vendor.id, roleInSection: blankToNull(body.role_in_section), ...stampCreate(actor) },
          include: { vendor: { select: { id: true, name: true, archived: true, phone: true, contactPerson: true, categories: { select: { category: { select: { id: true, name: true } } } } } } },
        });
        await recordOnBoth(tx, {
          action: 'SECTION_ASSIGNED',
          actorId: actor,
          vendor: { id: vendor.id, name: vendor.name },
          project: { id: project.id, name: project.name },
          assignmentId: created.id,
          section: { id: section.id, name: section.name },
          extra: { role_in_section: created.roleInSection },
        });
        return { assignment: presentAssignment(created), project_assignment_created: !onProject };
      })
      .catch((error: unknown) => {
        // A parallel request won the race for one of the current-assignment indexes; nothing was saved.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (String(error.meta?.target ?? error.message).includes('section')) {
            throw new HttpError(409, 'That vendor is already assigned to this section.', { code: 'SECTION_ASSIGNMENT_EXISTS' });
          }
          throw linkExists();
        }
        throw error;
      });
    res.status(201).json(result);
  }),
);

// Locks one section assignment and its project; refuses changes on an archived project.
async function lockAssignment(tx: Prisma.TransactionClient, id: string) {
  const found = await tx.sectionAssignment.findUnique({ where: { id }, select: { section: { select: { projectId: true } } } });
  if (!found) throw new HttpError(404, 'Section assignment not found.');
  await lockProject(tx, found.section.projectId);
  await tx.$queryRaw`SELECT id FROM section_assignments WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.sectionAssignment.findUniqueOrThrow({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, archived: true, phone: true, contactPerson: true, categories: { select: { category: { select: { id: true, name: true } } } } } },
      section: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
    },
  });
}

sectionRouter.patch(
  '/section-assignments/:id',
  asyncRoute(async (req, res) => {
    const body = rolePatchSchema.parse(req.body);
    const actor = req.staff!.id;
    const assignment = await prisma.$transaction(async (tx) => {
      const existing = await lockAssignment(tx, req.params.id);
      if (existing.removedAt) throw new HttpError(409, 'This vendor is no longer assigned to the section.', { code: 'SECTION_ASSIGNMENT_REMOVED' });
      const roleInSection = blankToNull(body.role_in_section) ?? null;
      const updated = await tx.sectionAssignment.update({
        where: { id: existing.id },
        data: { roleInSection, ...stampUpdate(actor) },
        include: { vendor: { select: { id: true, name: true, archived: true, phone: true, contactPerson: true, categories: { select: { category: { select: { id: true, name: true } } } } } } },
      });
      const changes = diffFields({ role_in_section: existing.roleInSection }, { role_in_section: roleInSection }, ['role_in_section']);
      if (Object.keys(changes).length) {
        await recordOnBoth(tx, {
          action: 'SECTION_ASSIGNMENT_EDITED',
          actorId: actor,
          vendor: { id: existing.vendor.id, name: existing.vendor.name },
          project: existing.section.project,
          assignmentId: existing.id,
          section: { id: existing.section.id, name: existing.section.name },
          changes,
        });
      }
      return presentAssignment(updated);
    });
    res.json(assignment);
  }),
);

sectionRouter.delete(
  '/section-assignments/:id',
  asyncRoute(async (req, res) => {
    const actor = req.staff!.id;
    const ended = await prisma.$transaction(async (tx) => {
      const existing = await lockAssignment(tx, req.params.id);
      if (existing.removedAt) throw new HttpError(409, 'This vendor has already been removed from the section.', { code: 'ALREADY_REMOVED' });
      // Only this section: the vendor's other sections and the project assignment stay (FR-015b).
      await endSectionAssignments(tx, { id: existing.id }, actor);
      return tx.sectionAssignment.findUniqueOrThrow({ where: { id: existing.id }, include: { removedBy: { select: { id: true, name: true } } } });
    });
    res.json({ removed_at: ended.removedAt!.toISOString(), removed_by: ended.removedBy });
  }),
);
