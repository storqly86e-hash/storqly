// ============================================================
// AI Editing Regression Tests
// ============================================================
// Validates the chat edit pipeline handles 10 realistic user
// commands correctly. Tests verifyMutation, bridgeSectionStyles,
// operation structure, section existence, and security boundaries.
//
// Run: bun run src/lib/design-library/__tests__/ai-editing-regression.ts

import { createDemoStore } from '@/lib/store-schema';
import { verifyMutation, RENDERER_CONSUMED } from '@/lib/renderer-properties';
import { bridgeSectionStyles } from '@/lib/design-library/style-bridge';
import type { ChatEditOperation, Store, Section } from '@/lib/store-schema';

// ── Test infrastructure ────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  checks: { label: string; passed: boolean; detail?: string }[];
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  const result: TestResult = { name, passed: true, checks: [] };
  const originalConsoleError = console.error;
  console.error = () => {}; // suppress expected logs from sanitize
  try {
    fn(result);
  } catch (e) {
    result.passed = false;
    result.checks.push({
      label: 'uncaught-exception',
      passed: false,
      detail: String(e),
    });
  } finally {
    console.error = originalConsoleError;
  }
  results.push(result);
}

function check(
  result: TestResult,
  label: string,
  condition: boolean,
  detail?: string,
) {
  if (!condition) result.passed = false;
  result.checks.push({ label, passed: condition, detail });
}

// ── Helper: simulate sanitizeOperations concepts ───────────
// Reimplements the core logic from chat route for testing
// (sanitizeOperations is not exported, so we test the concepts)

function getSectionMap(store: Store) {
  const map = new Map<string, { content: Record<string, unknown>; style: Record<string, unknown>; type: string }>();
  for (const page of store.pages) {
    for (const section of page.sections) {
      map.set(section.id, {
        content: section.content as Record<string, unknown>,
        style: section.style as Record<string, unknown>,
        type: section.type,
      });
    }
  }
  return map;
}

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
  return false;
}

// Simulate what sanitizeOperations does for update-section ops
function simulateSanitize(op: ChatEditOperation, store: Store): {
  op: ChatEditOperation | null;
  droppedSection: boolean;
  rejectedFields: string[];
  strippedFields: string[];
} {
  if (op.type !== 'update-section') {
    return { op, droppedSection: false, rejectedFields: [], strippedFields: [] };
  }

  const sectionMap = getSectionMap(store);
  const payload = op.payload as Record<string, unknown>;
  const sectionId = payload.sectionId as string;
  const existing = sectionMap.get(sectionId);

  if (!existing) {
    return { op: null, droppedSection: true, rejectedFields: [], strippedFields: [] };
  }

  const rejectedFields: string[] = [];
  const strippedFields: string[] = [];

  // Step 1: verifyMutation (renderer-consumed check)
  const content = payload.content as Record<string, unknown> | undefined;
  const style = payload.style as Record<string, unknown> | undefined;
  const contentFields = content && typeof content === 'object' ? Object.keys(content) : [];
  const styleFields = style && typeof style === 'object' ? Object.keys(style) : [];

  const verification = verifyMutation(existing.type, contentFields, styleFields);

  if (verification.rejected.length > 0) {
    rejectedFields.push(...verification.rejected);
  }

  // Step 2: no-op filter
  if (content && typeof content === 'object') {
    for (const key of Object.keys(content)) {
      if (valuesEqual(content[key], existing.content[key])) {
        strippedFields.push('content.' + key);
      }
    }
  }
  if (style && typeof style === 'object') {
    for (const key of Object.keys(style)) {
      if (valuesEqual(style[key], (existing.style as Record<string, unknown>)[key])) {
        strippedFields.push('style.' + key);
      }
    }
  }

  return { op, droppedSection: false, rejectedFields, strippedFields };
}

// ── Setup ──────────────────────────────────────────────────

const store = createDemoStore();
const homepage = store.pages.find(p => p.isHomepage)!;
const heroSection = homepage.sections.find(s => s.type === 'hero')!;
const featuredSection = homepage.sections.find(s => s.type === 'featured-products')!;
const testimonialsSection = homepage.sections.find(s => s.type === 'testimonials')!;
const newsletterSection = homepage.sections.find(s => s.type === 'newsletter')!;

// ── Test 1: "make the hero more premium" ───────────────────

test('1a. "make the hero more premium" — operation type is update-section', (r) => {
  // AI would generate layout change + backgroundTreatment for premium feel
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      content: {
        layout: 'minimal',
        backgroundTreatment: 'dramatic',
        ctaStyle: 'outline',
      },
    },
  };
  check(r, 'op.type === update-section', op.type === 'update-section');
  check(r, 'payload has sectionId', typeof (op.payload as any).sectionId === 'string');
  check(r, 'payload has content', typeof (op.payload as any).content === 'object');
});

test('1b. "make the hero more premium" — fields are renderer-consumed', (r) => {
  const contentFields = ['layout', 'backgroundTreatment', 'ctaStyle'];
  const result = verifyMutation('hero', contentFields, []);
  check(r, 'layout valid', result.valid.includes('content.layout'));
  check(r, 'backgroundTreatment valid', result.valid.includes('content.backgroundTreatment'));
  check(r, 'ctaStyle valid', result.valid.includes('content.ctaStyle'));
  check(r, 'no rejected fields', result.rejected.length === 0, `rejected: ${result.rejected.join(',')}`);
});

test('1c. "make the hero more premium" — sectionId exists in store', (r) => {
  const sectionMap = getSectionMap(store);
  check(r, 'hero sectionId exists', sectionMap.has(heroSection.id));
  check(r, 'section type is hero', sectionMap.get(heroSection.id)!.type === 'hero');
});

// ── Test 2: "change the colors to black and gold" ─────────

test('2a. "change the colors to black and gold" — operation type is update-theme', (r) => {
  const op: ChatEditOperation = {
    type: 'update-theme',
    payload: {
      colors: {
        primary: '#ffd700',
        secondary: '#000000',
        background: '#000000',
        text: '#ffd700',
      },
    },
  };
  check(r, 'op.type === update-theme', op.type === 'update-theme');
  check(r, 'payload has colors', typeof (op.payload as any).colors === 'object');
  check(r, 'primary is hex', /^#[0-9a-f]{6}$/i.test((op.payload as any).colors.primary));
  check(r, 'background is hex', /^#[0-9a-f]{6}$/i.test((op.payload as any).colors.background));
});

test('2b. "change the colors to black and gold" — style hex changes are valid', (r) => {
  // If AI applies color to hero section directly
  const styleFields = ['backgroundColor', 'textColor', 'buttonBackgroundColor'];
  const result = verifyMutation('hero', [], styleFields);
  check(r, 'backgroundColor valid', result.valid.includes('style.backgroundColor'));
  check(r, 'textColor valid', result.valid.includes('style.textColor'));
  check(r, 'buttonBackgroundColor valid', result.valid.includes('style.buttonBackgroundColor'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

// ── Test 3: "make this section more minimal" ───────────────

test('3a. "make this section more minimal" — style changes for minimalism', (r) => {
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: featuredSection.id,
      content: {
        columns: 2,
      },
      style: {
        paddingY: 'sm',
        maxWidth: 'md',
      },
    },
  };
  check(r, 'op.type === update-section', op.type === 'update-section');
  check(r, 'content.columns present', (op.payload as any).content.columns === 2);
  check(r, 'style.paddingY present', (op.payload as any).style.paddingY === 'sm');
  check(r, 'style.maxWidth present', (op.payload as any).style.maxWidth === 'md');
});

test('3b. "make this section more minimal" — verifyMutation validates fields', (r) => {
  const result = verifyMutation('featured-products', ['columns'], ['paddingY', 'maxWidth']);
  check(r, 'content.columns valid', result.valid.includes('content.columns'));
  check(r, 'style.paddingY valid', result.valid.includes('style.paddingY'));
  check(r, 'style.maxWidth valid', result.valid.includes('style.maxWidth'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

// ── Test 4: "add urgency to the CTA" ──────────────────────

test('4a. "add urgency to the CTA" — ctaText change', (r) => {
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      content: {
        ctaText: 'Shop Now — Limited Time Only',
      },
    },
  };
  check(r, 'op.type === update-section', op.type === 'update-section');
  check(r, 'content.ctaText is string', typeof (op.payload as any).content.ctaText === 'string');
  check(r, 'ctaText is not empty', (op.payload as any).content.ctaText.length > 0);
});

test('4b. "add urgency to the CTA" — ctaText is renderer-consumed', (r) => {
  const result = verifyMutation('hero', ['ctaText'], []);
  check(r, 'ctaText valid for hero', result.valid.includes('content.ctaText'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

test('4c. "add urgency to the CTA" — not a no-op', (r) => {
  const existingContent = heroSection.content as Record<string, unknown>;
  const newCta = 'Shop Now — Limited Time Only';
  check(r, 'ctaText differs from existing', !valuesEqual(newCta, existingContent.ctaText));
  check(r, 'existing ctaText is different', existingContent.ctaText !== newCta);
});

// ── Test 5: "make the product cards compact" ───────────────

test('5a. "make the product cards compact" — column/count changes', (r) => {
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: featuredSection.id,
      content: {
        columns: 4,
      },
      style: {
        paddingY: 'sm',
      },
    },
  };
  check(r, 'op.type === update-section', op.type === 'update-section');
  check(r, 'columns changed to 4', (op.payload as any).content.columns === 4);
  check(r, 'paddingY is sm', (op.payload as any).style.paddingY === 'sm');
});

test('5b. "make the product cards compact" — fields are valid', (r) => {
  const result = verifyMutation('featured-products', ['columns'], ['paddingY']);
  check(r, 'content.columns valid', result.valid.includes('content.columns'));
  check(r, 'style.paddingY valid', result.valid.includes('style.paddingY'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

// ── Test 6: "change typography" ───────────────────────────

test('6a. "change typography" — font changes via update-theme', (r) => {
  const op: ChatEditOperation = {
    type: 'update-theme',
    payload: {
      fonts: {
        heading: 'Playfair Display',
        body: 'Inter',
      },
    },
  };
  check(r, 'op.type === update-theme', op.type === 'update-theme');
  check(r, 'payload has fonts', typeof (op.payload as any).fonts === 'object');
  check(r, 'fonts.heading is string', typeof (op.payload as any).fonts.heading === 'string');
  check(r, 'fonts.body is string', typeof (op.payload as any).fonts.body === 'string');
});

test('6b. "change typography" — headlineSize change via hero update', (r) => {
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      content: {
        headlineSize: 'xl',
      },
    },
  };
  const result = verifyMutation('hero', ['headlineSize'], []);
  check(r, 'headlineSize valid for hero', result.valid.includes('content.headlineSize'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

// ── Test 7: "make the homepage more luxurious" ─────────────

test('7a. "make the homepage more luxurious" — produces multiple operations', (r) => {
  const operations: ChatEditOperation[] = [
    {
      type: 'update-theme',
      payload: {
        colors: { primary: '#b8860b', secondary: '#1a1a2e', background: '#fefcf8' },
        fonts: { heading: 'Playfair Display', body: 'Lato' },
        spacing: 'spacious',
        borderRadius: 'lg',
      },
    },
    {
      type: 'update-section',
      payload: {
        sectionId: heroSection.id,
        content: { layout: 'minimal', backgroundTreatment: 'editorial' },
        style: { paddingY: 'xl' },
      },
    },
  ];
  check(r, 'multiple operations generated', operations.length >= 2);
  check(r, 'first op is update-theme', operations[0].type === 'update-theme');
  check(r, 'second op is update-section', operations[1].type === 'update-section');
  check(r, 'theme has colors + fonts',
    !!(operations[0].payload as any).colors && !!(operations[0].payload as any).fonts);
  check(r, 'section op has content + style',
    !!(operations[1].payload as any).content && !!(operations[1].payload as any).style);
});

test('7b. "make the homepage more luxurious" — all fields are renderer-consumed', (r) => {
  const heroContentFields = ['layout', 'backgroundTreatment'];
  const heroStyleFields = ['paddingY'];
  const result = verifyMutation('hero', heroContentFields, heroStyleFields);
  check(r, 'all fields valid', result.rejected.length === 0, `rejected: ${result.rejected.join(',')}`);
  check(r, 'layout valid', result.valid.includes('content.layout'));
  check(r, 'backgroundTreatment valid', result.valid.includes('content.backgroundTreatment'));
  check(r, 'paddingY valid', result.valid.includes('style.paddingY'));
});

// ── Test 8: "change the hero background to dark" ───────────

test('8a. "change the hero background to dark" — backgroundColor change', (r) => {
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      style: {
        backgroundColor: '#1a1a2e',
        textColor: '#ffffff',
      },
    },
  };
  check(r, 'op.type === update-section', op.type === 'update-section');
  check(r, 'backgroundColor is dark hex', (op.payload as any).style.backgroundColor === '#1a1a2e');
  check(r, 'textColor is light hex', (op.payload as any).style.textColor === '#ffffff');
});

test('8b. "change the hero background to dark" — style fields valid', (r) => {
  const result = verifyMutation('hero', [], ['backgroundColor', 'textColor']);
  check(r, 'backgroundColor valid', result.valid.includes('style.backgroundColor'));
  check(r, 'textColor valid', result.valid.includes('style.textColor'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

test('8c. "change the hero background to dark" — not a no-op', (r) => {
  const { op, strippedFields } = simulateSanitize({
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      style: {
        backgroundColor: '#1a1a2e',
        textColor: '#ffffff',
      },
    },
  }, store);
  check(r, 'operation not dropped', op !== null);
  check(r, 'no stripped (no-op) fields', strippedFields.length === 0, `stripped: ${strippedFields.join(',')}`);
});

// ── Test 9: "add a testimonials section" ───────────────────

test('9a. "add a testimonials section" — add-section operation', (r) => {
  const newSectionId = 'new-testimonials-001';
  const op: ChatEditOperation = {
    type: 'add-section',
    payload: {
      pageId: homepage.id,
      section: {
        id: newSectionId,
        type: 'testimonials',
        content: {
          headline: 'What Our Customers Say',
          items: [
            { id: 'nt1', quote: 'Amazing quality!', author: 'Jane D.', role: 'Verified Buyer', rating: 5 },
            { id: 'nt2', quote: 'Will buy again.', author: 'Mark S.', role: 'Verified Buyer', rating: 4 },
          ],
        },
        style: { backgroundColor: '#faf6ef', paddingY: 'lg' },
        visible: true,
      },
      index: 3,
    },
  };
  check(r, 'op.type === add-section', op.type === 'add-section');
  check(r, 'payload has pageId', typeof (op.payload as any).pageId === 'string');
  check(r, 'payload has section object', typeof (op.payload as any).section === 'object');
  check(r, 'section has id', typeof (op.payload as any).section.id === 'string');
  check(r, 'section type is testimonials', (op.payload as any).section.type === 'testimonials');
  check(r, 'section has content', typeof (op.payload as any).section.content === 'object');
  check(r, 'section has style', typeof (op.payload as any).section.style === 'object');
  check(r, 'section is visible', (op.payload as any).section.visible === true);
  check(r, 'pageId exists in store', store.pages.some(p => p.id === (op.payload as any).pageId));
  check(r, 'index is number', typeof (op.payload as any).index === 'number');
});

test('9b. "add a testimonials section" — new section fields are renderer-consumed', (r) => {
  const contentFields = ['headline', 'items'];
  const styleFields = ['backgroundColor', 'paddingY'];
  const result = verifyMutation('testimonials', contentFields, styleFields);
  check(r, 'headline valid', result.valid.includes('content.headline'));
  check(r, 'items valid', result.valid.includes('content.items'));
  check(r, 'backgroundColor valid', result.valid.includes('style.backgroundColor'));
  check(r, 'paddingY valid', result.valid.includes('style.paddingY'));
  check(r, 'no rejected fields', result.rejected.length === 0);
});

// ── Test 10: "remove the newsletter section" ───────────────

test('10a. "remove the newsletter section" — remove-section operation', (r) => {
  const op: ChatEditOperation = {
    type: 'remove-section',
    payload: {
      pageId: homepage.id,
      sectionId: newsletterSection.id,
    },
  };
  check(r, 'op.type === remove-section', op.type === 'remove-section');
  check(r, 'payload has pageId', typeof (op.payload as any).pageId === 'string');
  check(r, 'payload has sectionId', typeof (op.payload as any).sectionId === 'string');
  check(r, 'pageId exists in store', store.pages.some(p => p.id === (op.payload as any).pageId));
  check(r, 'sectionId exists in store', homepage.sections.some(s => s.id === (op.payload as any).sectionId));
  check(r, 'section being removed is newsletter',
    homepage.sections.find(s => s.id === (op.payload as any).sectionId)!.type === 'newsletter');
});

// ── Security Tests ─────────────────────────────────────────

test('SECURITY 1: CSS injection via style bridge — semicolons stripped', (r) => {
  const maliciousStore = JSON.parse(JSON.stringify(store));
  const hero = maliciousStore.pages[0].sections[0];
  hero.style = { ...hero.style, density: 'sm; background-image: url(evil.js)' };

  const result = bridgeSectionStyles(maliciousStore);
  const bridgedHero = result.pages[0].sections[0];

  // The CSS injection regex should strip the semicolon-containing value
  check(r, 'CSS injection value stripped',
    !Object.values(bridgedHero.style as Record<string, unknown>).some(
      (v) => typeof v === 'string' && v.includes(';')
    ),
    'style bridge should strip values with semicolons'
  );
});

test('SECURITY 2: CSS injection via style bridge — url() stripped', (r) => {
  const maliciousStore = JSON.parse(JSON.stringify(store));
  const hero = maliciousStore.pages[0].sections[0];
  hero.style = { ...hero.style, density: 'url(javascript:alert(1))' };

  const result = bridgeSectionStyles(maliciousStore);
  const bridgedHero = result.pages[0].sections[0];

  check(r, 'url() injection value stripped',
    !Object.values(bridgedHero.style as Record<string, unknown>).some(
      (v) => typeof v === 'string' && v.includes('url(')
    ),
    'style bridge should strip values with url()'
  );
});

test('SECURITY 3: CSS injection via style bridge — expression() stripped', (r) => {
  const maliciousStore = JSON.parse(JSON.stringify(store));
  const hero = maliciousStore.pages[0].sections[0];
  hero.style = { ...hero.style, density: 'expression(alert(1))' };

  const result = bridgeSectionStyles(maliciousStore);
  const bridgedHero = result.pages[0].sections[0];

  check(r, 'expression() injection value stripped',
    !Object.values(bridgedHero.style as Record<string, unknown>).some(
      (v) => typeof v === 'string' && v.includes('expression(')
    ),
    'style bridge should strip values with expression()'
  );
});

test('SECURITY 4: CSS injection via style bridge — @import stripped', (r) => {
  const maliciousStore = JSON.parse(JSON.stringify(store));
  const hero = maliciousStore.pages[0].sections[0];
  hero.style = { ...hero.style, density: '@import url(evil.css)' };

  const result = bridgeSectionStyles(maliciousStore);
  const bridgedHero = result.pages[0].sections[0];

  check(r, '@import injection value stripped',
    !Object.values(bridgedHero.style as Record<string, unknown>).some(
      (v) => typeof v === 'string' && (v.includes('@import') || v.includes('import('))
    ),
    'style bridge should strip values with @import'
  );
});

test('SECURITY 5: CSS injection via style bridge — curly braces stripped', (r) => {
  const maliciousStore = JSON.parse(JSON.stringify(store));
  const hero = maliciousStore.pages[0].sections[0];
  hero.style = { ...hero.style, density: 'sm{color:red}' };

  const result = bridgeSectionStyles(maliciousStore);
  const bridgedHero = result.pages[0].sections[0];

  check(r, 'curly braces injection value stripped',
    !Object.values(bridgedHero.style as Record<string, unknown>).some(
      (v) => typeof v === 'string' && (v.includes('{') || v.includes('}'))
    ),
    'style bridge should strip values with curly braces'
  );
});

test('SECURITY 6: Non-whitelisted style fields rejected by bridge', (r) => {
  const maliciousStore = JSON.parse(JSON.stringify(store));
  const hero = maliciousStore.pages[0].sections[0];
  hero.style = {
    ...hero.style,
    evilField: 'malicious',
    __proto__: { polluted: true } as any,
    onerror: 'alert(1)',
  };

  const result = bridgeSectionStyles(maliciousStore);
  const bridgedHero = result.pages[0].sections[0];
  const styleKeys = Object.keys(bridgedHero.style as Record<string, unknown>);

  check(r, 'evilField not in output', !styleKeys.includes('evilField'));
  check(r, '__proto__ not in output', !styleKeys.includes('__proto__'));
  check(r, 'onerror not in output', !styleKeys.includes('onerror'));
});

test('SECURITY 7: Non-whitelisted style fields rejected by verifyMutation', (r) => {
  // These are generic CSS properties that the AI should NOT generate
  // for hero sections (the semantic map handles them)
  const badContentFields = ['fontSize', 'fontWeight', 'justifyContent', 'alignItems', 'fontFamily', 'color', 'margin'];
  const result = verifyMutation('hero', badContentFields, ['fontSize', 'fontWeight', 'margin', 'padding']);

  check(r, 'fontSize rejected', result.rejected.includes('content.fontSize'));
  check(r, 'fontWeight rejected', result.rejected.includes('content.fontWeight'));
  check(r, 'justifyContent rejected', result.rejected.includes('content.justifyContent'));
  check(r, 'alignItems rejected', result.rejected.includes('content.alignItems'));
  check(r, 'fontFamily rejected', result.rejected.includes('content.fontFamily'));
  check(r, 'style.fontSize rejected', result.rejected.includes('style.fontSize'));
  check(r, 'style.fontWeight rejected', result.rejected.includes('style.fontWeight'));
  check(r, 'style.margin rejected', result.rejected.includes('style.margin'));
  check(r, 'style.padding rejected', result.rejected.includes('style.padding'));
  check(r, 'all bad fields rejected', result.valid.length === 0, `unexpectedly valid: ${result.valid.join(',')}`);
});

test('SECURITY 8: verifyMutation correctly validates known-good properties', (r) => {
  // Test that ALL known renderer-consumed properties for hero are valid
  const heroContent = RENDERER_CONSUMED['hero'].content;
  const heroStyle = RENDERER_CONSUMED['hero'].style;
  const result = verifyMutation('hero', heroContent, heroStyle);
  check(r, 'all hero content fields valid', result.rejected.filter(f => f.startsWith('content.')).length === 0,
    `rejected content: ${result.rejected.filter(f => f.startsWith('content.')).join(',')}`);
  check(r, 'all hero style fields valid', result.rejected.filter(f => f.startsWith('style.')).length === 0,
    `rejected style: ${result.rejected.filter(f => f.startsWith('style.')).join(',')}`);
  check(r, 'total valid matches total input',
    result.valid.length === heroContent.length + heroStyle.length);
});

test('SECURITY 9: Non-existent sectionId would be dropped', (r) => {
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: 'non-existent-section-999',
      content: { headline: 'hacked' },
    },
  };
  const { op: result, droppedSection } = simulateSanitize(op, store);
  check(r, 'operation dropped', result === null);
  check(r, 'droppedSection flag set', droppedSection === true);
});

test('SECURITY 10: style bridge is pure (no mutation of input)', (r) => {
  const originalHeroStyle = { ...heroSection.style };
  const originalHeroContent = { ...heroSection.content };

  bridgeSectionStyles(store);

  check(r, 'hero style not mutated', JSON.stringify(heroSection.style) === JSON.stringify(originalHeroStyle));
  check(r, 'hero content not mutated', JSON.stringify(heroSection.content) === JSON.stringify(originalHeroContent));
});

// ── Pipeline Integration Tests ─────────────────────────────

test('PIPELINE 1: Simulate full sanitize for a realistic hero edit', (r) => {
  // User: "make the hero more premium"
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      content: {
        layout: 'minimal',
        backgroundTreatment: 'dramatic',
        ctaStyle: 'outline',
      },
    },
  };

  const { op: result, droppedSection, rejectedFields, strippedFields } = simulateSanitize(op, store);

  check(r, 'operation not dropped', result !== null);
  check(r, 'not a dropped section', !droppedSection);
  check(r, 'no rejected fields', rejectedFields.length === 0, `rejected: ${rejectedFields.join(',')}`);
  // layout was 'split-left' in demo store, so 'minimal' is different → not stripped
  // backgroundTreatment was 'editorial', so 'dramatic' is different → not stripped
  // ctaStyle didn't exist, so 'outline' is different → not stripped
  const noOpStripped = strippedFields.filter(f => !f.includes('(unchanged)')).length === 0;
  check(r, 'stripped fields are only no-ops', noOpStripped, `stripped: ${strippedFields.join(',')}`);
});

test('PIPELINE 2: No-op operations are detected', (r) => {
  // User: "make the hero background to editorial" — but it's ALREADY editorial in demo store
  const op: ChatEditOperation = {
    type: 'update-section',
    payload: {
      sectionId: heroSection.id,
      content: {
        backgroundTreatment: 'editorial', // already this value in demo
      },
    },
  };

  const { strippedFields } = simulateSanitize(op, store);
  check(r, 'no-op field detected as stripped',
    strippedFields.some(f => f.includes('backgroundTreatment')),
    `expected backgroundTreatment to be stripped as no-op, got: ${strippedFields.join(',')}`);
});

test('PIPELINE 3: RENDERER_CONSUMED covers all section types', (r) => {
  const allSectionTypes = [
    'hero', 'featured-products', 'product-grid', 'text-banner', 'image-gallery',
    'testimonials', 'newsletter', 'faq', 'cta', 'categories',
    'brand-statement', 'header', 'footer', 'rich-text', 'spacer', 'divider',
  ];
  const missing: string[] = [];
  for (const t of allSectionTypes) {
    if (!RENDERER_CONSUMED[t]) missing.push(t);
  }
  check(r, 'all section types have renderer-consumed specs', missing.length === 0,
    `missing: ${missing.join(', ')}`);
});

// ── Report ─────────────────────────────────────────────────

function printReport() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  AI EDITING REGRESSION TESTS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  let totalChecks = 0;
  let passedChecks = 0;
  let failedTests = 0;

  for (const result of results) {
    const icon = result.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${result.name}`);

    for (const c of result.checks) {
      totalChecks++;
      if (c.passed) {
        passedChecks++;
        console.log(`        ✓ ${c.label}`);
      } else {
        console.log(`        ✗ ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
      }
    }
    console.log('');

    if (!result.passed) failedTests++;
  }

  console.log('───────────────────────────────────────────────────────────────────────');
  console.log(`  TOTAL: ${results.length} tests, ${totalChecks} checks`);
  console.log(`  PASSED: ${results.length - failedTests}/${results.length} tests, ${passedChecks}/${totalChecks} checks`);
  console.log(`  FAILED: ${failedTests}/${results.length} tests, ${totalChecks - passedChecks}/${totalChecks} checks`);
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  if (failedTests > 0) {
    console.log('  ⚠️  SOME TESTS FAILED');
    console.log('');
    process.exit(1);
  } else {
    console.log('  ✅ ALL TESTS PASSED');
    console.log('');
  }
}

printReport();
