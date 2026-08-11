// ========================================
// Store Generation API — SSE Streaming + Schema Normalization
// ========================================
// Pipeline: AI (json_object mode) → JSON.parse() → normalizeStore() → valid Store
//
// json_object mode guarantees valid JSON syntax (no more 502 from malformed JSON).
// normalizeStore() guarantees valid Store schema (deterministic type coercion, no guessing).
// createFallbackStore() is the absolute last resort (AI returned non-object or null).
//
// Safety nets:
// - SSE heartbeats every 4s to keep the proxy connection alive
// - Hard time budget: if >50s elapsed, return fallback immediately
// - NEVER returns a non-200 status code

import { NextRequest } from 'next/server';
import { executeAI } from '@/lib/ai-orchestrator';
import { normalizeStore } from '@/lib/normalize-store';
import type { Store } from '@/lib/store-schema';

// ─── Time budgets ────────────────────────────────────────────
// Infrastructure proxy has a ~60s hard timeout. We must finish well before that.
// AI typically completes in 20-42s. 50s timeout gives margin for occasional slower calls.
const TIME_BUDGET_MS = 55_000;
const PER_CALL_TIMEOUT_MS = 50_000;

// ─── System prompt ─────────────────────────────────────────────
// Kept minimal — the normalization layer handles schema mismatches.
// We only need to guide the AI to output reasonable content, not perfect JSON.
const SYSTEM_PROMPT = `You are an e-commerce store builder. Return a SINGLE JSON object — no markdown, no explanation.

CRITICAL FORMAT RULES:
1. Return raw JSON ONLY. No markdown fences, no commentary.
2. NEVER put literal newlines inside any string value. Every string must be one line.
3. NEVER use double-quote characters inside any string value. Use single quotes (') instead.
4. Generate fresh UUIDs for all "id" fields.

TOP-LEVEL SCHEMA:
{"id":"<uuid>","name":"<store name>","slug":"<url-safe>","description":"<1 sentence>","theme":{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","background":"#hex","surface":"#hex","text":"#hex","textMuted":"#hex","border":"#hex"},"fonts":{"heading":"<font>","body":"<font>"},"spacing":"normal","borderRadius":"md"},"pages":[{"id":"<uuid>","name":"Home","slug":"","isHomepage":true,"sections":[...]}],"products":[...],"published":false,"createdAt":"<ISO>","updatedAt":"<ISO>"}

SECTION TYPES: hero | featured-products | product-grid | text-banner | image-gallery | testimonials | newsletter | faq | cta | categories | rich-text | spacer | divider

Each section: {"id":"<uuid>","type":"<type>","content":{...},"style":{"paddingY":"md","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true}

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
- rich-text: {html: "<valid HTML without double quotes inside attributes>"}
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
  const storeName = extractStoreName(prompt);
  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40) || 'my-store';
  const now = new Date().toISOString();
  const uid = () => crypto.randomUUID();

  const products = [
    { id: uid(), name: 'Classic Edition', price: 49.99, compareAtPrice: null, images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'], description: 'Our signature product, crafted with care.', category: 'Featured', variants: [{ id: uid(), name: 'Size', options: [{ label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }], inStock: true }], featured: true, inStock: true },
    { id: uid(), name: 'Premium Selection', price: 89.99, compareAtPrice: null, images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'], description: 'Premium quality for discerning customers.', category: 'Featured', variants: [{ id: uid(), name: 'Size', options: [{ label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }], inStock: true }], featured: true, inStock: true },
    { id: uid(), name: 'Starter Kit', price: 29.99, compareAtPrice: null, images: ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600'], description: 'Great value, perfect for getting started.', category: 'Starter', variants: [{ id: uid(), name: 'Size', options: [{ label: 'S', value: 's' }, { label: 'M', value: 'm' }], inStock: true }], featured: false, inStock: true },
    { id: uid(), name: 'Pro Collection', price: 129.99, compareAtPrice: 149.99, images: ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600'], description: 'Professional grade for serious enthusiasts.', category: 'Pro', variants: [{ id: uid(), name: 'Size', options: [{ label: 'M', value: 'm' }, { label: 'L', value: 'l' }, { label: 'XL', value: 'xl' }], inStock: true }], featured: true, inStock: true },
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
        { id: uid(), type: 'hero', content: { headline: `Welcome to ${storeName}`, subheadline: 'Discover our curated collection of quality products.', ctaText: 'Shop Now', ctaLink: '#products', alignment: 'center', height: 'lg' }, style: { paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'featured-products', content: { headline: 'Featured Products', subtitle: 'Our most popular items', productIds: products.slice(0, 3).map(p => p.id), columns: 3, showPrice: true, showAddToCart: true }, style: { paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'testimonials', content: { headline: 'What Our Customers Say', items: [{ id: uid(), quote: 'Excellent quality and fast shipping!', author: 'Alex M.', role: 'Verified Buyer', rating: 5 }, { id: uid(), quote: 'Love the products. Will buy again.', author: 'Jordan K.', role: 'Verified Buyer', rating: 5 }] }, style: { backgroundColor: '#f9fafb', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'newsletter', content: { headline: 'Stay Updated', subtitle: 'Get exclusive offers and new arrivals.', placeholderText: 'Enter your email', buttonText: 'Subscribe' }, style: { backgroundColor: '#6d28d9', textColor: '#ffffff', paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
        { id: uid(), type: 'cta', content: { headline: 'Ready to Shop?', body: 'Browse our full collection and find your favorites.', ctaText: 'View All Products', ctaLink: '#products', style: 'solid' }, style: { paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' }, visible: true },
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
  let text = prompt.trim();
  const calledMatch = text.match(/(?:called|named|known\s+as)\s+([\w&'\-]+(?:\s+[\w&'\-]+){0,2})/i);
  if (calledMatch?.[1]) {
    let name = calledMatch[1].replace(/\s+(selling|with|that|for|using|featuring|and|include|products?)\s*$/i, '').trim();
    if (name.length >= 2 && name.length <= 40) return name;
  }
  const quotedMatch = text.match(/["']([^"']{2,40})["']/);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const afterType = text.match(/\b(store|shop|boutique|brand)\s+([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,2})/);
  if (afterType?.[2]) {
    const name = afterType[2].replace(/\s+(selling|with|that|for|using|featuring|and)\s*$/i, '').trim();
    if (name.length >= 2 && name.length <= 40) return name;
  }
  text = text
    .replace(/^(build|create|make|design|set\s+up)\s+(a|an|the|my)\s+/i, '')
    .replace(/\b(online|e-commerce|ecommerce)\s+(store|shop|boutique)\b/gi, '')
    .replace(/\b(store|shop|boutique|website|site|brand)\b/gi, '')
    .replace(/\b(selling|with|that|for|using|featuring|and)\b.*/i, '')
    .trim();
  const words = text.split(/\s+/).filter(w => w.length >= 2);
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

        const trimmedPrompt = prompt.trim();
        const userMessage = `Generate an e-commerce store: ${trimmedPrompt}`;

        // ── Check time budget ──
        if (elapsed() > TIME_BUDGET_MS) {
          console.warn(`[Store Generate] Time budget exceeded before AI call (${elapsed()}ms). Returning fallback.`);
          send('result', { store: createFallbackStore(trimmedPrompt), _isFallback: true, _fallbackReason: 'Time budget exceeded.' });
          return;
        }

        send('progress', { stage: 'generating', message: 'AI is generating your store...' });
        console.log(`[Store Generate] Starting AI generation with JSON mode (timeout: ${PER_CALL_TIMEOUT_MS}ms/call)...`);

        // ── AI call with JSON mode ──
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
          const fallback = createFallbackStore(trimmedPrompt);
          send('result', { store: fallback, _isFallback: true, _fallbackReason: result.error });
          return;
        }

        const totalMs = elapsed();
        console.log(`[Store Generate] AI returned ${result.content.length} chars in ${totalMs}ms (${result.attempts} API attempts)`);

        // ── Parse JSON (json_object mode guarantees valid syntax) ──
        send('progress', { stage: 'parsing', message: 'Processing store data...' });
        let parsed: unknown;
        try {
          parsed = JSON.parse(result.content);
        } catch (e) {
          console.error(`[Store Generate] JSON parse failed (should not happen with JSON mode):`, e);
          const fallback = createFallbackStore(trimmedPrompt);
          send('result', { store: fallback, _isFallback: true, _fallbackReason: 'JSON parse failed.' });
          return;
        }

        // ── Normalize to Store schema (deterministic, never throws) ──
        const normResult = normalizeStore(parsed, trimmedPrompt);

        if (!normResult) {
          // normalizeStore returns null only if input is not an object at all
          console.warn(`[Store Generate] normalizeStore returned null (input was not an object). Returning fallback.`);
          send('progress', { stage: 'fallback', message: 'AI response was not valid. Creating starter template...' });
          const fallback = createFallbackStore(trimmedPrompt);
          send('result', { store: fallback, _isFallback: true, _fallbackReason: 'AI response was not a JSON object.' });
          return;
        }

        // ── Log normalization details ──
        if (normResult.normalizationCount > 0) {
          console.log(`[Store Generate] Normalization applied (${normResult.summary}):`);
          for (const line of normResult.log) {
            console.log(`  ${line}`);
          }
        } else {
          console.log(`[Store Generate] Normalization: 0 fixes needed — clean output.`);
        }

        const store = normResult.store;
        const sectionCount = store.pages.reduce((sum, p) => sum + p.sections.length, 0);
        console.log(`[Store Generate] ✅ Success in ${totalMs}ms. Store: "${store.name}" (${store.products.length} products, ${sectionCount} sections, ${normResult.normalizationCount} normalizations)`);

        send('result', {
          store,
          _isFallback: false,
          _normalizations: normResult.normalizationCount,
        });
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
