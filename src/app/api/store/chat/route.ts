// ========================================
// Chat Edit API — Targeted Patch Operations
// ========================================
// POST /api/store/chat
//
// Three-layer defense against destructive edits:
// 1. System prompt includes full section content + strict "only change what was asked" rules
// 2. Server-side no-op filter strips fields that match existing values
// 3. Detailed summary shows exactly what changed

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON, repairJSON } from '@/lib/ai-orchestrator';
import type { Store, ChatMessage, ChatEditOperation } from '@/lib/store-schema';

// ─── Build system prompt with FULL section content ──────────────
function buildChatSystemPrompt(store: Store): string {
  let pagesList = store.pages.map(function(p) {
    return '  - Page "' + p.name + '" (id: "' + p.id + '", slug: "' + p.slug + '", homepage: ' + p.isHomepage + ')';
  }).join('\n');

  let prods = store.products || [];
  let prodsList = prods.slice(0, 20).map(function(p) {
    return '  - "' + p.name + '" (id: "' + p.id + '", $' + p.price + ', category: "' + (p.category || 'none') + '")';
  }).join('\n');

  // Include FULL section content so the AI knows current values
  let sectsList = store.pages.flatMap(function(p) {
    return p.sections.map(function(s) {
      let contentStr = JSON.stringify(s.content).replace(/"/g, "'").substring(0, 300);
      let styleStr = Object.keys(s.style || {}).length > 0
        ? ', style: ' + JSON.stringify(s.style).replace(/"/g, "'").substring(0, 200)
        : '';
      return '  - [Page: "' + p.name + '"] Section "' + s.id + '" (type: ' + s.type + ', visible: ' + s.visible + ')' +
        '\n    content: ' + contentStr + styleStr;
    });
  }).join('\n');

  let themeStr = JSON.stringify(store.theme);

  return 'You are Storqly AI, a store editor. Translate natural language edit commands into precise JSON operations.\n\n' +
    '## Current Store State\n\n' +
    'Name: "' + store.name + '" | Slug: "' + store.slug + '"\n' +
    'Description: "' + (store.description || 'None') + '"\n\n' +
    '### Theme\n' + themeStr + '\n\n' +
    '### Pages (' + store.pages.length + ')\n' + pagesList + '\n\n' +
    '### Products (' + prods.length + ')\n' + prodsList + '\n\n' +
    '### Sections (with current content)\n' + sectsList + '\n\n' +
    '## Operation Types\n\n' +
    '1. update-theme: { "type": "update-theme", "payload": { "colors": { "primary": "#hex" } } }\n' +
    '2. update-section: { "type": "update-section", "payload": { "sectionId": "<id>", "content": { "fieldName": "new value" }, "style": { "fieldName": "new value" } } }\n' +
    '3. add-section: { "type": "add-section", "payload": { "pageId": "<id>", "section": { "id": "<uuid>", "type": "<type>", "content": {}, "style": {}, "visible": true }, "index": 0 } }\n' +
    '4. remove-section: { "type": "remove-section", "payload": { "pageId": "<id>", "sectionId": "<id>" } }\n' +
    '5. reorder-sections: { "type": "reorder-sections", "payload": { "pageId": "<id>", "sectionIds": ["<id1>", "<id2>"] } }\n' +
    '6. update-product: { "type": "update-product", "payload": { "productId": "<id>", "data": { "name": "New" } } }\n' +
    '7. add-product: { "type": "add-product", "payload": { "id": "<uuid>", "name": "...", "price": 29.99, "images": ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600"], "description": "...", "category": "...", "inStock": true } }\n' +
    '8. remove-product: { "type": "remove-product", "payload": { "productId": "<id>" } }\n\n' +
    '## CRITICAL SAFETY RULES (VIOLATING THESE WILL CORRUPT USER DATA)\n\n' +
    'RULE 1 — MINIMAL PATCHES: In update-section, ONLY include the specific field(s) the user asked to change. Do NOT include any other content or style fields.\n' +
    'RULE 2 — NEVER REGENERATE: Never copy-paste existing content values into the operation. If the user did not ask to change a field, it must NOT appear in the payload.\n' +
    'RULE 3 — COLOR REQUESTS: When user asks to change a color/background, use style.backgroundColor with a hex color. Common: neon=#39ff14, hot pink=#ff1493, royal blue=#4169e1, gold=#ffd700, forest green=#228b22, coral=#ff7f50, midnight=#191970, lavender=#e6e6fa.\n' +
    'RULE 4 — TEXT REQUESTS: When user asks to change text (headline, subtitle, description, button text), ONLY include that one content field.\n' +
    'RULE 5 — sectionId: Always use the EXACT sectionId from the store state above.\n\n' +
    '### EXAMPLES\n\n' +
    'User: "change hero background to neon"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<hero-id>","style":{"backgroundColor":"#39ff14"}}}\n' +
    'WRONG: {"type":"update-section","payload":{"sectionId":"<hero-id>","content":{"headline":"Welcome","subheadline":"Shop now"},"style":{}}}\n' +
    '^^^ WRONG because: user only asked for color change, but content fields were included (they will overwrite the user\'s existing text)\n\n' +
    'User: "change headline to Welcome Home"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<id>","content":{"headline":"Welcome Home"}}}\n' +
    'WRONG: {"type":"update-section","payload":{"sectionId":"<id>","content":{"headline":"Welcome Home","subheadline":"New subtitle","ctaText":"Buy Now"},"style":{}}}\n' +
    '^^^ WRONG because: subheadline and ctaText were not requested and will overwrite existing values\n\n' +
    '## Output Format\n\n' +
    'Return ONLY: {"operations": [...]}\n' +
    'No markdown, no explanation, no commentary.';
}

// ─── No-op filter: strip fields that match existing values ──────
// This is the server-side defense against AI returning unchanged fields
// that would still overwrite user content.
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every(function(v, i) { return valuesEqual(v, b[i]); });
  }
  if (typeof a === 'object' && typeof b === 'object') {
    let keysA = Object.keys(a as Record<string, unknown>);
    let keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(function(k) {
      return valuesEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      );
    });
  }
  return false;
}

interface SanitizeResult {
  operations: ChatEditOperation[];
  strippedFields: string[];
}

function sanitizeOperations(operations: ChatEditOperation[], store: Store): SanitizeResult {
  let strippedFields: string[] = [];

  // Build section lookup: sectionId -> { content, style }
  let sectionMap = new Map<string, { content: Record<string, unknown>; style: Record<string, unknown> }>();
  for (let page of store.pages) {
    for (let section of page.sections) {
      sectionMap.set(section.id, {
        content: section.content as Record<string, unknown>,
        style: section.style as Record<string, unknown>,
      });
    }
  }

  let sanitized = operations.map(function(op) {
    if (op.type !== 'update-section') return op;

    let payload = op.payload as Record<string, unknown>;
    let sectionId = payload.sectionId as string;
    let existing = sectionMap.get(sectionId);
    if (!existing) return op; // Unknown section — pass through as-is

    // Filter content fields: remove any that match existing value exactly
    let content = payload.content as Record<string, unknown> | undefined;
    if (content && typeof content === 'object') {
      let filteredContent: Record<string, unknown> = {};
      for (let key of Object.keys(content)) {
        let newVal = content[key];
        let oldVal = existing.content[key];
        if (valuesEqual(newVal, oldVal)) {
          strippedFields.push('content.' + key + ' (unchanged)');
          console.log('[Chat Edit] Stripped no-op field: content.' + key + ' for section ' + sectionId);
        } else {
          filteredContent[key] = newVal;
        }
      }
      if (Object.keys(filteredContent).length > 0) {
        payload = { ...payload, content: filteredContent };
      } else {
        // All content fields were no-ops — remove content entirely
        let payloadCopy = { ...payload };
        delete payloadCopy.content;
        payload = payloadCopy;
      }
    }

    // Filter style fields: remove any that match existing value exactly
    let style = payload.style as Record<string, unknown> | undefined;
    if (style && typeof style === 'object') {
      let filteredStyle: Record<string, unknown> = {};
      for (let skey of Object.keys(style)) {
        let newStyleVal = style[skey];
        let oldStyleVal = existing.style[skey];
        if (valuesEqual(newStyleVal, oldStyleVal)) {
          strippedFields.push('style.' + skey + ' (unchanged)');
          console.log('[Chat Edit] Stripped no-op field: style.' + skey + ' for section ' + sectionId);
        } else {
          filteredStyle[skey] = newStyleVal;
        }
      }
      if (Object.keys(filteredStyle).length > 0) {
        payload = { ...payload, style: filteredStyle };
      } else {
        let payloadCopy2 = { ...payload };
        delete payloadCopy2.style;
        payload = payloadCopy2;
      }
    }

    return { ...op, payload };
  });

  // Drop any update-section operations that became empty (no actual changes)
  let finalOps = sanitized.filter(function(op) {
    if (op.type !== 'update-section') return true;
    let p = op.payload as Record<string, unknown>;
    let hasContent = p.content && typeof p.content === 'object' && Object.keys(p.content).length > 0;
    let hasStyle = p.style && typeof p.style === 'object' && Object.keys(p.style).length > 0;
    let hasChanges = hasContent || hasStyle;
    if (!hasChanges) {
      strippedFields.push('entire operation (no actual changes after filtering)');
      console.log('[Chat Edit] Dropped empty update-section operation for section ' + (p.sectionId as string));
      return false;
    }
    return true;
  });

  return { operations: finalOps, strippedFields };
}

// ─── Build detailed summary ──────────────────────────────────────
function buildSummary(operations: ChatEditOperation[], strippedFields: string[]): string {
  if (operations.length === 0) {
    if (strippedFields.length > 0) {
      return 'No effective changes made. The AI suggested changes that matched existing values.';
    }
    return 'No changes needed.';
  }

  let parts = operations.map(function(op) {
    switch (op.type) {
      case 'update-theme': {
        let payload = op.payload as Record<string, unknown>;
        let details: string[] = [];
        if (payload.colors) {
          let cols = payload.colors as Record<string, string>;
          for (let k of Object.keys(cols)) details.push(k + ' color');
        }
        if (payload.fonts) {
          let fonts = payload.fonts as Record<string, string>;
          for (let fk of Object.keys(fonts)) details.push(fk + ' font');
        }
        if (payload.spacing) details.push('spacing');
        if (payload.borderRadius) details.push('border radius');
        return 'Updated theme: ' + (details.length > 0 ? details.join(', ') : 'misc');
      }
      case 'update-section': {
        let sp = op.payload as Record<string, unknown>;
        let changes: string[] = [];
        if (sp.content && typeof sp.content === 'object') {
          let contentKeys = Object.keys(sp.content);
          for (let ck of contentKeys) changes.push(ck);
        }
        if (sp.style && typeof sp.style === 'object') {
          let styleKeys = Object.keys(sp.style);
          for (let sk of styleKeys) changes.push('style.' + sk);
        }
        return 'Updated section: ' + (changes.length > 0 ? changes.join(', ') : 'unknown fields');
      }
      case 'add-section': return 'Added a new section';
      case 'remove-section': return 'Removed a section';
      case 'reorder-sections': return 'Reordered sections';
      case 'update-product': return 'Updated a product';
      case 'add-product': return 'Added a product';
      case 'remove-product': return 'Removed a product';
      default: return 'Made a change';
    }
  });

  let summary = 'Applied ' + operations.length + ' change' + (operations.length > 1 ? 's' : '') + ': ' + parts.join('; ');

  if (strippedFields.length > 0) {
    summary += ' (' + strippedFields.length + ' no-op field' + (strippedFields.length > 1 ? 's' : '') + ' filtered out)';
  }

  return summary;
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

    const recentHistory = (history || []).slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && msg.content) {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    const result = await executeAI('chat-edit', messages, {
      systemPrompt,
      timeout: 30_000,
      responseFormat: 'json_object',
    });

    if (!result.success || !result.content) {
      return NextResponse.json({
        message: "I'm having trouble right now. Please try again in a moment.",
        operations: [],
      });
    }

    // Extract and parse the operations array
    let aiContent = result.content;
    try {
      const parsed = JSON.parse(aiContent);
      if (!Array.isArray(parsed)) {
        if (parsed.operations && Array.isArray(parsed.operations)) {
          aiContent = JSON.stringify(parsed.operations);
        } else if (parsed.changes && Array.isArray(parsed.changes)) {
          aiContent = JSON.stringify(parsed.changes);
        } else {
          const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
          if (arrayKey) {
            aiContent = JSON.stringify(parsed[arrayKey]);
          }
        }
      }
    } catch {
      // Not valid JSON — continue with extractJSON
    }
    let jsonStr = extractJSON(aiContent);

    let operations: ChatEditOperation[];
    try {
      operations = JSON.parse(jsonStr) as ChatEditOperation[];
    } catch {
      try {
        const repaired = repairJSON(jsonStr);
        operations = JSON.parse(repaired) as ChatEditOperation[];
      } catch (parseErr: unknown) {
        const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error('[Chat Edit] JSON parse error:', errMsg);
        return NextResponse.json(
          { message: 'I understood your request but had trouble applying the changes. Please try rephrasing.', operations: [] },
          { status: 200 }
        );
      }
    }

    if (!Array.isArray(operations)) {
      return NextResponse.json({
        message: 'I understood your request but had trouble applying changes. Please try rephrasing.',
        operations: [],
      });
    }

    // Basic validation
    for (const op of operations) {
      if (!op.type || !op.payload) {
        return NextResponse.json({
          message: 'Some changes could not be applied. Please try again.',
          operations: [],
        });
      }
    }

    // ── SERVER-SIDE NO-OP FILTER ──
    // Strip any fields that match existing values (prevents silent corruption)
    const { operations: sanitized, strippedFields } = sanitizeOperations(operations, store);

    if (strippedFields.length > 0) {
      console.log('[Chat Edit] No-op filter stripped ' + strippedFields.length + ' fields:');
      for (const field of strippedFields) {
        console.log('  - ' + field);
      }
    }

    // ── Build detailed summary ──
    const summary = buildSummary(sanitized, strippedFields);

    return NextResponse.json({ message: summary, operations: sanitized });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Chat Edit] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the chat edit.' },
      { status: 500 }
    );
  }
}
