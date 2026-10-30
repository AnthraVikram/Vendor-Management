import type { StaffRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { presentSummary } from '../../src/lib/dashboard-summary';
import { ADVANCE_VIEWERS } from '../../src/lib/permissions';

const figures = {
  vendorsActive: 184,
  projects: { PLANNED: 3, ACTIVE: 12, ON_HOLD: 2, COMPLETED: 9 },
  advances: { standingTotal: '4520000.00', receivedThisMonth: '350000.00', month: '2026-10' },
};

describe('presentSummary', () => {
  it.each(ADVANCE_VIEWERS)('includes the money tiles in the contract shape for %s', (role) => {
    expect(presentSummary(role, figures)).toEqual({
      vendors: { active: 184 },
      projects: { PLANNED: 3, ACTIVE: 12, ON_HOLD: 2, COMPLETED: 9 },
      client_advances: {
        standing_total: '4520000.00',
        received_this_month: '350000.00',
        month: '2026-10',
        labels: {
          standing_total: 'Client advances received and not reversed, all projects',
          received_this_month: 'Client advances received in October 2026 and not reversed',
        },
      },
    });
  });

  it('names the month in English for January and December', () => {
    const january = presentSummary('ADMINISTRATOR', { ...figures, advances: { ...figures.advances, month: '2027-01' } });
    expect(january.client_advances?.labels.received_this_month).toBe('Client advances received in January 2027 and not reversed');
    const december = presentSummary('ADMINISTRATOR', { ...figures, advances: { ...figures.advances, month: '2026-12' } });
    expect(december.client_advances?.labels.received_this_month).toBe('Client advances received in December 2026 and not reversed');
  });

  it('leaves out client_advances and every amount for a role outside ADVANCE_VIEWERS (FR-025)', () => {
    const outsider = 'SITE_VISITOR' as StaffRole;
    const result = presentSummary(outsider, figures);
    expect(result).not.toHaveProperty('client_advances');
    expect(result).toEqual({ vendors: { active: 184 }, projects: { PLANNED: 3, ACTIVE: 12, ON_HOLD: 2, COMPLETED: 9 } });
    const text = JSON.stringify(result);
    expect(text).not.toContain('4520000');
    expect(text).not.toContain('350000');
    expect(text).not.toMatch(/\d+\.\d{2}/);
  });
});
