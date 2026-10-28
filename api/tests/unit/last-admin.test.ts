import { describe, expect, it } from 'vitest';
import { leavesNoActiveAdministrator } from '../../src/lib/last-admin';

describe('last administrator', () => {
  it('refuses a change that would leave zero active administrators', () => {
    expect(
      leavesNoActiveAdministrator({
        activeAdministratorCount: 1,
        targetIsActiveAdministrator: true,
        willBeActiveAdministrator: false,
      }),
    ).toBe(true);
  });

  it('allows a change while another administrator stays active', () => {
    expect(
      leavesNoActiveAdministrator({
        activeAdministratorCount: 2,
        targetIsActiveAdministrator: true,
        willBeActiveAdministrator: false,
      }),
    ).toBe(false);
  });
});
