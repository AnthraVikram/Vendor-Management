/// <reference types="node" />
import { readFileSync } from 'node:fs';

// Feature 005 FR-041 (T011): every text and control colour pair in the design meets WCAG 2.1 AA. Vitest does not
// load CSS, so this reads the tokens from the stylesheet itself.
const css = readFileSync('src/styles.css', 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(root);
  if (!match) throw new Error(`--${name} is not a six-digit colour on :root`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-muted'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-muted'],
  ['text-dim', 'surface'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-strong'],
  ['nav-text', 'nav-bg'],
  ['nav-text-muted', 'nav-bg'],
  ['success-fg', 'success-bg'],
  ['warning-fg', 'warning-bg'],
  ['danger-fg', 'danger-bg'],
  ['info-fg', 'info-bg'],
  ['completed-fg', 'completed-bg'],
  ['danger-fg', 'surface'],
  ['link', 'surface'],
];

// Control boundaries and the focus ring need 3:1 against what is next to them (WCAG 1.4.11).
const NON_TEXT_PAIRS: [string, string][] = [
  ['input-border', 'surface'],
  ['focus', 'surface'],
  ['accent', 'nav-bg'],
];

describe('light visual system contrast (FR-041)', () => {
  it.each(TEXT_PAIRS)('--%s on --%s is at least 4.5:1', (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('--%s against --%s is at least 3:1', (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it('uses white surfaces and black text (FR-033)', () => {
    expect(token('surface').toLowerCase()).toBe('#ffffff');
    expect(luminance(token('text'))).toBeLessThan(0.02);
    expect(token('accent').toLowerCase()).toBe('#facc15');
  });
});
