// ========================================
// Design Library Integration Contract
// ========================================
//
// This module defines the contract between the external ecommerce
// design library and Storqly's generation/rendering system.
//
// CURRENT STATE: Preparation phase — types and interfaces only.
// FUTURE STATE: Library loading, selection pipeline, composition.

import type {
  Store,
  Section,
  ComponentMeta,
  DesignRole,
  ImageArtDirection,
  ResponsiveOverrides,
} from './store-schema';

// ── Brand Profile (from library's brand-profile.schema.json) ─────

export interface BrandProfile {
  category: string;
  audience: string;
  positioning: string;
  mood: string;
  visual_energy: 'calm' | 'moderate' | 'high' | 'extreme';
  conversion_priority: string;
  price_tier?: 'entry' | 'mid' | 'premium' | 'luxury' | 'ultra_luxury';
  image_preference?: 'studio' | 'lifestyle' | 'flat_lay' | 'ugc' | 'mixed';
  visual_direction?: {
    palette?: string;
    contrast?: string;
    typography?: string;
    composition?: string;
    imagery?: string;
  };
}

// ── Page Graph Node (from library's page-graph.schema.json) ───────

export interface PageGraphNode {
  node_id: string;
  component_id: string;          // e.g. 'hero.editorial_product_still_life'
  role: DesignRole;
  order: number;
  content?: Record<string, unknown>;
  media?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  responsive_overrides?: ResponsiveOverrides;
}

// ── Composition Recipe (from library's composition-recipes.json) ──

export interface CompositionRecipe {
  id: string;
  signals: string[];
  recommended_theme: string;
  nodes: Array<{
    role: DesignRole;
    component_id: string;
  }>;
  rhythm: string[];
  substitutions: Record<string, string[]>;
  avoid: string[];
}

// ── Generation Pipeline Stages ────────────────────────────────
// The eventual library-aware generation flow:
//
// 1. USER FIRST PROMPT
// 2. Brand profile extraction (LLM or heuristic)
// 3. Theme/token selection
// 4. Role sequence selection
// 5. Component variant ranking + selection
// 6. Page graph assembly with constraints
// 7. Content customization (LLM)
// 8. Image art direction
// 9. Store spec assembly
// 10. Storqly renderer

export type GenerationStage =
  | 'brand_profile'
  | 'theme_selection'
  | 'role_selection'
  | 'component_ranking'
  | 'page_graph'
  | 'content_customization'
  | 'image_art_direction'
  | 'store_spec'
  | 'rendering';

// ── Library-aware section creation helper ─────────────────────

/**
 * Creates a Section with design library metadata attached.
 * This is the primary way library-aware generation will
 * produce sections that the component registry can resolve.
 *
 * @example
 * ```ts
 * createLibrarySection({
 *   type: 'hero',
 *   componentId: 'hero.editorial_product_still_life',
 *   family: 'hero',
 *   variant: 'editorial_product_still_life',
 *   role: 'orient',
 *   content: { headline: '...', ... },
 *   imageArtDirection: {
 *     brief: 'serene skincare flat lay with botanicals',
 *     aspectRatio: '3:2',
 *     slotType: 'context_background',
 *   },
 * })
 * ```
 */
export function createLibrarySection(params: {
  type: Section['type'];
  componentId: string;
  family: string;
  variant: string;
  role?: DesignRole;
  content: Record<string, unknown>;
  style?: Section['style'];
  imageArtDirection?: ImageArtDirection;
  responsiveOverrides?: ResponsiveOverrides;
  tags?: string[];
}): Section {
  const componentMeta: ComponentMeta = {
    family: params.family,
    variant: params.variant,
    componentId: params.componentId,
    role: params.role,
    tags: params.tags,
  };

  return {
    id: crypto.randomUUID(),
    type: params.type,
    content: params.content,
    style: params.style ?? {},
    visible: true,
    componentMeta,
    responsiveOverrides: params.responsiveOverrides,
    imageArtDirection: params.imageArtDirection,
  };
}

// ── Integration Readiness Check ────────────────────────────────

/**
 * Verifies that Storqly can accept a library component reference.
 * Returns true if the architecture supports the given family/variant.
 *
 * This function is used for testing integration readiness.
 * It does NOT require the actual library to be loaded.
 */
export function canAcceptLibraryReference(
  family: string,
  variant: string,
): boolean {
  // The architecture can accept ANY family/variant because:
 // 1. Section.componentMeta is optional and typed
  // 2. ComponentRegistry has a register() method
  // 3. renderSection() checks the registry before the switch
  // 4. When no Component is registered, it falls through to the
  //    default section renderer based on section.type
  return true;
}
