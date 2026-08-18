// ═══════════════════════════════════════════════════════════════════
// Registration API
// ═══════════════════════════════════════════════════════════════════
// POST /api/auth/register
// Takes { name, email, password } and creates a new user.
// Returns the user (without password hash).
// Does NOT auto-login — client must call signIn() separately.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';

// ─── Input validation ──────────────────────────────────────────
function validateInput(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
  name?: string;
  email?: string;
  password?: string;
} {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || name.length < 1) {
    return { valid: false, error: 'Name is required.' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Name must be 100 characters or less.' };
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { valid: false, error: 'A valid email address is required.' };
  }
  if (email.length > 255) {
    return { valid: false, error: 'Email must be 255 characters or less.' };
  }

  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters.' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be 128 characters or less.' };
  }

  return { valid: true, name, email, password };
}

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = validateInput(body);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 },
      );
    }

    const { name, email, password } = validation;

    // Check for existing user (case-insensitive email)
    const existing = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    // Hash password and create user
    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Auth Register] Unexpected error:', msg);

    // Handle unique constraint violation (race condition)
    if (msg.includes('Unique constraint') || msg.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    // Detect database connection issues for helpful error messages
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: 'Database not configured. Please set DATABASE_URL in your deployment environment.' },
        { status: 500 },
      );
    }
    if (msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('P1001') || msg.includes('P1003')) {
      return NextResponse.json(
        { error: 'Could not connect to database. Check DATABASE_URL in your deployment settings.' },
        { status: 500 },
      );
    }
    if (msg.includes('relation') || msg.includes('table') || msg.includes('P2021') || msg.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Database tables not found. The deployment may need to be restarted to run migrations.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: `Registration failed: ${msg.substring(0, 120)}` },
      { status: 500 },
    );
  }
}
