// ========================================
// Chat Edit API
// ========================================
// POST /api/store/chat
// Takes { message, store, history } body, uses the AI orchestrator to parse
// the user's edit command and return ChatEditOperation[].

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON } from '@/lib/ai-orchestrator';
import type { Store, ChatMessage, ChatEditOperation } from '@/lib/store-schema';

// ─── Build system prompt with current store context ──────────────
function buildChatSystemPrompt(store: Store): string {
  return `You are Storqly AI, an intelligent store editor. You help users modify their e-commerce store by understanding natural language commands and translating them into precise edit operations.

The user has an existing store. Your job is to understand what they want to change and return a JSON array of operations.

## Current Store State

Store Name: "${store.name}"
Store Slug: "${store.slug}"
Description: "${store.description || 'None'}"

### Theme
${JSON.stringify(store.theme, null, 2)}

### Pages (${store.pages.length})
${store.pages.map((p) => `  - Page "${p.name}" (slug: "${p.slug}", homepage: ${p.isHomepage}, sections: ${p.sections.length})`).join('\n')}

### Products (${store.products.length})
${store.products.slice(0, 20).map((p) => `  - "${p.name}" ($${p.price}, category: "${p.category || 'none'}", featured: ${!!p.featured}, inStock: ${p.inStock})`).join('\n')}
${store.products.length > 20 ? `  ... and ${store.products.length - 20} more products` : ''}

### Sections (across all pages)
${store.pages.flatMap((p) =>
  p.sections.map((s) => `  - [Page: "${p.name}"] Section "${s.id}" (type: ${s.type}, visible: ${s.visible})`)
).join('\n')}

## Available Operation Types

Return a JSON array of operation objects. Each operation has a "type" field and a "payload" field. Valid types:

1. **update-theme**: Change the store theme
   { "type": "update-theme", "payload": { "colors": { "primary": "#ff0000" }, "fonts": { "heading": "Playfair Display" }, "spacing": "spacious", "borderRadius": "lg" } }

2. **update-section**: Modify an existing section's content and/or style
   { "type": "update-section", "payload": { "sectionId": "<uuid>", "content": { "headline": "New Headline" }, "style": { "backgroundColor": "#f0f0f0" } } }
   IMPORTANT: You MUST use the actual sectionId from the store. Look at the sections listed above.

3. **add-section**: Add a new section to a page
   { "type": "add-section", "payload": { "pageId": "<uuid>", "section": { "id": "<new uuid>", "type": "<section type>", "content": { ... }, "style": { ... }, "visible": true }, "index": <optional number> } }

4. **remove-section**: Remove a section from a page
   { "type": "remove-section", "payload": { "pageId": "<uuid>", "sectionId": "<uuid>" } }

5. **reorder-sections**: Reorder sections on a page
   { "type": "reorder-sections", "payload": { "pageId": "<uuid>", "sectionIds": ["<uuid1>", "<uuid2>", ...] } }

6. **add-product**: Add a new product
   { "type": "add-product", "payload": { "id": "<new uuid>", "name": "...", "price": 29.99, "images": [...], "description": "...", "category": "...", "inStock": true } }

7. **update-product**: Update an existing product
   { "type": "update-product", "payload": { "productId": "<uuid>", "data": { "name": "New Name", "price": 39.99 } } }

8. **remove-product**: Remove a product
   { "type": "remove-product", "payload": { "productId": "<uuid>" } }

9. **bulk-update**: Apply multiple top-level store changes at once
   { "type": "bulk-update", "payload": { "name": "New Store Name", "description": "New description" } }

## Rules

1. Return ONLY a JSON array of operations. No markdown, no explanation.
2. Generate fresh UUIDs (e.g. "550e8400-e29b-41d4-a716-446655440000") for any new IDs you create.
3. Use the actual pageId and sectionId values from the current store state above.
4. When the user asks to change text, update the relevant section content.
5. When the user asks to change colors/style, use update-theme or update-section with style changes.
6. Combine multiple related changes into separate operations in the array.
7. Be precise — only make the changes the user requests.
8. If a request is ambiguous, make a reasonable interpretation and apply it.
9. If the user asks a question that doesn't require changes, return an empty array [].
10. For image URLs, use placeholder URLs like "https://images.unsplash.com/photo-1506744038136-46273834b3fb" with real unsplash photo IDs when possible.`;
}

// ─── POST handler ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, store, history } = body as {
      message?: string;
      store?: Store;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'A non-empty "message" field is required.' },
        { status: 400 }
      );
    }

    if (!store || !store.id || !store.name || !store.theme || !Array.isArray(store.pages)) {
      return NextResponse.json(
        { error: 'A valid "store" object with id, name, theme, and pages is required.' },
        { status: 400 }
      );
    }

    const systemPrompt = buildChatSystemPrompt(store);

    // Build conversation history for context
    const messages: Array<{ role: 'assistant' | 'user'; content: string }> = [];

    // Include recent history (last 10 messages) for context
    const recentHistory = (history || []).slice(-10);
    for (const msg of recentHistory) {
      // Skip messages that already have operations — they were from previous assistant turns
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && msg.content) {
        // Only include the assistant's text response, not the operations
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    // Add the current user message
    messages.push({ role: 'user', content: message.trim() });

    const result = await executeAI('chat-edit', messages, {
      systemPrompt,
      timeout: 30_000,
    });

    if (!result.success || !result.content) {
      return NextResponse.json(
        { error: result.error || 'AI failed to process the edit request.' },
        { status: 502 }
      );
    }

    // Extract and parse the operations array
    const jsonStr = extractJSON(result.content);

    let operations: ChatEditOperation[];
    try {
      operations = JSON.parse(jsonStr) as ChatEditOperation[];
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error('[Chat Edit] JSON parse error:', msg);
      return NextResponse.json(
        { error: 'AI returned invalid JSON for operations.', details: msg },
        { status: 502 }
      );
    }

    // Validate it's an array
    if (!Array.isArray(operations)) {
      return NextResponse.json(
        { error: 'AI did not return an array of operations.' },
        { status: 502 }
      );
    }

    // Basic validation of each operation
    for (const op of operations) {
      if (!op.type || !op.payload) {
        return NextResponse.json(
          { error: 'Each operation must have a "type" and "payload" field.' },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ operations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Chat Edit] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the chat edit.' },
      { status: 500 }
    );
  }
}
