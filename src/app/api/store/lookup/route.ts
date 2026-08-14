// ========================================
// Store Lookup API
// ========================================
// GET /api/store/lookup?slug=xxx
//
// Access rules:
//   Published stores   → public (anyone can view)
//   Unpublished stores → requires auth + ownership match

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');

    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      return NextResponse.json(
        { error: 'A "slug" query parameter is required.' },
        { status: 400 }
      );
    }

    const record = await db.store.findUnique({
      where: { slug: slug.trim() },
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Store not found.' },
        { status: 404 }
      );
    }

    // Published stores are public — no auth required
    if (record.published) {
      let storeData: unknown;
      try {
        storeData = JSON.parse(record.schema);
      } catch {
        return NextResponse.json(
          { error: 'Store data is corrupted.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        store: storeData,
        publishedAt: record.publishedAt?.toISOString() ?? null,
      });
    }

    // Unpublished stores require auth + ownership
    let session;
    try {
      session = await requireAuth();
    } catch (e) {
      if (e instanceof AuthError) return authErrorResponse(e);
      throw e;
    }

    // Ownership check: record must be owned by the authenticated user
    if (record.userId && record.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Store not found.' },
        { status: 404 }
      );
    }

    let storeData: unknown;
    try {
      storeData = JSON.parse(record.schema);
    } catch {
      return NextResponse.json(
        { error: 'Store data is corrupted.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      store: storeData,
      publishedAt: null,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Lookup] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
