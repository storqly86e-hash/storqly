// ========================================
// Store Generation API — SSE Streaming
// ========================================
// Returns an SSE stream with progress events and final result.
// Streaming prevents infrastructure proxy timeouts on long AI generations.
// NEVER returns a non-200 status. If AI fails after all retries,
// sends a valid starter store with _isFallback flag.

import { NextRequest } from 'next/server';
import { executeAI, extractJSON, repairJSON, aggressiveRepair, iterativeRepair } from '@/lib/ai-orchestrator';
import type { Store } from '@/lib/store-schema';

// ─── System prompts ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an e-commerce store builder. Return a SINGLE JSON object — no markdown, no explanation.

CRITICAL FORMAT RULES:
1. Return raw JSON ONLY. No markdown fences, no commentary.
2. NEVER put a literal newline, line break, or tab inside any string value. Every string must be one line.
3. NEVER use double-quote characters inside any string value. If you need quotation marks inside a string, use single quotes (') instead. For example: description should be "Handcrafted 'gold' ring" not "Handcrafted \\"gold\\" ring".
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
- 5-7 products with realistic names, prices, descriptions. Mark 2-3 as featured.
- 6-8 sections: hero + featured-products + testimonials + newsletter + cta + extras.
- Do NOT include header or footer sections.
- Theme colors must match the brand.`;

// Stricter prompt for JSON-parse retry attempts
const RETRY_SYSTEM_PROMPT_1 = SYSTEM_PROMPT + `

⚠️ YOUR PREVIOUS RESPONSE HAD INVALID JSON.
You MUST produce PERFECTLY VALID JSON this time.
- Use single quotes (') for any quoted words inside string values — NEVER double quotes inside strings.
- No newlines, no tabs, no special characters inside strings.
- Keep descriptions simple and short.`;

// Even more minimal prompt for last-resort attempt
const RETRY_SYSTEM_PROMPT_2 = `Return a valid JSON object for an e-commerce store. No markdown. No explanation. Raw JSON only.

RULE: Never put double-quote characters inside any string value. Use single quotes instead.

Schema: {"id":"uuid","name":"Store Name","slug":"store-name","description":"One line","theme":{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","background":"#hex","surface":"#hex","text":"#hex","textMuted":"#hex","border":"#hex"},"fonts":{"heading":"Font","body":"Font"},"spacing":"normal","borderRadius":"md"},"pages":[{"id":"uuid","name":"Home","slug":"","isHomepage":true,"sections":[{"id":"uuid","type":"hero","content":{"headline":"H","subheadline":"S","ctaText":"Shop Now","ctaLink":"#products","alignment":"center","height":"lg"},"style":{"backgroundColor":"","textColor":"","paddingY":"xl","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true},{"id":"uuid","type":"featured-products","content":{"headline":"Featured","subtitle":"Our best","productIds":["id1","id2"],"columns":3,"showPrice":true,"showAddToCart":true},"style":{"backgroundColor":"","textColor":"","paddingY":"xl","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true},{"id":"uuid","type":"testimonials","content":{"headline":"Reviews","items":[{"id":"uuid","quote":"Great","author":"A","role":"Buyer","rating":5}]},"style":{"backgroundColor":"#f9fafb","textColor":"","paddingY":"xl","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true},{"id":"uuid","type":"newsletter","content":{"headline":"Subscribe","subtitle":"Get offers","placeholderText":"Email","buttonText":"Subscribe"},"style":{"backgroundColor":"#6d28d9","textColor":"#ffffff","paddingY":"xl","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true},{"id":"uuid","type":"cta","content":{"headline":"Shop Now","body":"Browse our collection","ctaText":"View Products","ctaLink":"#products","style":"solid"},"style":{"backgroundColor":"","textColor":"","paddingY":"xl","paddingX":"md","maxWidth":"lg","borderRadius":"none"},"visible":true}]},{"id":"uuid","name":"About","slug":"about","isHomepage":false,"sections":[]}],"products":[{"id":"uuid","name":"Product 1","price":29.99,"compareAtPrice":null,"images":["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600"],"description":"A great product","category":"General","variants":[{"id":"uuid","name":"Size","options":[{"label":"M","value":"m"}],"inStock":true}],"featured":true,"inStock":true}],"published":false,"createdAt":"ISO","updatedAt":"ISO"}

Customize the names, descriptions, colors, and products for the requested store. Include 5-7 products and 6-8 sections. Use single quotes for any quoted words inside strings. No double quotes inside string values.`;

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

// ─── Try to parse store JSON with multi-strategy repair ───────
function tryParseStore(content: string): { store?: Store; error?: string } {
  if (content.length < 500) {
    return { error: `Response too short (${content.length} chars), likely truncated.` };
  }

  const isValid = (s: unknown): s is Store =>
    !!s && typeof s === 'object' &&
    'id' in s && 'name' in s && 'theme' in s &&
    Array.isArray((s as Store).pages) && Array.isArray((s as Store).products);

  const tryParse = (str: string): Store | null => {
    try {
      const obj = JSON.parse(str);
      return isValid(obj) ? obj : null;
    } catch { return null; }
  };

  // Strategy 1: Safe repair (newlines, trailing commas, truncation) + extract + parse
  const safeRepaired = repairJSON(content);
  let jsonStr = extractJSON(safeRepaired);
  let store = tryParse(jsonStr);
  if (store) return { store };

  // Strategy 2: Iterative position-based targeted repair on safe-repaired JSON
  const iterRepaired = iterativeRepair(jsonStr);
  store = tryParse(iterRepaired);
  if (store) {
    console.log('[Store Generate] JSON fixed via iterative repair.');
    return { store };
  }

  // Strategy 3: Aggressive repair (unescaped quotes) + extract + iterative
  const aggrRepaired = aggressiveRepair(content);
  jsonStr = extractJSON(aggrRepaired);
  store = tryParse(jsonStr);
  if (store) {
    console.log('[Store Generate] JSON fixed via aggressive repair.');
    return { store };
  }
  const iterAggr = iterativeRepair(jsonStr);
  store = tryParse(iterAggr);
  if (store) {
    console.log('[Store Generate] JSON fixed via aggressive + iterative repair.');
    return { store };
  }

  // All strategies failed — log diagnostic
  const lastErr = (() => {
    try { JSON.parse(iterAggr); return null; }
    catch (e: unknown) { return e instanceof Error ? e.message : String(e); }
  })();
  const posMatch = lastErr?.match(/position (\d+)/);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const start = Math.max(0, pos - 50);
    const end = Math.min(iterAggr.length, pos + 50);
    console.error(`[DIAG] All repairs failed. Error: ${lastErr}`);
    console.error(`[DIAG] Around pos ${pos} (len=${iterAggr.length}): ...${iterAggr.substring(start, end)}...`);
  }

  return { error: `All repair strategies failed. Last: ${lastErr}` };
}

// ─── JSON-parse retry configurations ─────────────────────────────
const PARSE_RETRY_CONFIGS = [
  { systemPrompt: SYSTEM_PROMPT, temperature: 0.7, maxRetries: 2, timeout: 90_000, label: 'attempt 1' },
  { systemPrompt: RETRY_SYSTEM_PROMPT_1, temperature: 0.3, maxRetries: 1, timeout: 60_000, label: 'attempt 2 (stricter prompt)' },
  { systemPrompt: RETRY_SYSTEM_PROMPT_2, temperature: 0.1, maxRetries: 1, timeout: 60_000, label: 'attempt 3 (minimal prompt)' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // Stream already closed (client disconnect)
        }
      };

      // Heartbeat: send keepalive every 4s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 4000);

      try {
        const body = await req.json();
        const { prompt } = body as { prompt?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          send('error', { message: 'A prompt is required.' });
          return;
        }

        const userMessage = `Generate an e-commerce store: ${prompt.trim()}`;
        let lastParseError = 'Unknown';

        // ── JSON-parse-level retry: up to 3 attempts with stricter prompts ──
        for (let i = 0; i < PARSE_RETRY_CONFIGS.length; i++) {
          const cfg = PARSE_RETRY_CONFIGS[i];

          if (i > 0) {
            console.log(`[Store Generate] JSON parse failed. Waiting 2s before ${cfg.label}...`);
            send('progress', { stage: 'retrying', attempt: i + 1, total: PARSE_RETRY_CONFIGS.length, message: `Refining generation (${i + 1}/${PARSE_RETRY_CONFIGS.length})...` });
            await sleep(2000);
          } else {
            console.log(`[Store Generate] Starting AI generation (${cfg.label})...`);
          }

          send('progress', { stage: 'generating', attempt: i + 1, total: PARSE_RETRY_CONFIGS.length, message: `AI is generating your store (${i + 1}/${PARSE_RETRY_CONFIGS.length})...` });

          // Call the AI — executeAI handles API-level retries internally
          const result = await executeAI('store-generation', [
            { role: 'user', content: userMessage },
          ], {
            systemPrompt: cfg.systemPrompt,
            temperature: cfg.temperature,
            timeout: cfg.timeout,
          });

          if (!result.success || !result.content) {
            console.warn(`[Store Generate] AI API failed on ${cfg.label}: ${result.error}`);
            lastParseError = `AI API failed: ${result.error}`;
            send('progress', { stage: 'api_error', attempt: i + 1, total: PARSE_RETRY_CONFIGS.length, message: `API error on attempt ${i + 1}, retrying...` });
            continue; // Try next parse attempt
          }

          // AI returned content — try to parse
          send('progress', { stage: 'parsing', attempt: i + 1, total: PARSE_RETRY_CONFIGS.length, message: `Parsing AI response (${i + 1}/${PARSE_RETRY_CONFIGS.length})...` });

          const parsed = tryParseStore(result.content);
          if (parsed.store) {
            console.log(`[Store Generate] ✅ AI success on ${cfg.label}. Store: ${parsed.store.name}`);
            send('result', { store: parsed.store, _isFallback: false });
            return;
          }

          console.warn(`[Store Generate] JSON unparseable on ${cfg.label}: ${parsed.error}`);
          lastParseError = parsed.error || 'Unknown parse error';
          send('progress', { stage: 'parse_error', attempt: i + 1, total: PARSE_RETRY_CONFIGS.length, message: `JSON repair failed on attempt ${i + 1}, retrying with stricter prompt...` });
        }

        // ── ALL ATTEMPTS FAILED: Return fallback ──
        console.error(`[Store Generate] ❌ All ${PARSE_RETRY_CONFIGS.length} attempts failed. Last error: ${lastParseError}`);
        send('progress', { stage: 'fallback', message: 'Creating starter template...' });
        const fallback = createFallbackStore(prompt.trim());
        send('result', {
          store: fallback,
          _isFallback: true,
          _fallbackReason: 'AI generation did not return valid data after multiple attempts.',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Store Generate] Unexpected error:', msg);
        const fallback = createFallbackStore('My Store');
        send('result', {
          store: fallback,
          _isFallback: true,
          _fallbackReason: `Unexpected error: ${msg}`,
        });
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
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
