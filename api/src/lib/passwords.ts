import bcrypt from 'bcrypt';
import { HttpError } from './http';

const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 10;

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function assertPassword(password: string): void {
  const problem = passwordProblem(password);
  if (problem) {
    throw new HttpError(400, 'Check the highlighted fields.', {
      fields: { password: problem },
    });
  }
}

export function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
