// ========================================
// Store Generation API
// ========================================
// POST /api/store/generate
// Takes a { prompt: string } body, uses the AI orchestrator to generate
// a complete store schema, and returns the Store object as JSON.

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON } from '@/lib/ai-orchestrator';
import type { Store } from '@/lib/store-schema';

// ─── System prompt for store generation ──────────────────────────
const STORE_GENERATION_SYSTEM_PROMPT = `You are Storqly AI, an expert e-commerce store designer and builder. Your job is to generate a COMPLETE, PRODUCTION-QUALITY e-commerce store configuration based on the user's description.

You MUST respond with a SINGLE valid JSON object matching the Store TypeScript interface exactly. No markdown, no explanation, no extra text — ONLY raw JSON.

## Store Interface Requirements

The JSON object must have the following top-level fields:

{
  "id": "<uuid string — generate a fresh one>",
  "name": "<store name — descriptive, catchy>",
  "slug": "<url-safe slug from store name>",
  "description": "<1-2 sentence store description>",
  "theme": {
    "colors": {
      "primary": "<hex color>",
      "secondary": "<hex color>",
      "accent": "<hex color>",
      "background": "<hex color>",
      "surface": "<hex color>",
      "text": "<hex color>",
      "textMuted": "<hex color>",
      "border": "<hex color>"
    },
    "fonts": {
      "heading": "<font name — e.g. Inter, Playfair Display, Poppins, Merriweather>",
      "body": "<font name — e.g. Inter, Open Sans, Lato, Source Sans Pro>"
    },
    "spacing": "normal",
    "borderRadius": "md"
  },
  "pages": [ /* at least 1 homepage */ ],
  "products": [ /* at least 4-8 realistic products */ ],
  "published": false,
  "createdAt": "<ISO 8601 timestamp>",
  "updatedAt": "<ISO 8601 timestamp>"
}

## Page Structure

Each page:
{
  "id": "<uuid>",
  "name": "Home",
  "slug": "",
  "isHomepage": true,
  "sections": [ /* ordered array of sections */ ]
}

## Section Types and Content

Each section:
{
  "id": "<uuid>",
  "type": "<one of: hero, featured-products, product-grid, text-banner, image-gallery, testimonials, newsletter, faq, cta, categories, rich-text, spacer, divider>",
  "content": { /* type-specific content — see below */ },
  "style": {
    "backgroundColor": "<optional hex>",
    "textColor": "<optional hex>",
    "paddingY": "md",
    "paddingX": "md",
    "maxWidth": "lg",
    "backgroundImage": "<optional url>",
    "overlay": false,
    "borderRadius": "none"
  },
  "visible": true
}

### Section Content Schemas:

**hero**:
{
  "headline": "<compelling headline>",
  "subheadline": "<supporting text>",
  "ctaText": "<button text — e.g. Shop Now>",
  "ctaLink": "#products",
  "alignment": "center",
  "height": "lg"
}

**featured-products**:
{
  "headline": "<section headline>",
  "subtitle": "<optional subtitle>",
  "productIds": ["<ids from products array>"],
  "columns": 3,
  "showPrice": true,
  "showAddToCart": true
}

**product-grid**:
{
  "headline": "All Products",
  "columns": 3,
  "showPrice": true,
  "showAddToCart": true
}

**text-banner**:
{
  "headline": "<banner headline>",
  "body": "<optional body text>",
  "alignment": "center",
  "size": "md"
}

**image-gallery**:
{
  "images": [
    { "src": "https://images.unsplash.com/photo-<use real unsplash URLs>", "alt": "<description>" }
  ],
  "columns": 3,
  "gap": "md"
}

**testimonials**:
{
  "headline": "What Our Customers Say",
  "items": [
    { "id": "<uuid>", "quote": "<realistic testimonial>", "author": "<name>", "role": "<title/company>", "rating": 5 }
  ]
}

**newsletter**:
{
  "headline": "Stay in the Loop",
  "subtitle": "<optional>",
  "placeholderText": "Enter your email",
  "buttonText": "Subscribe"
}

**faq**:
{
  "headline": "Frequently Asked Questions",
  "items": [
    { "id": "<uuid>", "question": "<question>", "answer": "<answer>" }
  ]
}

**cta**:
{
  "headline": "<cta headline>",
  "body": "<optional body>",
  "ctaText": "<button text>",
  "ctaLink": "#",
  "style": "solid"
}

**categories**:
{
  "headline": "Shop by Category",
  "items": [
    { "id": "<uuid>", "name": "<category>", "slug": "<slug>", "productCount": 5 }
  ],
  "columns": 3
}

**rich-text**: { "html": "<valid HTML string>" }

**spacer**: { "height": "md" }

**divider**: { }

## Product Requirements

Each product:
{
  "id": "<uuid>",
  "name": "<realistic product name>",
  "price": <number — realistic pricing>,
  "compareAtPrice": <optional number for sale items>,
  "images": ["https://images.unsplash.com/photo-<use real unsplash URLs>"],
  "description": "<2-4 sentence description>",
  "category": "<category matching the store theme>",
  "variants": [
    {
      "id": "<uuid>",
      "name": "<variant name — e.g. Size, Color>",
      "options": [{ "label": "<label>", "value": "<value>" }],
      "inStock": true
    }
  ],
  "featured": <boolean — mark 2-4 as featured>,
  "inStock": true
}

## Design Guidelines

1. **Theme colors must match the brand** — e.g., a luxury jewelry store should use dark/rich colors; a kids' toy store should use bright/playful colors; a coffee shop should use warm browns/creams.
2. **Create 6-10 realistic products** with meaningful descriptions and categories.
3. **Build a compelling page** with at minimum: header, hero, featured products, testimonials, newsletter, footer sections. Add more sections for variety.
4. **Use Unsplash image URLs** that match the products and brand aesthetic (e.g., use real photo IDs from unsplash).
5. **Product prices should be realistic** for the type of store.
6. **Section styles should vary** — use different backgrounds, padding, and alignment for visual interest.
7. **Generate fresh UUIDs** for all id fields (use random strings like "a1b2c3d4-e5f6-7890-abcd-ef1234567890").
8. **The store must feel complete and professional** — like a real Shopify store.

CRITICAL: Return ONLY the raw JSON object. No markdown fences, no explanation, no commentary.`;

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

    const userMessage = `Generate an e-commerce store based on this description:\n\n${prompt.trim()}`;

    const result = await executeAI('store-generation', [
      { role: 'user', content: userMessage },
    ], {
      systemPrompt: STORE_GENERATION_SYSTEM_PROMPT,
      timeout: 90_000,
    });

    if (!result.success || !result.content) {
      return NextResponse.json(
        { error: result.error || 'AI failed to generate the store.' },
        { status: 502 }
      );
    }

    // Extract JSON from the AI response
    const jsonStr = extractJSON(result.content);

    // Parse and validate
    let store: Store;
    try {
      store = JSON.parse(jsonStr) as Store;
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error('[Store Generate] JSON parse error:', msg);
      return NextResponse.json(
        { error: 'AI returned invalid JSON. Please try again.', details: msg },
        { status: 502 }
      );
    }

    // Basic validation
    if (!store.id || !store.name || !store.theme || !Array.isArray(store.pages) || !Array.isArray(store.products)) {
      return NextResponse.json(
        { error: 'AI returned an incomplete store schema. Missing required fields (id, name, theme, pages, products).' },
        { status: 502 }
      );
    }

    return NextResponse.json({ store });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Store Generate] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred while generating the store.' },
      { status: 500 }
    );
  }
}
