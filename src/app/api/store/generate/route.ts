// ========================================
// Store Generation API
// ========================================
// NEVER returns 502 to the user. If AI fails after all retries,
// returns a valid starter store that the user can customize.

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON, repairJSON } from '@/lib/ai-orchestrator';
import type { Store } from '@/lib/store-schema';

// ─── System prompt ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an e-commerce store builder. Return a SINGLE JSON object — no markdown, no explanation.

CRITICAL FORMAT RULES:
1. Return raw JSON ONLY. No markdown fences, no commentary.
2. NEVER put a literal newline, line break, or tab inside any string value. Every string must be one line.
3. Generate fresh UUIDs for all "id" fields.

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
- rich-text: {html: "<valid HTML>"}
- spacer: {height: "md"}
- divider: {}

PRODUCT: {id: "<uuid>", name, price: <number>, compareAtPrice: null, images: ["https://images.unsplash.com/photo-<id>"], description: "<1-2 sentences, ONE line>", category, variants: [{id: "<uuid>", name: "Size", options: [{label: "M", value: "m"}], inStock: true}], featured: false, inStock: true}

REQUIREMENTS:
- 5-7 products with realistic names, prices, descriptions. Mark 2-3 as featured.
- 6-8 sections: hero + featured-products + testimonials + newsletter + cta + extras.
- Do NOT include header or footer sections.
- Theme colors must match the brand.`;

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
        primary: '#6d28d9',
        secondary: '#ec4899',
        accent: '#f59e0b',
        background: '#ffffff',
        surface: '#f9fafb',
        text: '#111827',
        textMuted: '#6b7280',
        border: '#e5e7eb',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      spacing: 'normal',
      borderRadius: 'md',
    },
    pages: [{
      id: uid(),
      name: 'Home',
      slug: '',
      isHomepage: true,
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

// ─── Try to parse store JSON ────────────────────────────────────
function tryParseStore(content: string): { store?: Store; error?: string } {
  // Skip obviously broken responses (< 500 chars = truncated)
  if (content.length < 500) {
    return { error: `Response too short (${content.length} chars), likely truncated.` };
  }

  let jsonStr = extractJSON(content);

  // Attempt 1: direct parse
  try {
    const store = JSON.parse(jsonStr) as Store;
    if (store?.id && store?.name && store?.theme && Array.isArray(store.pages) && Array.isArray(store.products)) {
      return { store };
    }
    return { error: 'Incomplete schema.' };
  } catch { /* continue */ }

  // Attempt 2: repair + parse
  try {
    const repaired = repairJSON(jsonStr);
    const store = JSON.parse(repaired) as Store;
    if (store?.id && store?.name && store?.theme && Array.isArray(store.pages) && Array.isArray(store.products)) {
      console.log('[Store Generate] JSON repaired successfully.');
      return { store };
    }
    return { error: 'Repaired JSON incomplete.' };
  } catch (repairErr: unknown) {
    const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
    return { error: `Invalid JSON: ${msg}` };
  }
}

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 });
    }

    const userMessage = `Generate an e-commerce store: ${prompt.trim()}`;

    // ── Try AI generation (up to 3 attempts with backoff) ──
    console.log('[Store Generate] Starting AI generation...');
    const result = await executeAI('store-generation', [
      { role: 'user', content: userMessage },
    ], { systemPrompt: SYSTEM_PROMPT });

    if (result.success && result.content) {
      const parsed = tryParseStore(result.content);
      if (parsed.store) {
        console.log(`[Store Generate] AI success on attempt ${result.attempts}. Store: ${parsed.store.name}`);
        return NextResponse.json({ store: parsed.store });
      }
      console.warn(`[Store Generate] AI returned unparseable JSON on attempt ${result.attempts}: ${parsed.error}`);
    } else {
      console.warn(`[Store Generate] AI failed after ${result.attempts} attempts: ${result.error}`);
    }

    // ── FALLBACK: Return a valid starter store ──
    // The user will NEVER see an error. They get a starter store they can customize.
    console.log('[Store Generate] Using fallback store generation.');
    const fallback = createFallbackStore(prompt.trim());
    return NextResponse.json({
      store: fallback,
      _note: 'AI generation failed — showing starter template. Use the editor to customize.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Generate] Unexpected error:', msg);
    // Even on unexpected errors, return a fallback
    const fallback = createFallbackStore('My Store');
    return NextResponse.json({ store: fallback });
  }
}
