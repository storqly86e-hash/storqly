// ========================================
// ComponentMeta Validator + Fixer
// ========================================
// GAP 1: Validates AI-generated componentMeta on each section.
// - Checks that componentId exists in the registry
// - Fixes invalid IDs by finding a compatible replacement
// - Attaches missing componentMeta from composition context
// - Never crashes generation, never silently accepts invalid IDs

import type { Section, ComponentMeta, Store, DesignRole } from '@/lib/store-schema';
import { componentRegistry } from '@/lib/component-registry';
import { getVariantMapping } from './variant-mapping';
import type { CompositionResult } from './design-intent';
import { isPageSection } from './variant-categories';

// ── Build a set of valid component IDs from the registry ──

function getValidComponentIds(): Set<string> {
  const ids = new Set<string>();
  for (const entry of componentRegistry.getAll()) {
    ids.add(entry.componentId);
  }
  return ids;
}

// ── Find a compatible replacement for an invalid componentId ──

function findCompatibleReplacement(
  sectionType: string,
  family?: string,
  role?: DesignRole,
): { componentId: string; family: string; variant: string } | null {
  // Strategy 1: If family is valid, find any variant in that family
  if (family) {
    const familyVariants = componentRegistry.getVariantsByFamily(family);
    // Prefer variants that map to the correct section type
    const compatible = familyVariants.find(v => v.sectionType === sectionType);
    if (compatible) {
      return {
        componentId: compatible.componentId,
        family: compatible.family,
        variant: compatible.variant,
      };
    }
    // Fall back to any variant in the family
    if (familyVariants.length > 0) {
      const v = familyVariants[0];
      return { componentId: v.componentId, family: v.family, variant: v.variant };
    }
  }

  // Strategy 2: Find a library variant that maps to this section type
  const sectionTypeToFamily: Record<string, string> = {
    'hero': 'hero',
    'featured-products': 'featured-product',
    'product-grid': 'product-grid',
    'text-banner': 'trust',
    'image-gallery': 'gallery',
    'testimonials': 'testimonials',
    'newsletter': 'newsletter',
    'faq': 'feature-benefits',
    'cta': 'cta',
    'categories': 'collection',
    'brand-statement': 'brand-story',
    'rich-text': 'editorial',
  };

  const guessedFamily = sectionTypeToFamily[sectionType];
  if (guessedFamily) {
    const familyVariants = componentRegistry.getVariantsByFamily(guessedFamily);
    if (familyVariants.length > 0) {
      const v = familyVariants[0];
      return { componentId: v.componentId, family: v.family, variant: v.variant };
    }
  }

  return null;
}

// ── Infer family from section type ──

const SECTION_TYPE_FAMILY_MAP: Record<string, string> = {
  'hero': 'hero',
  'featured-products': 'featured-product',
  'product-grid': 'product-grid',
  'text-banner': 'trust',
  'image-gallery': 'gallery',
  'testimonials': 'testimonials',
  'newsletter': 'newsletter',
  'faq': 'feature-benefits',
  'cta': 'cta',
  'categories': 'collection',
  'brand-statement': 'brand-story',
  'rich-text': 'editorial',
  'header': 'header',
  'footer': 'footer',
};

// ── PUBLIC: Validate and fix componentMeta on all sections ──

export interface ValidationResult {
  totalSections: number;
  sectionsWithMeta: number;
  validMeta: number;
  fixedMeta: number;
  attachedMissingMeta: number;
  errors: string[];
}

/**
 * Validates and fixes componentMeta on every section in the store.
 * When a composition context is available, uses it to attach the correct
 * componentMeta. When not available, validates/fixed AI-generated meta.
 *
 * This function NEVER throws. It always returns a valid store.
 */
export function validateAndFixComponentMeta(
  store: Store,
  compositionCtx: CompositionResult | null,
): { store: Store; result: ValidationResult } {
  const validIds = getValidComponentIds();
  const result: ValidationResult = {
    totalSections: 0,
    sectionsWithMeta: 0,
    validMeta: 0,
    fixedMeta: 0,
    attachedMissingMeta: 0,
    errors: [],
  };

  // If we have a composition context, build a node→componentId map
  const compNodes = compositionCtx?.nodes ?? [];
  const compVariants = compositionCtx?.variantSummaries ?? [];

  for (const page of store.pages) {
    for (let i = 0; i < page.sections.length; i++) {
      const section = page.sections[i];
      result.totalSections++;

      // Skip invisible sections
      if (!section.visible) continue;

      // Skip spacers/dividers — they don't get componentMeta
      if (section.type === 'spacer' || section.type === 'divider') continue;

      // ── Strategy 1: If composition context exists, match by type compatibility ──
      // Build a family compatibility map from composition nodes.
      // Instead of matching by position (which causes hero meta on product sections),
      // we match composition nodes to generated sections by compatible section type.
      if (compNodes.length > 0) {
        const sectionType = section.type;
        const sectionFamily = SECTION_TYPE_FAMILY_MAP[sectionType];

        // Find all composition nodes whose family is compatible with this section's type.
        // A composition node's family is the part before the '.' in component_id.
        const compatibleNodes = compNodes.filter(node => {
          const [nodeFamily] = node.component_id.split('.');
          // Direct family match: hero→hero, cta→cta, etc.
          if (nodeFamily === sectionFamily) return true;
          // Cross-family type compatibility: featured-product and product-grid can both map to product sections
          if ((nodeFamily === 'featured-product' || nodeFamily === 'product-grid') &&
              (sectionType === 'featured-products' || sectionType === 'product-grid')) return true;
          // collection/category → categories
          if ((nodeFamily === 'collection' || nodeFamily === 'category') && sectionType === 'categories') return true;
          // trust/promotion → text-banner
          if ((nodeFamily === 'trust' || nodeFamily === 'promotion') && sectionType === 'text-banner') return true;
          // feature-benefits → faq
          if (nodeFamily === 'feature-benefits' && sectionType === 'faq') return true;
          return false;
        });

        if (compatibleNodes.length > 0) {
          // Pick the first compatible node that hasn't been assigned yet.
          // Use position within compatible set as tiebreaker.
          const usedComponentIds = new Set<string>();
          // Scan previous sections for already-assigned composition IDs
          for (const prevPage of store.pages) {
            for (const prevSection of prevPage.sections) {
              if (prevSection.componentMeta?.componentId && prevSection !== section) {
                usedComponentIds.add(prevSection.componentMeta.componentId);
              }
            }
          }

          const availableNode = compatibleNodes.find(n => !usedComponentIds.has(n.component_id))
            ?? compatibleNodes[0];

          const [family, variant] = availableNode.component_id.split('.');
          const meta: ComponentMeta = {
            componentId: availableNode.component_id,
            family,
            variant,
            role: availableNode.role,
          };
          section.componentMeta = meta;
          result.attachedMissingMeta++;
          result.sectionsWithMeta++;
          continue;
        }
        // No compatible node found — fall through to Strategy 2/3
      }

      // ── Strategy 2: Validate AI-generated componentMeta ──
      const existingMeta = section.componentMeta;
      if (existingMeta?.componentId) {
        result.sectionsWithMeta++;

        if (validIds.has(existingMeta.componentId)) {
          // Valid — ensure family/variant are populated
          if (!existingMeta.family || !existingMeta.variant) {
            const entry = componentRegistry.getByComponentId(existingMeta.componentId);
            if (entry) {
              existingMeta.family = existingMeta.family || entry.family;
              existingMeta.variant = existingMeta.variant || entry.variant;
            }
          }
          result.validMeta++;
        } else {
          // Invalid ID — find a compatible replacement
          const replacement = findCompatibleReplacement(
            section.type,
            existingMeta.family,
            existingMeta.role,
          );
          if (replacement) {
            section.componentMeta = {
              componentId: replacement.componentId,
              family: replacement.family,
              variant: replacement.variant,
              role: existingMeta.role,
              tags: existingMeta.tags,
            };
            result.fixedMeta++;
            result.errors.push(
              `Fixed invalid componentId '${existingMeta.componentId}' -> '${replacement.componentId}' on section type '${section.type}'`
            );
          } else {
            // No replacement found — strip the invalid meta
            result.errors.push(
              `Could not fix invalid componentId '${existingMeta.componentId}' on section type '${section.type}' — meta removed`
            );
            delete section.componentMeta;
          }
        }
      } else {
        // ── Strategy 3: No meta at all — try to infer from section type ──
        const inferredFamily = SECTION_TYPE_FAMILY_MAP[section.type];
        if (inferredFamily && isPageSection(inferredFamily)) {
          const familyVariants = componentRegistry.getVariantsByFamily(inferredFamily);
          if (familyVariants.length > 0) {
            // Pick first non-default, non-legacy variant if possible
            const libraryVariant = familyVariants.find(v => !v.componentId.endsWith('.default'))
              ?? familyVariants[0];
            section.componentMeta = {
              componentId: libraryVariant.componentId,
              family: libraryVariant.family,
              variant: libraryVariant.variant,
            };
            result.attachedMissingMeta++;
          }
        }
      }
    }
  }

  // Also attach designLibrary metadata to the store
  if (compositionCtx) {
    store.designLibrary = {
      version: '1.0.0',
      recipe: compositionCtx.recipeId,
      typographySystem: compositionCtx.typographySystem,
      densityPreset: compositionCtx.densityPreset,
      // Include compositionResult so the renderer can consume
      // design tokens and per-section visual rhythm.
      compositionResult: {
        tokenCssVars: compositionCtx.tokenCssVars,
        sectionRhythm: compositionCtx.sectionRhythm,
      },
    };
  }

  return { store, result };
}
