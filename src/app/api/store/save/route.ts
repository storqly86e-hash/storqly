// ========================================
// Store Persistence (Save) API
// ========================================
// POST /api/store/save
// Takes { store: Store } body and upserts to the database WITHOUT publishing.
// This is for auto-save / draft persistence.

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

    // Upsert: create or update, preserving existing published state
    const existing = await db.store.findUnique({
      where: { id: store.id },
    });

    const record = await db.store.upsert({
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
      },
    });

    return NextResponse.json({
      success: true,
      id: record.id,
      slug: record.slug,
      published: record.published,
    });
  } catch (err: unknown) {
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
