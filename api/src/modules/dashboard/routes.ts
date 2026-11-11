import type { ProjectStatus } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../db';
import { recentDelaysAndIssues, sortDueSoon, sortMissingUpdate, sortOverdue } from '../../lib/dashboard-sort';
import { presentSummary } from '../../lib/dashboard-summary';
import { deadlineGroup } from '../../lib/deadline-groups';
import { currentMonthInIndia, fromDateColumn, toDateColumn, todayInIndia } from '../../lib/india-date';
import { moneyString } from '../../lib/money';
import { ADVANCE_VIEWERS } from '../../lib/permissions';
import { asyncRoute } from '../async-route';
import { projectFigures } from '../projects/figures';
import { isInProgress } from '../projects/routes';
import { currentState, delayInclude, flagsOf, itemInclude, presentAuthor, presentResponsible } from '../timeline/present';

const RECENT_LIMIT = 10;

export const dashboardRouter = Router();

dashboardRouter.get(
  '/dashboard',
  asyncRoute(async (_req, res) => {
    const today = todayInIndia();
    const items = await prisma.timelineItem.findMany({
      where: { archived: false, project: { archived: false } },
      include: { ...itemInclude, project: { select: { id: true, name: true } } },
    });

    type Entry = { project: { id: string; name: string }; item: { id: string; name: string }; responsible_label: string };
    const overdue: (Entry & { deadline: string; days_overdue: number })[] = [];
    const dueSoon: (Entry & { deadline: string })[] = [];
    const missingUpdate: (Entry & { last_update_on: string })[] = [];
    for (const item of items) {
      const entry = {
        project: item.project,
        item: { id: item.id, name: item.name },
        responsible_label: presentResponsible(item.responsibleKind, item.responsibleVendor, 'None').label,
      };
      for (const flag of flagsOf(item, today)) {
        if (flag.type === 'OVERDUE') {
          overdue.push({ ...entry, deadline: fromDateColumn(item.deadline), days_overdue: flag.days_overdue });
        } else if (flag.type === 'DUE_SOON') {
          dueSoon.push({ ...entry, deadline: fromDateColumn(item.deadline) });
        } else {
          missingUpdate.push({ ...entry, last_update_on: flag.last_update_on });
        }
      }
    }

    const visible = {
      project: { archived: false },
      OR: [{ timelineItemId: null }, { timelineItem: { archived: false } }],
    };
    const newest = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const recordInclude = {
      project: { select: { id: true, name: true } },
      timelineItem: { select: { id: true, name: true, responsibleKind: true, responsibleVendor: { select: { id: true, name: true, archived: true } } } },
      createdBy: delayInclude.createdBy,
    };
    const [delays, issues] = await Promise.all([
      prisma.delay.findMany({ where: visible, include: recordInclude, orderBy: newest, take: RECENT_LIMIT }),
      prisma.coordinationIssue.findMany({ where: visible, include: recordInclude, orderBy: newest, take: RECENT_LIMIT }),
    ]);
    type RecordRow = Pick<(typeof delays)[number], 'id' | 'createdAt' | 'project' | 'timelineItem' | 'createdBy'>;
    const record = (row: RecordRow, kind: 'DELAY' | 'COORDINATION_ISSUE', text: string) => ({
      kind,
      id: row.id,
      project: row.project,
      item: row.timelineItem ? { id: row.timelineItem.id, name: row.timelineItem.name } : null,
      responsible_label: row.timelineItem
        ? presentResponsible(row.timelineItem.responsibleKind, row.timelineItem.responsibleVendor, 'None').label
        : 'None',
      text,
      created_at: row.createdAt,
      created_by: presentAuthor(row.createdBy),
    });

    // Feature 004 (FR-018, FR-019): every open item on an active project with its deadline group. The browser
    // groups, filters and sorts these; the Feature 002 lists above are kept unchanged beside them.
    const open = items.filter((item) => currentState(item).status !== 'DONE');
    const itemRows = open
      .map((item) => {
        const state = currentState(item);
        const flags = flagsOf(item, today);
        const overdueFlag = flags.find((flag) => flag.type === 'OVERDUE');
        return {
          id: item.id,
          name: item.name,
          item_type: item.itemType,
          deadline: fromDateColumn(item.deadline),
          status: state.status,
          last_update_on: state.lastUpdateOn,
          group: deadlineGroup(fromDateColumn(item.deadline), today),
          days_overdue: overdueFlag && overdueFlag.type === 'OVERDUE' ? overdueFlag.days_overdue : null,
          flags,
          project: item.project,
          responsible: presentResponsible(item.responsibleKind, item.responsibleVendor, 'None'),
        };
      })
      .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name));

    // FR-023a: active projects that are Delayed, or Ongoing with overdue items. Projects with no items count too.
    const activeProjects = await prisma.project.findMany({
      where: { archived: false },
      select: { id: true, name: true, status: true, archived: true, expectedCompletionDate: true },
    });
    const attentionProjects = activeProjects
      .map((project) => ({ project, figures: projectFigures(project, items.filter((item) => item.projectId === project.id), today) }))
      .filter(({ figures }) => figures.reasons.length > 0)
      .sort(
        (a, b) =>
          Number(b.figures.health === 'DELAYED') - Number(a.figures.health === 'DELAYED') ||
          b.figures.overdue_count - a.figures.overdue_count ||
          a.project.name.localeCompare(b.project.name),
      )
      .map(({ project, figures }) => ({
        id: project.id,
        name: project.name,
        health: figures.health,
        progress: figures.progress,
        overdue_count: figures.overdue_count,
        reasons: figures.reasons,
      }));

    res.json({
      today,
      items: itemRows,
      attention_projects: attentionProjects,
      overdue: sortOverdue(overdue),
      due_soon: sortDueSoon(dueSoon),
      missing_update: sortMissingUpdate(missingUpdate),
      recent_delays_and_issues: recentDelaysAndIssues(
        delays.map((row) => record(row, 'DELAY', row.reason)),
        issues.map((row) => record(row, 'COORDINATION_ISSUE', row.description)),
        RECENT_LIMIT,
      ),
    });
  }),
);

// Count and money tiles (FR-023 to FR-026). Worked out on every request, so they reflect every saved change.
dashboardRouter.get(
  '/dashboard/summary',
  asyncRoute(async (req, res) => {
    const role = req.staff!.role;
    const [vendorsActive, byStatus, projectsArchived] = await Promise.all([
      prisma.vendor.count({ where: { archived: false } }),
      prisma.project.groupBy({ by: ['status'], where: { archived: false }, _count: { _all: true } }),
      prisma.project.count({ where: { archived: true } }),
    ]);
    const projects: Record<ProjectStatus, number> = { PLANNED: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0 };
    for (const row of byStatus) projects[row.status] = row._count._all;

    let advances = null;
    if (ADVANCE_VIEWERS.includes(role)) {
      // Covers every project, archived included. A reversal removes its advance from the month it was received in.
      const month = currentMonthInIndia();
      const [standing, received] = await Promise.all([
        prisma.clientAdvance.aggregate({ where: { reversal: { is: null } }, _sum: { amount: true } }),
        prisma.clientAdvance.aggregate({
          where: { reversal: { is: null }, receivedOn: { gte: toDateColumn(month.start), lt: toDateColumn(month.end) } },
          _sum: { amount: true },
        }),
      ]);
      advances = {
        standingTotal: moneyString(standing._sum.amount ?? 0),
        receivedThisMonth: moneyString(received._sum.amount ?? 0),
        month: month.label,
      };
    }
    res.json(presentSummary(role, { vendorsActive, projects, projectsArchived, advances }));
  }),
);

// Feature 005 US3: the business overview (FR-020 to FR-023), worked out from the saved records on every request.
// The Feature 003 summary above and GET /dashboard stay exactly as they were (FR-025).
const RECENTLY_UPDATED_LIMIT = 5;
const PROGRESS_LIMIT = 10;
const ACTIVITY_LIMIT = 10;

dashboardRouter.get(
  '/dashboard/overview',
  asyncRoute(async (req, res) => {
    const today = todayInIndia();
    const [vendorsAll, vendorsArchived, projectsArchived, openProjects] = await Promise.all([
      prisma.vendor.count(),
      prisma.vendor.count({ where: { archived: true } }),
      prisma.project.count({ where: { archived: true } }),
      prisma.project.findMany({
        where: { archived: false },
        select: { id: true, name: true, status: true, archived: true, expectedCompletionDate: true, timelineItems: { where: { archived: false }, include: itemInclude } },
        orderBy: { name: 'asc' },
      }),
    ]);
    const figures = openProjects.map((project) => ({ project, figures: projectFigures(project, project.timelineItems, today) }));
    const progress = figures
      .filter(({ project, figures: f }) => project.status !== 'COMPLETED' && f.progress.total > 0)
      .map(({ project, figures: f }) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        health: f.health,
        done: f.progress.done,
        total: f.progress.total,
        percent: Math.round((f.progress.done / f.progress.total) * 100),
      }))
      .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name))
      .slice(0, PROGRESS_LIMIT);

    // The newest change to each open project, its sections and their vendors, its assignments or its timeline.
    const recentlyUpdated = await prisma.$queryRaw<{ id: string; name: string; status: string; updated_at: Date }[]>`
      SELECT p.id, p.name, p.status::text AS status, MAX(c.at) AS updated_at
      FROM (
        SELECT id AS project_id, updated_at AS at FROM projects
        UNION ALL SELECT project_id, updated_at FROM project_sections
        UNION ALL SELECT s.project_id, a.updated_at FROM section_assignments a JOIN project_sections s ON s.id = a.section_id
        UNION ALL SELECT project_id, updated_at FROM vendor_project_links
        UNION ALL SELECT project_id, updated_at FROM timeline_items
        UNION ALL SELECT i.project_id, u.created_at FROM timeline_progress_updates u JOIN timeline_items i ON i.id = u.timeline_item_id
      ) c
      JOIN projects p ON p.id = c.project_id AND p.archived = false
      GROUP BY p.id, p.name, p.status
      ORDER BY updated_at DESC, p.name ASC
      LIMIT ${RECENTLY_UPDATED_LIMIT}`;

    // Vendor and project history; client-advance entries only for roles that may see amounts (Feature 003 FR-017).
    const maySeeAdvances = ADVANCE_VIEWERS.includes(req.staff!.role);
    const entries = await prisma.historyEntry.findMany({
      where: { OR: [{ vendorId: { not: null } }, { projectId: { not: null } }, ...(maySeeAdvances ? [{ clientAdvanceId: { not: null } }] : [])] },
      include: {
        vendor: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        clientAdvance: { select: { project: { select: { id: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ACTIVITY_LIMIT,
    });

    res.json({
      counts: {
        vendors_all: vendorsAll,
        vendors_archived: vendorsArchived,
        projects_not_archived: openProjects.length,
        projects_in_progress: figures.filter(({ project, figures: f }) => isInProgress(project, f.progress)).length,
        projects_archived: projectsArchived,
      },
      progress,
      recently_updated: recentlyUpdated.map((row) => ({ id: row.id, name: row.name, status: row.status, updated_at: row.updated_at.toISOString() })),
      recent_activity: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        target: entry.vendor
          ? { kind: 'vendor', id: entry.vendor.id, name: entry.vendor.name }
          : entry.project
            ? { kind: 'project', id: entry.project.id, name: entry.project.name }
            : { kind: 'client_advance', id: entry.clientAdvance!.project.id, name: entry.clientAdvance!.project.name },
        changes: entry.changes,
        details: entry.details,
        created_at: entry.createdAt.toISOString(),
        created_by: entry.createdBy,
      })),
    });
  }),
);
