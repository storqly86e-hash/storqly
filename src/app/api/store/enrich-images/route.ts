// ========================================
// Image Enrichment API — Lazy/Background
// ========================================
// POST /api/store/enrich-images
//
// Called by the client AFTER store generation completes.
// Enriches product images sequentially with rate limiting.
// Returns updated image URLs as they complete.
//
// Also supports enriching section background images.
//
// This keeps store generation at 1 API call. Image enrichment
// happens in the background without blocking the user.

import { NextRequest, NextResponse } from 'next/server';
import { enrichProductImages, fetchImage } from '@/lib/unsplash';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return authErrorResponse(e);
    throw e;
  }

  try {
    const body = await req.json();
    const { products, storeName, sectionBackgrounds } = body as {
      products: { id: string; name: string; images: string[]; category?: string; description?: string }[];
      storeName: string;
      sectionBackgrounds?: { sectionId: string; query: string; currentUrl: string }[];
    };

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'Products array is required.' }, { status: 400 });
    }

    if (!storeName || typeof storeName !== 'string') {
      return NextResponse.json({ error: 'Store name is required.' }, { status: 400 });
    }

    // Build a store-like object for enrichment
    const storeLike = { products, name: storeName };

    // Run enrichment (sequential, rate-limited)
    const result = await enrichProductImages(storeLike);

    // Return updated products with new image URLs
    const updatedProducts = products.map((p) => ({
      id: p.id,
      images: p.images, // enriched in-place by enrichProductImages
    }));

    // Enrich section background images
    const enrichedSectionBackgrounds: { sectionId: string; url: string }[] = [];
    if (sectionBackgrounds && Array.isArray(sectionBackgrounds) && sectionBackgrounds.length > 0) {
      console.log(`[Enrich Images] Enriching ${sectionBackgrounds.length} section background images...`);
      for (const sb of sectionBackgrounds) {
        try {
          const enrichedUrl = await fetchImage(sb.query);
          if (enrichedUrl) {
            enrichedSectionBackgrounds.push({ sectionId: sb.sectionId, url: enrichedUrl });
          } else {
            // Keep the current URL if enrichment failed
            enrichedSectionBackgrounds.push({ sectionId: sb.sectionId, url: sb.currentUrl });
          }
        } catch {
          enrichedSectionBackgrounds.push({ sectionId: sb.sectionId, url: sb.currentUrl });
        }
      }
    }

    return NextResponse.json({
      enriched: result.enriched,
      kept: result.kept,
      failed: result.failed,
      latencyMs: result.latencyMs,
      products: updatedProducts,
      sectionBackgrounds: enrichedSectionBackgrounds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Enrich Images] Error:', msg);
    return NextResponse.json(
      { error: 'Image enrichment failed.' },
      { status: 500 }
    );
  }
}
