import { describe, expect, it } from 'vitest';
import { normaliseClientName } from '../../src/lib/client-name';

// FR-029a, OQ-41: trim, collapse repeated spaces, ignore letter case; aliases and other spellings do not match.
describe('client-name normalisation', () => {
  it('matches names that differ only in spacing and case', () => {
    expect(normaliseClientName(' mehta  interiors ')).toBe(normaliseClientName('Mehta Interiors'));
  });

  it('does not match a different spelling or an alias', () => {
    expect(normaliseClientName('Mehta Interiors Pvt Ltd')).not.toBe(normaliseClientName('Mehta Interiors'));
    expect(normaliseClientName('Mehta Int.')).not.toBe(normaliseClientName('Mehta Interiors'));
  });

  it('gives null for a blank or missing name', () => {
    expect(normaliseClientName('   ')).toBeNull();
    expect(normaliseClientName(null)).toBeNull();
  });
});
