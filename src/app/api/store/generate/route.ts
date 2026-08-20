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
import { getProviders } from '@/lib/ai-providers';
import { normalizeStore, normalizeProducts } from '@/lib/normalize-store';
import { sanitizePrompt, extractProductCount } from '@/lib/sanitize-prompt';
import type { Store, StoreProduct } from '@/lib/store-schema';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';
import { ensureLibraryRegistered } from '@/lib/design-library/ensure-registered';
import { composeStore } from '@/lib/design-library/composition';
import type { CompositionResult } from '@/lib/design-library/design-intent';
import { buildLibraryPromptContext, buildHeroLibraryBlock, buildImageArtDirectionPrompt } from '@/lib/design-library/prompt-context';
import { getVariantMapping } from '@/lib/design-library/variant-mapping';
import { validateAndFixComponentMeta } from '@/lib/design-library/componentmeta-validator';
import type { ComponentMeta } from '@/lib/store-schema';

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
// CRITICAL: heroImages MUST use REAL Unsplash URLs from the curated set below.
// The LLM cannot generate valid Unsplash photo IDs. Providing real URLs is essential.
// Each category has 3+ URLs — the LLM picks the best ones for the store theme.

const REAL_UNSPLASH_HERO_URLS = {
  'skincare/beauty/spa': [
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1400',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400',
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1400',
    'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=1400',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1400',
    'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1400',
  ],
  'fashion/clothing/apparel': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1400',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1400',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1400',
    'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=1400',
  ],
  'jewelry/watches/accessories': [
    'https://images.unsplash.com/photo-1515562141589-67f0d569b6c3?w=1400',
    'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1400',
    'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=1400',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1400',
  ],
  'food/coffee/bakery': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1400',
    'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=1400',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1400',
    'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=1400',
  ],
  'furniture/home/decor': [
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1400',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1400',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1400',
  ],
  'electronics/tech/gadgets': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1400',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1400',
  ],
  'fitness/sports/outdoor': [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1400',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1400',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1400',
  ],
  'general/lifestyle': [
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400',
    'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=1400',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1400',
  ],
};

const REAL_UNSPLASH_PRODUCT_URLS = {
  'skincare/beauty': [
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600',
    'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=600',
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600',
    'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
    'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=600',
  ],
  'fashion/clothing': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600',
    'https://images.unsplash.com/photo-1434389677669-e08b4cda3a01?w=600',
  ],
  'jewelry/accessories': [
    'https://images.unsplash.com/photo-1515562141589-67f0d569b6c3?w=600',
    'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=600',
    'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=600',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600',
  ],
  'food/coffee': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
    'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=600',
    'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600',
  ],
  'furniture/home': [
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600',
  ],
  'electronics/tech': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600',
  ],
  'fitness/sports': [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600',
  ],
  'general': [
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
  ],
};

function pickCategory(keys: string[]): string {
  const lower = keys.join(' ').toLowerCase();
  for (const [cat, ] of Object.entries(REAL_UNSPLASH_HERO_URLS)) {
    const catParts = cat.split('/');
    if (catParts.some(p => lower.includes(p))) return cat;
  }
  return 'general/lifestyle';
}

function formatUrlsForPrompt(urls: string[]): string {
  return urls.map((u, i) => `  URL ${i+1}: ${u}`).join('\n');
}

function buildPhase1SystemPrompt(productCount: number, userPrompt: string): string {
  // Detect store category from user prompt for curated URLs
  const promptWords = userPrompt.toLowerCase();
  const category = pickCategory([promptWords]);
  const heroUrls = REAL_UNSPLASH_HERO_URLS[category] || REAL_UNSPLASH_HERO_URLS['general/lifestyle'];
  const productUrls = REAL_UNSPLASH_PRODUCT_URLS[category] || REAL_UNSPLASH_PRODUCT_URLS['general'];

  return `You are an e-commerce store builder. Your job is to faithfully translate the user's design specification into a structured store.

CRITICAL PRINCIPLE — USER INTENT IS LAW:
- The user prompt is the DESIGN SPECIFICATION. Every explicit requirement MUST appear in the output.
- AI fills in unspecified details intelligently. AI does NOT replace explicit requirements with generic defaults.
- If the user says "premium editorial hero with 3 campaign images", the hero MUST have 3 heroImages with editorial backgroundTreatment.
- If the user says "only hero and products, no testimonials", do NOT add testimonials or newsletter.
- If the user specifies a layout (split-left, minimal, etc.), use THAT layout, not a default.

FORMAT RULES:
1. Raw JSON ONLY. No markdown fences.
2. NEVER put newlines or double-quotes inside any string. Use single quotes for emphasis.
3. Fresh UUIDs for all "id" fields.
4. KEEP OUTPUT MINIMAL — short strings, no unnecessary fields.

SCHEMA (compact):
{"id":"<uuid>","name":"<store name>","slug":"<url-safe>","description":"<1 sentence>","announcementText":"<short promo like Free shipping on orders over $50 or New drops every Friday>","theme":{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","background":"#hex","surface":"#hex","text":"#hex","textMuted":"#hex","border":"#hex"},"fonts":{"heading":"<font>","body":"<font>"},"spacing":"normal","borderRadius":"md"},"pages":[{"id":"<uuid>","name":"Home","slug":"","isHomepage":true,"sections":[...]}],"products":[...],"published":false,"createdAt":"<ISO>","updatedAt":"<ISO>"}

SECTION: {"id":"<uuid>","type":"<type>","content":{...},"style":{"paddingY":"lg","paddingX":"md","maxWidth":"xl","borderRadius":"none"},"visible":true,"componentMeta":{"componentId":"<family.variant>","family":"<family>","variant":"<variant>","role":"<role>"}}
Every section MUST have a componentMeta field. Use the EXACT componentId values from the Page Composition section below. Do NOT invent componentId values.

═══ IMAGE URLS — USE THESE EXACT URLS ═══
You MUST use these real, working image URLs. Do NOT invent or guess photo IDs.
Pick the 3 most relevant URLs from the appropriate category for heroImages.
For products, pick 1 URL per product from the product list, cycling through them.

HERO BACKGROUND IMAGES (pick 3 for heroImages, use 1st also as style.backgroundImage):
${formatUrlsForPrompt(heroUrls)}

PRODUCT IMAGES (cycle through these for each product):
${formatUrlsForPrompt(productUrls)}

═══ HERO SECTION — CRITICAL ═══
The hero is the PRIMARY visual statement of the store. It MUST be visually impactful.

HERO CONTENT FIELDS:
headline, subheadline, ctaText, ctaLink, alignment (left/center/right), height (sm/md/lg/xl), badge (short uppercase label), secondaryCtaText (optional)

HERO LAYOUT — choose based on user prompt, NOT a default:
- minimal: Full-bleed background image + text overlay. NO separate product image column. Best for: premium brands, editorial campaigns, luxury, skincare, cosmetics, fashion campaigns. Use this when user says "editorial", "premium", "campaign", "lifestyle", or when heroImages are campaign-style.
- split-left: Text left 50% + product image right 50%. Use when user explicitly wants a split or product showcase.
- split-right: Product image left 50% + text right 50%. Mirror of split-left.
- product-first: Product image 60% dominant + text 40%. Use when user emphasizes the product.
- text-first: Text 60% dominant + product image 40%. Use when user emphasizes the message.
- DO NOT use "centered" — use "minimal" for centered text-over-image.

HERO IMAGE SYSTEM:
- heroImages: Array of exactly 3 objects. Each has "src" (URL from the list above), "alt" (descriptive), and "role" (one of: "product-hero", "editorial-lifestyle", "product-detail", "campaign", "brand-atmosphere").
- Assign distinct, meaningful roles to each image based on user's requirements.
- carouselEnabled: true (always)
- carouselInterval: 5 (always, unless user specifies differently)
- style.backgroundImage: use the 1st hero image URL
- style.overlay: true
- backgroundTreatment: "editorial" for premium/fashion/skincare, "dramatic" for bold campaigns, "soft" for gentle brands, "none" only if user says no treatment
- vignette: true
- height: "xl" for editorial/premium, "lg" for standard, "md" only if user says compact
- visualPriority: "headline" for minimal layout, "balanced" for split layouts, "product" for product-first

HERO RULES — NON-NEGOTIABLE:
1. heroImages MUST have exactly 3 objects with REAL URLs from the list above.
2. Each heroImage MUST have a "role" field describing its semantic purpose.
3. Do NOT set heroImage (singular foreground product image) when using minimal layout — the background images ARE the visuals.
4. carouselEnabled MUST be true, carouselInterval MUST be 5.

═══ SECTIONS — FOLLOW USER INTENT ═══
- ONLY create sections the user explicitly requested, plus a hero (always first) and featured-products.
- Do NOT automatically add testimonials, newsletter, or FAQ unless the user's prompt implies they are appropriate.
- Section order must match the user's described flow.
- Each section's style.maxWidth should be "xl" (not "lg") for a professional, expansive feel.

AVAILABLE SECTION TYPES:
- hero: {headline, subheadline, ctaText, ctaLink, alignment, height, badge, secondaryCtaText, layout, visualPriority, backgroundTreatment, vignette, heroImages, carouselEnabled, carouselInterval}
- featured-products: {headline, subtitle, productIds, columns, showPrice, showAddToCart}
- product-grid: {headline, columns, showPrice, showAddToCart}
- text-banner: {headline, body, alignment, size}
- cta: {headline, body, ctaText, ctaLink, style}
- testimonials: {headline, items: [{id, quote, author, role, rating}]}
- newsletter: {headline, subtitle, placeholderText, buttonText}
- image-gallery: {images, columns, gap}
- categories: {headline, items: [{id, name, image, slug}], columns}
- faq: {headline, items: [{id, question, answer}]}
- brand-statement: {headline, body, backgroundImage, alignment}

PRODUCT (NO variants field):
{id: "<uuid>", name: "<short name>", price: <number>, compareAtPrice: null, images: ["<one of the REAL product URLs above>"], description: "<max 8 words>", category: "<category>", featured: false, inStock: true}

GENERATION RULES:
- Generate EXACTLY ${productCount} products. Mark 1 as featured. Descriptions max 8 words.
- Use REAL image URLs from the lists above. Do NOT make up photo IDs.
- Theme colors MUST match the brand aesthetic described in the prompt.
- If the user specifies exact colors, use those exactly.
- If the user specifies a visual style (minimal, luxury, editorial, etc.), match it.
- Include a relevant announcementText.
- Do NOT add header, footer, spacer, or divider sections.
- NO variants field on products.

USER PROMPT (this is the design specification — follow it precisely):
${userPrompt}`;
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
    { id: uid(), name: 'Classic Edition', price: 49.99, compareAtPrice: undefined, images: ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600'], description: 'Our signature product.', category: 'Featured', featured: true, inStock: true },
    { id: uid(), name: 'Premium Selection', price: 89.99, compareAtPrice: undefined, images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'], description: 'Premium quality for you.', category: 'Premium', featured: false, inStock: true },
    { id: uid(), name: 'Starter Kit', price: 29.99, compareAtPrice: undefined, images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'], description: 'Great value starter.', category: 'Starter', featured: false, inStock: true },
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

  // ── Read request body BEFORE creating the ReadableStream ──
  // Reading req.json() inside ReadableStream.start() is unsafe: start() runs
  // asynchronously after the Response is returned, and the request body may
  // already be consumed or invalidated by the runtime in some environments.
  let prompt: string | undefined;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let sendFailed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          if (!sendFailed) {
            sendFailed = true;
            logErr(`[Store Generate] send('${event}') failed — stream likely closed. Error: ${e instanceof Error ? e.message : e}`);
          }
        }
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
          warn(`[Store Generate] Time budget exceeded before AI call (${elapsed()}ms).`);
          send('error', { message: 'Generation timed out before AI could respond. Please try again.' });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // PHASE 1: Store Structure + First Batch of Products
        // ═══════════════════════════════════════════════════════════
        // Log provider chain for diagnostics (visible in Render logs)
        const providerChain = getProviders();
        log(`[Store Generate] Provider chain: ${providerChain.map(p => p.name).join(' → ')} (${providerChain.length} providers, NODE_ENV=${process.env.NODE_ENV || 'not set'})`);

        send('progress', { stage: 'generating', message: 'Generating your store...' });
        log(`[Store Generate] Phase 1: Generating store with ${phase1Count} products...`);

        // ── Library-aware composition ────────────────────────────────
        let libraryCtx: CompositionResult | null = null;
        let libraryPromptSection = '';
        try {
          ensureLibraryRegistered();
          libraryCtx = await composeStore(sanitizedPrompt);
          if (libraryCtx) {
            log(`[Store Generate] Library composition: ${libraryCtx.recipeName} (${libraryCtx.nodes.length} sections)`);
            libraryPromptSection = buildLibraryPromptContext(libraryCtx);
          }
        } catch (e) {
          warn(`[Store Generate] Library composition failed (non-fatal): ${e}. Using legacy generation.`);
        }

        const userMessage = `Generate an e-commerce store: ${sanitizedPrompt}`;

        const systemPrompt = libraryCtx
          ? buildPhase1SystemPrompt(phase1Count, sanitizedPrompt) + '\n\n' + libraryPromptSection
          : buildPhase1SystemPrompt(phase1Count, sanitizedPrompt);
        log(`[Store Generate] System prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 4)} tokens). Library context: ${libraryPromptSection.length > 0 ? libraryPromptSection.length + ' chars' : 'none'}`);

        const phase1Result = await executeAI('store-generation', [
          { role: 'user', content: userMessage },
        ], {
          systemPrompt,
          temperature: 0.6,
          timeout: 40_000,
          maxRetries: 3,
          responseFormat: 'json_object',
        });

        if (!phase1Result.success || !phase1Result.content) {
          logErr(`[Store Generate] Phase 1 AI failed: ${phase1Result.error}. Attempts: ${phase1Result.attempts}`);
          send('error', { message: `AI generation failed after ${phase1Result.attempts} attempts. ${phase1Result.error || 'Please try again.'}` });
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
          send('error', { message: 'AI returned invalid data. Please try again.' });
          return;
        }

        // ── Normalize to Store schema ──
        // For Phase 1, pass maxProducts = phase1Count so the normalizer caps at our intended count.
        // (If AI returned more, the normalizer truncates. If fewer, padProducts fills to min 1.)
        const normResult = normalizeStore(parsed, trimmedPrompt, phase1Count);

        if (!normResult) {
          warn(`[Store Generate] normalizeStore returned null.`);
          send('error', { message: 'AI response could not be processed into a valid store. Please try again.' });
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

        let store = normResult.store;

        // ── GAP 1: Validate and fix componentMeta ─────────────────────
        if (libraryCtx) {
          const { store: validatedStore, result: vr } = validateAndFixComponentMeta(store, libraryCtx);
          store = validatedStore;
          if (vr.fixedMeta > 0 || vr.errors.length > 0) {
            log(`[Store Generate] componentMeta validation: ${vr.validMeta} valid, ${vr.fixedMeta} fixed, ${vr.attachedMissingMeta} attached, ${vr.errors.length} errors`);
            for (const e of vr.errors) log(`  [componentMeta] ${e}`);
          } else {
            log(`[Store Generate] componentMeta: ${vr.validMeta} valid, ${vr.attachedMissingMeta} attached from composition`);
          }
        }

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
          _normalizations: normResult.normalizationCount,
          _productCapHit: wasCapped,
          _requestedCount: wasCapped ? extractProductCount(trimmedPrompt) : undefined,
          _generatedCount: store.products.length,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logErr(`[Store Generate] Unexpected error after ${elapsed()}ms:`, msg);
        send('error', { message: `An unexpected error occurred: ${msg.substring(0, 120)}. Please try again.` });
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
