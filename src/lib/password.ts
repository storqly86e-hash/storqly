// ═══════════════════════════════════════════════════════════════════
// Password Hashing Utilities
// ═══════════════════════════════════════════════════════════════════
// Extracted into their own file to avoid circular dependencies
// between auth.ts (needs verifyPassword) and auth-utils.ts (needs authOptions).

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/** Hash a plain-text password using bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verify a plain-text password against a bcrypt hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
