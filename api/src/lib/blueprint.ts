// The fixed default blueprint (Feature 005 FR-012, FR-014). A new project gets its own copy of these sections, in this
// order; staff then change that project's copy only. Every section holds text only: Procurement and Budget & Costing
// carry no amounts or orders (FR-048).
export const DEFAULT_SECTIONS: readonly string[] = Object.freeze([
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
