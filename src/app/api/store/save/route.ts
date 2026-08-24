// ========================================
// Store Persistence (Save) API
// ========================================
// POST /api/store/save
// Takes { store: Store } body and upserts to the database WITHOUT publishing.
// This is for auto-save / draft persistence.

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Store } from '@/lib/store-schema';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const dbClient = getDb();
    if (!dbClient) {
      return NextResponse.json(
        { error: 'Database is currently unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { store } = body as { store?: Store };

    if (!store || !store.id || !store.name || !store.slug) {
      return NextResponse.json(
        { error: 'A valid store object with id, name, and slug is required.' },
        { status: 400 }
      );
    }

    const serializedStore = JSON.stringify(store);
    const now = new Date();

    // Upsert: create or update, preserving existing published state
    const existing = await dbClient.store.findUnique({
      where: { id: store.id },
    });

    // Ownership enforcement: if record exists and is owned by a different user, block
    if (existing?.userId && existing.userId !== userId) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this store.' },
        { status: 403 }
      );
    }

    const record = await dbClient.store.upsert({
      where: { id: store.id },
      update: {
        name: store.name,
        slug: store.slug,
        description: store.description || null,
        schema: serializedStore,
        updatedAt: now,
      },
      create: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description || null,
        schema: serializedStore,
        published: false,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      id: record.id,
      slug: record.slug,
      published: record.published,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Save] Unexpected error:', msg);

    // Handle unique constraint violation on slug
    if (msg.includes('Unique constraint') || msg.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A store with this slug already exists. Please use a different store name.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while saving the store.' },
      { status: 500 }
    );
  }
}
