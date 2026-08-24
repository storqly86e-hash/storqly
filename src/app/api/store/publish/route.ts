// ========================================
// Publish API
// ========================================
// POST /api/store/publish
// Takes { store: Store } body, saves to the database with published=true
// and publishedAt=now(). Returns the slug for the published store URL.

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

    // Ownership enforcement: if record exists and is owned by a different user, block
    const existing = await dbClient.store.findUnique({
      where: { id: store.id },
    });
    if (existing?.userId && existing.userId !== userId) {
      return NextResponse.json(
        { error: 'You do not have permission to publish this store.' },
        { status: 403 }
      );
    }

    // Upsert: create or update the store record
    const record = await dbClient.store.upsert({
      where: { id: store.id },
      update: {
        name: store.name,
        slug: store.slug,
        description: store.description || null,
        schema: serializedStore,
        published: true,
        publishedAt: now,
        updatedAt: now,
      },
      create: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description || null,
        schema: serializedStore,
        published: true,
        publishedAt: now,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      slug: record.slug,
      publishedAt: record.publishedAt?.toISOString() ?? null,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Publish] Unexpected error:', msg);

    // Handle unique constraint violation on slug
    if (msg.includes('Unique constraint') || msg.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A store with this slug already exists. Please use a different store name.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while publishing the store.' },
      { status: 500 }
    );
  }
}
