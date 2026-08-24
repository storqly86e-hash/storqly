// ========================================
// Store List API
// ========================================
// GET /api/store/list
// Returns all stores belonging to the authenticated user.
// Lightweight metadata only — full store fetched on-demand via /api/store/lookup.

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

export async function GET() {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const dbClient = getDb();
    if (!dbClient) {
      return NextResponse.json({ stores: [] });
    }

    const stores = await dbClient.store.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        published: true,
        createdAt: true,
        updatedAt: true,
        schema: true,
      },
    });

    // Extract thumbnail from first product image in schema (lightweight)
    const result = stores.map((s) => {
      let thumbnail: string | null = null;
      try {
        const parsed = JSON.parse(s.schema) as { products?: { images?: string[] }[] };
        const firstProduct = parsed.products?.[0];
        if (firstProduct?.images?.[0]) {
          thumbnail = firstProduct.images[0];
        }
      } catch {
        // schema parse failed — thumbnail stays null
      }

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description ?? '',
        published: s.published,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        thumbnail,
      };
    });

    return NextResponse.json({ stores: result });
  } catch (err: unknown) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store List] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'Failed to load stores.' },
      { status: 500 },
    );
  }
}
