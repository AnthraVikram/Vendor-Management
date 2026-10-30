import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { stampCreate, stampUpdate } from '../../lib/audit';
import { diffFields, recordHistory } from '../../lib/history';
import { HttpError } from '../../lib/http';
import { parseChargeAmount, moneyString } from '../../lib/money';
import { phoneMatches } from '../../lib/phone';
import { vendorIdentityLock } from '../../lib/vendor-lock';
import { gstinProblem, normalizeGstin, ratingProblem, reuseCategory } from '../../lib/vendor-rules';
import { asyncRoute } from '../async-route';

const rateSchema = z.object({
  label: z.string().trim().min(1, 'Rate label is required.'),
  amount: z.string(),
  unit: z.string().trim().min(1, 'Rate unit is required.'),
});

const vendorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  phone: z.string().trim().min(1, 'Phone is required.'),
  category_ids: z.array(z.string().uuid()).min(1, 'A category is required.'),
  contact_person: z.string().trim().optional(),
  alternate_phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  address: z.string().trim().optional(),
  gst_registered: z.boolean().optional(),
  gstin: z.string().trim().nullable().optional(),
  gst_legal_name: z.string().trim().optional(),
  team_size: z.number().int().min(0, 'Team size must be a whole number of zero or greater.').nullable().optional(),
  availability: z.enum(['AVAILABLE', 'LIMITED', 'UNAVAILABLE']).nullable().optional(),
  manpower_note: z.string().optional(),
  locations: z.array(z.string().trim().min(1)).optional(),
  services: z.array(z.string().trim().min(1)).optional(),
  materials: z.array(z.string().trim().min(1)).optional(),
  rates: z.array(rateSchema).optional(),
  confirm_duplicate_phone: z.boolean().optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
});

const noteSchema = z.object({
  note_type: z.enum(['PAST_WORK', 'RELIABILITY', 'COORDINATION', 'GENERAL']),
  body: z.string().trim().min(1, 'Note text is required.'),
});

const ratingSchema = z.object({
  score: z.number(),
  comment: z.string().optional(),
});

const vendorInclude = {
  categories: { include: { category: true } },
  locations: true,
  services: true,
  materials: true,
  rates: true,
  notes: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  ratings: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  links: { include: { project: { select: { id: true, name: true } } } },
  importRun: { select: { id: true, fileName: true, createdAt: true } },
} satisfies Prisma.VendorInclude;

type VendorRecord = Prisma.VendorGetPayload<{ include: typeof vendorInclude }>;

function presentVendor(vendor: VendorRecord) {
  const history = vendor.ratings.map((rating) => ({
    id: rating.id,
    score: rating.score,
    comment: rating.comment,
    created_at: rating.createdAt.toISOString(),
    author: { id: rating.createdBy.id, name: rating.createdBy.name },
  }));
  return {
    id: vendor.id,
    name: vendor.name,
    contact_person: vendor.contactPerson,
    phone: vendor.phone,
    alternate_phone: vendor.alternatePhone,
    email: vendor.email,
    address: vendor.address,
    gst_registered: vendor.gstRegistered,
    gstin: vendor.gstin,
    gst_legal_name: vendor.gstLegalName,
    team_size: vendor.teamSize,
    availability: vendor.availability,
    manpower_note: vendor.manpowerNote,
    archived: vendor.archived,
    categories: vendor.categories.map((row) => ({ id: row.category.id, name: row.category.name })),
    locations: vendor.locations.map((row) => row.label),
    services: vendor.services.map((row) => row.label),
    materials: vendor.materials.map((row) => row.label),
    rates: vendor.rates.map((row) => ({
      id: row.id,
      label: row.label,
      amount: moneyString(row.amount),
      unit: row.unit,
    })),
    current_rating: history.length > 0 ? history[history.length - 1] : null,
    rating_history: history,
    notes: vendor.notes.map((note) => ({
      id: note.id,
      note_type: note.noteType,
      body: note.body,
      created_at: note.createdAt.toISOString(),
      author: { id: note.createdBy.id, name: note.createdBy.name },
    })),
    links: vendor.links.map((link) => ({
      id: link.id,
      project_id: link.project.id,
      project_name: link.project.name,
      role_on_project: link.roleOnProject,
      scope_of_work: link.scopeOfWork,
      note: link.note,
    })),
    import_run: vendor.importRun
      ? { id: vendor.importRun.id, file_name: vendor.importRun.fileName, created_at: vendor.importRun.createdAt.toISOString() }
      : null,
  };
}

// The fields compared for a vendor EDITED entry (data-model.md). Lists hold readable values, not ids.
const EDITED_FIELDS = [
  'name', 'contact_person', 'phone', 'alternate_phone', 'email', 'address', 'categories', 'locations', 'services', 'materials',
  'rates', 'gst_registered', 'gstin', 'gst_legal_name', 'team_size', 'availability', 'manpower_note',
];

function vendorSnapshot(vendor: VendorRecord): Record<string, unknown> {
  return {
    name: vendor.name,
    contact_person: vendor.contactPerson,
    phone: vendor.phone,
    alternate_phone: vendor.alternatePhone,
    email: vendor.email,
    address: vendor.address,
    categories: vendor.categories.map((row) => row.category.name),
    locations: vendor.locations.map((row) => row.label),
    services: vendor.services.map((row) => row.label),
    materials: vendor.materials.map((row) => row.label),
    rates: vendor.rates.map((row) => `${row.label}: ${moneyString(row.amount)} / ${row.unit}`),
    gst_registered: vendor.gstRegistered,
    gstin: vendor.gstin,
    gst_legal_name: vendor.gstLegalName,
    team_size: vendor.teamSize,
    availability: vendor.availability,
    manpower_note: vendor.manpowerNote,
  };
}

// Archive and restore write an entry only when the archived flag actually changes. The row lock
// stops two simultaneous requests from both recording the same change.
async function setVendorArchived(id: string, archived: boolean, actor: string): Promise<VendorRecord> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM vendors WHERE id = ${id}::uuid FOR UPDATE`;
    const existing = await tx.vendor.findUnique({ where: { id }, select: { archived: true } });
    if (!existing) throw new HttpError(404, 'Vendor not found.');
    const vendor = await tx.vendor.update({ where: { id }, data: { archived, ...stampUpdate(actor) }, include: vendorInclude });
    if (existing.archived !== archived) {
      await recordHistory(tx, { target: { vendorId: id }, action: archived ? 'ARCHIVED' : 'RESTORED', actorId: actor });
    }
    return vendor;
  });
}

async function loadVendor(id: string): Promise<VendorRecord> {
  const vendor = await prisma.vendor.findUnique({ where: { id }, include: vendorInclude });
  if (!vendor) throw new HttpError(404, 'Vendor not found.');
  return vendor;
}

// FR-030: the submitted phone and alternate phone are compared, ignoring spaces and dashes, with the
// phone and alternate phone of every other vendor, archived included. Stored values are not changed.
async function assertPhone(
  tx: Prisma.TransactionClient,
  candidate: { phone?: string; alternatePhone?: string },
  confirm: boolean,
  exceptId?: string,
): Promise<void> {
  const others = await tx.vendor.findMany({
    where: exceptId ? { id: { not: exceptId } } : {},
    select: { id: true, name: true, phone: true, alternatePhone: true },
  });
  const matches = phoneMatches(candidate, others);
  if (matches.length > 0 && !confirm) {
    throw new HttpError(409, 'Another vendor already uses this phone number.', {
      code: 'PHONE_IN_USE',
      extra: { matches },
    });
  }
}

function gstFields(registered: boolean, gstin: string | null | undefined) {
  const problem = gstinProblem(registered, gstin);
  if (problem) {
    throw new HttpError(400, 'Check the highlighted fields.', { fields: { gstin: problem } });
  }
  return normalizeGstin(registered, gstin);
}

async function assertGstinUnique(tx: Prisma.TransactionClient, gstin: string | null, exceptId?: string): Promise<void> {
  if (!gstin) return;
  const existing = await tx.vendor.findFirst({
    where: { gstin, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, 'That GSTIN is already stored.', { code: 'GSTIN_IN_USE' });
}

function childWrites(actorId: string, body: z.infer<typeof vendorSchema>, vendorId: string) {
  return {
    categories: {
      create: body.category_ids.map((categoryId) => ({
        categoryId,
        ...stampCreate(actorId),
      })),
    },
    locations: {
      create: (body.locations ?? []).map((label) => ({ label, ...stampCreate(actorId) })),
    },
    services: {
      create: (body.services ?? []).map((label) => ({ label, ...stampCreate(actorId) })),
    },
    materials: {
      create: (body.materials ?? []).map((label) => ({ label, ...stampCreate(actorId) })),
    },
    rates: {
      create: (body.rates ?? []).map((rate) => ({
        label: rate.label,
        amount: parseChargeAmount(rate.amount),
        unit: rate.unit,
        ...stampCreate(actorId),
      })),
    },
  };
  void vendorId;
}

export const categoryRouter = Router();

categoryRouter.get(
  '/',
  asyncRoute(async (_req, res) => {
    const rows = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json(rows.map((row) => ({ id: row.id, name: row.name })));
  }),
);

categoryRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = categorySchema.parse(req.body);
    const existing = await prisma.category.findMany();
    const match = existing.find((row) => reuseCategory(row.name, body.name).matches);
    if (match) {
      res.json({ id: match.id, name: match.name });
      return;
    }
    const created = await prisma.category.create({
      data: { name: body.name.trim(), ...stampCreate(req.staff!.id) },
    });
    res.status(201).json({ id: created.id, name: created.name });
  }),
);

export const vendorRouter = Router();

vendorRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : undefined;
    const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';
    const availability = typeof req.query.availability === 'string' ? req.query.availability : undefined;
    const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
    const includeArchived = req.query.include_archived === 'true';
    const vendors = await prisma.vendor.findMany({
      where: {
        ...(includeArchived ? {} : { archived: false }),
        ...(categoryId ? { categories: { some: { categoryId } } } : {}),
        ...(location ? { locations: { some: { label: { equals: location, mode: 'insensitive' } } } } : {}),
        ...(availability ? { availability: availability as 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' } : {}),
        ...(projectId ? { links: { some: { projectId } } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { alternatePhone: { contains: q, mode: 'insensitive' } },
                { contactPerson: { contains: q, mode: 'insensitive' } },
                { services: { some: { label: { contains: q, mode: 'insensitive' } } } },
                { materials: { some: { label: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: vendorInclude,
      orderBy: { name: 'asc' },
    });
    res.json(vendors.map(presentVendor));
  }),
);

vendorRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = vendorSchema.parse(req.body);
    const actor = req.staff!.id;
    const registered = body.gst_registered ?? false;
    const gstin = gstFields(registered, body.gstin);
    const categories = await prisma.category.findMany({ where: { id: { in: body.category_ids } } });
    if (categories.length !== body.category_ids.length) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { category_ids: 'A category is required.' } });
    }
    // The vendor identity lock makes the GSTIN and phone checks and the write one step, so a
    // concurrent vendor write or import confirmation cannot slip a duplicate in between.
    const vendor = await prisma.$transaction(async (tx) => {
      await vendorIdentityLock(tx);
      await assertPhone(tx, { phone: body.phone, alternatePhone: body.alternate_phone }, body.confirm_duplicate_phone === true);
      await assertGstinUnique(tx, gstin);
      const created = await tx.vendor.create({
        data: {
          name: body.name,
          phone: body.phone,
          contactPerson: body.contact_person,
          alternatePhone: body.alternate_phone,
          email: body.email,
          address: body.address,
          gstRegistered: registered,
          gstin,
          gstLegalName: body.gst_legal_name,
          teamSize: body.team_size ?? null,
          availability: body.availability ?? null,
          manpowerNote: body.manpower_note,
          ...stampCreate(actor),
          ...childWrites(actor, body, ''),
        },
        include: vendorInclude,
      });
      await recordHistory(tx, { target: { vendorId: created.id }, action: 'CREATED', actorId: actor });
      return created;
    });
    res.status(201).json(presentVendor(vendor));
  }),
);

vendorRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    res.json(presentVendor(await loadVendor(req.params.id)));
  }),
);

vendorRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = await loadVendor(req.params.id);
    const body = vendorSchema.parse(req.body);
    const actor = req.staff!.id;
    const registered = body.gst_registered ?? false;
    const gstin = gstFields(registered, body.gstin);
    const vendor = await prisma.$transaction(async (tx) => {
      await vendorIdentityLock(tx);
      await assertPhone(tx, { phone: body.phone, alternatePhone: body.alternate_phone }, body.confirm_duplicate_phone === true, existing.id);
      await assertGstinUnique(tx, gstin, existing.id);
      // Read again under the lock, so the diff starts from the state this edit replaces.
      const before = vendorSnapshot(await tx.vendor.findUniqueOrThrow({ where: { id: existing.id }, include: vendorInclude }));
      await tx.vendorCategory.deleteMany({ where: { vendorId: existing.id } });
      await tx.vendorLocation.deleteMany({ where: { vendorId: existing.id } });
      await tx.vendorService.deleteMany({ where: { vendorId: existing.id } });
      await tx.vendorMaterial.deleteMany({ where: { vendorId: existing.id } });
      await tx.vendorRate.deleteMany({ where: { vendorId: existing.id } });
      const updated = await tx.vendor.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          phone: body.phone,
          contactPerson: body.contact_person,
          alternatePhone: body.alternate_phone,
          email: body.email,
          address: body.address,
          gstRegistered: registered,
          gstin,
          gstLegalName: body.gst_legal_name,
          teamSize: body.team_size ?? null,
          availability: body.availability ?? null,
          manpowerNote: body.manpower_note,
          ...stampUpdate(actor),
          ...childWrites(actor, body, existing.id),
        },
        include: vendorInclude,
      });
      const changes = diffFields(before, vendorSnapshot(updated), EDITED_FIELDS);
      if (Object.keys(changes).length > 0) {
        await recordHistory(tx, { target: { vendorId: existing.id }, action: 'EDITED', actorId: actor, changes });
      }
      return updated;
    });
    res.json(presentVendor(vendor));
  }),
);

vendorRouter.post(
  '/:id/archive',
  asyncRoute(async (req, res) => {
    res.json(presentVendor(await setVendorArchived(req.params.id, true, req.staff!.id)));
  }),
);

vendorRouter.post(
  '/:id/restore',
  asyncRoute(async (req, res) => {
    res.json(presentVendor(await setVendorArchived(req.params.id, false, req.staff!.id)));
  }),
);

vendorRouter.post(
  '/:id/notes',
  asyncRoute(async (req, res) => {
    await loadVendor(req.params.id);
    const body = noteSchema.parse(req.body);
    await prisma.vendorNote.create({
      data: {
        vendorId: req.params.id,
        noteType: body.note_type,
        body: body.body,
        ...stampCreate(req.staff!.id),
      },
    });
    res.status(201).json(presentVendor(await loadVendor(req.params.id)));
  }),
);

vendorRouter.post(
  '/:id/ratings',
  asyncRoute(async (req, res) => {
    await loadVendor(req.params.id);
    const body = ratingSchema.parse(req.body);
    const problem = ratingProblem(body.score);
    if (problem) throw new HttpError(400, 'Check the highlighted fields.', { fields: { score: problem } });
    await prisma.vendorRating.create({
      data: {
        vendorId: req.params.id,
        score: body.score,
        comment: body.comment,
        ...stampCreate(req.staff!.id),
      },
    });
    res.status(201).json(presentVendor(await loadVendor(req.params.id)));
  }),
);
