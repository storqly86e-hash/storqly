// ========================================
// Store Generation API
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON, repairJSON } from '@/lib/ai-orchestrator';
import type { Store } from '@/lib/store-schema';

// ─── System prompt ──────────────────────────────────────────────
// Prose style (proven to work) but trimmed for speed.
// The #1 rule is embedded up front to prevent newlines-in-strings.
const SYSTEM_PROMPT = `You are Storqly AI, an expert e-commerce store designer.

## ABSOLUTE RULES (IF YOU VIOLATE THESE, THE OUTPUT BREAKS):
1. Return ONE raw JSON object. No markdown fences. No explanation. No commentary.
2. NEVER put a literal newline, line break, or tab character inside any string value. Every string must be a single line. Use spaces instead of newlines.
3. Generate fresh UUIDs for all "id" fields.

## Output Schema

Return a JSON object with this exact structure:

{
  "id": "<uuid>",
  "name": "<store name>",
  "slug": "<url-safe slug>",
  "description": "<1 sentence>",
  "theme": {
    "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex", "textMuted": "#hex", "border": "#hex" },
    "fonts": { "heading": "Inter", "body": "Inter" },
    "spacing": "normal",
    "borderRadius": "md"
  },
  "pages": [{ "id": "<uuid>", "name": "Home", "slug": "", "isHomepage": true, "sections": [...] }],
  "products": [...],
  "published": false,
  "createdAt": "<ISO 8601>",
  "updatedAt": "<ISO 8601>"
}

## Sections

Each section: { "id": "<uuid>", "type": "<type>", "content": { ... }, "style": { "backgroundColor": "<opt hex>", "textColor": "<opt hex>", "paddingY": "md", "paddingX": "md", "maxWidth": "lg", "borderRadius": "none" }, "visible": true }

Types & contents:
- hero: { headline, subheadline, ctaText: "Shop Now", ctaLink: "#products", alignment: "center", height: "lg" }
- featured-products: { headline, subtitle, productIds: ["<ids from products>"], columns: 3, showPrice: true, showAddToCart: true }
- product-grid: { headline: "All Products", columns: 3, showPrice: true, showAddToCart: true }
- text-banner: { headline, body, alignment: "center", size: "md" }
- image-gallery: { images: [{ src: "https://images.unsplash.com/photo-<id>", alt: "" }], columns: 3, gap: "md" }
- testimonials: { headline, items: [{ id, quote, author, role, rating: 5 }] }
- newsletter: { headline, subtitle, placeholderText: "Enter your email", buttonText: "Subscribe" }
- faq: { headline, items: [{ id, question, answer }] }
- cta: { headline, body, ctaText, ctaLink: "#", style: "solid" }
- categories: { headline, items: [{ id, name, slug, productCount: 5 }], columns: 3 }
- rich-text: { html: "<valid HTML>" }
- spacer: { height: "md" }
- divider: {}

## Products

Each: { id: "<uuid>", name, price: <number>, compareAtPrice: null, images: ["https://images.unsplash.com/photo-<id>"], description: "<1-2 sentences, ONE line>", category, variants: [{ id: "<uuid>", name: "Size", options: [{ label: "M", value: "m" }], inStock: true }], featured: false, inStock: true }

## Requirements
- 5-7 products with realistic names, prices, descriptions. Mark 2-3 as featured.
- 6-8 sections on the homepage: hero + featured-products + testimonials + newsletter + cta + extras.
- Do NOT include header or footer sections (auto-generated).
- Theme colors must match the brand.`;

// ─── Minimal retry prompt (fast, asks for less) ─────────────────
const RETRY_SYSTEM_PROMPT = `You generate e-commerce store JSON. Return raw JSON only. No markdown. Every string value on ONE line — zero newlines inside quotes.

Schema: { id, name, slug, description, theme: { colors: { primary, secondary, accent, background, surface, text, textMuted, border }, fonts: { heading, body }, spacing: "normal", borderRadius: "md" }, pages: [{ id, name: "Home", slug: "", isHomepage: true, sections: [{ id, type, content, style, visible }] }], products: [{ id, name, price, compareAtPrice, images, description, category, variants, featured, inStock }], published: false, createdAt, updatedAt }

Create 4-5 products and 5-6 sections (hero, featured-products, testimonials, newsletter, cta). Keep descriptions short. Use UUIDs for ids.`;

// ─── Helper: try to parse store JSON with repair ───────────────
function tryParseStore(content: string): { store?: Store; error?: string } {
  let jsonStr = extractJSON(content);

  // Attempt 1: direct parse
  try {
    const store = JSON.parse(jsonStr) as Store;
    if (store.id && store.name && store.theme && Array.isArray(store.pages) && Array.isArray(store.products)) {
      return { store };
    }
    return { error: 'Incomplete schema.' };
  } catch { /* continue */ }

  // Attempt 2: repair + parse
  try {
    const repaired = repairJSON(jsonStr);
    console.log('[Store Generate] Attempting JSON repair...');
    const store = JSON.parse(repaired) as Store;
    if (store.id && store.name && store.theme && Array.isArray(store.pages) && Array.isArray(store.products)) {
      console.log('[Store Generate] JSON repaired successfully.');
      return { store };
    }
    return { error: 'Repaired JSON incomplete.' };
  } catch (repairErr: unknown) {
    const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
    console.error('[Store Generate] JSON parse failed after repair:', msg);
    console.error('[Store Generate] JSON preview (first 300 chars):', jsonStr.substring(0, 300));
    return { error: `Invalid JSON: ${msg}` };
  }
}

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'A non-empty "prompt" field is required.' },
        { status: 400 }
      );
    }

    const userMessage = `Generate an e-commerce store: ${prompt.trim()}`;

    // ── Attempt 1: Normal generation ──
    console.log('[Store Generate] Attempt 1: generating...');
    const result1 = await executeAI('store-generation', [
      { role: 'user', content: userMessage },
    ], { systemPrompt: SYSTEM_PROMPT });

    if (result1.success && result1.content) {
      // Detect obvious truncation — a valid store is always >2000 chars
      if (result1.content.length < 1000) {
        console.warn(`[Store Generate] Attempt 1 response suspiciously short (${result1.content.length} chars), likely truncated. Skipping parse, going straight to retry.`);
      } else {
        const parsed = tryParseStore(result1.content);
        if (parsed.store) {
          console.log(`[Store Generate] OK on attempt 1 (${result1.attempts} AI calls). Store: ${parsed.store.name}`);
          return NextResponse.json({ store: parsed.store });
        }
        console.warn('[Store Generate] Attempt 1 invalid JSON:', parsed.error);
      }
    } else {
      console.warn('[Store Generate] Attempt 1 AI failed:', result1.error);
    }

    // ── Attempt 2: Faster retry with shorter prompt ──
    console.log('[Store Generate] Attempt 2: retrying with shorter prompt...');
    const result2 = await executeAI('store-generation', [
      { role: 'user', content: userMessage },
    ], { systemPrompt: RETRY_SYSTEM_PROMPT, temperature: 0.3, timeout: 60_000 });

    if (result2.success && result2.content) {
      if (result2.content.length < 1000) {
        console.error(`[Store Generate] Attempt 2 also truncated (${result2.content.length} chars).`);
      } else {
        const parsed = tryParseStore(result2.content);
        if (parsed.store) {
          console.log(`[Store Generate] OK on attempt 2. Store: ${parsed.store.name}`);
          return NextResponse.json({ store: parsed.store });
        }
        console.error('[Store Generate] Attempt 2 also invalid:', parsed.error);
      }
      return NextResponse.json(
        { error: 'AI returned invalid data after 2 attempts. Try again.' },
        { status: 502 }
      );
    }

    console.error('[Store Generate] Both attempts failed.', result2.error);
    return NextResponse.json(
      { error: result2.error || 'Generation failed after 2 attempts.' },
      { status: 502 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Generate] Unexpected:', msg);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
