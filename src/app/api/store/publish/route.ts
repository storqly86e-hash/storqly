// ========================================
// Publish API
// ========================================
// POST /api/store/publish
// Takes { store: Store } body, saves to the database with published=true
// and publishedAt=now(). Returns the slug for the published store URL.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Store } from '@/lib/store-schema';

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
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

    // Upsert: create or update the store record
    const record = await db.store.upsert({
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
      },
    });

    return NextResponse.json({
      success: true,
      slug: record.slug,
      publishedAt: record.publishedAt?.toISOString() ?? null,
    });
  } catch (err: unknown) {
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
