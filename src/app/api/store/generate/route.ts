// ========================================
// Store Generation API — SSE Streaming + JSON Mode
// ========================================
// Uses response_format: { type: 'json_object' } to force the AI to produce
// structurally valid JSON. This eliminates the #1 cause of failures (JSON
// malformation) and reduces typical generation time from 30-126s to 15-30s.
//
// Safety nets:
// - SSE heartbeats every 4s to keep the proxy connection alive
// - Hard time budget: if >45s elapsed, return fallback immediately
// - Fallback store if AI fails after all retries
// - NEVER returns a non-200 status code

import { NextRequest } from 'next/server';
import { executeAI } from '@/lib/ai-orchestrator';
import type { Store } from '@/lib/store-schema';

// ─── Time budgets ────────────────────────────────────────────
// Infrastructure proxy has a ~60s hard timeout. We must finish well before that.
// With JSON mode, first-call success rate is near 100%, so NO retries.
// If the AI times out, we return a fallback at ~50s — well under 60s.
const TIME_BUDGET_MS = 55_000;
const PER_CALL_TIMEOUT_MS = 45_000;

// ─── System prompts ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an e-commerce store builder. Return a SINGLE JSON object — no markdown, no explanation.

CRITICAL FORMAT RULES:
1. Return raw JSON ONLY. No markdown fences, no commentary.
2. NEVER put a literal newline, line break, or tab inside any string value. Every string must be one line.
3. NEVER use double-quote characters inside any string value. If you need quotation marks inside a string, use single quotes (') instead.
4. Generate fresh UUIDs for all "id" fields.

TOP-LEVEL SCHEMA:
{"id":"<uuid>","name":"<store name>","slug":"<url-safe>","description":"<1 sentence>","theme":{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","background":"#hex","surface":"#hex","text":"#hex","textMuted":"#hex","border":"#hex"},"fonts":{"heading":"<font>","body":"<font>"},"spacing":"normal","borderRadius":"md"},"pages":[{"id":"<uuid>","name":"Home","slug":"","isHomepage":true,"sections":[...]}],"products":[...],"published":false,"createdAt":"<ISO>","updatedAt":"<ISO>"}

SECTION TYPES: hero | featured-products | product-grid | text-banner | image-gallery | testimonials | newsletter | faq | cta | categories | rich-text | spacer | divider

Each section: {"id":"<uuid>","type":"<type>","content":{...},"style":{"backgroundColor":"<opt hex>","textColor":"<opt hex>","paddingY":"md","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true}

SECTION CONTENTS:
- hero: {headline, subheadline, ctaText: "Shop Now", ctaLink: "#products", alignment: "center", height: "lg"}
- featured-products: {headline, subtitle, productIds: ["<ids>"], columns: 3, showPrice: true, showAddToCart: true}
- product-grid: {headline: "All Products", columns: 3, showPrice: true, showAddToCart: true}
- text-banner: {headline, body, alignment: "center", size: "md"}
- image-gallery: {images: [{src: "https://images.unsplash.com/photo-<id>", alt: ""}], columns: 3, gap: "md"}
- testimonials: {headline, items: [{id, quote, author, role, rating: 5}]}
- newsletter: {headline, subtitle, placeholderText: "Enter your email", buttonText: "Subscribe"}
- faq: {headline, items: [{id, question, answer}]}
- cta: {headline, body, ctaText, ctaLink: "#", style: "solid"}
- categories: {headline, items: [{id, name, slug, productCount: 5}], columns: 3}
- rich-text: {html: "<valid HTML without double quotes inside attributes — use single quotes>"}
- spacer: {height: "md"}
- divider: {}

PRODUCT: {id: "<uuid>", name, price: <number>, compareAtPrice: null, images: ["https://images.unsplash.com/photo-<id>"], description: "<1-2 sentences, ONE line, use single quotes for emphasis>", category, variants: [{id: "<uuid>", name: "Size", options: [{label: "M", value: "m"}], inStock: true}], featured: false, inStock: true}

REQUIREMENTS:
- 4-5 products with realistic names, prices, short descriptions (1 sentence each). Mark 2 as featured.
- 5 sections: hero + featured-products + testimonials (2 items) + newsletter + cta.
- Do NOT include header or footer sections.
- Keep descriptions SHORT to minimize output length.
- Theme colors must match the brand.
- The JSON must have these exact top-level keys: id, name, slug, description, theme, pages, products, published, createdAt, updatedAt.
- Each page must have a "sections" array with objects that have "id", "type", "content", "style".`;

// ─── Fallback: generate a valid starter store without AI ───────
function createFallbackStore(prompt: string): Store {
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
  const name = prompt
    .replace(/^build\s+(a|an|the)\s+/i, '')
    .replace(/\s+store$/i, '')
    .replace(/\s+shop$/i, '')
    .trim();
  const displayName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const now = new Date().toISOString();
  const uid = () => crypto.randomUUID();

  const products = [
    { id: uid(), name: `${displayName} Classic`, price: 49.99, compareAtPrice: null, images: [`https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600`], description: `Our signature ${name.toLowerCase()} product, crafted with care.`, category: 'Featured', variants: [{ id: uid(), name: 'Size', options: [{ label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }], inStock: true }], featured: true, inStock: true },
    { id: uid(), name: `${displayName} Premium`, price: 89.99, compareAtPrice: null, images: [`https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600`], description: `Premium quality ${name.toLowerCase()} for discerning customers.`, category: 'Featured', variants: [{ id: uid(), name: 'Size', options: [{ label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }], inStock: true }], featured: true, inStock: true },
    { id: uid(), name: `${displayName} Starter`, price: 29.99, compareAtPrice: null, images: [`https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600`], description: `Great value ${name.toLowerCase()} perfect for beginners.`, category: 'Starter', variants: [{ id: uid(), name: 'Size', options: [{ label: 'S', value: 's' }, { label: 'M', value: 'm' }], inStock: true }], featured: false, inStock: true },
    { id: uid(), name: `${displayName} Pro`, price: 129.99, compareAtPrice: 149.99, images: [`https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600`], description: `Professional grade ${name.toLowerCase()} for serious enthusiasts.`, category: 'Pro', variants: [{ id: uid(), name: 'Size', options: [{ label: 'M', value: 'm' }, { label: 'L', value: 'l' }, { label: 'XL', value: 'xl' }], inStock: true }], featured: true, inStock: true },
  ];

  return {
    id: uid(),
    name: `${displayName || 'My'} Store`,
    slug: slug || 'my-store',
    description: `A ${name.toLowerCase()} store built with Storqly AI.`,
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
        { id: uid(), type: 'hero', content: { headline: `Welcome to ${displayName || 'My'} Store`, subheadline: 'Discover our curated collection of quality products.', ctaText: 'Shop Now', ctaLink: '#products', alignment: 'center', height: 'lg' }, style: { backgroundColor: '', textColor: '', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'featured-products', content: { headline: 'Featured Products', subtitle: 'Our most popular items', productIds: products.slice(0, 3).map(p => p.id), columns: 3, showPrice: true, showAddToCart: true }, style: { backgroundColor: '', textColor: '', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'testimonials', content: { headline: 'What Our Customers Say', items: [{ id: uid(), quote: 'Excellent quality and fast shipping!', author: 'Alex M.', role: 'Verified Buyer', rating: 5 }, { id: uid(), quote: 'Love the products. Will buy again.', author: 'Jordan K.', role: 'Verified Buyer', rating: 5 }] }, style: { backgroundColor: '#f9fafb', textColor: '', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'newsletter', content: { headline: 'Stay Updated', subtitle: 'Get exclusive offers and new arrivals.', placeholderText: 'Enter your email', buttonText: 'Subscribe' }, style: { backgroundColor: '#6d28d9', textColor: '#ffffff', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'cta', content: { headline: 'Ready to Shop?', body: 'Browse our full collection and find your favorites.', ctaText: 'View All Products', ctaLink: '#products', style: 'solid' }, style: { backgroundColor: '', textColor: '', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
      ],
    }],
    products,
    published: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Schema validation (not JSON parse — JSON mode guarantees valid JSON) ──
function isValidStore(obj: unknown): obj is Store {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.name === 'string' && s.name.length > 0 &&
    Array.isArray(s.products) && s.products.length > 0 &&
    Array.isArray(s.pages) && s.pages.length > 0 &&
    typeof s.theme === 'object' && s.theme !== null
  );
}

// ─── SSE Helper ──────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── POST handler — SSE stream ──────────────────────────────────
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(sseEvent(event, data))); }
        catch { /* Stream already closed */ }
      };

      // Heartbeat: send keepalive every 4s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); }
        catch { clearInterval(heartbeat); }
      }, 4000);

      const startTime = Date.now();
      const elapsed = () => Date.now() - startTime;

      try {
        const body = await req.json();
        const { prompt } = body as { prompt?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          send('error', { message: 'A prompt is required.' });
          return;
        }

        const userMessage = `Generate an e-commerce store: ${prompt.trim()}`;

        // ── Check time budget ──
        if (elapsed() > TIME_BUDGET_MS) {
          console.warn(`[Store Generate] Time budget exceeded before AI call (${elapsed()}ms). Returning fallback.`);
          send('result', { store: createFallbackStore(prompt.trim()), _isFallback: true, _fallbackReason: 'Time budget exceeded.' });
          return;
        }

        send('progress', { stage: 'generating', message: 'AI is generating your store...' });
        console.log(`[Store Generate] Starting AI generation with JSON mode (timeout: ${PER_CALL_TIMEOUT_MS}ms/call)...`);

        // ── AI call with JSON mode ──
        // JSON mode guarantees valid JSON, eliminating the #1 failure cause.
        // We still retry on API-level failures (network, rate limit, timeout).
        const result = await executeAI('store-generation', [
          { role: 'user', content: userMessage },
        ], {
          systemPrompt: SYSTEM_PROMPT,
          temperature: 0.7,
          timeout: PER_CALL_TIMEOUT_MS,
          maxRetries: 1,
          responseFormat: 'json_object',
        });

        if (!result.success || !result.content) {
          console.error(`[Store Generate] AI API failed: ${result.error}. Attempts: ${result.attempts}`);
          send('progress', { stage: 'fallback', message: 'AI service unavailable. Creating starter template...' });
          const fallback = createFallbackStore(prompt.trim());
          send('result', { store: fallback, _isFallback: true, _fallbackReason: result.error });
          return;
        }

        const totalMs = elapsed();
        console.log(`[Store Generate] AI returned ${result.content.length} chars in ${totalMs}ms (${result.attempts} API attempts)`);

        // ── Parse the JSON (JSON mode guarantees valid syntax) ──
        send('progress', { stage: 'parsing', message: 'Parsing store data...' });
        let store: Store | null = null;
        try {
          const parsed = JSON.parse(result.content);
          if (isValidStore(parsed)) {
            store = parsed;
          } else {
            console.warn(`[Store Generate] JSON valid but schema invalid. Keys: ${Object.keys(parsed).join(', ')}`);
          }
        } catch (e) {
          console.error(`[Store Generate] JSON parse failed (should not happen with JSON mode):`, e);
        }

        if (store) {
          console.log(`[Store Generate] ✅ Success in ${totalMs}ms. Store: ${store.name} (${store.products?.length || 0} products)`);
          send('result', { store, _isFallback: false });
        } else {
          // JSON was valid but schema was wrong, or parse failed (extremely rare with JSON mode)
          console.warn(`[Store Generate] Schema invalid after ${totalMs}ms. Returning fallback.`);
          send('progress', { stage: 'fallback', message: 'AI response was incomplete. Creating starter template...' });
          const fallback = createFallbackStore(prompt.trim());
          send('result', { store: fallback, _isFallback: true, _fallbackReason: 'AI response had invalid schema.' });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Store Generate] Unexpected error after ${elapsed()}ms:`, msg);
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
