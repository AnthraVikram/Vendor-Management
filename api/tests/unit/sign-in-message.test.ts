import { describe, expect, it } from 'vitest';
import { signInRefusal } from '../../src/lib/sign-in-message';

describe('sign-in message', () => {
  it('uses one message for an unknown email, a wrong password, and a revoked account', () => {
    const unknown = signInRefusal('unknown');
    const wrong = signInRefusal('wrong-password');
    const revoked = signInRefusal('revoked');
    expect(unknown).toBe('Email or password is not valid.');
    expect(wrong).toBe(unknown);
    expect(revoked).toBe(unknown);
  });
});
