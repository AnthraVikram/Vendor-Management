import type { ProjectStatus } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../db';
import { recentDelaysAndIssues, sortDueSoon, sortMissingUpdate, sortOverdue } from '../../lib/dashboard-sort';
import { presentSummary } from '../../lib/dashboard-summary';
import { currentMonthInIndia, fromDateColumn, toDateColumn, todayInIndia } from '../../lib/india-date';
import { moneyString } from '../../lib/money';
import { ADVANCE_VIEWERS } from '../../lib/permissions';
import { asyncRoute } from '../async-route';
import { delayInclude, flagsOf, itemInclude, presentAuthor, presentResponsible } from '../timeline/present';

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

    res.json({
      today,
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
