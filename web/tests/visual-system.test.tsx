/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { ArchivedBadge, AssignmentStatusBadge, AvailabilityBadge, HealthBadge, ProjectStatusBadge } from '../src/badges';

// Feature 005 US6 (T037): one visual system on every page (FR-033 to FR-036, FR-041). Vitest does not load CSS, so
// these read the stylesheet; how the pages actually look is checked by hand in T048.

const css = readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Every innermost rule as [selectors, declarations]; rules inside @media blocks are included.
const rules: [string[], string][] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => [
  match[1].split(',').map((selector) => selector.trim()).filter(Boolean),
  match[2],
]);

function declaration(body: string, property: string): string | undefined {
  return new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();
}

describe('yellow is never a page or large-panel background (FR-033)', () => {
  // The client-advance tiles count as large panels (owner decision on T048 defect D3).
  const LARGE = ['body', 'main', 'section', '.app', '.workspace', '.content', '.sidebar', '.card', '.section', '.dashboard-panel', '.profile-panel', '.confirm-dialog', '.dashboard-tiles a.tile-money', '.dashboard-tiles a.tile-money:hover'];

  it.each(LARGE)('%s has no yellow background', (selector) => {
    const offenders = rules
      .filter(([selectors]) => selectors.includes(selector))
      .map(([, body]) => declaration(body, 'background') ?? declaration(body, 'background-color') ?? '')
      .filter((value) => /--accent/.test(value));
    expect(offenders).toEqual([]);
  });
});

describe('primary actions (FR-033, FR-034)', () => {
  it('are yellow with black text', () => {
    const [, body] = rules.find(([selectors]) => selectors.includes('button') && selectors.includes('.button'))!;
    expect(declaration(body, 'background')).toBe('var(--accent)');
    expect(declaration(body, 'color')).toBe('var(--on-accent)');
  });
});

describe('one colour treatment per meaning (FR-036)', () => {
  const FAMILIES = ['success', 'warning', 'danger', 'info', 'completed'];
  const MARKER = /\.(status|health|assignment|availability|flag|outcome|role)-[a-z-]+$|^\.role-badge$/;

  // Which palette families a rule's colour, background and border use.
  function families(body: string): string[] {
    const found = new Set<string>();
    for (const property of ['color', 'background', 'background-color', 'border-color']) {
      const value = declaration(body, property) ?? '';
      for (const family of FAMILIES) if (value.includes(`--${family}-`)) found.add(family);
      if (/--accent/.test(value)) found.add('accent');
    }
    return [...found];
  }

  // Whole-row tints (an import row approved anyway) are highlights, like a selected row, not status markers.
  const markers = rules.flatMap(([selectors, body]) => selectors.filter((selector) => MARKER.test(selector) && !selector.includes('::') && !selector.includes('outcome-row-')).map((selector) => [selector, body] as const));

  it('finds the marker rules it checks', () => {
    expect(markers.map(([selector]) => selector)).toEqual(expect.arrayContaining(['.status-planned', '.health-delayed', '.assignment-in-progress', '.status-archived', '.flag-overdue']));
  });

  it.each(markers.map(([selector, body]) => [selector, body]))('%s uses one palette family or none', (_selector, body) => {
    expect(families(body).length).toBeLessThanOrEqual(1);
    expect(families(body)).not.toContain('accent');
  });

  it.each([
    ['in progress', ['.status-badge.status-in-progress', '.assignment-in-progress']],
    ['completed', ['.status-completed', '.assignment-completed', '.health-completed']],
    ['delayed', ['.assignment-delayed', '.health-delayed']],
  ])('gives "%s" the same treatment everywhere', (_meaning, selectors) => {
    const used = selectors.map((selector) => families(rules.find(([list]) => list.includes(selector))![1]).join());
    expect(new Set(used).size).toBe(1);
  });
});

describe('visible keyboard focus (FR-041)', () => {
  it('has one focus ring for buttons, links, inputs, selects and summaries', () => {
    const [, body] = rules.find(([selectors]) => selectors.includes(':focus-visible'))!;
    expect(declaration(body, 'outline')).toMatch(/var\(--focus\)/);
  });

  it('never removes a focus indicator without replacing it', () => {
    const removed = rules.filter(([, body]) => /outline\s*:\s*(none|0)\b/.test(body));
    for (const [selectors, body] of removed) {
      expect(selectors.every((selector) => /:focus/.test(selector))).toBe(true);
      expect(declaration(body, 'box-shadow') ?? declaration(body, 'border-color')).toBeTruthy();
    }
    expect(rules.some(([selectors, body]) => selectors.some((selector) => selector.includes(':focus-visible')) && /outline\s*:\s*(none|0)\b/.test(body))).toBe(false);
  });
});

// T048 browser-acceptance defects. Vitest has no layout, so these pin the rules that fixed what the browser showed.
describe('no sideways page scroll from list controls and tables (FR-045, T048 D2 and D4)', () => {
  const only = (selector: string) => rules.filter(([selectors]) => selectors.length === 1 && selectors[0] === selector).map(([, body]) => body);

  it('keeps the hidden Active/Archived radios inside their option instead of 100% of the page wide (D2)', () => {
    expect(only('.view-option').some((body) => declaration(body, 'position') === 'relative')).toBe(true);
    const input = only('.view-option input').join(';');
    expect(declaration(input, 'width')).toBe('1px');
    expect(declaration(input, 'height')).toBe('1px');
  });

  it('keeps visually hidden text inside a scrolling table frame (D4)', () => {
    const frame = only('.table-wrap').find((body) => declaration(body, 'overflow-x') === 'auto')!;
    expect(declaration(frame, 'position')).toBe('relative');
  });

  it('wraps list-table cells between words, so columns are not squeezed into broken words (D4)', () => {
    // Two classes, so it wins over the shared `.table-wrap td { overflow-wrap: anywhere }` wherever that rule sits.
    expect(declaration(only('.table-wrap.list-table td').join(';'), 'overflow-wrap')).toBe('break-word');
    expect(declaration(only('.list-table td').join(';'), 'overflow-wrap')).toBeUndefined();
  });
});

describe('sign-in branding is readable (FR-041, T048 D1)', () => {
  it('uses the body text colour on the white card, not the navigation text colour', () => {
    const [, body] = rules.find(([selectors]) => selectors.includes('.auth-card .brand'))!;
    expect(declaration(body, 'color')).toBe('var(--text)');
  });
});

describe('every marker carries words (FR-028, FR-036)', () => {
  it('renders text inside every status badge', () => {
    const { container } = render(
      <div>
        {['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'SOMETHING_NEW'].map((status) => <ProjectStatusBadge key={status} status={status} />)}
        {['AVAILABLE', 'LIMITED', 'UNAVAILABLE'].map((value) => <AvailabilityBadge key={value} availability={value} />)}
        <AvailabilityBadge availability={null} />
        {['NO_ACTIVITIES', 'NOT_STARTED', 'IN_PROGRESS', 'DELAYED', 'COMPLETED'].map((status) => <AssignmentStatusBadge key={status} status={status} />)}
        {['ONGOING', 'DELAYED', 'COMPLETED'].map((health) => <HealthBadge key={health} health={health} />)}
        <ArchivedBadge />
      </div>,
    );
    const badges = [...container.querySelectorAll('.status-badge')];
    expect(badges).toHaveLength(18);
    for (const badge of badges) expect(badge.textContent?.trim()).not.toBe('');
  });
});
