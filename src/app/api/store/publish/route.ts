// ========================================
// Publish API — with structured logging
// ========================================
// POST /api/store/publish
// Takes { store: Store } body, saves to the database with published=true
// and publishedAt=now(). Returns the slug for the published store URL.
//
// Auth: optional — anonymous users can publish stores (userId=null).
// Signed-in users get ownership enforcement.

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Store } from '@/lib/store-schema';
import { getServerAuthSession, AuthError, authErrorResponse } from '@/lib/auth-utils';

// ─── Helpers ──────────────────────────────────────────────────

/** JSON.stringify that tolerates circular refs / BigInt / undefined */
function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return null;           // undefined → null (JSON-safe)
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
  console.log('[PUBLISH] request received');

  // ── Step 1: Authentication (optional) ──────────────────────────
  let userId: string | undefined;
  try {
    const session = await getServerAuthSession();
    userId = session?.user?.id;
    console.log(`[PUBLISH] authenticated user: ${userId ?? 'anonymous'}`);
  } catch (authErr: unknown) {
    const authMsg = authErr instanceof Error ? authErr.message : String(authErr);
    console.log(`[PUBLISH] auth check skipped (proceeding anonymous): ${authMsg}`);
  }

  // ── Step 2: Database client ────────────────────────────────────
  const dbClient = getDb();
  if (!dbClient) {
    console.error('[PUBLISH ERROR] step=database_client');
    console.error('[PUBLISH ERROR] message=Database unavailable — DATABASE_URL not set or invalid');
    console.error('[PUBLISH ERROR] env_DATABASE_URL=', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.slice(0, 40)}...` : '(not set)');
    return NextResponse.json(
      { error: 'Database is currently unavailable. Please try again later.' },
      { status: 503 }
    );
  }
  console.log('[PUBLISH] database client acquired');

  // ── Step 3: Parse request body ─────────────────────────────────
  let body: { store?: Store };
  try {
    body = await req.json();
  } catch (parseErr: unknown) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error('[PUBLISH ERROR] step=request_parse');
    console.error('[PUBLISH ERROR] message=', parseMsg);
    return NextResponse.json(
      { error: `Invalid JSON in request body: ${parseMsg}` },
      { status: 400 }
    );
  }

  const { store } = body;

  // ── Step 4: Validate store object ──────────────────────────────
  if (!store) {
    console.error('[PUBLISH ERROR] step=validation');
    console.error('[PUBLISH ERROR] message=No store object in request body');
    return NextResponse.json(
      { error: 'A valid store object with id, name, and slug is required.' },
      { status: 400 }
    );
  }

  if (!store.id) {
    console.error('[PUBLISH ERROR] step=validation');
    console.error('[PUBLISH ERROR] message=store.id is missing');
    return NextResponse.json(
      { error: 'Store is missing a valid id.' },
      { status: 400 }
    );
  }

  if (!store.name) {
    console.error('[PUBLISH ERROR] step=validation');
    console.error('[PUBLISH ERROR] message=store.name is missing');
    return NextResponse.json(
      { error: 'Store is missing a valid name.' },
      { status: 400 }
    );
  }

  if (!store.slug) {
    console.error('[PUBLISH ERROR] step=validation');
    console.error('[PUBLISH ERROR] message=store.slug is missing');
    return NextResponse.json(
      { error: 'Store is missing a valid slug.' },
      { status: 400 }
    );
  }

  console.log(`[PUBLISH] store ID: ${store.id}`);
  console.log(`[PUBLISH] store name: ${store.name}`);
  console.log(`[PUBLISH] store slug: ${store.slug}`);

  // ── Step 5: Serialize store for database ───────────────────────
  let serializedStore: string;
  try {
    serializedStore = safeJsonStringify(store);
    console.log(`[PUBLISH] serialized store size: ${Buffer.byteLength(serializedStore, 'utf-8')} bytes`);
  } catch (serErr: unknown) {
    const serMsg = serErr instanceof Error ? serErr.message : String(serErr);
    console.error('[PUBLISH ERROR] step=serialization');
    console.error('[PUBLISH ERROR] message=', serMsg);
    return NextResponse.json(
      { error: `Failed to serialize store data: ${serMsg}` },
      { status: 500 }
    );
  }

  const now = new Date();

  // ── Step 6: Ownership check ────────────────────────────────────
  try {
    const existing = await dbClient.store.findUnique({
      where: { id: store.id },
    });
    console.log(`[PUBLISH] existing record: ${existing ? `found (userId=${existing.userId ?? 'null'}, published=${existing.published})` : 'not found'}`);

    if (existing?.userId && userId && existing.userId !== userId) {
      console.error('[PUBLISH ERROR] step=ownership');
      console.error('[PUBLISH ERROR] message=Owned by ${existing.userId}, requested by ${userId}');
      return NextResponse.json(
        { error: 'You do not have permission to publish this store.' },
        { status: 403 }
      );
    }
  } catch (lookupErr: unknown) {
    const lookupMsg = lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
    console.error('[PUBLISH ERROR] step=store_lookup');
    console.error('[PUBLISH ERROR] message=', lookupMsg);
    if (lookupErr instanceof Error && lookupErr.stack) {
      console.error('[PUBLISH ERROR] stack=', lookupErr.stack);
    }
    return NextResponse.json(
      { error: `Database lookup failed: ${lookupMsg}` },
      { status: 500 }
    );
  }

  // ── Step 7: Upsert (create or update) ──────────────────────────
  let record;
  try {
    console.log('[PUBLISH] writing published state to database...');
    record = await dbClient.store.upsert({
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
        userId: userId || null,
      },
    });
    console.log(`[PUBLISH] database update successful — record id=${record.id}, published=${record.published}`);
  } catch (upsertErr: unknown) {
    const upsertMsg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
    const upsertCode = (upsertErr as { code?: string })?.code;
    console.error('[PUBLISH ERROR] step=database_upsert');
    console.error('[PUBLISH ERROR] code=', upsertCode ?? 'unknown');
    console.error('[PUBLISH ERROR] message=', upsertMsg);
    if (upsertErr instanceof Error && upsertErr.stack) {
      console.error('[PUBLISH ERROR] stack=', upsertErr.stack);
    }

    // Handle unique constraint violation on slug
    if (upsertMsg.includes('Unique constraint') || upsertMsg.includes('UNIQUE constraint') || upsertCode === 'P2002') {
      return NextResponse.json(
        { error: 'A store with this slug already exists. Please use a different store name.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: `Publish failed: ${upsertMsg}` },
      { status: 500 }
    );
  }

  // ── Step 8: Success ─────────────────────────────────────────────
  console.log(`[PUBLISH] publish completed — slug=${record.slug}, publishedAt=${record.publishedAt?.toISOString() ?? 'null'}`);

  return NextResponse.json({
    success: true,
    slug: record.slug,
    publishedAt: record.publishedAt?.toISOString() ?? null,
  });
}
