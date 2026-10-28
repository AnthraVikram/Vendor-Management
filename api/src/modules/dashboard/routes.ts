import { Router } from 'express';
import { prisma } from '../../db';
import { recentDelaysAndIssues, sortDueSoon, sortMissingUpdate, sortOverdue } from '../../lib/dashboard-sort';
import { fromDateColumn, todayInIndia } from '../../lib/india-date';
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
