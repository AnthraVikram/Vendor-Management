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
    const [vendorsActive, byStatus] = await Promise.all([
      prisma.vendor.count({ where: { archived: false } }),
      prisma.project.groupBy({ by: ['status'], where: { archived: false }, _count: { _all: true } }),
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
    res.json(presentSummary(role, { vendorsActive, projects, advances }));
  }),
);
