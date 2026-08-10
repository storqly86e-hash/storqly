// ========================================
// Published Store Lookup API
// ========================================
// GET /api/store/lookup?slug=xxx
// Returns the published store's schema JSON for a given slug.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    if (!record || !record.published) {
      return NextResponse.json(
        { error: 'Store not found or not published.' },
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
      publishedAt: record.publishedAt?.toISOString() ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Lookup] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
