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

/** JSON.stringify that tolerates circular refs / BigInt / undefined */
function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return null;
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'function') return '[Function]';
    if (typeof val === 'symbol') return val.toString();
    if (val !== null && typeof val === 'object') {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
}

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  console.log('[SAVE] request received');

  try {
    const session = await requireAuth();
    const userId = session.user.id;
    console.log(`[SAVE] authenticated user: ${userId}`);

    const dbClient = getDb();
    if (!dbClient) {
      console.error('[SAVE ERROR] step=database_client');
      return NextResponse.json(
        { error: 'Database is currently unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { store } = body as { store?: Store };

    if (!store || !store.id || !store.name || !store.slug) {
      console.error('[SAVE ERROR] step=validation — missing store/id/name/slug');
      return NextResponse.json(
        { error: 'A valid store object with id, name, and slug is required.' },
        { status: 400 }
      );
    }

    console.log(`[SAVE] store ID: ${store.id}, slug: ${store.slug}`);

    const serializedStore = safeJsonStringify(store);
    const now = new Date();

    // Ownership enforcement: if record exists and is owned by a different user, block
    const existing = await dbClient.store.findUnique({
      where: { id: store.id },
    });

    if (existing?.userId && existing.userId !== userId) {
      console.error(`[SAVE ERROR] step=ownership — owned by ${existing.userId}, requested by ${userId}`);
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

    console.log(`[SAVE] success — id=${record.id}, slug=${record.slug}, published=${record.published}`);

    return NextResponse.json({
      success: true,
      id: record.id,
      slug: record.slug,
      published: record.published,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    console.error(`[SAVE ERROR] step=unknown, code=${code ?? 'n/a'}, message=${msg}`);
    if (err instanceof Error && err.stack) console.error(`[SAVE ERROR] stack=${err.stack}`);

    // Handle unique constraint violation on slug
    if (msg.includes('Unique constraint') || msg.includes('UNIQUE constraint') || code === 'P2002') {
      return NextResponse.json(
        { error: 'A store with this slug already exists. Please use a different store name.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: `Save failed: ${msg}` },
      { status: 500 }
    );
  }
}
