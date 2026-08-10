// ========================================
// Chat Edit API
// ========================================
// POST /api/store/chat
// Takes { message, store, history } body, uses the AI orchestrator to parse
// the user's edit command and return ChatEditOperation[].

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON, repairJSON } from '@/lib/ai-orchestrator';
import type { Store, ChatMessage, ChatEditOperation } from '@/lib/store-schema';

// ─── Build system prompt with current store context ──────────────
function buildChatSystemPrompt(store: Store): string {
  const pagesList = store.pages.map(function(p) {
    return '  - Page "' + p.name + '" (slug: "' + p.slug + '", homepage: ' + p.isHomepage + ', sections: ' + p.sections.length + ')';
  }).join('\n');

  const prods = store.products || [];
  const prodsList = prods.slice(0, 20).map(function(p) {
    return '  - "' + p.name + '" ($' + p.price + ', category: "' + (p.category || 'none') + '", featured: ' + !!p.featured + ', inStock: ' + p.inStock + ')';
  }).join('\n');
  const prodsMore = prods.length > 20 ? '  ... and ' + (prods.length - 20) + ' more products' : '';

  const sectsList = store.pages.flatMap(function(p) {
    return p.sections.map(function(s) {
      return '  - [Page: "' + p.name + '"] Section "' + s.id + '" (type: ' + s.type + ', visible: ' + s.visible + ')';
    });
  }).join('\n');

  const themeStr = JSON.stringify(store.theme, null, 2);

  return 'You are Storqly AI, an intelligent store editor. You help users modify their e-commerce store by understanding natural language commands and translating them into precise edit operations.\n\n' +
    'The user has an existing store. Your job is to understand what they want to change and return a JSON object with an "operations" array.\n\n' +
    '## Current Store State\n\n' +
    'Store Name: "' + store.name + '"\n' +
    'Store Slug: "' + store.slug + '"\n' +
    'Description: "' + (store.description || 'None') + '"\n\n' +
    '### Theme\n' + themeStr + '\n\n' +
    '### Pages (' + store.pages.length + ')\n' + pagesList + '\n\n' +
    '### Products (' + prods.length + ')\n' + prodsList + '\n' + prodsMore + '\n\n' +
    '### Sections (across all pages)\n' + sectsList + '\n\n' +
    '## Response Format\n\n' +
    'Return a JSON object: {"operations": [...]} — an array of operation objects.\n' +
    'Each operation has a "type" field and a "payload" field. Valid types:\n\n' +
    '1. **update-theme**: Change the store theme\n' +
    '   { "type": "update-theme", "payload": { "colors": { "primary": "#ff0000" }, "fonts": { "heading": "Playfair Display" }, "spacing": "spacious", "borderRadius": "lg" } }\n\n' +
    '2. **update-section**: Modify an existing section content and/or style\n' +
    '   { "type": "update-section", "payload": { "sectionId": "<uuid>", "content": { "headline": "New Headline" }, "style": { "backgroundColor": "#f0f0f0" } } }\n' +
    '   IMPORTANT: Use the actual sectionId from the store above.\n\n' +
    '3. **add-section**: Add a new section to a page\n' +
    '   { "type": "add-section", "payload": { "pageId": "<uuid>", "section": { "id": "<new uuid>", "type": "<section type>", "content": { ... }, "style": { ... }, "visible": true }, "index": <number> } }\n\n' +
    '4. **remove-section**: Remove a section\n' +
    '   { "type": "remove-section", "payload": { "pageId": "<uuid>", "sectionId": "<uuid>" } }\n\n' +
    '5. **reorder-sections**: Reorder sections\n' +
    '   { "type": "reorder-sections", "payload": { "pageId": "<uuid>", "sectionIds": ["<uuid1>", "<uuid2>"] } }\n\n' +
    '6. **add-product**: Add a product\n' +
    '   { "type": "add-product", "payload": { "id": "<new uuid>", "name": "...", "price": 29.99, "images": [...], "description": "...", "category": "...", "inStock": true } }\n\n' +
    '7. **update-product**: Update a product\n' +
    '   { "type": "update-product", "payload": { "productId": "<uuid>", "data": { "name": "New Name", "price": 39.99 } } }\n\n' +
    '8. **remove-product**: Remove a product\n' +
    '   { "type": "remove-product", "payload": { "productId": "<uuid>" } }\n\n' +
    '9. **bulk-update**: Multiple top-level store changes\n' +
    '   { "type": "bulk-update", "payload": { "name": "New Store Name", "description": "New description" } }\n\n' +
    '## Rules\n\n' +
    '1. Return ONLY a JSON object {"operations": [...]}. No markdown, no explanation.\n' +
    '2. Generate fresh UUIDs for any new IDs.\n' +
    '3. Use actual pageId and sectionId values from the store above.\n' +
    '4. When the user asks to change text, update the relevant section content.\n' +
    '5. When the user asks to change colors/style, use update-theme or update-section.\n' +
    '6. Combine multiple related changes into separate operations in the array.\n' +
    '7. Be precise — only make the changes the user requests.\n' +
    '8. If a request is ambiguous, make a reasonable interpretation.\n' +
    '9. If no changes are needed, return {"operations": []}.';
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
      responseFormat: 'json_object',
    });

    if (!result.success || !result.content) {
      // Never 502 — return empty operations with explanation
      return NextResponse.json({
        message: "I'm having trouble right now. Please try again in a moment.",
        operations: [],
      });
    }

    // Extract and parse the operations array
    let aiContent = result.content;
    // AI with json_object mode wraps arrays in an object — handle both cases
    try {
      const parsed = JSON.parse(aiContent);
      if (!Array.isArray(parsed)) {
        // AI returned a JSON object instead of array — look for an operations/operations array inside
        if (parsed.operations && Array.isArray(parsed.operations)) {
          aiContent = JSON.stringify(parsed.operations);
        } else if (parsed.changes && Array.isArray(parsed.changes)) {
          aiContent = JSON.stringify(parsed.changes);
        } else {
          // Try to find any array value in the response
          const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
          if (arrayKey) {
            aiContent = JSON.stringify(parsed[arrayKey]);
          }
        }
      }
    } catch {
      // Not valid JSON or already an array string — continue with extractJSON
    }
    let jsonStr = extractJSON(aiContent);

    let operations: ChatEditOperation[];
    // Try direct parse, then repair
    try {
      operations = JSON.parse(jsonStr) as ChatEditOperation[];
    } catch {
      try {
        const repaired = repairJSON(jsonStr);
        operations = JSON.parse(repaired) as ChatEditOperation[];
      } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error('[Chat Edit] JSON parse error:', msg);
        return NextResponse.json(
          { message: "I understood your request but had trouble applying the changes. Please try rephrasing.", operations: [] },
          { status: 200 }
        );
      }
    }

    // Validate it's an array
    if (!Array.isArray(operations)) {
      return NextResponse.json({
        message: 'I understood your request but had trouble applying changes. Please try rephrasing.',
        operations: [],
      });
    }

    // Basic validation of each operation
    for (const op of operations) {
      if (!op.type || !op.payload) {
        return NextResponse.json({
          message: 'Some changes could not be applied. Please try again.',
          operations: [],
        });
      }
    }

    // Generate a human-readable summary
    let summary: string;
    if (operations.length === 0) {
      summary = 'No changes needed.';
    } else {
      const labels: Record<string, string> = {
        'update-theme': 'Updated theme',
        'update-section': 'Updated a section',
        'add-section': 'Added a new section',
        'remove-section': 'Removed a section',
        'reorder-sections': 'Reordered sections',
        'add-product': 'Added a product',
        'update-product': 'Updated a product',
        'remove-product': 'Removed a product',
        'bulk-update': 'Applied changes',
        'update-page': 'Updated page',
      };
      const count = operations.length;
      const plural = count > 1 ? 's' : '';
      const parts = operations.map(function(op) { return labels[op.type] || 'Made a change'; });
      summary = 'Applied ' + count + ' change' + plural + ': ' + parts.join(', ');
    }

    return NextResponse.json({ message: summary, operations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Chat Edit] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the chat edit.' },
      { status: 500 }
    );
  }
}
