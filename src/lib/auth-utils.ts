// ═══════════════════════════════════════════════════════════════════
// Auth Utility Functions (Step 3)
// ═══════════════════════════════════════════════════════════════════
// Server-side only. Provides session helpers and auth guards
// for use in API routes and server components.

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

// Re-export password utilities for convenience
export { hashPassword, verifyPassword } from '@/lib/password';

// ── Session Helpers ─────────────────────────────────────────────

/**
 * Get the current auth session (safe for server components & API routes).
 * Returns null if not authenticated.
 */
export async function getServerAuthSession() {
  return getServerSession(authOptions);
}

/**
 * Require authentication — returns the session or throws an AuthError.
 * Use in API routes: `const session = await requireAuth();`
 */
export async function requireAuth() {
  const session = await getServerAuthSession();

  if (!session?.user?.id) {
    throw new AuthError('Authentication required', 401);
  }

  return session;
}

// ── Custom Error Class ───────────────────────────────────────────

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Create a NextResponse from an AuthError.
 * Use in API route catch blocks:
 * `catch (e) { if (e instanceof AuthError) return authErrorResponse(e); }`
 */
export function authErrorResponse(error: AuthError): NextResponse {
  return NextResponse.json(
    { error: error.message },
    { status: error.status },
  );
}
