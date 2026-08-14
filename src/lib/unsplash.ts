// ========================================
// Unsplash API Client — Server-Side Only
// ========================================
// Provides enrichProductImages() which replaces placeholder Unsplash URLs
// with real, relevant images fetched from the Unsplash API.
// Includes in-memory caching and parallel fetching.

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const BASE_URL = 'https://api.unsplash.com';

// ─── In-Memory Cache ────────────────────────────────────────────
// Maps search query → image URL. Survives for the process lifetime.
const imageCache = new Map<string, { url: string; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UnsplashResult {
  urls: {
    small: string;
    thumb: string;
    regular: string;
  };
  alt_description: string | null;
  description: string | null;
  user: { name: string };
}

/**
 * Search Unsplash for a single image given a query string.
 * Returns the image URL or null on failure.
 */
async function fetchUnsplashImage(query: string): Promise<string | null> {
  // Check cache first
  const cached = imageCache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.url;
  }

  if (!ACCESS_KEY) {
    console.warn('[Unsplash] No UNSPLASH_ACCESS_KEY configured. Skipping image enrichment.');
    return null;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=squarish`,
      {
        headers: {
          Authorization: `Client-ID ${ACCESS_KEY}`,
          'Accept-Version': 'v1',
        },
        signal: AbortSignal.timeout(5000), // 5s per image
      }
    );

    if (!res.ok) {
      console.warn(`[Unsplash] API returned ${res.status} for query: ${query}`);
      return null;
    }

    const data = await res.json() as { results: UnsplashResult[]; total: number };

    if (data.results && data.results.length > 0) {
      const imgUrl = data.results[0].urls.small;
      // Cache the result
      imageCache.set(query, { url: imgUrl, fetchedAt: Date.now() });
      console.log(`[Unsplash] Fetched image for: "${query}"`);
      return imgUrl;
    }

    console.log(`[Unsplash] No results for query: ${query}`);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Unsplash] Fetch failed for "${query}": ${msg}`);
    return null;
  }
}

/**
 * Build a search query from a product's name, description, category, and store context.
 * Produces queries like "leather wallet product photography" or "organic tea premium".
 */
function buildSearchQuery(
  productName: string,
  category?: string,
  storeName?: string,
  description?: string
): string {
  const terms: string[] = [];

  // Product name is the primary signal
  if (productName) {
    // Take first 3 meaningful words from product name
    const nameWords = productName
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 3);
    terms.push(...nameWords);
  }

  // Category provides context (skip generic ones)
  if (category) {
    const cat = category.toLowerCase();
    if (!['featured', 'general', 'products', 'items', 'other'].includes(cat)) {
      terms.push(category);
    }
  }

  // Add "product photography" to get clean, professional-looking shots
  terms.push('product');

  // Cap at 5 terms total to keep queries focused
  const query = terms.slice(0, 5).join(' ');
  return query || 'product photography';
}

/**
 * Enrich all products in a store with real Unsplash images.
 * Runs all fetches in parallel with a per-image timeout.
 * Falls back gracefully — if a fetch fails, the existing image URL is kept.
 *
 * This is the main entry point, called after normalizeStore() in the generate route.
 */
export async function enrichProductImages(
  store: { products: { id: string; name: string; images: string[]; category?: string; description?: string }[]; name: string },
  options?: { maxConcurrency?: number; timeoutMs?: number }
): Promise<{ enriched: number; failed: number; latencyMs: number }> {
  const startTime = Date.now();
  let enriched = 0;
  let failed = 0;

  if (!store.products || store.products.length === 0) {
    return { enriched: 0, failed: 0, latencyMs: 0 };
  }

  // Build all queries upfront
  const queries = store.products.map((p) => ({
    product: p,
    query: buildSearchQuery(p.name, p.category, store.name, p.description),
  }));

  console.log(`[Unsplash] Enriching ${queries.length} product images...`);

  // Execute all fetches in parallel (Unsplash API allows 50 req/min on free tier)
  const results = await Promise.allSettled(
    queries.map(async ({ product, query }) => {
      const url = await fetchUnsplashImage(query);
      if (url) {
        // Replace the first image in the array (or add if empty)
        if (product.images.length > 0) {
          product.images[0] = url;
        } else {
          product.images.push(url);
        }
        return true; // enriched
      }
      return false; // failed
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      enriched++;
    } else {
      failed++;
    }
  }

  const latencyMs = Date.now() - startTime;
  console.log(`[Unsplash] Done: ${enriched} enriched, ${failed} failed in ${latencyMs}ms`);

  return { enriched, failed, latencyMs };
}
