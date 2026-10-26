import { describe, expect, it } from 'vitest';
import { gstinProblem, listedWhenArchived, ratingProblem, reuseCategory } from '../../src/lib/vendor-rules';

describe('vendor rules', () => {
  it('requires a GSTIN only when the vendor is registered', () => {
    expect(gstinProblem(true, null)).toMatch(/GSTIN is required/);
    expect(gstinProblem(false, null)).toBeNull();
    expect(gstinProblem(true, '22AAAAA0000A1Z5')).toBeNull();
  });

  it('rejects a duplicate-shaped rating and an empty score', () => {
    expect(ratingProblem(0)).toBeTruthy();
    expect(ratingProblem(6)).toBeTruthy();
    expect(ratingProblem(3)).toBeNull();
  });

  it('omits archived vendors unless include_archived is set', () => {
    expect(listedWhenArchived(false, true)).toBe(false);
    expect(listedWhenArchived(true, true)).toBe(true);
    expect(listedWhenArchived(false, false)).toBe(true);
  });

  it('reuses a category without rewriting the stored name', () => {
    const result = reuseCategory('Electrical', 'electrical');
    expect(result.matches).toBe(true);
    expect(result.name).toBe('Electrical');
  });
});
