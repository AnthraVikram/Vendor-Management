import { describe, expect, it } from 'vitest';
import { changesOwnRole } from '../../src/lib/own-role';

describe('own role', () => {
  it('flags a caller giving their own account a different role', () => {
    expect(
      changesOwnRole({ callerId: 'a', targetId: 'a', currentRole: 'ADMINISTRATOR', nextRole: 'OFFICE_TEAM' }),
    ).toBe(true);
  });

  it('allows changing someone else, sending no role, or resending the same role', () => {
    expect(
      changesOwnRole({ callerId: 'a', targetId: 'b', currentRole: 'ADMINISTRATOR', nextRole: 'OFFICE_TEAM' }),
    ).toBe(false);
    expect(
      changesOwnRole({ callerId: 'a', targetId: 'a', currentRole: 'ADMINISTRATOR', nextRole: undefined }),
    ).toBe(false);
    expect(
      changesOwnRole({ callerId: 'a', targetId: 'a', currentRole: 'ADMINISTRATOR', nextRole: 'ADMINISTRATOR' }),
    ).toBe(false);
  });
});
