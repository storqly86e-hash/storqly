// ========================================
// Image Enrichment — Server-Side Only
// ========================================
// Replaces placeholder image URLs with real, relevant photos using
// the z-ai image-search CLI (in-house service, OSS-hosted URLs, no API key needed).
// Includes in-memory caching, natural-language query building, and fallback retry.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── In-Memory Cache ────────────────────────────────────────────
// Maps search query → image URL. Survives for the process lifetime.
const imageCache = new Map<string, { url: string; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Known-good fallback image (real Unsplash photo — used when enrichment fails
// so the product card shows a real photo instead of a broken AI-hallucinated URL)
const FALLBACK_IMAGE_URL = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600';

interface ImageSearchResult {
  success: boolean;
  query: string;
  count: number;
  results: Array<{
    original_url: string;
    caption: string;
    source: string;
  }>;
  error?: string;
}

/**
 * Extract a concrete product-type noun from the store name or product context.
 * e.g. "Lumière Candles" → "candle", "Sole Stack Sneakers" → "sneaker", "TechVault" → null
 */
function extractNicheNoun(storeName: string, productCategory?: string): string | null {
  // Map of common store-type words to their product noun
  const nicheMap: Record<string, string> = {
    'candle': 'candle', 'candles': 'candle',
    'sneaker': 'sneaker', 'sneakers': 'sneaker', 'shoe': 'shoe', 'shoes': 'shoe', 'footwear': 'shoe',
    'furniture': 'furniture', 'home': 'home decor', 'decor': 'home decor',
    'skincare': 'skincare', 'skin care': 'skincare', 'beauty': 'beauty',
    'cosmetic': 'cosmetic', 'cosmetics': 'cosmetic', 'makeup': 'makeup',
    'tech': 'electronics', 'gadget': 'gadget', 'gadgets': 'gadget', 'electronics': 'electronics',
    'jewelry': 'jewelry', 'jewellery': 'jewelry', 'watch': 'watch', 'watches': 'watch',
    'clothing': 'clothing', 'apparel': 'apparel', 'fashion': 'fashion',
    'coffee': 'coffee', 'tea': 'tea', 'food': 'food', 'bakery': 'bakery',
    'plant': 'plant', 'plants': 'plant', 'garden': 'garden', 'flower': 'flower',
    'pet': 'pet supply', 'pets': 'pet supply',
    'book': 'book', 'books': 'book',
    'art': 'art', 'artwork': 'artwork',
    'wine': 'wine', 'beer': 'beer', 'drink': 'drink', 'beverage': 'beverage',
    'fitness': 'fitness equipment', 'yoga': 'yoga', 'sport': 'sports equipment',
    'music': 'music', 'instrument': 'musical instrument',
    'toy': 'toy', 'toys': 'toy', 'game': 'game',
    'bag': 'bag', 'bags': 'bag', 'handbag': 'handbag', 'backpack': 'backpack',
    'perfume': 'perfume', 'fragrance': 'fragrance', 'scent': 'fragrance',
    'essential oil': 'essential oil', 'oil': 'oil',
    'ceramic': 'ceramic', 'pottery': 'pottery',
    'leather': 'leather',
  };

  const storeLower = storeName.toLowerCase();

  // Check product category first (most specific signal)
  if (productCategory) {
    const catLower = productCategory.toLowerCase();
    for (const [key, noun] of Object.entries(nicheMap)) {
      if (catLower.includes(key)) return noun;
    }
  }

  // Then check store name
  for (const [key, noun] of Object.entries(nicheMap)) {
    if (storeLower.includes(key)) return noun;
  }

  return null;
}

/**
 * Build a natural-language search query for a product.
 * Uses descriptive sentences (not keyword soup) for better relevance.
 *
 * Examples:
 *   "Winter Spice" candle in "Lumière Candles" → "winter spice scented candle product photo"
 *   "Running Shoes" in sneaker store → "running shoes product photography"
 *   "Oak Dining Table" in furniture store → "oak dining table furniture product photo"
 */
function buildSearchQuery(
  productName: string,
  category?: string,
  storeName?: string,
  description?: string
): string {
  const niche = storeName ? extractNicheNoun(storeName, category) : null;
  const parts: string[] = [];

  // 1. Product name (lowercased for natural phrasing)
  if (productName) {
    parts.push(productName.toLowerCase());
  }

  // 2. Niche noun from store/category context (e.g., "candle", "sneaker", "furniture")
  //    This is the KEY fix — without this, "Winter Spice" returns random seasonal photos
   if (niche && !productName.toLowerCase().includes(niche)) {
    parts.push(niche);
  }

  // 3. Description can add specificity (e.g., "leather", "handmade")
  if (description && description.length > 3 && parts.length < 4) {
    const descWords = description
      .split(/[,;.]/)[0] // Take first clause only
      .split(/\s+/)
      .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'your', 'their', 'made'].includes(w.toLowerCase()))
      .slice(0, 2);
    for (const w of descWords) {
      if (!parts.join(' ').toLowerCase().includes(w.toLowerCase())) {
        parts.push(w.toLowerCase());
        if (parts.length >= 5) break;
      }
    }
  }

  // 4. Append "product photo" to bias toward clean product shots
  const query = parts.join(' ') + ' product photo';
  return query;
}

/**
 * Search for a single image via z-ai image-search CLI.
 * Returns the image URL or null on failure.
 */
async function fetchImage(query: string): Promise<string | null> {
  // Check cache first
  const cached = imageCache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[ImageEnrich] Cache hit for: "${query}"`);
    return cached.url;
  }

  try {
    const { stdout } = await execFileAsync(
      'z-ai',
      ['image-search', '--query', query, '--count', '1', '--gl', 'us', '--no-rank'],
      { timeout: 15_000, maxBuffer: 1024 * 1024 }
    );

    // CLI prints emoji status lines to stdout before the JSON payload.
    // Extract the JSON by finding the first '{' and last '}'.
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.warn(`[ImageEnrich] No JSON in output for: "${query}"`);
      return null;
    }
    const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
    const data = JSON.parse(jsonStr) as ImageSearchResult;

    if (data.success && data.results && data.results.length > 0) {
      const imgUrl = data.results[0].original_url;
      imageCache.set(query, { url: imgUrl, fetchedAt: Date.now() });
      console.log(`[ImageEnrich] Fetched image for: "${query}" (source: ${data.results[0].source})`);
      return imgUrl;
    }

    console.log(`[ImageEnrich] No results for query: "${query}"${data.error ? ' — ' + data.error : ''}`);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't log the full error for timeouts — it's just noise
    if (msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
      console.warn(`[ImageEnrich] Timeout for: "${query}"`);
    } else {
      console.warn(`[ImageEnrich] Fetch failed for "${query}": ${msg}`);
    }
    return null;
  }
}

/**
 * Try fetching with fallback queries if the primary query fails.
 * Strategy: progressively simplify the query to increase match probability.
 */
async function fetchWithFallback(
  productName: string,
  category: string | undefined,
  storeName: string | undefined,
  description: string | undefined
): Promise<string | null> {
  // Primary query: full natural language
  const primary = buildSearchQuery(productName, category, storeName, description);
  let url = await fetchImage(primary);
  if (url) return url;

  // Fallback 1: just product name + niche noun + "product photo"
  const niche = storeName ? extractNicheNoun(storeName, category) : null;
  if (niche) {
    const fb1 = `${productName.toLowerCase()} ${niche} product photo`;
    if (fb1 !== primary) {
      url = await fetchImage(fb1);
      if (url) {
        console.log(`[ImageEnrich] Fallback 1 succeeded for "${productName}" → "${fb1}"`);
        return url;
      }
    }
  }

  // Fallback 2: just the niche noun + "product photo" (e.g., "candle product photo")
  if (niche) {
    const fb2 = `${niche} product photo`;
    url = await fetchImage(fb2);
    if (url) {
      console.log(`[ImageEnrich] Fallback 2 succeeded for "${productName}" → "${fb2}"`);
      return url;
    }
  }

  // Fallback 3: category + "product" (if category is useful)
  if (category && !['featured', 'general', 'products', 'items', 'other'].includes(category.toLowerCase())) {
    const fb3 = `${category.toLowerCase()} product photo`;
    url = await fetchImage(fb3);
    if (url) {
      console.log(`[ImageEnrich] Fallback 3 succeeded for "${productName}" → "${fb3}"`);
      return url;
    }
  }

  return null;
}

/**
 * Enrich all products in a store with real images from z-ai image-search.
 * Runs all fetches in parallel with per-image timeouts.
 * Falls back gracefully — if a fetch fails, the existing image URL is kept.
 *
 * This is the main entry point, called after normalizeStore() in the generate route.
 * Interface is identical to the old Unsplash version — drop-in replacement.
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

  console.log(`[ImageEnrich] Enriching ${store.products.length} product images for store: "${store.name}"...`);

  // Execute fetches in parallel with a concurrency cap.
  // Each z-ai call spawns a separate child process via execFile, so there are
  // no SDK-level conflicts. Capped at 4 to avoid overwhelming the search service.
  const MAX_CONCURRENCY = 4;
  let idx = 0;
  const results: Array<{ product: typeof store.products[0]; url: string | null }> = [];

  async function nextBatch(): Promise<void> {
    while (idx < store.products.length) {
      const i = idx++;
      try {
        const url = await fetchWithFallback(
          store.products[i].name,
          store.products[i].category,
          store.name,
          store.products[i].description
        );
        results[i] = { product: store.products[i], url };
      } catch {
        results[i] = { product: store.products[i], url: null };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, store.products.length) }, () => nextBatch())
  );

  for (const { product, url } of results) {
    try {
      if (url) {
        if (product.images.length > 0) {
          product.images[0] = url;
        } else {
          product.images.push(url);
        }
        enriched++;
      } else {
        // Image search failed — replace the AI-hallucinated Unsplash URL
        // with a known-good fallback so the product card shows a real photo
        if (product.images.length > 0) {
          product.images[0] = FALLBACK_IMAGE_URL;
        } else {
          product.images.push(FALLBACK_IMAGE_URL);
        }
        failed++;
      }
    } catch {
      if (product.images.length > 0) {
        product.images[0] = FALLBACK_IMAGE_URL;
      } else {
        product.images.push(FALLBACK_IMAGE_URL);
      }
      failed++;
    }
  }

  const latencyMs = Date.now() - startTime;
  return { enriched, failed, latencyMs };
}
