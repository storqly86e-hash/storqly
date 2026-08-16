// ========================================
// Image Enrichment — Server-Side Only
// ========================================
// Replaces placeholder image URLs with real, relevant photos using
// the z-ai image-search CLI (in-house service, OSS-hosted URLs, no API key needed).
// Includes in-memory caching, natural-language query building, and fallback retry.
//
// RATE LIMIT AWARENESS (v2):
// - All image fetches run SEQUENTIALLY with 2s delays between requests.
// - This prevents 429 rate-limit exhaustion during store generation.
// - On failure, the AI-generated placeholder URL is KEPT (not replaced with
//   a generic fallback image), because the AI URL is at least category-relevant.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── In-Memory Cache ────────────────────────────────────────────
// Maps search query → image URL. Survives for the process lifetime.
const imageCache = new Map<string, { url: string; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Rate Limit Guard ───────────────────────────────────────────
// Ensures minimum spacing between image search API calls.
let lastImageSearchTime = 0;
const MIN_SEARCH_INTERVAL_MS = 2_000; // 2 seconds between requests

async function rateLimitedSleep(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastImageSearchTime;
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    const waitMs = MIN_SEARCH_INTERVAL_MS - elapsed;
    console.log(`[ImageEnrich] Rate-limit guard: waiting ${waitMs}ms before next search`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  lastImageSearchTime = Date.now();
}

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
    'textile': 'textile', 'textiles': 'textile', 'fabric': 'fabric', 'linen': 'linen',
    'cotton': 'cotton textile', 'wool': 'wool textile', 'bamboo': 'bamboo product', 'jute': 'jute product', 'hemp': 'hemp product', 'alpaca': 'alpaca wool product',
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
    'sustainable': 'sustainable product', 'eco': 'eco-friendly product', 'organic': 'organic product',
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

  // 2. Niche noun from store/category context
   if (niche && !productName.toLowerCase().includes(niche)) {
    parts.push(niche);
  }

  // 3. Description can add specificity
  if (description && description.length > 3 && parts.length < 4) {
    const descWords = description
      .split(/[,;.]/)[0]
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
 * Includes rate-limit guard (minimum 2s between calls).
 */
async function fetchImage(query: string): Promise<string | null> {
  // Check cache first
  const cached = imageCache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[ImageEnrich] Cache hit for: "${query}"`);
    return cached.url;
  }

  // Rate limit guard — wait before making the API call
  await rateLimitedSleep();

  try {
    const { stdout } = await execFileAsync(
      'z-ai',
      ['image-search', '--query', query, '--count', '1', '--gl', 'us', '--no-rank'],
      { timeout: 15_000, maxBuffer: 1024 * 1024 }
    );

    // CLI prints emoji status lines to stdout before the JSON payload.
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
    if (msg.includes('429') || msg.includes('Too many requests') || msg.includes('rate limit')) {
      console.warn(`[ImageEnrich] Rate limited on: "${query}" — backing off`);
      // Increase backoff after a 429
      lastImageSearchTime = Date.now() + 3_000; // Extra 3s penalty
    } else if (msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
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
 * Check if an image URL looks valid (not empty, not a broken Unsplash link).
 * AI-generated Unsplash URLs like photo-XXXXX?w=600 are acceptable placeholders.
 */
function isUsableImageUrl(url: string): boolean {
  if (!url || url.trim().length === 0) return false;
  // Accept Unsplash URLs (both real and AI-hallucinated)
  if (url.includes('unsplash.com') || url.includes('images.unsplash.com')) return true;
  // Accept any https URL that looks plausible
  if (url.startsWith('https://') && url.length > 20) return true;
  return false;
}

/**
 * Enrich all products in a store with real images from z-ai image-search.
 * Runs fetches SEQUENTIALLY with rate-limit guards to avoid 429 errors.
 * Falls back gracefully — if a fetch fails, the existing image URL is KEPT
 * (which is usually an AI-generated Unsplash URL that's at least category-relevant).
 *
 * v2: Sequential execution with 2s minimum spacing between API calls.
 *     No generic fallback image replacement — keeps AI URLs on failure.
 */
export async function enrichProductImages(
  store: { products: { id: string; name: string; images: string[]; category?: string; description?: string }[]; name: string },
  options?: { maxConcurrency?: number; timeoutMs?: number }
): Promise<{ enriched: number; failed: number; kept: number; latencyMs: number }> {
  const startTime = Date.now();
  let enriched = 0;
  let failed = 0;
  let kept = 0;

  if (!store.products || store.products.length === 0) {
    return { enriched: 0, failed: 0, kept: 0, latencyMs: 0 };
  }

  console.log(`[ImageEnrich] Enriching ${store.products.length} product images for store: "${store.name}" (sequential mode)...`);

  // Process products ONE AT A TIME with rate-limit spacing
  for (let i = 0; i < store.products.length; i++) {
    const product = store.products[i];
    try {
      const url = await fetchWithFallback(
        product.name,
        product.category,
        store.name,
        product.description
      );

      if (url) {
        if (product.images.length > 0) {
          product.images[0] = url;
        } else {
          product.images.push(url);
        }
        enriched++;
      } else {
        // Search failed — KEEP the existing AI-generated URL.
        // This is better than replacing with a generic unrelated image.
        if (product.images.length > 0 && isUsableImageUrl(product.images[0])) {
          kept++;
          console.log(`[ImageEnrich] Search failed for "${product.name}" — kept existing AI URL`);
        } else {
          // No usable image at all — add a neutral placeholder
          product.images[0] = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600';
          failed++;
          console.log(`[ImageEnrich] No usable image for "${product.name}" — added neutral placeholder`);
        }
      }
    } catch {
      if (product.images.length > 0 && isUsableImageUrl(product.images[0])) {
        kept++;
      } else {
        product.images[0] = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600';
        failed++;
      }
    }
  }

  const latencyMs = Date.now() - startTime;
  console.log(`[ImageEnrich] Complete: ${enriched} enriched, ${kept} kept existing, ${failed} replaced in ${latencyMs}ms`);
  return { enriched, failed, kept, latencyMs };
}
