// ========================================
// Component Registry — Design Library Integration Point
// ========================================
//
// This registry is the bridge between the design library's
// component family/variant system and Storqly's section renderer.
//
// CURRENT STATE (Phase 1 — Preparation):
//   - All existing section types are registered with their
//     current Storqly renderer components.
//   - The registry can resolve `family` + `variant` to a
//     section type + optional renderer override.
//   - Unknown variants fall back to the base section type.
//
// FUTURE STATE (Phase 2 — Library Integration):
//   - Design library variants will be registered here.
//   - Each variant maps to a React component that implements
//     the library's visual specification.
//   - The renderer will check this registry before falling
//     back to the default section switch.

import type { ComponentType } from 'react'
import type { Section, StoreTheme, StoreProduct } from './store-schema'

// ── Registry entry ──────────────────────────────────────────

export interface RegistryEntry {
  /** Design library family name (e.g. 'hero', 'cta', 'testimonials') */
  family: string;
  /** Design library variant id (e.g. 'editorial_product_still_life') */
  variant: string;
  /** Full component id in the library (e.g. 'hero.editorial_product_still_life') */
  componentId: string;
  /** The Storqly section type this maps to (for fallback rendering) */
  sectionType: string;
  /** Optional: a custom React component for this variant.
   *  When null/undefined, the default section renderer handles it. */
  Component?: ComponentType<SectionRendererProps>;
  /** Tags for filtering/selection */
  tags?: string[];
  /** Conflicts — other componentIds that shouldn't be adjacent */
  conflictsWith?: string[];
}

// ── Renderer props shared by all registered components ──────
// Matches the shape passed by StoreRenderer's renderSection calls.

export interface SectionRendererProps {
  section: Section;
  theme: StoreTheme;
  products: StoreProduct[];
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
  onViewProduct?: (productId: string) => void;
  onNavigate?: (slug: string) => void;
  forceHideAddToCart?: boolean;
  /** CSS custom properties from variant config — applied to section wrapper */
  variantCssVars?: Record<string, string>;
  /** Extra Tailwind classes from variant config — appended to section wrapper */
  variantExtraClasses?: string;
  /** Product card style variant from design library */
  cardStyle?: string;
}

// ── Registry implementation ──────────────────────────────────

class ComponentRegistry {
  private entries: Map<string, RegistryEntry> = new Map()
  private familyIndex: Map<string, Map<string, RegistryEntry>> = new Map()

  /** Register a component variant. */
  register(entry: RegistryEntry): void {
    this.entries.set(entry.componentId, entry)
    // Index by family.variant for fast lookup
    if (!this.familyIndex.has(entry.family)) {
      this.familyIndex.set(entry.family, new Map())
    }
    this.familyIndex.get(entry.family)!.set(entry.variant, entry)
  }

  /** Look up by full component id (e.g. 'hero.editorial_product_still_life') */
  getByComponentId(componentId: string): RegistryEntry | undefined {
    return this.entries.get(componentId)
  }

  /** Look up by family + variant */
  getByFamilyVariant(family: string, variant: string): RegistryEntry | undefined {
    return this.familyIndex.get(family)?.get(variant)
  }

  /** Get all variants for a family */
  getVariantsByFamily(family: string): RegistryEntry[] {
    const familyMap = this.familyIndex.get(family)
    if (!familyMap) return []
    return Array.from(familyMap.values())
  }

  /** Get all registered entries */
  getAll(): RegistryEntry[] {
    return Array.from(this.entries.values())
  }

  /** Check if two componentIds conflict (shouldn't be adjacent) */
  hasConflict(idA: string, idB: string): boolean {
    const a = this.entries.get(idA)
    return a ? (a.conflictsWith ?? []).includes(idB) : false
  }

  /** Total number of registered variants */
  get size(): number {
    return this.entries.size
  }
}

// ── Singleton instance ──────────────────────────────────────

export const componentRegistry = new ComponentRegistry()

// ── Legacy section type → family mapping ─────────────────────
// Maps current Storqly section types to design library family names.
// This ensures existing stores can be upgraded to library-awareness.

export const SECTION_TYPE_TO_FAMILY: Record<string, string> = {
  'hero': 'hero',
  'featured-products': 'featured-product',
  'product-grid': 'product-grid',
  'text-banner': 'editorial',
  'image-gallery': 'gallery',
  'testimonials': 'testimonials',
  'newsletter': 'newsletter',
  'faq': 'feature-benefits',
  'cta': 'cta',
  'categories': 'category',
  'brand-statement': 'brand-story',
  'header': 'header',
  'footer': 'footer',
  'rich-text': 'editorial',
  'spacer': 'global-primitives',
  'divider': 'global-primitives',
}

// ── Hero layout → variant hint mapping ───────────────────────
// Maps current hero layouts to the closest design library hero variants.
// Used during migration/interpolation — not a hard requirement.

export const HERO_LAYOUT_TO_VARIANT_HINT: Record<string, string> = {
  'centered': 'editorial_masthead',
  'split-left': 'split_context_product',
  'split-right': 'split_context_product',
  'product-first': 'editorial_product_still_life',
  'text-first': 'fullbleed_copy_safe_area',
  'minimal': 'editorial_masthead',
}

// ── Initialization ───────────────────────────────────────────
// Register all CURRENT section types as base entries.
// When the design library is integrated, these will be supplemented
// with the 73 library variants.

function initializeBaseRegistry(): void {
  const baseTypes = [
    'hero', 'featured-products', 'product-grid', 'text-banner',
    'image-gallery', 'testimonials', 'newsletter', 'faq',
    'cta', 'categories', 'brand-statement', 'header', 'footer',
    'rich-text', 'spacer', 'divider',
  ]

  for (const type of baseTypes) {
    const family = SECTION_TYPE_TO_FAMILY[type] ?? 'global-primitives'
    componentRegistry.register({
      family,
      variant: 'default',
      componentId: `${family}.default`,
      sectionType: type,
      tags: ['legacy', type],
    })
  }
}

// Auto-initialize on import
initializeBaseRegistry()
