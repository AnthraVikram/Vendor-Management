export const SIGN_IN_FAILURE_MESSAGE = 'Email or password is not valid.';

export function signInRefusal(_reason: 'unknown' | 'wrong-password' | 'revoked'): string {
  return SIGN_IN_FAILURE_MESSAGE;
}
