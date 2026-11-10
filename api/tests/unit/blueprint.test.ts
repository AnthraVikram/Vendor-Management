import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTIONS } from '../../src/lib/blueprint';

// Feature 005 FR-012: every new project starts with these 15 sections, in this order (owner decision, 2026-11-09).
describe('default project blueprint', () => {
  it('has exactly the 15 sections in the agreed order', () => {
    expect(DEFAULT_SECTIONS).toEqual([
      'Project Overview',
      'Client Information',
      'Scope of Work',
      'Design & Planning',
      'Drawings / Documentation',
      'Procurement',
      'Materials',
      'Execution',
      'Site Coordination',
      'Budget & Costing',
      'Timeline',
      'Milestones',
      'Deliverables',
      'Snagging',
      'Completion',
    ]);
  });

  it('cannot be changed at run time (FR-014)', () => {
    expect(Object.isFrozen(DEFAULT_SECTIONS)).toBe(true);
  });
});
