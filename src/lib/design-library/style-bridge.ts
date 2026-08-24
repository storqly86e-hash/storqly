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
//
// ── MAPPING TABLE ────────────────────────────────────────────
// Full AI field → renderer field mapping per section type:
//
//   hero:
//     typographySystem  → content.headingFont
//     contentAlignment  → content.alignment
//     density           → style.paddingY
//     sectionHeight     → content.height
//     vignetteStrength  → content.vignette
//     productScale      → content.productTreatment
//     mediaCrop         → (consumed by renderer directly)
//     surfaceTheme      → (consumed by renderer directly)
//
//   product-grid:
//     columnCount       → content.columns
//     headingAlignment  → style.headingAlignment
//     sectionSpacing    → style.paddingY
//     cardVariant       → style.cardVariant
//     productScale      → (consumed by renderer directly)
//     density           → (consumed by renderer directly)
//
//   testimonials:
//     quoteScale        → style.quoteScale
//     cardMode          → style.cardMode
//     attributionStyle  → style.attributionStyle
//     dividerMode       → style.dividerMode
//     density           → (consumed by renderer directly)
//     sectionSpacing    → (consumed by renderer directly)
//
//   cta:
//     typeScale         → style.typeScale
//     sectionSpacing    → style.paddingY
//     alignment         → content.alignment
//     surfaceTheme      → (consumed by renderer directly)
//     density           → (consumed by renderer directly)
//     buttonVariant     → (consumed by renderer directly)
//
//   newsletter:
//     typePairing       → style.typePairing
//     inputStyle        → style.inputStyle
//     sectionSpacing    → style.paddingY
//     alignment         → content.alignment
//     surfaceTheme      → (consumed by renderer directly)
//     density           → (consumed by renderer directly)
//
//   brand-statement:
//     splitRatio        → style.splitRatio
//     typePairing       → style.typePairing
//     copyMeasure       → style.copyMeasure
//     captionStyle      → style.captionStyle
//     imageRatio        → style.imageRatio
//     density           → (consumed by renderer directly)
//
//   image-gallery:
//     masonryPattern    → style.masonryPattern
//     anchorSize        → style.anchorSize
//     gap               → content.gap
//     captionStyle      → style.captionStyle
//     columns           → content.columns
//     density           → (consumed by renderer directly)
//
//   faq:
//     indexStyle        → style.indexStyle
//     numberStyle       → style.numberStyle
//     columns           → style.columns
//     dividerMode       → style.dividerMode
//     density           → (consumed by renderer directly)
//
//   text-banner:
//     size              → content.size
//     alignment         → content.alignment
//     density           → (consumed by renderer directly)
//     surfaceTheme      → (consumed by renderer directly)
//
//   categories:
//     columns           → content.columns
//     sectionSpacing    → style.paddingY
//     headingAlignment  → style.headingAlignment
//     alignment         → content.alignment
//     density           → (consumed by renderer directly)
//
//   rich-text:
//     sectionSpacing    → style.paddingY
//     alignment         → content.alignment
//     density           → style.paddingY (if no sectionSpacing)
//     typePairing       → (consumed by renderer directly)
//     copyMeasure       → (consumed by renderer directly)
//
//   header:
//     logoScale         → style.logoScale
//     headerHeight      → style.headerHeight
//     borderMode        → style.borderMode
//     surface           → style.surface
//     navSpacing        → style.navSpacing
//
//   footer:
//     columnCount       → style.columnCount
//     logoScale         → style.logoScale
//     typeSystem        → style.typeSystem
//
// ────────────────────────────────────────────────────────────

import type { Store, Section } from '@/lib/store-schema';

// ── Field whitelist (CSS injection prevention) ───────────────
// Only these AI-generated style fields are permitted per section type.
// Any field not listed here is silently stripped before bridging.

const ALLOWED_FIELDS: Record<string, string[]> = {
  hero: ['typographySystem', 'contentAlignment', 'density', 'sectionHeight', 'vignetteStrength', 'productScale', 'mediaCrop', 'surfaceTheme', 'backgroundImage', 'backgroundColor', 'overlay'],
  'product-grid': ['columnCount', 'headingAlignment', 'sectionSpacing', 'cardVariant', 'productScale', 'density'],
  testimonials: ['quoteScale', 'cardMode', 'attributionStyle', 'dividerMode', 'density', 'sectionSpacing'],
  cta: ['typeScale', 'sectionSpacing', 'alignment', 'surfaceTheme', 'density', 'buttonVariant'],
  newsletter: ['typePairing', 'inputStyle', 'sectionSpacing', 'alignment', 'surfaceTheme', 'density'],
  'brand-statement': ['splitRatio', 'typePairing', 'copyMeasure', 'captionStyle', 'imageRatio', 'density'],
  'image-gallery': ['masonryPattern', 'anchorSize', 'gap', 'captionStyle', 'columns', 'density'],
  faq: ['indexStyle', 'numberStyle', 'columns', 'dividerMode', 'density'],
  'text-banner': ['size', 'alignment', 'density', 'surfaceTheme'],
  categories: ['columns', 'headingAlignment', 'sectionSpacing', 'alignment', 'density'],
  'rich-text': ['sectionSpacing', 'alignment', 'density', 'typePairing', 'copyMeasure'],
  header: ['logoScale', 'headerHeight', 'borderMode', 'surface', 'navSpacing'],
  footer: ['columnCount', 'logoScale', 'typeSystem'],
};

// ── Value sanitizer (CSS injection prevention) ───────────────
// Returns undefined for non-string/non-number, empty strings, or values
// containing suspicious CSS patterns.

const CSS_INJECTION_RE = /[;{}]|\burl\(|\bexpression\(|\bimport\(|@import/i;

function sanitizeValue(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (CSS_INJECTION_RE.test(trimmed)) return undefined;
  return trimmed;
}

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

function bridgeCategories(s: Section): void {
  const { style, content } = s;

  // columns → content.columns
  const cols = src(style, 'columns') as number | undefined;
  if (cols) setContent(content, 'columns', cols);

  // sectionSpacing → style.paddingY
  const spacing = src(style, 'sectionSpacing') as string | undefined;
  if (spacing) {
    const padMap: Record<string, string> = { spacious: 'xl', compact: 'sm' };
    const pad = padMap[spacing];
    if (pad) setStyle(style, 'paddingY', pad);
  }

  // headingAlignment → style.headingAlignment
  const headingAlign = src(style, 'headingAlignment') as string | undefined;
  if (headingAlign) setStyle(style, 'headingAlignment', headingAlign);

  // alignment → content.alignment
  const align = src(style, 'alignment') as string | undefined;
  if (align) setContent(content, 'alignment', align);
}

function bridgeRichText(s: Section): void {
  const { style, content } = s;

  // sectionSpacing → style.paddingY
  const spacing = src(style, 'sectionSpacing') as string | undefined;
  if (spacing) {
    const padMap: Record<string, string> = { spacious: 'xl', compact: 'sm' };
    const pad = padMap[spacing];
    if (pad) setStyle(style, 'paddingY', pad);
  }

  // alignment → content.alignment
  const align = src(style, 'alignment') as string | undefined;
  if (align) setContent(content, 'alignment', align);

  // density → style.paddingY (if no sectionSpacing)
  const density = src(style, 'density') as string | undefined;
  if (density && !(style as any).paddingY) {
    const padMap: Record<string, string> = { airy: 'xl', compact: 'sm' };
    const pad = padMap[density];
    if (pad) setStyle(style, 'paddingY', pad);
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
  categories: bridgeCategories,
  'rich-text': bridgeRichText,
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
        const rawStyle = { ...section.style } as Record<string, unknown>;

        // Filter to only whitelisted fields and sanitize each value
        const whitelist = ALLOWED_FIELDS[section.type];
        const style: Record<string, unknown> = {};
        if (whitelist) {
          for (const key of whitelist) {
            const val = sanitizeValue(rawStyle[key]);
            if (val !== undefined) {
              style[key] = val;
            }
          }
        }

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
