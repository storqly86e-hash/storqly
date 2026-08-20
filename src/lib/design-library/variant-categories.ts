// ========================================
// Variant Categories
// ========================================
//
// Classifies design library families into high-level categories
// that determine how they're used in the composition and
// rendering pipeline.
//
//   PAGE_SECTION    — Top-level sections rendered on a store page
//   SUB_COMPONENT   — Reusable building blocks embedded inside sections
//   UTILITY         — Cross-cutting patterns (commerce helpers, etc.)
//   PATTERN         — Compositional design patterns (reserved for future use)

// ── Category type ──────────────────────────────────────────

export type ComponentCategory = 'PAGE_SECTION' | 'SUB_COMPONENT' | 'UTILITY' | 'PATTERN'

// ── Family → category mapping ───────────────────────────────

const PAGE_SECTION_FAMILIES = new Set([
  'hero',
  'product-grid',
  'collection',
  'category',
  'featured-product',
  'testimonials',
  'trust',
  'promotion',
  'cta',
  'newsletter',
  'brand-story',
  'editorial',
  'feature-benefits',
  'gallery',
  'footer',
  'header',
  'announcement',
])

export const SUB_COMPONENT_FAMILIES = new Set([
  'button',
  'product-card',
  'navigation',
  'commerce-pattern',
])

const UTILITY_FAMILIES = new Set([
  'global-primitives',
])

// ── Lookup helpers ──────────────────────────────────────────

/**
 * Return the category for a given family name.
 * Defaults to 'PATTERN' for unknown families.
 */
export function getComponentCategory(family: string): ComponentCategory {
  if (PAGE_SECTION_FAMILIES.has(family)) return 'PAGE_SECTION'
  if (SUB_COMPONENT_FAMILIES.has(family)) return 'SUB_COMPONENT'
  if (UTILITY_FAMILIES.has(family)) return 'UTILITY'
  return 'PATTERN'
}

/**
 * Quick check: is this family a top-level page section?
 */
export function isPageSection(family: string): boolean {
  return PAGE_SECTION_FAMILIES.has(family)
}
