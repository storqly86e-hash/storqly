// ========================================
// AI Style Bridge for Storqly
// ========================================
// Bridges AI-generated section.style fields into renderer-consumable
// section.content and section.style fields.
//
// The AI outputs high-level design tokens (typographySystem, density,
// contentAlignment, etc.) that the renderer doesn't know about. This
// module translates those tokens into the concrete fields the renderer
// expects, without overwriting values the AI already placed in content.

import type { Store, Section } from '@/lib/store-schema';

// ── Helpers ─────────────────────────────────────────────────

/** Read a value from style (any key) without TypeScript complaints. */
function src(style: Record<string, unknown>, key: string): unknown {
  return (style as any)[key];
}

/** Set a value on content only if not already present. */
function setContent(
  content: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (content[key] === undefined) {
    (content as any)[key] = value;
  }
}

/** Set a value on style only if not already present. */
function setStyle(
  style: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if ((style as any)[key] === undefined) {
    (style as any)[key] = value;
  }
}

// ── Per-section-type bridges ─────────────────────────────────

function bridgeHero(s: Section): void {
  const { style, content } = s;

  // typographySystem → content.headingFont
  const typo = src(style, 'typographySystem') as string | undefined;
  if (typo) {
    const font = typo.toLowerCase().includes('serif') ? 'serif' : 'sans';
    setContent(content, 'headingFont', font);
  }

  // contentAlignment → content.alignment
  const align = src(style, 'contentAlignment') as string | undefined;
  if (align) {
    setContent(content, 'alignment', align);
  }

  // density → style.paddingY
  const density = src(style, 'density') as string | undefined;
  if (density) {
    const padMap: Record<string, string> = { airy: 'xl', compact: 'sm' };
    const pad = padMap[density];
    if (pad) setStyle(style, 'paddingY', pad);
  }

  // sectionHeight → content.height
  const height = src(style, 'sectionHeight') as string | undefined;
  if (height) {
    setContent(content, 'height', height);
  }

  // vignetteStrength → content.vignette
  const vignette = src(style, 'vignetteStrength') as string | undefined;
  if (vignette) {
    setContent(content, 'vignette', vignette === 'medium' || vignette === 'high');
  }

  // productScale → content.productTreatment
  const productScale = src(style, 'productScale') as string | undefined;
  if (productScale) {
    const treatmentMap: Record<string, string> = {
      medium: 'floating',
      large: 'featured',
    };
    const treatment = treatmentMap[productScale];
    if (treatment) setContent(content, 'productTreatment', treatment);
  }
}

function bridgeProductGrid(s: Section): void {
  const { style, content } = s;

  // columnCount → content.columns
  const cols = src(style, 'columnCount') as number | undefined;
  if (cols) {
    setContent(content, 'columns', cols);
  }

  // headingAlignment → style.headingAlignment (direct access for renderer)
  const headingAlign = src(style, 'headingAlignment') as string | undefined;
  if (headingAlign) {
    setStyle(style, 'headingAlignment', headingAlign);
  }

  // sectionSpacing → style.paddingY
  const spacing = src(style, 'sectionSpacing') as string | undefined;
  if (spacing) {
    const padMap: Record<string, string> = { spacious: 'xl', compact: 'sm' };
    const pad = padMap[spacing];
    if (pad) setStyle(style, 'paddingY', pad);
  }

  // cardVariant → style.cardVariant (informative; variant resolver handles)
  const cardVariant = src(style, 'cardVariant') as string | undefined;
  if (cardVariant) {
    setStyle(style, 'cardVariant', cardVariant);
  }
}

function bridgeTestimonials(s: Section): void {
  const { style } = s;

  const fields = ['quoteScale', 'cardMode', 'attributionStyle', 'dividerMode'] as const;
  for (const f of fields) {
    const v = src(style, f);
    if (v) setStyle(style, f, v);
  }
}

function bridgeCta(s: Section): void {
  const { style, content } = s;

  // typeScale → style.typeScale
  const typeScale = src(style, 'typeScale') as string | undefined;
  if (typeScale) {
    setStyle(style, 'typeScale', typeScale);
  }

  // sectionSpacing → style.paddingY
  const spacing = src(style, 'sectionSpacing') as string | undefined;
  if (spacing) {
    const padMap: Record<string, string> = { spacious: 'xl', compact: 'sm' };
    const pad = padMap[spacing];
    if (pad) setStyle(style, 'paddingY', pad);
  }

  // alignment → content.alignment
  const align = src(style, 'alignment') as string | undefined;
  if (align) {
    setContent(content, 'alignment', align);
  }
}

function bridgeNewsletter(s: Section): void {
  const { style, content } = s;

  // typePairing → style.typePairing
  const typePairing = src(style, 'typePairing') as string | undefined;
  if (typePairing) {
    setStyle(style, 'typePairing', typePairing);
  }

  // inputStyle → style.inputStyle
  const inputStyle = src(style, 'inputStyle') as string | undefined;
  if (inputStyle) {
    setStyle(style, 'inputStyle', inputStyle);
  }

  // sectionSpacing → style.paddingY
  const spacing = src(style, 'sectionSpacing') as string | undefined;
  if (spacing) {
    const padMap: Record<string, string> = { spacious: 'xl', compact: 'sm' };
    const pad = padMap[spacing];
    if (pad) setStyle(style, 'paddingY', pad);
  }

  // alignment → content.alignment
  const align = src(style, 'alignment') as string | undefined;
  if (align) {
    setContent(content, 'alignment', align);
  }
}

function bridgeBrandStatement(s: Section): void {
  const { style } = s;

  const fields = ['splitRatio', 'typePairing', 'copyMeasure', 'captionStyle', 'imageRatio'] as const;
  for (const f of fields) {
    const v = src(style, f);
    if (v) setStyle(style, f, v);
  }
}

function bridgeImageGallery(s: Section): void {
  const { style, content } = s;

  // masonryPattern → style.masonryPattern
  const masonry = src(style, 'masonryPattern') as string | undefined;
  if (masonry) {
    setStyle(style, 'masonryPattern', masonry);
  }

  // anchorSize → style.anchorSize
  const anchorSize = src(style, 'anchorSize') as string | undefined;
  if (anchorSize) {
    setStyle(style, 'anchorSize', anchorSize);
  }

  // gap → content.gap
  const gap = src(style, 'gap') as string | undefined;
  if (gap) {
    setContent(content, 'gap', gap);
  }

  // captionStyle → style.captionStyle
  const captionStyle = src(style, 'captionStyle') as string | undefined;
  if (captionStyle) {
    setStyle(style, 'captionStyle', captionStyle);
  }

  // columns → content.columns
  const cols = src(style, 'columns') as number | undefined;
  if (cols) {
    setContent(content, 'columns', cols);
  }
}

function bridgeFaq(s: Section): void {
  const { style } = s;

  // indexStyle → style.indexStyle
  const indexStyle = src(style, 'indexStyle') as string | undefined;
  if (indexStyle) {
    setStyle(style, 'indexStyle', indexStyle);
  }

  // numberStyle → style.numberStyle
  const numberStyle = src(style, 'numberStyle') as string | undefined;
  if (numberStyle) {
    setStyle(style, 'numberStyle', numberStyle);
  }

  // columns → style.columns
  const cols = src(style, 'columns') as number | undefined;
  if (cols) {
    setStyle(style, 'columns', cols);
  }

  // dividerMode → style.dividerMode
  const dividerMode = src(style, 'dividerMode') as string | undefined;
  if (dividerMode) {
    setStyle(style, 'dividerMode', dividerMode);
  }
}

function bridgeTextBanner(s: Section): void {
  const { style, content } = s;

  // size → content.size
  const size = src(style, 'size') as string | undefined;
  if (size) {
    setContent(content, 'size', size);
  }

  // alignment → content.alignment
  const align = src(style, 'alignment') as string | undefined;
  if (align) {
    setContent(content, 'alignment', align);
  }
}

function bridgeHeader(s: Section): void {
  const { style } = s;

  const fields = ['logoScale', 'headerHeight', 'borderMode', 'surface', 'navSpacing'] as const;
  for (const f of fields) {
    const v = src(style, f);
    if (v) setStyle(style, f, v);
  }
}

function bridgeFooter(s: Section): void {
  const { style } = s;

  const fields = ['columnCount', 'logoScale', 'typeSystem'] as const;
  for (const f of fields) {
    const v = src(style, f);
    if (v) setStyle(style, f, v);
  }
}

// ── Dispatcher ───────────────────────────────────────────────

const bridgeByType: Record<string, (s: Section) => void> = {
  hero: bridgeHero,
  'product-grid': bridgeProductGrid,
  testimonials: bridgeTestimonials,
  cta: bridgeCta,
  newsletter: bridgeNewsletter,
  'brand-statement': bridgeBrandStatement,
  'image-gallery': bridgeImageGallery,
  faq: bridgeFaq,
  'text-banner': bridgeTextBanner,
  header: bridgeHeader,
  footer: bridgeFooter,
};

// ── Public API ───────────────────────────────────────────────

/**
 * Bridge AI-generated section.style fields into renderer-consumable fields.
 *
 * - Pure function (no side effects, no mutations of the input object).
 * - Only sets target fields when the source exists AND the target is not
 *   already populated (preserves AI-generated content values over style values).
 * - Silently skips unknown section types and unknown style fields.
 */
export function bridgeSectionStyles(store: Store): Store {
  return {
    ...store,
    pages: store.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => {
        const bridge = bridgeByType[section.type];
        if (!bridge) return section; // unknown type — skip silently

        // Shallow-clone so we never mutate the input
        const style = { ...section.style } as Record<string, unknown>;
        const content = { ...section.content };

        try {
          bridge({ ...section, style, content } as Section);
        } catch {
          // Never throw — silently skip on any error
        }

        return { ...section, style, content };
      }),
    })),
  };
}
