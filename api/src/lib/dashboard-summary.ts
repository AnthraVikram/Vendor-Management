import type { ProjectStatus, StaffRole } from '@prisma/client';
import { ADVANCE_VIEWERS } from './permissions';

// The dashboard count and money tiles (FR-023 to FR-025). Amounts reach only roles allowed to see them.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface SummaryFigures {
  vendorsActive: number;
  projects: Record<ProjectStatus, number>;
  // Money strings with two decimals; `month` is the IST month as YYYY-MM. Null when not gathered.
  advances: { standingTotal: string; receivedThisMonth: string; month: string } | null;
}

export interface Summary {
  vendors: { active: number };
  projects: Record<ProjectStatus, number>;
  client_advances?: {
    standing_total: string;
    received_this_month: string;
    month: string;
    labels: { standing_total: string; received_this_month: string };
  };
}

function monthInWords(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return `${MONTHS[index - 1]} ${year}`;
}

export function presentSummary(role: StaffRole, figures: SummaryFigures): Summary {
  const summary: Summary = { vendors: { active: figures.vendorsActive }, projects: { ...figures.projects } };
  if (figures.advances && ADVANCE_VIEWERS.includes(role)) {
    summary.client_advances = {
      standing_total: figures.advances.standingTotal,
      received_this_month: figures.advances.receivedThisMonth,
      month: figures.advances.month,
      labels: {
        standing_total: 'Client advances received and not reversed, all projects',
        received_this_month: `Client advances received in ${monthInWords(figures.advances.month)} and not reversed`,
      },
    };
  }
  return summary;
}
