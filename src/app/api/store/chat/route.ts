// ========================================
// Chat Edit API — Targeted Patch Operations
// ========================================
// Four-layer defense against non-functional edits:
// 1. Semantic mutation map — LLM uses correct renderer-consumed properties
// 2. Server-side no-op filter — strips fields matching existing values
// 3. Renderer verification — rejects mutations for properties the renderer ignores
// 4. Detailed summary — only reports success when state actually changed

import { NextRequest, NextResponse } from 'next/server';
import { executeAI, extractJSON, repairJSON } from '@/lib/ai-orchestrator';
import type { Store, ChatMessage, ChatEditOperation } from '@/lib/store-schema';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';
import { verifyMutation } from '@/lib/renderer-properties';

// ─── Build system prompt with FULL section content + SEMANTIC MAP ──────
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

  let themeStr = JSON.stringify(store);

  return 'You are Storqly AI, a store editor. Translate natural language edit commands into precise JSON operations.\n\n' +
    '## Current Store State\n\n' +
    'Name: "' + store.name + '" | Slug: "' + store.slug + '"\n' +
    'Description: "' + (store.description || 'None') + '"\n\n' +
    '### Theme\n' + JSON.stringify(store.theme) + '\n\n' +
    '### Pages (' + store.pages.length + ')\n' + pagesList + '\n\n' +
    '### Products (' + prods.length + ')\n' + prodsList + '\n\n' +
    '### Sections (with current content)\n' + sectsList + '\n\n' +
    // ── OPERATION TYPES ──
    '## Operation Types\n\n' +
    '1. update-theme: { "type": "update-theme", "payload": { "colors": { "primary": "#hex" } } }\n' +
    '2. update-section: { "type": "update-section", "payload": { "sectionId": "<id>", "content": { "fieldName": "new value" }, "style": { "fieldName": "new value" } } }\n' +
    '3. add-section: { "type": "add-section", "payload": { "pageId": "<id>", "section": { "id": "<uuid>", "type": "<type>", "content": {}, "style": {}, "visible": true }, "index": 0 } }\n' +
    '4. remove-section: { "type": "remove-section", "payload": { "pageId": "<id>", "sectionId": "<id>" } }\n' +
    '5. reorder-sections: { "type": "reorder-sections", "payload": { "pageId": "<id>", "sectionIds": ["<id1>", "<id2>"] } }\n' +
    '6. update-product: { "type": "update-product", "payload": { "productId": "<id>", "data": { "name": "New" } } }\n' +
    '7. add-product: { "type": "add-product", "payload": { "id": "<uuid>", "name": "...", "price": 29.99, "images": ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600"], "description": "...", "category": "...", "inStock": true } }\n' +
    '8. remove-product: { "type": "remove-product", "payload": { "productId": "<id>" } }\n' +
    '9. add-page: { "type": "add-page", "payload": { "name": "<Page Name>", "slug": "<url-safe-slug>", "sections": [<section objects>] } }\n' +
    '10. remove-page: { "type": "remove-page", "payload": { "pageId": "<id>" } }\n' +
    '11. rename-page: { "type": "rename-page", "payload": { "pageId": "<id>", "name": "<New Name>" } }\n\n' +
    // ── SECTION TYPES ──
    '## VALID SECTION TYPES\n\n' +
    '"hero" - Hero banner. "text-banner" - Text block. "rich-text" - HTML content. "featured-products" - Product showcase. "product-grid" - Full catalog. "testimonials" - Reviews. "image-gallery" - Photos. "faq" - Q&A accordion. "cta" - Call-to-action. "categories" - Category grid. "brand-statement" - Brand statement. "newsletter" - Email signup. "spacer" - Empty space. "divider" - Line separator.\n' +
    'NEVER use "header" or "footer" as add-section type.\n\n' +
    // ── SEMANTIC HERO MUTATION MAP (CRITICAL) ──
    '## HERO SEMANTIC MUTATION MAP (MANDATORY)\n\n' +
    'When editing hero sections, you MUST use these exact semantic properties. NEVER use generic CSS properties (fontSize, justifyContent, alignItems, fontWeight, etc.) — they will be REJECTED.\n\n' +
    '| User says | Property to change | Value |\n' +
    '|---|---|---|\n' +
    '| make headline bigger | content.headlineSize | "lg" |\n' +
    '| make headline much bigger | content.headlineSize | "xl" |\n' +
    '| make headline smaller | content.headlineSize | "sm" |\n' +
    '| reset headline size | content.headlineSize | "md" |\n' +
    '| move product to the left | content.layout | "split-right" |\n' +
    '| move product to the right | content.layout | "split-left" |\n' +
    '| put product in center | content.layout | "product-first" |\n' +
    '| text-first layout | content.layout | "text-first" |\n' +
    '| minimal layout / clean banner | content.layout | "minimal" |\n' +
    '| make background darker | content.backgroundTreatment | "dramatic" |\n' +
    '| make background slightly darker | content.backgroundTreatment | "soft" |\n' +
    '| make background editorial/magazine | content.backgroundTreatment | "editorial" |\n' +
    '| remove background treatment | content.backgroundTreatment | "none" |\n' +
    '| change CTA text | content.ctaText | "New Text" |\n' +
    '| change CTA to outline style | content.ctaStyle | "outline" |\n' +
    '| change CTA to gradient | content.ctaStyle | "gradient" |\n' +
    '| change CTA to filled | content.ctaStyle | "filled" |\n' +
    '| change CTA button color | style.buttonBackgroundColor | "#hex" |\n' +
    '| make product image float | content.productTreatment | "floating" |\n' +
    '| frame the product image | content.productTreatment | "framed" |\n' +
    '| heavy product shadow | content.productTreatment | "cutout" |\n' +
    '| make product bigger | (use product-first layout) | content.layout: "product-first" |\n' +
    '| make product smaller | (use text-first layout) | content.layout: "text-first" |\n' +
    '| change badge style | content.badgeStyle | "filled"/"gradient"/"outlined" |\n' +
    '| change headline color | style.headlineColor | "#hex" |\n' +
    '| change all text color | style.textColor | "#hex" |\n' +
    '| change section background | style.backgroundColor | "#hex" |\n' +
    '| add/toggle vignette | content.vignette | true/false |\n' +
    '| change hero height | content.height | "sm"/"md"/"lg"/"xl" |\n' +
    '| change alignment | content.alignment | "left"/"center"/"right" |\n' +
    '| change visual focus | content.visualPriority | "product"/"headline"/"balanced" |\n\n' +
    '### HERO CONTENT FIELDS (ALL that exist):\n' +
    'headline, subheadline, ctaText, ctaLink, alignment, height, badge, layout, heroImage, secondaryCtaText, secondaryCtaLink, visualPriority, backgroundTreatment, vignette, ctaStyle, productTreatment, badgeStyle, headlineSize, heroImages, carouselEnabled, carouselInterval, initialSlide\n\n' +
    '### HERO STYLE FIELDS (ALL that exist):\n' +
    'backgroundColor, textColor, paddingY, paddingX, maxWidth, backgroundImage, overlay, borderRadius, buttonBackgroundColor, buttonTextColor, headlineColor\n\n' +
    // ── FOOTER SEMANTIC MAP ──
    '## FOOTER/SECTION MUTATION MAP\n\n' +
    '| User says | Property | Value |\n' +
    '|---|---|---|\n' +
    '| make footer darker | style.backgroundColor | "#1a1a2e" or dark hex |\n' +
    '| make footer lighter | style.backgroundColor | "#f5f5f5" or light hex |\n' +
    '| change section background | style.backgroundColor | "#hex" |\n' +
    '| change text color | style.textColor | "#hex" |\n' +
    '| change button color | style.buttonBackgroundColor | "#hex" |\n' +
    '| change headline color | style.headlineColor | "#hex" |\n\n' +
    // ── STYLE FIELDS REFERENCE ──
    '## Style Fields Reference\n\n' +
    'Section-level: backgroundColor, textColor, paddingY, paddingX, maxWidth, backgroundImage, overlay, borderRadius\n' +
    'Element-level: buttonBackgroundColor, buttonTextColor, headlineColor\n\n' +
    // ── CRITICAL SAFETY RULES ──
    '## CRITICAL SAFETY RULES\n\n' +
    'RULE 1 — MINIMAL PATCHES: In update-section, ONLY include fields the user asked to change.\n' +
    'RULE 2 — NEVER REGENERATE: Never copy-paste existing content into the operation.\n' +
    'RULE 3 — USE SEMANTIC PROPERTIES: For hero, use the Semantic Mutation Map above. NEVER use generic CSS properties.\n' +
    'RULE 4 — COLOR REQUESTS: Use hex colors. Common: neon=#39ff14, hot pink=#ff1493, royal blue=#4169e1, gold=#ffd700, black=#000000, white=#ffffff.\n' +
    'RULE 5 — SUB-ELEMENT TARGETING: "change button color" uses style.buttonBackgroundColor (NOT backgroundColor!). "change headline color" uses style.headlineColor.\n' +
    'RULE 6 — BACKGROUND DENSITY: "make darker" uses backgroundTreatment for hero ("dramatic"), backgroundColor with dark hex for other sections.\n\n' +
    '## Output Format\n\n' +
    'Return ONLY: {"operations": [...]}\n' +
    'No markdown, no explanation.\n\n' +
    '## COMPLETENESS RULE\n\n' +
    'For multiple requests, generate an operation for EACH. Never skip items.';
}

// ─── No-op filter: strip fields that match existing values ──────
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'string' && typeof b === 'string') {
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
  rejectedFields: string[];
}

function sanitizeOperations(operations: ChatEditOperation[], store: Store): SanitizeResult {
  let strippedFields: string[] = [];
  let rejectedFields: string[] = [];

  // Build section lookup
  let sectionMap = new Map<string, { content: Record<string, unknown>; style: Record<string, unknown>; type: string }>();
  for (let page of store.pages) {
    for (let section of page.sections) {
      sectionMap.set(section.id, {
        content: section.content as Record<string, unknown>,
        style: section.style as Record<string, unknown>,
        type: section.type,
      });
    }
  }

  let sanitized = operations.map(function(op) {
    if (op.type !== 'update-section') return op;

    let payload = op.payload as Record<string, unknown>;
    let sectionId = payload.sectionId as string;
    let existing = sectionMap.get(sectionId);
    if (!existing) return op;

    // ── Renderer verification: reject properties the renderer doesn't consume ──
    let content = payload.content as Record<string, unknown> | undefined;
    let style = payload.style as Record<string, unknown> | undefined;

    let contentFields = content && typeof content === 'object' ? Object.keys(content) : [];
    let styleFields = style && typeof style === 'object' ? Object.keys(style) : [];

    let verification = verifyMutation(existing.type, contentFields, styleFields);

    // Filter out rejected (non-consumed) properties
    if (verification.rejected.length > 0) {
      console.log('[Chat Edit] Rejected non-renderer properties for section ' + sectionId + ':', verification.rejected.join(', '));
      rejectedFields.push(...verification.rejected);

      // Remove rejected content fields
      if (content && typeof content === 'object') {
        let filteredContent: Record<string, unknown> = {};
        for (let key of Object.keys(content)) {
          if (existing.type && verification.valid.includes('content.' + key)) {
            filteredContent[key] = content[key];
          }
        }
        if (Object.keys(filteredContent).length > 0) {
          payload = { ...payload, content: filteredContent };
        } else {
          let pCopy = { ...payload };
          delete pCopy.content;
          payload = pCopy;
        }
      }

      // Remove rejected style fields
      if (style && typeof style === 'object') {
        let filteredStyle: Record<string, unknown> = {};
        for (let skey of Object.keys(style)) {
          if (existing.type && verification.valid.includes('style.' + skey)) {
            filteredStyle[skey] = style[skey];
          }
        }
        if (Object.keys(filteredStyle).length > 0) {
          payload = { ...payload, style: filteredStyle };
        } else {
          let pCopy2 = { ...payload };
          delete pCopy2.style;
          payload = pCopy2;
        }
      }
    }

    // ── No-op filter: strip fields matching existing values ──
    content = payload.content as Record<string, unknown> | undefined;
    style = payload.style as Record<string, unknown> | undefined;

    if (content && typeof content === 'object') {
      let filteredContent: Record<string, unknown> = {};
      for (let key of Object.keys(content)) {
        let newVal = content[key];
        let oldVal = existing.content[key];
        if (valuesEqual(newVal, oldVal)) {
          strippedFields.push('content.' + key + ' (unchanged)');
        } else {
          filteredContent[key] = newVal;
        }
      }
      if (Object.keys(filteredContent).length > 0) {
        payload = { ...payload, content: filteredContent };
      } else {
        let pCopy = { ...payload };
        delete pCopy.content;
        payload = pCopy;
      }
    }

    if (style && typeof style === 'object') {
      let filteredStyle: Record<string, unknown> = {};
      for (let skey of Object.keys(style)) {
        let newStyleVal = style[skey];
        let oldStyleVal = existing.style[skey];
        if (valuesEqual(newStyleVal, oldStyleVal)) {
          strippedFields.push('style.' + skey + ' (unchanged)');
        } else {
          filteredStyle[skey] = newStyleVal;
        }
      }
      if (Object.keys(filteredStyle).length > 0) {
        payload = { ...payload, style: filteredStyle };
      } else {
        let pCopy2 = { ...payload };
        delete pCopy2.style;
        payload = pCopy2;
      }
    }

    return { ...op, payload };
  });

  // Drop empty operations
  let finalOps = sanitized.filter(function(op) {
    if (op.type !== 'update-section') return true;
    let p = op.payload as Record<string, unknown>;
    let hasContent = p.content && typeof p.content === 'object' && Object.keys(p.content).length > 0;
    let hasStyle = p.style && typeof p.style === 'object' && Object.keys(p.style).length > 0;
    if (!hasContent && !hasStyle) {
      strippedFields.push('entire operation (empty after filtering)');
      return false;
    }
    return true;
  });

  return { operations: finalOps, strippedFields, rejectedFields };
}

// ─── Build detailed summary ──────────────────────────────────────
function buildSummary(operations: ChatEditOperation[], strippedFields: string[], rejectedFields: string[]): string {
  if (operations.length === 0) {
    if (rejectedFields.length > 0) {
      return 'The requested changes use properties that are not supported by the renderer. Please try rephrasing your request.';
    }
    if (strippedFields.length > 0) {
      return 'The store already has those exact values. No changes were needed.';
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
        return 'Updated theme: ' + (details.length > 0 ? details.join(', ') : 'misc');
      }
      case 'update-section': {
        let sp = op.payload as Record<string, unknown>;
        let changes: string[] = [];
        if (sp.content && typeof sp.content === 'object') {
          for (let ck of Object.keys(sp.content)) changes.push(ck);
        }
        if (sp.style && typeof sp.style === 'object') {
          for (let sk of Object.keys(sp.style)) changes.push('style.' + sk);
        }
        return 'Updated section: ' + (changes.length > 0 ? changes.join(', ') : 'unknown');
      }
      case 'add-section': return 'Added a section';
      case 'remove-section': return 'Removed a section';
      case 'reorder-sections': return 'Reordered sections';
      case 'update-product': return 'Updated a product';
      case 'add-product': return 'Added a product';
      case 'remove-product': return 'Removed a product';
      case 'add-page': return 'Added a page';
      case 'remove-page': return 'Removed a custom page';
      case 'rename-page': return 'Renamed a page';
      default: return 'Made a change';
    }
  });

  let summary = 'Applied ' + operations.length + ' change' + (operations.length > 1 ? 's' : '') + ': ' + parts.join('; ');

  if (rejectedFields.length > 0) {
    summary += ' (' + rejectedFields.length + ' unsupported field' + (rejectedFields.length > 1 ? 's' : '') + ' ignored)';
  }

  return summary;
}

// ─── POST handler ───────────────────────────────────────
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
      return NextResponse.json({ error: 'A non-empty message field is required.' }, { status: 400 });
    }
    if (!store || !store.id || !store.name || !store.theme || !Array.isArray(store.pages)) {
      return NextResponse.json({ error: 'A valid store object is required.' }, { status: 400 });
    }

    const systemPrompt = buildChatSystemPrompt(store);

    const messages: Array<{ role: 'assistant' | 'user'; content: string }> = [];
    const recentHistory = (history || []).slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user') messages.push({ role: 'user', content: msg.content });
      else if (msg.role === 'assistant' && msg.content) messages.push({ role: 'assistant', content: msg.content });
    }
    messages.push({ role: 'user', content: message.trim() });

    const result = await executeAI('chat-edit', messages, {
      systemPrompt,
      timeout: 30_000,
      responseFormat: 'json_object',
    });

    if (!result.success || !result.content) {
      return NextResponse.json({ message: "I'm having trouble right now. Please try again in a moment.", operations: [] });
    }

    // Parse operations
    let aiContent = result.content;
    try {
      const parsed = JSON.parse(aiContent);
      if (!Array.isArray(parsed)) {
        if (parsed.operations && Array.isArray(parsed.operations)) aiContent = JSON.stringify(parsed.operations);
        else if (parsed.changes && Array.isArray(parsed.changes)) aiContent = JSON.stringify(parsed.changes);
        else {
          const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
          if (arrayKey) aiContent = JSON.stringify(parsed[arrayKey]);
        }
      }
    } catch { /* continue */ }

    let jsonStr = extractJSON(aiContent);
    let operations: ChatEditOperation[];
    try {
      operations = JSON.parse(jsonStr) as ChatEditOperation[];
    } catch {
      try {
        operations = JSON.parse(repairJSON(jsonStr)) as ChatEditOperation[];
      } catch {
        return NextResponse.json({ message: 'I understood your request but had trouble applying the changes. Please try rephrasing.', operations: [] }, { status: 200 });
      }
    }

    if (!Array.isArray(operations)) {
      return NextResponse.json({ message: 'I understood your request but had trouble applying changes. Please try rephrasing.', operations: [] });
    }
    for (const op of operations) {
      if (!op.type || !op.payload) {
        return NextResponse.json({ message: 'Some changes could not be applied. Please try again.', operations: [] });
      }
    }

    // ── THREE-LAYER FILTERING ──
    console.log('[Chat Edit] Raw operations:', operations.length);
    const { operations: sanitized, strippedFields, rejectedFields } = sanitizeOperations(operations, store);
    console.log('[Chat Edit] After filtering:', sanitized.length, '(stripped:', strippedFields.length, ', rejected:', rejectedFields.length, ')');

    const summary = buildSummary(sanitized, strippedFields, rejectedFields);
    return NextResponse.json({ message: summary, operations: sanitized });
  } catch (err: unknown) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Chat Edit] Unexpected error:', msg);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
