// ========================================
// Design Library Variant Config Resolver
// ========================================
//
// Bridge between design library variant metadata and the section
// renderer. Takes a section's componentMeta (family.variant
// componentId) and the store theme, and returns resolved visual
// configuration that the renderer applies to produce REAL visual
// differences between variants.
//
// The resolver layers:
//   1. configOverrides from variant-mapping (base overrides)
//   2. Library metadata–driven overrides (styleHooks, contentRules,
//      heroArchitecture, layout, tags) for additional visual nuance
//   3. Theme-aware CSS variables and utility classes

import { getVariantMapping } from './variant-mapping'
import { getLibraryMetadata } from './loader'
import type { Section, StoreTheme } from '@/lib/store-schema'

// ── Public types ───────────────────────────────────────────

/** The set of product card visual variants. */
export type CardStyle =
  | 'editorial_portrait'
  | 'utility_dense'
  | 'bold_utility'
  | 'bundle_stack'
  | 'review_led'
  | 'quick_add'
  | 'swatch_story'

export interface ResolvedVariantConfig {
  /** Content overrides — merged INTO section.content */
  contentOverrides: Record<string, unknown>
  /** Style overrides — merged INTO section.style */
  styleOverrides: Record<string, unknown>
  /** CSS custom properties applied to the section wrapper div */
  cssVars: Record<string, string>
  /** Tailwind utility classes to add to the section wrapper */
  extraClasses: string
  /** Product card variant style (if this section contains product cards) */
  cardStyle?: CardStyle
}

// ── Card style configs ─────────────────────────────────────
// When a product-grid variant sets cardStyle, the ProductCard
// component uses these CSS variable conventions to vary its
// appearance without needing 7 separate React components.

const CARD_STYLE_CONFIGS: Record<
  CardStyle,
  {
    cssVars: Record<string, string>
    extraClasses: string
  }
> = {
  editorial_portrait: {
    cssVars: {
      '--card-radius': '0.75rem',
      '--card-padding': '1rem',
      '--card-image-ratio': '3/4',
      '--card-border-width': '0px',
      '--card-border-color': 'transparent',
      '--card-shadow': 'none',
      '--card-title-weight': '500',
      '--card-title-size': '0.875rem',
      '--card-price-size': '0.8125rem',
      '--card-hover-lift': '0.25rem',
      '--card-show-rating': 'false',
      '--card-show-swatch': 'false',
      '--card-show-quick-add': 'false',
      '--card-show-badge': 'true',
    },
    extraClasses: 'gap-6',
  },
  utility_dense: {
    cssVars: {
      '--card-radius': '0.25rem',
      '--card-padding': '0.5rem',
      '--card-image-ratio': '1/1',
      '--card-border-width': '1px',
      '--card-border-color': 'var(--border, #e5e7eb)',
      '--card-shadow': 'none',
      '--card-title-weight': '500',
      '--card-title-size': '0.75rem',
      '--card-price-size': '0.75rem',
      '--card-hover-lift': '0',
      '--card-show-rating': 'false',
      '--card-show-swatch': 'false',
      '--card-show-quick-add': 'true',
      '--card-show-badge': 'true',
    },
    extraClasses: 'gap-3',
  },
  bold_utility: {
    cssVars: {
      '--card-radius': '0',
      '--card-padding': '0.75rem',
      '--card-image-ratio': '4/5',
      '--card-border-width': '2px',
      '--card-border-color': 'var(--text, #0f172a)',
      '--card-shadow': 'none',
      '--card-title-weight': '700',
      '--card-title-size': '0.875rem',
      '--card-price-size': '0.875rem',
      '--card-hover-lift': '0',
      '--card-show-rating': 'false',
      '--card-show-swatch': 'false',
      '--card-show-quick-add': 'true',
      '--card-show-badge': 'true',
    },
    extraClasses: 'gap-4',
  },
  bundle_stack: {
    cssVars: {
      '--card-radius': '0.5rem',
      '--card-padding': '1rem',
      '--card-image-ratio': '1/1',
      '--card-border-width': '1px',
      '--card-border-color': 'var(--border, #e5e7eb)',
      '--card-shadow': '0 1px 3px rgba(0,0,0,0.08)',
      '--card-title-weight': '600',
      '--card-title-size': '0.875rem',
      '--card-price-size': '0.8125rem',
      '--card-hover-lift': '0.125rem',
      '--card-show-rating': 'false',
      '--card-show-swatch': 'false',
      '--card-show-quick-add': 'true',
      '--card-show-badge': 'true',
    },
    extraClasses: 'gap-5',
  },
  review_led: {
    cssVars: {
      '--card-radius': '0.5rem',
      '--card-padding': '1rem',
      '--card-image-ratio': '3/4',
      '--card-border-width': '1px',
      '--card-border-color': 'var(--border, #e5e7eb)',
      '--card-shadow': 'none',
      '--card-title-weight': '600',
      '--card-title-size': '0.875rem',
      '--card-price-size': '0.8125rem',
      '--card-hover-lift': '0.125rem',
      '--card-show-rating': 'true',
      '--card-show-swatch': 'false',
      '--card-show-quick-add': 'false',
      '--card-show-badge': 'false',
    },
    extraClasses: 'gap-5',
  },
  quick_add: {
    cssVars: {
      '--card-radius': '0.375rem',
      '--card-padding': '0.625rem',
      '--card-image-ratio': '1/1',
      '--card-border-width': '1px',
      '--card-border-color': 'var(--border, #e5e7eb)',
      '--card-shadow': 'none',
      '--card-title-weight': '500',
      '--card-title-size': '0.8125rem',
      '--card-price-size': '0.8125rem',
      '--card-hover-lift': '0',
      '--card-show-rating': 'false',
      '--card-show-swatch': 'false',
      '--card-show-quick-add': 'true',
      '--card-show-badge': 'true',
    },
    extraClasses: 'gap-4',
  },
  swatch_story: {
    cssVars: {
      '--card-radius': '0.5rem',
      '--card-padding': '0.875rem',
      '--card-image-ratio': '3/4',
      '--card-border-width': '1px',
      '--card-border-color': 'var(--border, #e5e7eb)',
      '--card-shadow': 'none',
      '--card-title-weight': '500',
      '--card-title-size': '0.875rem',
      '--card-price-size': '0.8125rem',
      '--card-hover-lift': '0.125rem',
      '--card-show-rating': 'false',
      '--card-show-swatch': 'true',
      '--card-show-quick-add': 'true',
      '--card-show-badge': 'false',
    },
    extraClasses: 'gap-5',
  },
}

// ── Helpers ────────────────────────────────────────────────

/** No-op empty config returned when there is no componentMeta or no mapping. */
const EMPTY_CONFIG: ResolvedVariantConfig = {
  contentOverrides: {},
  styleOverrides: {},
  cssVars: {},
  extraClasses: '',
}

/** Merge two Record<string, unknown> objects. Second wins on conflict. */
function mergeRecords(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...overlay }
}

/** Safely read a CSS color value from the theme, falling back to a default. */
function themeColor(
  theme: StoreTheme,
  key: keyof StoreTheme['colors'],
  fallback: string,
): string {
  return theme.colors[key] ?? fallback
}

// ══════════════════════════════════════════════════════════════
// PER-FAMILY RESOLVERS
// ══════════════════════════════════════════════════════════════
// Each resolver reads the mapping's configOverrides AND the
// library metadata to produce additional content/style/CSS/
// class overrides unique to that specific variant.

// ── Hero family ────────────────────────────────────────────

function resolveHero(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const meta = getLibraryMetadata(componentId)
  const arch = meta?.heroArchitecture as Record<string, unknown> | undefined
  const styleHooks = meta?.styleHooks ?? []

  // Content overrides from configOverrides are already split out
  // by the caller. Here we produce ADDITIONAL metadata-driven overrides.
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- editorial_product_still_life ---
  if (componentId === 'hero.editorial_product_still_life') {
    // From heroArchitecture: baseline-led with large top offset,
    // 4-col left copy, 5-col right product
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'outline'
    contentOverrides.badgeStyle = 'outlined'
    contentOverrides.visualPriority = 'product'
    // Subtle editorial overlay gradient from bottom-left to center-right
    cssVars['--hero-overlay'] =
      'linear-gradient(135deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.04) 60%, transparent 100%)'
    cssVars['--hero-text-position'] = 'left 8% center'
    cssVars['--hero-text-max-width'] = '38%'
    cssVars['--hero-vignette-strength'] = '0.35'
    cssVars['--hero-badge-size'] = '0.6875rem'
    cssVars['--hero-headline-letter-spacing'] = '0.02em'
    extraClasses = 'font-light'
  }

  // --- split_context_product ---
  else if (componentId === 'hero.split_context_product') {
    // From heroArchitecture: 50/50 split, vertically centered copy
    contentOverrides.alignment = 'center'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    contentOverrides.backgroundTreatment = 'soft'
    // No vignette, just local tonal correction on image
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'center center'
    cssVars['--hero-text-max-width'] = '42%'
    cssVars['--hero-vignette-strength'] = '0'
    cssVars['--hero-image-fit'] = 'cover'
    extraClasses = ''
  }

  // --- fullbleed_copy_safe_area ---
  else if (componentId === 'hero.fullbleed_copy_safe_area') {
    // From heroArchitecture: 100vw media with 4-col safe area
    contentOverrides.layout = 'minimal'
    contentOverrides.backgroundTreatment = 'none'
    contentOverrides.height = 'xl'
    contentOverrides.alignment = 'left'
    contentOverrides.ctaStyle = 'filled'
    // Directional gradient only for legibility
    cssVars['--hero-overlay'] =
      'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 40%, transparent 70%)'
    cssVars['--hero-text-position'] = 'left 6% center'
    cssVars['--hero-text-max-width'] = '36%'
    cssVars['--hero-vignette-strength'] = '0'
    cssVars['--hero-headline-letter-spacing'] = '-0.01em'
    cssVars['--hero-headline-weight'] = '700'
    extraClasses = ''
  }

  // --- editorial_masthead ---
  else if (componentId === 'hero.editorial_masthead') {
    // From heroArchitecture: large masthead image, editorial title below
    contentOverrides.layout = 'minimal'
    contentOverrides.headlineSize = 'xl'
    contentOverrides.alignment = 'center'
    contentOverrides.height = 'lg'
    contentOverrides.badgeStyle = 'filled'
    // No overlay — preserve image integrity
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'center bottom 12%'
    cssVars['--hero-text-max-width'] = '56%'
    cssVars['--hero-vignette-strength'] = '0'
    cssVars['--hero-headline-letter-spacing'] = '0.01em'
    cssVars['--hero-headline-weight'] = '400'
    cssVars['--hero-badge-size'] = '0.8125rem'
    cssVars['--hero-badge-padding'] = '0.5rem 1.25rem'
    extraClasses = 'font-normal'
  }

  // --- product_stack_vertical ---
  else if (componentId === 'hero.product_stack_vertical') {
    // From heroArchitecture: two-column, product-first, benefits
    contentOverrides.layout = 'product-first'
    contentOverrides.productTreatment = 'floating'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'left 6% top 50%'
    cssVars['--hero-text-max-width'] = '40%'
    cssVars['--hero-product-shadow'] = '0 20px 40px rgba(0,0,0,0.08)'
    cssVars['--hero-product-scale'] = '1.05'
    extraClasses = ''
  }

  // --- dark_campaign_statement ---
  else if (componentId === 'hero.dark_campaign_statement') {
    // From heroArchitecture: dark full-bleed, edge-aligned type, high contrast
    contentOverrides.layout = 'minimal'
    contentOverrides.backgroundTreatment = 'dramatic'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    contentOverrides.badgeStyle = 'gradient'
    cssVars['--hero-overlay'] =
      'linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%)'
    cssVars['--hero-text-position'] = 'left 8% center'
    cssVars['--hero-text-max-width'] = '50%'
    cssVars['--hero-vignette-strength'] = '0.5'
    cssVars['--hero-headline-weight'] = '800'
    cssVars['--hero-headline-letter-spacing'] = '-0.02em'
    cssVars['--hero-headline-text-transform'] = 'uppercase'
    cssVars['--hero-grain-strength'] = '0.04'
    cssVars['--hero-contrast-mode'] = 'dark'
    styleOverrides.backgroundColor = '#0a0a0a'
    styleOverrides.textColor = '#ffffff'
    styleOverrides.headlineColor = '#ffffff'
    styleOverrides.buttonBackgroundColor = '#ffffff'
    styleOverrides.buttonTextColor = '#000000'
    extraClasses = 'bg-[#0a0a0a] text-white'
  }

  // --- ingredient_focus ---
  else if (componentId === 'hero.ingredient_focus') {
    // From heroArchitecture: three-zone composition (ingredient, product, copy)
    contentOverrides.layout = 'split-left'
    contentOverrides.backgroundTreatment = 'soft'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'left 6% center'
    cssVars['--hero-text-max-width'] = '36%'
    cssVars['--hero-product-position'] = 'center center'
    cssVars['--hero-accent-color'] = themeColor(theme, 'accent', '#f59e0b')
    extraClasses = ''
  }

  // --- ugc_collage ---
  else if (componentId === 'hero.ugc_collage') {
    // From heroArchitecture: copy column + UGC collage
    contentOverrides.layout = 'split-left'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'left 6% center'
    cssVars['--hero-text-max-width'] = '34%'
    cssVars['--hero-ugc-collage'] = 'true'
    cssVars['--hero-ugc-tile-rotation'] = 'random'
    cssVars['--hero-ugc-border-radius'] = '0.5rem'
    extraClasses = ''
  }

  // --- asymmetric_offset_product ---
  else if (componentId === 'hero.asymmetric_offset_product') {
    contentOverrides.layout = 'split-left'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    contentOverrides.headlineSize = 'lg'
    contentOverrides.badgeStyle = 'filled'
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'left 4% top 30%'
    cssVars['--hero-text-max-width'] = '52%'
    cssVars['--hero-headline-weight'] = '900'
    cssVars['--hero-headline-letter-spacing'] = '-0.03em'
    cssVars['--hero-product-offset'] = '15%'
    cssVars['--hero-product-overlap'] = 'true'
    extraClasses = 'font-black'
  }

  // --- collection_rail ---
  else if (componentId === 'hero.collection_rail') {
    contentOverrides.layout = 'minimal'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-text-position'] = 'left 4% top 16%'
    cssVars['--hero-text-max-width'] = '60%'
    cssVars['--hero-rail-enabled'] = 'true'
    extraClasses = ''
  }

  // --- category_portal ---
  else if (componentId === 'hero.category_portal') {
    contentOverrides.layout = 'centered'
    contentOverrides.alignment = 'center'
    contentOverrides.height = 'md'
    contentOverrides.ctaStyle = 'outline'
    cssVars['--hero-overlay'] = 'none'
    cssVars['--hero-portal-grid'] = 'true'
    extraClasses = ''
  }

  // --- launch_countdown ---
  else if (componentId === 'hero.launch_countdown') {
    contentOverrides.layout = 'split-left'
    contentOverrides.alignment = 'left'
    contentOverrides.height = 'lg'
    contentOverrides.ctaStyle = 'filled'
    cssVars['--hero-overlay'] =
      'linear-gradient(135deg, rgba(0,0,0,0.15) 0%, transparent 50%)'
    cssVars['--hero-text-position'] = 'left 6% center'
    cssVars['--hero-text-max-width'] = '44%'
    cssVars['--hero-countdown-visible'] = 'true'
    cssVars['--hero-urgency-level'] = 'high'
    extraClasses = ''
  }

  // --- Fallback: generic hero with metadata-driven tweaks ---
  else {
    applyGenericMetadataOverrides(
      meta,
      contentOverrides,
      styleOverrides,
      cssVars,
      theme,
    )
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Product Grid family ────────────────────────────────────

function resolveProductGrid(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''
  let cardStyle: CardStyle | undefined

  // --- luxury_gallery ---
  if (componentId === 'product-grid.luxury_gallery') {
    contentOverrides.columns = 3
    contentOverrides.showPrice = true
    contentOverrides.showAddToCart = false
    cardStyle = 'editorial_portrait'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'xl'
    cssVars['--grid-gap'] = '2rem'
    cssVars['--grid-card-hover-lift'] = '0.25rem'
    cssVars['--grid-show-price'] = 'true'
    cssVars['--grid-heading-alignment'] = 'center'
    extraClasses = 'max-w-5xl mx-auto'
  }

  // --- utility_dense ---
  else if (componentId === 'product-grid.utility_dense') {
    contentOverrides.columns = 4
    contentOverrides.showPrice = true
    contentOverrides.showAddToCart = true
    cardStyle = 'utility_dense'
    styleOverrides.paddingY = 'md'
    styleOverrides.maxWidth = 'xl'
    cssVars['--grid-gap'] = '0.75rem'
    cssVars['--grid-card-hover-lift'] = '0'
    cssVars['--grid-show-price'] = 'true'
    cssVars['--grid-heading-alignment'] = 'left'
    extraClasses = ''
  }

  // --- bold_rail ---
  else if (componentId === 'product-grid.bold_rail') {
    contentOverrides.columns = 3
    contentOverrides.showPrice = true
    contentOverrides.showAddToCart = true
    cardStyle = 'bold_utility'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'xl'
    cssVars['--grid-gap'] = '1rem'
    cssVars['--grid-card-hover-lift'] = '0'
    cssVars['--grid-show-price'] = 'true'
    cssVars['--grid-heading-alignment'] = 'left'
    cssVars['--grid-accent-plane'] = 'true'
    cssVars['--grid-heading-scale'] = '1.15'
    extraClasses = ''
  }

  // --- bestseller_focus ---
  else if (componentId === 'product-grid.bestseller_focus') {
    contentOverrides.columns = 3
    contentOverrides.showPrice = true
    contentOverrides.showAddToCart = true
    cardStyle = 'review_led'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'xl'
    cssVars['--grid-gap'] = '1.5rem'
    cssVars['--grid-card-hover-lift'] = '0.125rem'
    cssVars['--grid-show-price'] = 'true'
    cssVars['--grid-show-ratings'] = 'true'
    cssVars['--grid-featured-first'] = 'true'
    cssVars['--grid-heading-alignment'] = 'center'
    extraClasses = ''
  }

  // --- swatch_gallery ---
  else if (componentId === 'product-grid.swatch_gallery') {
    contentOverrides.columns = 3
    contentOverrides.showPrice = true
    contentOverrides.showAddToCart = true
    cardStyle = 'swatch_story'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'xl'
    cssVars['--grid-gap'] = '1.5rem'
    cssVars['--grid-card-hover-lift'] = '0.125rem'
    cssVars['--grid-show-price'] = 'true'
    cssVars['--grid-show-swatches'] = 'true'
    cssVars['--grid-heading-alignment'] = 'left'
    extraClasses = ''
  }

  // --- bundle_collection ---
  else if (componentId === 'product-grid.bundle_collection') {
    contentOverrides.columns = 3
    contentOverrides.showPrice = true
    contentOverrides.showAddToCart = true
    cardStyle = 'bundle_stack'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'xl'
    cssVars['--grid-gap'] = '1.25rem'
    cssVars['--grid-card-hover-lift'] = '0.125rem'
    cssVars['--grid-show-price'] = 'true'
    cssVars['--grid-show-bundle-badge'] = 'true'
    cssVars['--grid-show-savings'] = 'true'
    cssVars['--grid-heading-alignment'] = 'left'
    extraClasses = ''
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses, cardStyle }
}

// ── CTA family ─────────────────────────────────────────────

function resolveCTA(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- premium_invitation ---
  if (componentId === 'cta.premium_invitation') {
    contentOverrides.style = 'outline'
    contentOverrides.alignment = 'center'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'md'
    cssVars['--cta-button-variant'] = 'outline'
    cssVars['--cta-headline-weight'] = '300'
    cssVars['--cta-headline-letter-spacing'] = '0.02em'
    cssVars['--cta-headline-transform'] = 'none'
    cssVars['--cta-body-max-width'] = '36rem'
    cssVars['--cta-section-spacing'] = 'spacious'
    extraClasses = 'max-w-2xl mx-auto text-center'
  }

  // --- strong_statement ---
  else if (componentId === 'cta.strong_statement') {
    contentOverrides.style = 'solid'
    contentOverrides.alignment = 'center'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'lg'
    cssVars['--cta-button-variant'] = 'solid'
    cssVars['--cta-headline-weight'] = '800'
    cssVars['--cta-headline-letter-spacing'] = '-0.02em'
    cssVars['--cta-headline-transform'] = 'none'
    cssVars['--cta-body-max-width'] = '28rem'
    cssVars['--cta-section-spacing'] = 'generous'
    cssVars['--cta-contrast'] = 'high'
    extraClasses = 'max-w-3xl mx-auto text-center font-extrabold'
  }

  // --- editorial_invite ---
  else if (componentId === 'cta.editorial_invite') {
    contentOverrides.style = 'outline'
    contentOverrides.alignment = 'left'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'lg'
    cssVars['--cta-button-variant'] = 'outline'
    cssVars['--cta-headline-weight'] = '400'
    cssVars['--cta-headline-letter-spacing'] = '0.01em'
    cssVars['--cta-headline-transform'] = 'none'
    cssVars['--cta-body-max-width'] = '32rem'
    cssVars['--cta-section-spacing'] = 'normal'
    cssVars['--cta-body-font-style'] = 'italic'
    extraClasses = 'max-w-3xl text-left'
  }

  // --- urgency_panel ---
  else if (componentId === 'cta.urgency_panel') {
    contentOverrides.style = 'solid'
    contentOverrides.alignment = 'center'
    styleOverrides.paddingY = 'md'
    styleOverrides.maxWidth = 'md'
    styleOverrides.backgroundColor = '#fef3c7' // warm amber tint
    cssVars['--cta-button-variant'] = 'solid'
    cssVars['--cta-headline-weight'] = '700'
    cssVars['--cta-headline-letter-spacing'] = '0'
    cssVars['--cta-urgency-level'] = 'high'
    cssVars['--cta-body-max-width'] = '28rem'
    cssVars['--cta-border-mode'] = 'top-accent'
    cssVars['--cta-urgency-color'] = '#dc2626'
    extraClasses = 'max-w-2xl mx-auto text-center border-t-4 border-red-600'
  }

  // --- community_invite ---
  else if (componentId === 'cta.community_invite') {
    contentOverrides.style = 'solid'
    contentOverrides.alignment = 'center'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'md'
    cssVars['--cta-button-variant'] = 'solid'
    cssVars['--cta-headline-weight'] = '600'
    cssVars['--cta-headline-letter-spacing'] = '0'
    cssVars['--cta-body-max-width'] = '32rem'
    cssVars['--cta-proof-style'] = 'avatar-row'
    cssVars['--cta-section-spacing'] = 'normal'
    extraClasses = 'max-w-2xl mx-auto text-center'
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Testimonials family ────────────────────────────────────

function resolveTestimonials(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- quote_wall ---
  if (componentId === 'testimonials.quote_wall') {
    contentOverrides.layout = 'grid'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'lg'
    cssVars['--testimonials-quote-scale'] = '1.25'
    cssVars['--testimonials-card-mode'] = 'minimal'
    cssVars['--testimonials-attribution-style'] = 'name-role'
    cssVars['--testimonials-divider-mode'] = 'none'
    cssVars['--testimonials-surface'] = 'transparent'
    cssVars['--testimonials-columns'] = '2'
    cssVars['--testimonials-quote-mark'] = 'visible'
    extraClasses = 'max-w-4xl mx-auto'
  }

  // --- rating_rail ---
  else if (componentId === 'testimonials.rating_rail') {
    contentOverrides.layout = 'horizontal-scroll'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'full'
    cssVars['--testimonials-quote-scale'] = '0.9375'
    cssVars['--testimonials-card-mode'] = 'card'
    cssVars['--testimonials-attribution-style'] = 'name-rating'
    cssVars['--testimonials-divider-mode'] = 'border'
    cssVars['--testimonials-surface'] = 'surface'
    cssVars['--testimonials-rating-style'] = 'stars'
    cssVars['--testimonials-rating-summary'] = 'visible'
    cssVars['--testimonials-scroll'] = 'horizontal'
    cssVars['--testimonials-rail-gap'] = '1rem'
    extraClasses = ''
  }

  // --- ugc_rail ---
  else if (componentId === 'testimonials.ugc_rail') {
    contentOverrides.layout = 'horizontal-scroll'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'full'
    cssVars['--testimonials-quote-scale'] = '0.875'
    cssVars['--testimonials-card-mode'] = 'image-card'
    cssVars['--testimonials-attribution-style'] = 'username-handle'
    cssVars['--testimonials-divider-mode'] = 'none'
    cssVars['--testimonials-surface'] = 'transparent'
    cssVars['--testimonials-tile-ratio'] = '4/5'
    cssVars['--testimonials-scroll'] = 'horizontal'
    cssVars['--testimonials-ugc-mode'] = 'true'
    cssVars['--testimonials-rail-gap'] = '0.75rem'
    extraClasses = ''
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Newsletter family ──────────────────────────────────────

function resolveNewsletter(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- split_capture ---
  if (componentId === 'newsletter.split_capture') {
    contentOverrides.layout = 'split'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'xl'
    cssVars['--newsletter-layout'] = 'split'
    cssVars['--newsletter-split-ratio'] = '1/1'
    cssVars['--newsletter-input-style'] = 'bordered'
    cssVars['--newsletter-button-variant'] = 'solid'
    cssVars['--newsletter-copy-measure'] = 'narrow'
    cssVars['--newsletter-alignment'] = 'left'
    extraClasses = ''
  }

  // --- editorial_capture ---
  else if (componentId === 'newsletter.editorial_capture') {
    contentOverrides.layout = 'centered'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'md'
    cssVars['--newsletter-layout'] = 'centered'
    cssVars['--newsletter-input-style'] = 'underlined'
    cssVars['--newsletter-button-variant'] = 'outline'
    cssVars['--newsletter-copy-measure'] = 'narrow'
    cssVars['--newsletter-alignment'] = 'center'
    cssVars['--newsletter-heading-font'] = 'serif'
    cssVars['--newsletter-heading-weight'] = '400'
    cssVars['--newsletter-section-spacing'] = 'spacious'
    extraClasses = 'max-w-xl mx-auto text-center'
  }

  // --- waitlist_capture ---
  else if (componentId === 'newsletter.waitlist_capture') {
    contentOverrides.layout = 'centered'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'md'
    cssVars['--newsletter-layout'] = 'centered'
    cssVars['--newsletter-input-style'] = 'bordered'
    cssVars['--newsletter-button-variant'] = 'solid'
    cssVars['--newsletter-copy-measure'] = 'normal'
    cssVars['--newsletter-alignment'] = 'center'
    cssVars['--newsletter-urgency'] = 'true'
    cssVars['--newsletter-status-style'] = 'visible'
    cssVars['--newsletter-urgency-color'] = '#dc2626'
    extraClasses = 'max-w-lg mx-auto text-center'
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Brand Story (brand-statement) family ───────────────────

function resolveBrandStory(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- split_art-directed ---
  if (componentId === 'brand-story.split_art-directed') {
    contentOverrides.alignment = 'left'
    contentOverrides.layout = 'split'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'xl'
    cssVars['--brand-layout'] = 'split'
    cssVars['--brand-split-ratio'] = '5/7'
    cssVars['--brand-image-bleed'] = 'true'
    cssVars['--brand-copy-measure'] = 'narrow'
    cssVars['--brand-caption-style'] = 'small-italic'
    cssVars['--brand-type-pairing'] = 'serif-sans'
    extraClasses = ''
  }

  // --- founder_note ---
  else if (componentId === 'brand-story.founder_note') {
    contentOverrides.alignment = 'center'
    contentOverrides.layout = 'centered'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'md'
    cssVars['--brand-layout'] = 'centered'
    cssVars['--brand-portrait-visible'] = 'true'
    cssVars['--brand-portrait-ratio'] = '1/1'
    cssVars['--brand-signature-style'] = 'script'
    cssVars['--brand-copy-measure'] = 'narrow'
    cssVars['--brand-surface'] = 'warm'
    cssVars['--brand-type-pairing'] = 'serif-sans'
    cssVars['--brand-heading-weight'] = '400'
    extraClasses = 'max-w-2xl mx-auto text-center'
  }

  // --- timeline ---
  else if (componentId === 'brand-story.timeline') {
    contentOverrides.alignment = 'left'
    contentOverrides.layout = 'timeline'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'lg'
    cssVars['--brand-layout'] = 'timeline'
    cssVars['--brand-timeline-line-style'] = 'solid'
    cssVars['--brand-timeline-step-marker'] = 'dot'
    cssVars['--brand-timeline-alternation'] = 'true'
    cssVars['--brand-surface-alternation'] = 'true'
    cssVars['--brand-type-system'] = 'numbered'
    extraClasses = ''
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Gallery (image-gallery) family ─────────────────────────

function resolveGallery(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- editorial_masonry ---
  if (componentId === 'gallery.editorial_masonry') {
    contentOverrides.columns = 3
    contentOverrides.gap = 'lg'
    styleOverrides.paddingY = 'xl'
    styleOverrides.maxWidth = 'xl'
    cssVars['--gallery-layout'] = 'masonry'
    cssVars['--gallery-columns'] = '3'
    cssVars['--gallery-gap'] = '1rem'
    cssVars['--gallery-captions'] = 'overlay'
    cssVars['--gallery-lightbox'] = 'enabled'
    cssVars['--gallery-anchor-size'] = '2x'
    cssVars['--gallery-masonry-pattern'] = 'staggered'
    extraClasses = ''
  }

  // --- lookbook_grid ---
  else if (componentId === 'gallery.lookbook_grid') {
    contentOverrides.columns = 2
    contentOverrides.gap = 'sm'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'full'
    cssVars['--gallery-layout'] = 'grid'
    cssVars['--gallery-columns'] = '2'
    cssVars['--gallery-gap'] = '0.25rem'
    cssVars['--gallery-captions'] = 'below'
    cssVars['--gallery-lightbox'] = 'enabled'
    cssVars['--gallery-oversized-frames'] = 'true'
    cssVars['--gallery-hotspot-style'] = 'dot'
    extraClasses = ''
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Trust (text-banner) family ─────────────────────────────

function resolveTrust(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- proof_strip ---
  if (componentId === 'trust.proof_strip') {
    contentOverrides.layout = 'horizontal'
    contentOverrides.alignment = 'center'
    contentOverrides.size = 'sm'
    styleOverrides.paddingY = 'sm'
    styleOverrides.maxWidth = 'xl'
    cssVars['--trust-layout'] = 'strip'
    cssVars['--trust-columns'] = 'auto'
    cssVars['--trust-icon-style'] = 'line'
    cssVars['--trust-density'] = 'compact'
    cssVars['--trust-divider-mode'] = 'border'
    cssVars['--trust-surface'] = 'surface'
    extraClasses = 'max-w-5xl mx-auto'
  }

  // --- certification_row ---
  else if (componentId === 'trust.certification_row') {
    contentOverrides.layout = 'horizontal'
    contentOverrides.alignment = 'center'
    contentOverrides.size = 'sm'
    styleOverrides.paddingY = 'sm'
    styleOverrides.maxWidth = 'lg'
    cssVars['--trust-layout'] = 'row'
    cssVars['--trust-columns'] = 'auto'
    cssVars['--trust-mark-size'] = '2.5rem'
    cssVars['--trust-label-style'] = 'below'
    cssVars['--trust-density'] = 'normal'
    cssVars['--trust-divider-mode'] = 'none'
    cssVars['--trust-surface'] = 'transparent'
    extraClasses = 'max-w-3xl mx-auto'
  }

  // --- social_count ---
  else if (componentId === 'trust.social_count') {
    contentOverrides.layout = 'centered'
    contentOverrides.alignment = 'center'
    contentOverrides.size = 'md'
    styleOverrides.paddingY = 'md'
    styleOverrides.maxWidth = 'md'
    cssVars['--trust-layout'] = 'centered-count'
    cssVars['--trust-number-scale'] = '3xl'
    cssVars['--trust-label-style'] = 'below'
    cssVars['--trust-surface'] = 'transparent'
    cssVars['--trust-alignment'] = 'center'
    extraClasses = 'max-w-2xl mx-auto text-center'
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ── Promotion family ───────────────────────────────────────

function resolvePromotion(
  componentId: string,
  baseContent: Record<string, unknown>,
  theme: StoreTheme,
): Partial<ResolvedVariantConfig> {
  const contentOverrides: Record<string, unknown> = {}
  const styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''

  // --- campaign_split ---
  if (componentId === 'promotion.campaign_split') {
    contentOverrides.layout = 'split'
    contentOverrides.alignment = 'center'
    contentOverrides.style = 'solid'
    styleOverrides.paddingY = 'lg'
    styleOverrides.maxWidth = 'xl'
    cssVars['--promo-layout'] = 'split'
    cssVars['--promo-split-ratio'] = '1/1'
    cssVars['--promo-offer-emphasis'] = 'headline'
    cssVars['--promo-image-ratio'] = '4/5'
    cssVars['--promo-button-variant'] = 'solid'
    cssVars['--promo-fine-print'] = 'visible'
    extraClasses = ''
  }

  // --- sticker_campaign ---
  else if (componentId === 'promotion.sticker_campaign') {
    contentOverrides.layout = 'centered'
    contentOverrides.alignment = 'center'
    contentOverrides.style = 'solid'
    styleOverrides.paddingY = 'md'
    styleOverrides.maxWidth = 'lg'
    cssVars['--promo-layout'] = 'sticker'
    cssVars['--promo-sticker-shape'] = 'circle'
    cssVars['--promo-contrast'] = 'high'
    cssVars['--promo-display-type'] = 'bold'
    cssVars['--promo-button-variant'] = 'solid'
    cssVars['--promo-fine-print'] = 'visible'
    cssVars['--promo-badge-size'] = 'large'
    extraClasses = 'max-w-3xl mx-auto text-center'
  }

  // --- inline_offer ---
  else if (componentId === 'promotion.inline_offer') {
    contentOverrides.layout = 'inline'
    contentOverrides.alignment = 'center'
    contentOverrides.size = 'sm'
    styleOverrides.paddingY = 'sm'
    styleOverrides.maxWidth = 'xl'
    cssVars['--promo-layout'] = 'inline'
    cssVars['--promo-height'] = 'auto'
    cssVars['--promo-border-mode'] = 'full'
    cssVars['--promo-surface'] = 'accent-light'
    cssVars['--promo-content-color'] = 'dark'
    cssVars['--promo-fine-print'] = 'optional'
    extraClasses = 'max-w-5xl mx-auto'
  }

  return { contentOverrides, styleOverrides, cssVars, extraClasses }
}

// ══════════════════════════════════════════════════════════════
// GENERIC METADATA-DRIVEN FALLBACK
// ══════════════════════════════════════════════════════════════
// For any variant without a hand-crafted resolver above, derive
// overrides from the library metadata's styleHooks and tags.

function applyGenericMetadataOverrides(
  meta: {
    styleHooks?: string[]
    tags?: string[]
    visualStyle?: string[]
    contentRules?: Record<string, unknown>
  } | undefined,
  contentOverrides: Record<string, unknown>,
  styleOverrides: Record<string, unknown>,
  cssVars: Record<string, string>,
  theme: StoreTheme,
): void {
  if (!meta) return

  const hooks = new Set(meta.styleHooks ?? [])
  const tags = new Set(meta.tags ?? [])

  // --- Density / spacing from styleHooks ---
  if (hooks.has('density')) {
    styleOverrides.paddingY = 'sm'
    cssVars['--section-density'] = 'compact'
  }
  if (hooks.has('section_spacing')) {
    styleOverrides.paddingY = 'xl'
    cssVars['--section-density'] = 'spacious'
  }

  // --- Surface theme ---
  if (hooks.has('surface_theme')) {
    if (tags.has('luxury') || tags.has('premium')) {
      cssVars['--section-surface'] = 'warm'
      styleOverrides.backgroundColor = theme.colors.surface
    } else {
      cssVars['--section-surface'] = 'default'
    }
  }

  // --- Alignment ---
  if (hooks.has('alignment') || hooks.has('content_alignment')) {
    if (tags.has('editorial')) {
      contentOverrides.alignment = 'left'
    } else if (tags.has('centered')) {
      contentOverrides.alignment = 'center'
    }
  }

  // --- Heading alignment from styleHooks ---
  if (hooks.has('heading_alignment')) {
    if (tags.has('luxury') || tags.has('gallery')) {
      cssVars['--section-heading-alignment'] = 'center'
    } else {
      cssVars['--section-heading-alignment'] = 'left'
    }
  }

  // --- Border mode ---
  if (hooks.has('border_mode')) {
    if (tags.has('bold') || tags.has('utility')) {
      cssVars['--section-border-mode'] = 'full'
    } else {
      cssVars['--section-border-mode'] = 'none'
    }
  }

  // --- Type system / pairing ---
  if (hooks.has('type_system') || hooks.has('type_pairing')) {
    if (tags.has('editorial') || tags.has('luxury')) {
      cssVars['--section-heading-font'] = 'serif'
      cssVars['--section-heading-weight'] = '400'
    } else {
      cssVars['--section-heading-weight'] = '700'
    }
  }

  // --- Contrast ---
  if (hooks.has('contrast')) {
    cssVars['--section-contrast'] = 'high'
    cssVars['--section-heading-weight'] = '800'
  }

  // --- Button variant from styleHooks ---
  if (hooks.has('button_variant')) {
    if (tags.has('premium') || tags.has('editorial')) {
      cssVars['--section-button-variant'] = 'outline'
    } else {
      cssVars['--section-button-variant'] = 'solid'
    }
  }

  // --- Divider mode ---
  if (hooks.has('divider_mode')) {
    if (tags.has('utility') || tags.has('dense')) {
      cssVars['--section-divider-mode'] = 'border'
    } else {
      cssVars['--section-divider-mode'] = 'none'
    }
  }

  // --- Image ratio ---
  if (hooks.has('image_ratio') || hooks.has('media_ratio')) {
    if (tags.has('editorial')) {
      cssVars['--section-image-ratio'] = '3/4'
    } else {
      cssVars['--section-image-ratio'] = '1/1'
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN RESOLVER
// ══════════════════════════════════════════════════════════════

/**
 * Resolve a section's design library variant into concrete visual
 * configuration that the section renderer can apply.
 *
 * This is the single entry point. The renderer calls this with the
 * section and theme, then merges the returned overrides into the
 * section's content and style before rendering.
 *
 * When there is no componentMeta (or no mapping), returns an empty
 * config so the section renders with its defaults unchanged.
 */
export function resolveVariantConfig(
  section: Section,
  theme: StoreTheme,
): ResolvedVariantConfig {
  const componentId = section.componentMeta?.componentId
  if (!componentId) return { ...EMPTY_CONFIG }

  // 1. Get the variant mapping (base configOverrides + section type)
  const mapping = getVariantMapping(componentId)

  // 2. Get library metadata (styleHooks, contentRules, etc.)
  const metadata = getLibraryMetadata(componentId)

  // 3. Start with configOverrides from the mapping as content overrides
  //    (mapping.configOverrides contains hero layout/content fields)
  const mappingOverrides = mapping.configOverrides ?? {}
  let contentOverrides: Record<string, unknown> = { ...mappingOverrides }
  let styleOverrides: Record<string, unknown> = {}
  const cssVars: Record<string, string> = {}
  let extraClasses = ''
  let cardStyle: CardStyle | undefined

  // 4. Dispatch to per-family resolver for additional overrides
  const family = componentId.split('.')[0]

  switch (family) {
    case 'hero': {
      const resolved = resolveHero(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'product-grid': {
      const resolved = resolveProductGrid(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      cardStyle = resolved.cardStyle
      break
    }
    case 'cta': {
      const resolved = resolveCTA(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'testimonials': {
      const resolved = resolveTestimonials(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'newsletter': {
      const resolved = resolveNewsletter(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'brand-story': {
      const resolved = resolveBrandStory(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'gallery': {
      const resolved = resolveGallery(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'trust': {
      const resolved = resolveTrust(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'promotion': {
      const resolved = resolvePromotion(componentId, section.content, theme)
      contentOverrides = mergeRecords(contentOverrides, resolved.contentOverrides ?? {})
      styleOverrides = mergeRecords(styleOverrides, resolved.styleOverrides ?? {})
      Object.assign(cssVars, resolved.cssVars ?? {})
      extraClasses = resolved.extraClasses ?? ''
      break
    }
    case 'announcement': {
      // Announcement bar — visual diff via background, text size, density
      cssVars['--section-density'] = 'compact'
      cssVars['--section-border-mode'] = 'none'
      if (componentId.includes('rail')) {
        styleOverrides.paddingY = 'sm'
        cssVars['--section-surface'] = 'default'
      }
      break
    }
    case 'featured-product': {
      // Featured product — visual diff via layout hints and CTA style
      cssVars['--section-surface'] = 'default'
      if (componentId.includes('routine')) {
        contentOverrides.alignment = 'left'
        cssVars['--section-heading-alignment'] = 'left'
        cssVars['--section-density'] = 'spacious'
      } else if (componentId.includes('spotlight')) {
        contentOverrides.alignment = 'center'
        cssVars['--section-heading-alignment'] = 'center'
      }
      break
    }
    default: {
      // For families without a specific resolver, apply generic
      // metadata-driven overrides
      applyGenericMetadataOverrides(
        metadata,
        contentOverrides,
        styleOverrides,
        cssVars,
        theme,
      )
      break
    }
  }

  // 5. Apply card style CSS vars if a cardStyle was set
  if (cardStyle) {
    const cardConfig = CARD_STYLE_CONFIGS[cardStyle]
    if (cardConfig) {
      Object.assign(cssVars, cardConfig.cssVars)
      if (cardConfig.extraClasses) {
        extraClasses = extraClasses
          ? `${extraClasses} ${cardConfig.extraClasses}`
          : cardConfig.extraClasses
      }
    }
  }

  return {
    contentOverrides,
    styleOverrides,
    cssVars,
    extraClasses,
    cardStyle,
  }
}
