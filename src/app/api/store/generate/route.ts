// ========================================
// Store Generation API — SSE Streaming + 2-Phase Chunked Product Generation
// ========================================
// Phase 1: AI generates store structure (theme, pages, sections) + first batch of products (up to 8)
// Phase 2 (if requested > 8): Additional product-only batches of 6, with independent normalization & image enrichment
//
// Safety nets:
// - SSE heartbeats every 4s to keep the proxy connection alive
// - Hard time budget: 300s total (5 min) for the entire generation
// - Per-batch time budget check — abort remaining batches if < 20s remaining
// - Auth guard: returns 401 JSON before creating the SSE stream (defense-in-depth)

import { NextRequest } from 'next/server';
import { executeAI } from '@/lib/ai-orchestrator';
import { normalizeStore, normalizeProducts } from '@/lib/normalize-store';
import { sanitizePrompt, extractProductCount } from '@/lib/sanitize-prompt';
import type { Store, StoreProduct } from '@/lib/store-schema';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

// ─── Timestamped logging helper (for debugging timing issues) ─
const ts = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
const log = (msg: string) => console.log(`[${ts()}] ${msg}`);
const warn = (msg: string) => console.warn(`[${ts()}] ${msg}`);
const logErr = (msg: string, ...args: unknown[]) => console.error(`[${ts()}] ${msg}`, ...args);

// ─── Batch size constants ──────────────────────────────────────
const PHASE1_BATCH_SIZE = 8;
const PHASE2_BATCH_SIZE = 6;

// ─── Soft cap: quality degrades past ~30 products (dupes, image failures) ─
const MAX_PRACTICAL_PRODUCTS = 30;

// ─── Time budgets ────────────────────────────────────────────
const TOTAL_TIME_BUDGET_MS = 300_000; // 5 min total
const MIN_REMAINING_MS = 20_000;      // Abort remaining batches if < 20s left

// ─── Phase 1 System Prompt (full store + first batch of products) ─────
function buildPhase1SystemPrompt(productCount: number): string {
  return `You are an e-commerce store builder. Return a SINGLE JSON object — no markdown, no explanation.

FORMAT RULES:
1. Raw JSON ONLY. No markdown fences.
2. NEVER put newlines or double-quotes inside any string. Use single quotes for emphasis.
3. Fresh UUIDs for all "id" fields.
4. KEEP OUTPUT MINIMAL — short strings, no unnecessary fields.

SCHEMA (compact):
{"id":"<uuid>","name":"<store name>","slug":"<url-safe>","description":"<1 sentence>","announcementText":"<short promo like Free shipping on orders over $50 or New drops every Friday>","theme":{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","background":"#hex","surface":"#hex","text":"#hex","textMuted":"#hex","border":"#hex"},"fonts":{"heading":"<font>","body":"<font>"},"spacing":"normal","borderRadius":"md"},"pages":[{"id":"<uuid>","name":"Home","slug":"","isHomepage":true,"sections":[...]}],"products":[...],"published":false,"createdAt":"<ISO>","updatedAt":"<ISO>"}

SECTION: {"id":"<uuid>","type":"<type>","content":{...},"style":{"paddingY":"md","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true}
HERO STYLE: For the hero section ONLY, add "backgroundImage":"https://images.unsplash.com/photo-<lifestyle-id>?w=1400","overlay":true to style. Use a real Unsplash photo ID that matches the store theme (lifestyle/setting photo, NOT a product photo).

SECTION CONTENTS (use ONLY these 4):
- hero: {headline, subheadline, ctaText: "Shop Now", ctaLink: "#products", alignment: "center", height: "lg", badge: "<short uppercase label like NEW COLLECTION or HANDCRAFTED or SEASONAL DROP>", secondaryCtaText: "<optional secondary button like Learn More or View Lookbook>", layout: "<one of: split-left, split-right, product-first, text-first, minimal>", visualPriority: "<product or headline or balanced>", backgroundTreatment: "<soft or editorial or dramatic>", vignette: true, heroImages: [{src:"https://images.unsplash.com/photo-<id>?w=1400",alt:"<description>"},{src:"https://images.unsplash.com/photo-<id>?w=1400",alt:"<description>"},{src:"https://images.unsplash.com/photo-<id>?w=1400",alt:"<description>"}], carouselEnabled: true, carouselInterval: 5}

HERO LAYOUT RULES (choose the BEST layout for the store type):
- split-left: DEFAULT for most stores. Text left 50%, product image right 50%.
- split-right: Product image left 50%, text right 50%. Good for right-to-left brands.
- product-first: Product 60% dominant + text 40%. Use for: cosmetics, electronics, shoes, accessories, jewelry, watches, sneakers, packaged products — anything with a visually strong product.
- text-first: Text 60% dominant + product 40%. Use for: fashion campaigns, seasonal collections, brand launches, announcements.
- minimal: No product image. Premium centered layout with generous whitespace. Use for: luxury brands, high-end fashion, minimalist aesthetics, spa/wellness, fine art.

HERO visualPriority RULES:
- "product" when layout is product-first
- "headline" when layout is text-first or minimal
- "balanced" when layout is split-left or split-right

HERO backgroundTreatment RULES:
- "soft": slightly darkened background, gentle contrast. DEFAULT for most stores.
- "editorial": subtle blur effect, magazine-quality feel. Use for: fashion, beauty, lifestyle brands.
- "dramatic": strong contrast, deep shadows, moody atmosphere. Use for: luxury, nightlife, premium alcohol,高端 brands.

HERO RULES:
- The hero section must include style.backgroundImage (a lifestyle/setting photo URL from Unsplash) and style.overlay:true.
- Always set vignette:true in the hero content.
- Choose layout based on what will look most professional for this specific store type.
- Do NOT use "centered" layout — use "minimal" instead for text-only hero banners.
- featured-products: {headline, subtitle, productIds: ["<ids>"], columns: 3, showPrice: true, showAddToCart: true}
- testimonials: {headline, items: [{id, quote, author, role, rating: 5}]}
- newsletter: {headline, subtitle, placeholderText: "Enter your email", buttonText: "Subscribe"}

PRODUCT (NO variants field — omit it entirely):
{id: "<uuid>", name: "<short name>", price: <number>, compareAtPrice: null, images: ["https://images.unsplash.com/photo-<id>?w=600"], description: "<max 8 words, one line>", category: "<category>", featured: false, inStock: true}

GENERATION RULES:
- Generate EXACTLY ${productCount} products total. Mark 1 as featured. Descriptions max 8 words.
- MAX 4 sections per page, ONLY these types in this order: hero, featured-products, testimonials (1 item only), newsletter.
- NO header, footer, cta, faq, gallery, categories, or any other section types.
- NO variants field on products.
- Theme colors must match the brand.
- The hero section must include style.backgroundImage (a lifestyle/setting photo URL from Unsplash) and style.overlay:true.
- Include a relevant announcementText (short promo, shipping offer, or tagline).`;
}

// ─── Phase 2 System Prompt (products only) ────────────────────────
function buildPhase2SystemPrompt(
  count: number,
  storeName: string,
  storeDescription: string,
  existingProductNames: string[],
): string {
  return `You are a product catalog generator. Return a JSON ARRAY of product objects — no markdown, no explanation, no wrapping object.

FORMAT RULES:
1. Raw JSON array ONLY. No markdown fences. No object wrapper.
2. NEVER put newlines or double-quotes inside any string.
3. Fresh UUIDs for all "id" fields.
4. KEEP OUTPUT MINIMAL — short strings, no unnecessary fields.

Each product must be:
{id: "<uuid>", name: "<short name>", price: <number>, compareAtPrice: null, images: ["https://images.unsplash.com/photo-<id>?w=600"], description: "<max 8 words, one line>", category: "<category>", featured: false, inStock: true}

RULES:
- Generate EXACTLY ${count} products for the ${storeName} store (${storeDescription}).
- Each product must be UNIQUE — do NOT duplicate any of these existing products: ${existingProductNames.join(', ')}.
- NO variants field.
- Prices should vary realistically for the product category.`;
}

// ─── Fallback: generate a valid starter store without AI ───────
function createFallbackStore(prompt: string): Store {
  const storeName = extractStoreName(prompt);
  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40) || 'my-store';
  const now = new Date().toISOString();
  const uid = () => crypto.randomUUID();

  const products = [
    { id: uid(), name: 'Classic Edition', price: 49.99, compareAtPrice: null, images: ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600'], description: 'Our signature product.', category: 'Featured', featured: true, inStock: true },
    { id: uid(), name: 'Premium Selection', price: 89.99, compareAtPrice: null, images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'], description: 'Premium quality for you.', category: 'Premium', featured: false, inStock: true },
    { id: uid(), name: 'Starter Kit', price: 29.99, compareAtPrice: null, images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'], description: 'Great value starter.', category: 'Starter', featured: false, inStock: true },
  ];

  return {
    id: uid(),
    name: storeName,
    slug,
    description: 'A store built with Storqly AI.',
    theme: {
      colors: {
        primary: '#6d28d9', secondary: '#ec4899', accent: '#f59e0b',
        background: '#ffffff', surface: '#f9fafb', text: '#111827',
        textMuted: '#6b7280', border: '#e5e7eb',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      spacing: 'normal', borderRadius: 'md',
    },
    pages: [{
      id: uid(), name: 'Home', slug: '', isHomepage: true,
      sections: [
        { id: uid(), type: 'hero', content: { headline: `Welcome to ${storeName}`, subheadline: 'Discover our curated collection of quality products.', ctaText: 'Shop Now', ctaLink: '#products', alignment: 'left', height: 'lg', layout: 'split-left', backgroundTreatment: 'soft', vignette: true, visualPriority: 'balanced' }, style: { paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'featured-products', content: { headline: 'Featured Products', subtitle: 'Our most popular items', productIds: products.map(p => p.id), columns: 3, showPrice: true, showAddToCart: true }, style: { paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'testimonials', content: { headline: 'What Customers Say', items: [{ id: uid(), quote: 'Excellent quality and fast shipping!', author: 'Alex M.', role: 'Verified Buyer', rating: 5 }] }, style: { backgroundColor: '#f9fafb', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'newsletter', content: { headline: 'Stay Updated', subtitle: 'Get exclusive offers and new arrivals.', placeholderText: 'Enter your email', buttonText: 'Subscribe' }, style: { backgroundColor: '#6d28d9', textColor: '#ffffff', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
      ],
    }],
    products,
    published: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Extract a short, clean store name from the user prompt. */
function extractStoreName(prompt: string): string {
  const text = prompt.trim();

  // Pattern 1: Quoted name — highest priority, most reliable
  const quotedMatch = text.match(/["']([^"']{2,40})["']/);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  // Pattern 2: "called X" or "named X" — capture just the first word (the actual name)
  const calledMatch = text.match(/(?:called|named|known\s+as)\s+([A-Za-z][\w&'\-]*)/i);
  if (calledMatch?.[1] && calledMatch[1].length >= 2) return calledMatch[1].trim();

  // Pattern 3: "brand X" or "store X" — capture title-case words after type keyword
  const afterType = text.match(/\b(store|shop|boutique|brand)\s+([A-Z][\w&'\-]*(?:\s+[A-Z][\w&'\-]*){0,2})/);
  if (afterType?.[2]) {
    const name = afterType[2].replace(/\s+(selling|with|that|for|using|featuring|and)\s*$/i, '').trim();
    if (name.length >= 2 && name.length <= 40) return name;
  }

  // Pattern 4: Find longest title-case run (e.g., "StrideFit" in "a footwear brand StrideFit selling...")
  const stripped = text
    .replace(/^(build|create|make|design|set\s+up)\s+(a|an|the|my)\s+/i, '')
    .replace(/\b(online|e-commerce|ecommerce)\s+(store|shop|boutique)\b/gi, '')
    .replace(/\b(store|shop|boutique|website|site|brand)\b/gi, '')
    .replace(/\b(selling|with|that|for|using|featuring|and)\b.*/i, '')
    .trim();
  const words = stripped.split(/\s+/).filter(w => w.length >= 2);
  const isTitle = (w: string) => w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase();
  let bestRun: string[] = [];
  let currentRun: string[] = [];
  for (const w of words) {
    if (isTitle(w)) {
      currentRun.push(w.replace(/[^a-zA-Z0-9&'-]/g, ''));
    } else {
      if (currentRun.length > bestRun.length) bestRun = currentRun;
      currentRun = [];
    }
  }
  if (currentRun.length > bestRun.length) bestRun = currentRun;
  if (bestRun.length >= 1) {
    const candidate = bestRun.slice(0, 3).join(' ');
    if (candidate.length >= 2 && candidate.length <= 40) return candidate;
  }

  return 'My Store';
}

// ─── POST handler — SSE stream ──────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth guard — checked BEFORE creating the SSE stream.
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return authErrorResponse(e);
    throw e;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* Stream already closed */ }
      };

      // Heartbeat: send keepalive every 4s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); }
        catch { clearInterval(heartbeat); }
      }, 4000);

      const startTime = Date.now();
      const elapsed = () => Date.now() - startTime;
      const remaining = () => TOTAL_TIME_BUDGET_MS - elapsed();

      try {
        const body = await req.json();
        const { prompt } = body as { prompt?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          send('error', { message: 'A prompt is required.' });
          return;
        }

        const trimmedPrompt = prompt.trim();
        const sanitizedPrompt = sanitizePrompt(trimmedPrompt);
        let requestedCount = extractProductCount(trimmedPrompt);

        // Soft cap: if user requested more than 30, cap at 30 and notify
        const wasCapped = requestedCount > MAX_PRACTICAL_PRODUCTS;
        if (wasCapped) {
          console.log(`[Store Generate] Soft cap: user requested ${requestedCount}, capped to ${MAX_PRACTICAL_PRODUCTS}`);
          requestedCount = MAX_PRACTICAL_PRODUCTS;
        }

        // Determine phase 1 product count (capped at PHASE1_BATCH_SIZE)
        const phase1Count = Math.min(requestedCount, PHASE1_BATCH_SIZE);
        const needsPhase2 = requestedCount > PHASE1_BATCH_SIZE;
        const phase2BatchCount = needsPhase2
          ? Math.ceil((requestedCount - PHASE1_BATCH_SIZE) / PHASE2_BATCH_SIZE)
          : 0;

        log(`[Store Generate] Requested: ${requestedCount} products. Phase 1: ${phase1Count}. Phase 2 batches: ${phase2BatchCount}.`);

        if (sanitizedPrompt.length < trimmedPrompt.length) {
          log(`[Store Generate] Prompt sanitized: ${trimmedPrompt.length} → ${sanitizedPrompt.length} chars (long lists collapsed)`);
        }

        // ── Check time budget ──
        if (elapsed() > TOTAL_TIME_BUDGET_MS) {
          warn(`[Store Generate] Time budget exceeded before AI call (${elapsed()}ms). Returning fallback.`);
          send('result', { store: createFallbackStore(trimmedPrompt), _isFallback: true, _fallbackReason: 'Time budget exceeded.' });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // PHASE 1: Store Structure + First Batch of Products
        // ═══════════════════════════════════════════════════════════
        send('progress', { stage: 'generating', message: 'Generating your store...' });
        log(`[Store Generate] Phase 1: Generating store with ${phase1Count} products...`);

        const userMessage = `Generate an e-commerce store: ${sanitizedPrompt}`;

        const phase1Result = await executeAI('store-generation', [
          { role: 'user', content: userMessage },
        ], {
          systemPrompt: buildPhase1SystemPrompt(phase1Count),
          temperature: 0.6,
          timeout: 40_000,
          maxRetries: 3,
          responseFormat: 'json_object',
        });

        if (!phase1Result.success || !phase1Result.content) {
          logErr(`[Store Generate] Phase 1 AI failed: ${phase1Result.error}. Attempts: ${phase1Result.attempts}`);
          send('progress', { stage: 'fallback', message: 'AI service unavailable. Creating starter template...' });
          const fallback = createFallbackStore(trimmedPrompt);
          send('result', { store: fallback, _isFallback: true, _fallbackReason: phase1Result.error });
          return;
        }

        log(`[Store Generate] Phase 1 AI returned ${phase1Result.content.length} chars in ${elapsed()}ms (${phase1Result.attempts} API attempts)`);

        // ── Parse JSON (json_object mode guarantees valid syntax) ──
        send('progress', { stage: 'parsing', message: 'Processing store data...' });
        let parsed: unknown;
        try {
          parsed = JSON.parse(phase1Result.content);
        } catch (e) {
          logErr(`[Store Generate] Phase 1 JSON parse failed:`, e);
          const fallback = createFallbackStore(trimmedPrompt);
          send('result', { store: fallback, _isFallback: true, _fallbackReason: 'JSON parse failed.' });
          return;
        }

        // ── Normalize to Store schema ──
        // For Phase 1, pass maxProducts = phase1Count so the normalizer caps at our intended count.
        // (If AI returned more, the normalizer truncates. If fewer, padProducts fills to min 1.)
        const normResult = normalizeStore(parsed, trimmedPrompt, phase1Count);

        if (!normResult) {
          warn(`[Store Generate] normalizeStore returned null. Returning fallback.`);
          send('progress', { stage: 'fallback', message: 'AI response was not valid. Creating starter template...' });
          const fallback = createFallbackStore(trimmedPrompt);
          send('result', { store: fallback, _isFallback: true, _fallbackReason: 'AI response was not a JSON object.' });
          return;
        }

        // Log normalization
        if (normResult.normalizationCount > 0) {
          log(`[Store Generate] Normalization applied (${normResult.summary}):`);
          for (const line of normResult.log) {
            log(`  ${line}`);
          }
        } else {
          log(`[Store Generate] Normalization: 0 fixes needed — clean output.`);
        }

        const store = normResult.store;

        // ── Image enrichment is now LAZY (not blocking generation) ──
        // The client triggers background enrichment via /api/store/enrich-images
        // after the store is loaded in the editor. This reduces generation from
        // 9+ API calls to exactly 1, preventing rate-limit exhaustion.

        log(`[Store Generate] Phase 1 complete: ${store.products.length} products in ${elapsed()}ms (no image enrichment — lazy)`);

        // ═══════════════════════════════════════════════════════════
        // PHASE 2: Additional Product Batches (if requested > PHASE1_BATCH_SIZE)
        // ═══════════════════════════════════════════════════════════
        if (needsPhase2) {
          const productsStillNeeded = requestedCount - store.products.length;

          if (productsStillNeeded > 0 && remaining() > MIN_REMAINING_MS) {
            log(`[Store Generate] Phase 2: Need ${productsStillNeeded} more products (${phase2BatchCount} batches). ${Math.round(remaining() / 1000)}s remaining.`);

            const existingNames = store.products.map(p => p.name);
            const storeDescription = store.description || 'e-commerce store';
            let batchNum = 0;

            for (let offset = store.products.length; offset < requestedCount; offset += PHASE2_BATCH_SIZE) {
              batchNum++;
              const thisBatchSize = Math.min(PHASE2_BATCH_SIZE, requestedCount - offset);
              const batchRange = `${offset + 1}-${offset + thisBatchSize}`;

              // Time budget check before each batch
              if (remaining() < MIN_REMAINING_MS) {
                warn(`[Store Generate] Phase 2: Only ${Math.round(remaining() / 1000)}s remaining — skipping remaining batches. Have ${store.products.length} products total.`);
                break;
              }

              send('progress', { stage: 'generating', message: `Generating products ${batchRange}...` });
              log(`[Store Generate] Phase 2 batch ${batchNum}: Generating ${thisBatchSize} products (range ${batchRange})...`);

              try {
                const batchResult = await executeAI('product-batch', [
                  { role: 'user', content: `Generate ${thisBatchSize} products.` },
                ], {
                  systemPrompt: buildPhase2SystemPrompt(
                    thisBatchSize,
                    store.name,
                    storeDescription,
                    existingNames,
                  ),
                  responseFormat: 'json_object',
                  maxRetries: 1,
                  timeout: 30_000,
                });

                if (!batchResult.success || !batchResult.content) {
                  warn(`[Store Generate] Phase 2 batch ${batchNum} failed: ${batchResult.error}. Keeping ${store.products.length} products.`);
                  break; // Graceful degradation — keep all previous products
                }

                // Parse the batch response — should be a JSON array
                let batchParsed: unknown;
                try {
                  batchParsed = JSON.parse(batchResult.content);
                } catch (e) {
                  warn(`[Store Generate] Phase 2 batch ${batchNum} JSON parse failed. Keeping ${store.products.length} products.`);
                  break;
                }

                // Handle case where AI wraps array in an object
                let batchProducts: unknown[];
                if (Array.isArray(batchParsed)) {
                  batchProducts = batchParsed;
                } else if (batchParsed && typeof batchParsed === 'object' && !Array.isArray(batchParsed)) {
                  const obj = batchParsed as Record<string, unknown>;
                  // Try common wrapper keys
                  batchProducts = Array.isArray(obj.products) ? obj.products
                    : Array.isArray(obj.items) ? obj.items
                    : Array.isArray(obj.data) ? obj.data
                    : [];
                } else {
                  batchProducts = [];
                }

                // Normalize batch products
                const normalizedBatch: StoreProduct[] = normalizeProducts(batchProducts);

                if (normalizedBatch.length === 0) {
                  warn(`[Store Generate] Phase 2 batch ${batchNum} produced 0 valid products. Keeping ${store.products.length} products.`);
                  break;
                }

                // Phase 2 image enrichment is lazy (same as Phase 1)

                // Accumulate products into store
                for (const p of normalizedBatch) {
                  existingNames.push(p.name);
                  store.products.push(p);
                }

                log(`[Store Generate] Phase 2 batch ${batchNum} complete: +${normalizedBatch.length} products. Total: ${store.products.length}. ${Math.round(remaining() / 1000)}s remaining.`);

              } catch (batchErr) {
                const batchMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
                warn(`[Store Generate] Phase 2 batch ${batchNum} error: ${batchMsg}. Keeping ${store.products.length} products.`);
                break; // Graceful degradation
              }
            }
          } else {
            log(`[Store Generate] Phase 2 skipped: ${productsStillNeeded > 0 ? 'not enough time remaining' : 'already have enough products'}.`);
          }
        }

        // ── Fix product references in featured-products sections to include all products ──
        // (Phase 2 products were added after normalization ran, so we need to update references)
        const allProductIds = store.products.map(p => p.id);
        for (const page of store.pages) {
          for (const section of page.sections) {
            if (section.type === 'featured-products' && Array.isArray(section.content.productIds)) {
              // Keep existing valid IDs, then fill with any missing product IDs
              const validIds = (section.content.productIds as string[]).filter(id => allProductIds.includes(id));
              const usedIds = new Set(validIds);
              for (const pid of allProductIds) {
                if (!usedIds.has(pid)) {
                  validIds.push(pid);
                  usedIds.add(pid);
                }
              }
              section.content.productIds = validIds;
            }
          }
        }

        // ── Final result ──
        const sectionCount = store.pages.reduce((sum, p) => sum + p.sections.length, 0);
        log(`[Store Generate] ✅ Success in ${elapsed()}ms. Store: "${store.name}" (${store.products.length} products, ${sectionCount} sections, ${normResult.normalizationCount} normalizations)`);

        send('result', {
          store,
          _isFallback: false,
          _normalizations: normResult.normalizationCount,
          _productCapHit: wasCapped,
          _requestedCount: wasCapped ? extractProductCount(trimmedPrompt) : undefined,
          _generatedCount: store.products.length,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logErr(`[Store Generate] Unexpected error after ${elapsed()}ms:`, msg);
        const fallback = createFallbackStore('My Store');
        send('result', { store: fallback, _isFallback: true, _fallbackReason: `Unexpected error: ${msg}` });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
