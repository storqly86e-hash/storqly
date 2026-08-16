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
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

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
    '8. remove-product: { "type": "remove-product", "payload": { "productId": "<id>" } }\n' +
    '9. add-page: { "type": "add-page", "payload": { "name": "<Page Name>", "slug": "<url-safe-slug>", "sections": [<section objects>] } } — Creates a new custom page. sections is optional (empty if omitted).\n' +
    '10. remove-page: { "type": "remove-page", "payload": { "pageId": "<id>" } } — Deletes a CUSTOM page only. Never delete Home, Shop, Cart, or Checkout.\n' +
    '11. rename-page: { "type": "rename-page", "payload": { "pageId": "<id>", "name": "<New Name>" } }\n\n' +
    '## VALID SECTION TYPES (MANDATORY — ONLY use these exact type strings in add-section)\n\n' +
    'When adding sections, you MUST use one of these exact type values. NEVER invent a custom type string.\n' +
    'If the user asks for something conceptual (e.g. "our story", "core values", "team", "mission"), map it to the closest type below:\n' +
    '- "hero": Full-width hero banner with headline, subheadline, CTA button, optional badge (eyebrow label), and optional secondary CTA. Supports layout modes: "centered" (default), "split-left" (text left + image right), "split-right" (image left + text right). Use for: landing/mission/founding story intros. Content fields: headline, subheadline, ctaText, ctaLink, badge, secondaryCtaText, secondaryCtaLink, layout, heroImage.\n' +
    '- "text-banner": Single text block with headline and body text. Use for: announcements, stories, descriptions, "about us" text, mission statements, value propositions.\n' +
    '- "rich-text": Rich text content block with an "html" field containing HTML markup. Use for: detailed content, formatted text, longer descriptions, multiple paragraphs. IMPORTANT: The "html" field MUST contain actual HTML content like "<p>Your text here.</p>" — NEVER leave it empty.\n' +
    '- "featured-products": Curated product showcase. Use for: product highlights, featured items, best sellers.\n' +
    '- "product-grid": Grid of all products. Use for: full product catalog browsing.\n' +
    '- "testimonials": Customer reviews/quotes. Use for: social proof, customer stories, reviews.\n' +
    '- "image-gallery": Image grid. Use for: photo collections, brand imagery, portfolio.\n' +
    '- "faq": Accordion Q&A. Use for: frequently asked questions, common inquiries.\n' +
    '- "cta": Call-to-action banner. Use for: conversion prompts, special offers, signup pushes.\n' +
    '- "categories": Product category grid. Use for: category browsing, product organization.\n' +
    '- "brand-statement": Full-width brand statement with large headline and body text on a background image. Use for: mission statements, brand values, taglines, philosophy.\n' +
    '- "newsletter": Email signup. Use for: email capture, subscription forms.\n' +
    '- "spacer": Empty vertical space. Use for: visual breathing room between sections.\n' +
    '- "divider": Horizontal line separator. Use for: visual separation between content areas.\n' +
    'HEADER/FOOTER types exist ("header", "footer") but should NOT be added via add-section — they are managed automatically.\n\n' +
    '## Style Fields Reference\n\n' +
    'Section-level style fields (affect the ENTIRE section):\n' +
    '- backgroundColor: hex color for section background\n' +
    '- textColor: hex color for all text in the section\n' +
    '- paddingY, paddingX, maxWidth, backgroundImage, overlay, borderRadius\n\n' +
    'Element-level style fields (affect SPECIFIC elements inside the section):\n' +
    '- buttonBackgroundColor: hex color for buttons (CTA, Add to Cart, Subscribe) ONLY\n' +
    '- buttonTextColor: hex color for button text ONLY\n' +
    '- headlineColor: hex color for the section headline ONLY\n\n' +
    '## CRITICAL SAFETY RULES (VIOLATING THESE WILL CORRUPT USER DATA)\n\n' +
    'RULE 1 — MINIMAL PATCHES: In update-section, ONLY include the specific field(s) the user asked to change. Do NOT include any other content or style fields.\n' +
    'RULE 2 — NEVER REGENERATE: Never copy-paste existing content values into the operation. If the user did not ask to change a field, it must NOT appear in the payload.\n' +
    'RULE 3 — COLOR REQUESTS — SECTION LEVEL: When user asks to change the background or text of a SECTION, use style.backgroundColor or style.textColor with a hex color. Common: neon=#39ff14, hot pink=#ff1493, royal blue=#4169e1, gold=#ffd700, forest green=#228b22, coral=#ff7f50, midnight=#191970, lavender=#e6e6fa, black=#000000, white=#ffffff.\n' +
    'RULE 4 — TEXT REQUESTS: When user asks to change text (headline, subtitle, description, button text), ONLY include that one content field.\n' +
    'RULE 5 — sectionId: Always use the EXACT sectionId from the store state above.\n' +
    'RULE 6 — SUB-ELEMENT TARGETING (CRITICAL): When the user asks to change a SPECIFIC element inside a section (a button, a headline, etc.), you MUST use element-level style fields, NOT section-level ones.\n' +
    '  - "change button color" → use style.buttonBackgroundColor (NOT backgroundColor!)\n' +
    '  - "change button text color" → use style.buttonTextColor\n' +
    '  - "change headline color" → use style.headlineColor\n' +
    '  NEVER use style.backgroundColor when the user said "button" — backgroundColor changes the WHOLE section background, not the button.\n\n' +
    '### EXAMPLES\n\n' +
    'User: "change hero background to neon"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<hero-id>","style":{"backgroundColor":"#39ff14"}}}\n' +
    'WRONG: {"type":"update-section","payload":{"sectionId":"<hero-id>","content":{"headline":"Welcome","subheadline":"Shop now"},"style":{}}}\n' +
    '^^^ WRONG because: user only asked for color change, but content fields were included (they will overwrite the user\'s existing text)\n\n' +
    'User: "change headline to Welcome Home"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<id>","content":{"headline":"Welcome Home"}}}\n' +
    'WRONG: {"type":"update-section","payload":{"sectionId":"<id>","content":{"headline":"Welcome Home","subheadline":"New subtitle","ctaText":"Buy Now"},"style":{}}}\n' +
    '^^^ WRONG because: subheadline and ctaText were not requested and will overwrite existing values\n\n' +
    'User: "change the Add to Cart button to black"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<featured-products-id>","style":{"buttonBackgroundColor":"#000000"}}}\n' +
    'WRONG: {"type":"update-section","payload":{"sectionId":"<featured-products-id>","style":{"backgroundColor":"#000000"}}}\n' +
    '^^^ CATASTROPHICALLY WRONG: backgroundColor changes the ENTIRE section background to black, not just the button!\n\n' +
    'User: "make the CTA button text white"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<cta-id>","style":{"buttonTextColor":"#ffffff"}}}\n\n' +
    'User: "change the headline color to gold"\n' +
    'CORRECT: {"type":"update-section","payload":{"sectionId":"<id>","style":{"headlineColor":"#ffd700"}}}\n\n' +
    '## Output Format\n\n' +
    'Return ONLY: {"operations": [...]}\n' +
    'No markdown, no explanation, no commentary.\n\n' +
    '## COMPLETENESS RULE (CRITICAL)\n\n' +
    'When the user requests MULTIPLE things (e.g. "add a hero, a text section, and a newsletter"), ' +
    'you MUST generate an operation for EACH item requested. Never skip or merge items. ' +
    'Count the distinct things asked for before generating operations and verify your output includes all of them.\n\n' +
    'When creating a new page with multiple sections, use the add-page operation with ALL sections in the sections array. ' +
    'Each section MUST include complete content (headline, body, items, etc.) — never leave content as empty {}.\n\n' +
    'For multi-section creation, keep each section\'s content CONCISE (1-2 sentences max per text field) to avoid response truncation. ' +
    'Quality brevity is better than being cut off mid-response.';
}

// ─── No-op filter: strip fields that match existing values ──────
// This is the server-side defense against AI returning unchanged fields
// that would still overwrite user content.
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'string' && typeof b === 'string') {
    // Case-insensitive comparison for hex colors (e.g. #15bca0 === #15BCA0)
    if (/^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)) {
      return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
  }
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
      case 'add-section': {
        let sp = op.payload as Record<string, unknown>;
        let section = sp.section as Record<string, unknown> | undefined;
        return 'Added ' + (section?.type || 'unknown') + ' section';
      }
      case 'remove-section': return 'Removed a section';
      case 'reorder-sections': return 'Reordered sections';
      case 'update-product': return 'Updated a product';
      case 'add-product': return 'Added a product';
      case 'remove-product': return 'Removed a product';
      case 'add-page': {
        let sp = op.payload as Record<string, unknown>;
        let sections = sp.sections as unknown[] | undefined;
        return 'Added page "' + (sp.name || 'New Page') + '"' + (sections && sections.length > 0 ? ' with ' + sections.length + ' sections' : '');
      }
      case 'remove-page': return 'Removed a custom page';
      case 'rename-page': return 'Renamed a page';
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
    await requireAuth();

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
    console.log('[Chat Edit] Raw operations received:', operations.length);
    const { operations: sanitized, strippedFields } = sanitizeOperations(operations, store);
    console.log('[Chat Edit] Operations after no-op filter:', sanitized.length);

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
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Chat Edit] Unexpected error:', msg);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the chat edit.' },
      { status: 500 }
    );
  }
}
