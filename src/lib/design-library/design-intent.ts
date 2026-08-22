// ========================================
// Design Intent Extraction + Composition Engine
// ========================================
// Extracts structured design intent from a user prompt,
// selects an appropriate composition recipe, and
// produces a page graph with component variant selections.

import type { DesignRole } from '@/lib/store-schema';
export type { DesignRole };

// ── Brand Profile (matches library's brand-profile.schema.json) ──────

export interface BrandProfile {
  category: string;
  audience: string;
  positioning: string;
  mood: string;
  visual_energy: 'calm' | 'moderate' | 'high' | 'extreme';
  conversion_priority: 'awareness' | 'consideration' | 'conversion';
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

// ── Page Graph Node (what the composition engine produces) ──────

export interface PageGraphNode {
  node_id: string;
  component_id: string;
  role: DesignRole;
  order: number;
}

// ── Composition Result ──────────────────────────────────────

export interface CompositionResult {
  brandProfile: BrandProfile;
  recipeId: string;
  recipeName: string;
  nodes: PageGraphNode[];
  variantSummaries: VariantSummary[];
  imageArtDirections: ImageArtDirectionSummary[];
  typographySystem: string;
  densityPreset: string;
  designDirection?: import('./design-direction').DesignDirection;
}

// ── Library-aware prompt context (injected into generation system prompt) ──

export interface LibraryPromptContext {
  brandProfile: BrandProfile;
  recipeName: string;
  nodes: PageGraphNode[];
  variantSummaries: VariantSummary[];
  imageArtDirections: ImageArtDirectionSummary[];
}

export interface VariantSummary {
  componentId: string;
  family: string;
  variant: string;
  intent: string;
  use_when: string[];
  content_rules: Record<string, unknown>;
 style_hooks: string[];
  slots?: string[];
  layout: string;
  hero_architecture?: {
    structure: string;
    text_placement: string;
    product_placement: string;
    background_requirements: string;
    cta_placement: string;
    overlay_behavior: string;
    typography_behavior: string;
    breakpoints: Record<string, string>;
  };
  image_guidance?: {
    background?: string;
    product?: string;
    context?: string;
    prompt_frame?: string;
    campaign?: string;
    masthead?: string;
    ingredient?: string;
    ugc?: string;
    gallery?: string;
    lookbook?: string;
    items?: string;
  };
}

export interface ImageArtDirectionSummary {
  componentId: string;
  slotType: string;
  brief?: string;
  aspectRatio?: string;
  mood?: string[];
  avoid?: string[];
}

export type { DesignDirection } from './design-direction';

// ── Recipe type ────────────────────────────────────────────

export interface LibraryRecipe {
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

// ── Library component (simplified for composition) ──────

export interface LibraryComponent {
  id: string;
  family: string;
  variant: string;
  intent: string;
  use_when: string[];
  avoid_when: string[];
  slots: string[];
  layout: Record<string, string>;
  style_hooks: string[];
  compatible_with: string[];
  incompatible_with: string[];
  content_rules: Record<string, unknown>;
  tags: string[];
  hero_architecture?: {
    structure: string;
    text_placement: string;
    product_placement: string;
    background_requirements: string;
    cta_placement: string;
    overlay_behavior: string;
    typography_behavior: string;
    breakpoints: Record<string, string>;
  };
  image_guidance?: Record<string, string>;
}
