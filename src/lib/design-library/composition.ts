// ========================================
// Design Library Composition Engine
// ========================================
// Selects component variants for each page role,
// produces a page graph, and builds prompt context.
//
// GAP 4: Only PAGE_SECTION components become top-level nodes.
//         Sub-components (button, product-card, navigation, commerce-pattern)
//         are filtered out — they are consumed by their parent sections.
// GAP 5: Exactly ONE primary hero is selected.
//         Additional orient nodes that are heroes are skipped.

import type { BrandProfile, CompositionResult, VariantSummary, ImageArtDirectionSummary } from './design-intent';
import type { DesignRole } from './design-intent';
import type { CompositionRecipe } from '@/lib/design-library-contract';
import { loadDesignLibrary, getLibraryMetadata } from './loader';
import type { LibraryComponent } from './loader';
import { componentRegistry } from '@/lib/component-registry';
import { isPageSection } from './variant-categories';
import type { DesignDirection } from './design-direction';
import { inferDesignDirection } from './design-direction';
import { resolveDesignTokens, getTokenCssVars } from './token-resolver';
import { computeVisualRhythm, getRhythmCssVars } from './visual-rhythm';

// ── Role ordering weights for page composition ─────────
const ROLE_ORDER: DesignRole[] = [
  'orient',
  'merchandise',
  'educate',
  'differentiate',
  'reassure',
  'engage',
  'convert',  'retain',
];

// ── Scoring weights ─────────────────────────────────────
const W = {
  signal_match: 0.28,
  asset_fit: 0.18,
  goal_fit: 0.16,
  visual_energy_fit: 0.14,
  responsive_fit: 0.12,
  adjacency_fit: 0.12,
};

// ── Score a component against design intent ──────────────────

function scoreComponent(
  component: LibraryComponent,
  profile: BrandProfile,
  requiredRole: DesignRole,
  adjacentIds: string[],
  dd?: DesignDirection,
): number {
  let score = 0.5; // base

  // Signal match: how well component's useWhen matches the brand profile
  const signals = [
    profile.category, profile.audience, profile.positioning, profile.mood,
    profile.visual_energy, profile.conversion_priority,
  ];
  const signalOverlap = component.useWhen.filter(uw => signals.some(s => uw.includes(s) || s.includes(uw))).length;
  score += W.signal_match * (signalOverlap / Math.max(component.useWhen.length, 1));

  // AvoidWhen penalty
  const avoidHits = component.avoidWhen.filter(aw =>
    [profile.category, profile.audience, profile.positioning, profile.mood].some(s => aw.includes(s))
  ).length;
  score -= 0.16 * avoidHits;

  // Visual energy fit
  const energyMap: Record<string, number> = { calm: 0, moderate: 1, high: 2, extreme: 3 };
  const compEnergy = component.useWhen.some(uw => ['high_energy', 'bold', 'campaign', 'streetwear', 'dark', 'drop'].includes(uw)) ? 2 : 0;
  const intentEnergy = energyMap[profile.visual_energy] ?? 1;
  const energyDiff = Math.abs(compEnergy - intentEnergy);
  score -= 0.14 * (energyDiff / 3);

  // Goal fit
  if (profile.conversion_priority === 'conversion' && component.tags?.includes('conversion')) score += W.goal_fit;
  if (profile.conversion_priority === 'awareness' && component.tags?.includes('editorial')) score += W.goal_fit;

  // ── DesignDirection-aware scoring bonuses ─────────────
  if (dd) {
    // Aesthetic match: bonus when component's visual style aligns with dd.visual.aesthetic
    const aestheticMatch = component.visualStyle?.some(vs =>
      vs.includes(dd.visual.aesthetic) || dd.visual.aesthetic.includes(vs)
    );
    if (aestheticMatch) score += 0.1;

    // Sophistication bonus: higher sophistication components get a bonus for high sophistication DD
    if (dd.visual.sophistication === 'high' || dd.visual.sophistication === 'ultra') {
      if (component.tags?.includes('premium') || component.tags?.includes('luxury') || component.visualStyle?.includes('refined')) {
        score += 0.08;
      }
    }

    // CTA strategy match for convert role
    if (requiredRole === 'convert') {
      if (dd.commerce.ctaStrategy === 'subtle' && component.tags?.includes('editorial')) score += 0.06;
      if (dd.commerce.ctaStrategy === 'urgent' && component.tags?.includes('urgency')) score += 0.06;
      if (dd.commerce.ctaStrategy === 'direct' && component.tags?.includes('conversion')) score += 0.06;
    }

    // Merchandising priority match for merchandise role
    if (requiredRole === 'merchandise') {
      if (dd.commerce.merchandisingPriority === 'editorial' && component.tags?.includes('editorial')) score += 0.06;
      if (dd.commerce.merchandisingPriority === 'conversion' && component.tags?.includes('conversion')) score += 0.06;
    }

    // Preferred hero archetype bonus
    if (requiredRole === 'orient' && dd.design.preferredHeroArchetype.length > 0) {
      const variantId = component.id.replace(`${component.family}.`, '');
      if (dd.design.preferredHeroArchetype.includes(variantId)) {
        score += 0.15;
      }
    }

    // Preferred card archetype bonus
    if (requiredRole === 'merchandise' && dd.design.preferredCardArchetype) {
      const variantId = component.id.replace(`${component.family}.`, '');
      if (variantId.includes(dd.design.preferredCardArchetype)) {
        score += 0.1;
      }
    }
  }

  // Adjacency: penalize same-family or same-geometry adjacent
  for (const adjId of adjacentIds) {
    const adjFamily = componentRegistry.getByComponentId(adjId)?.family;
    if (adjFamily === component.family) score -= 0.12;
    if (component.incompatibleWith?.includes(adjId)) score -= 0.16;
  }

  return Math.max(0, Math.min(1, score));
}

// ── Select best variant for a role ─────────────────────────

function selectVariantForRole(
  role: DesignRole,
  components: LibraryComponent[],
  profile: BrandProfile,
  selectedIds: string[],
  dd?: DesignDirection,
): LibraryComponent | null {
  const candidates = components.filter(c => {
    // GAP 4: Only consider PAGE_SECTION components (exclude sub-components)
    if (!isPageSection(c.family)) return false;

    // Check if this component's role matches (inferred from intent/tags)
    const roleMap: Record<string, string[]> = {
      orient: ['hero'],
      merchandise: ['product-grid', 'featured-product', 'collection', 'category'],
      educate: ['feature-benefits', 'editorial', 'brand-story'],
      differentiate: ['brand-story', 'gallery', 'editorial'],
      reassure: ['trust', 'testimonials', 'featured-product'],
      engage: ['gallery', 'collection', 'newsletter', 'cta'],
      convert: ['cta', 'newsletter', 'promotion'],
      retain: ['newsletter', 'trust', 'footer'],
    };
    const roles = roleMap[role] ?? [];
    return roles.some(r => c.family === r) || roles.some(r => c.tags?.some(t => t.includes(r)));
  });

  if (candidates.length === 0) return null;

  // Score and rank
  const scored = candidates.map(c => ({
    component: c,
    score: scoreComponent(c, profile, role, selectedIds, dd),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Return best, skipping already-selected (unless no other option)
  const best = scored[0];
  if (!selectedIds.includes(best.component.id)) return best.component;
  return scored.find(s => !selectedIds.includes(s.component.id))?.component ?? best.component;
}

// ── Select composition recipe ────────────────────────────────

function selectRecipe(
  profile: BrandProfile,
  recipes: CompositionRecipe[],
  dd?: DesignDirection,
): CompositionRecipe | null {
  if (recipes.length === 0) return null;

  const scored = recipes.map(recipe => {
    let score = 0.5;

    // ── Signal overlap scoring (0.3 weight) ────────────
    const overlap = recipe.signals.filter(s =>
      [profile.category, profile.audience, profile.positioning, profile.mood, profile.visual_energy]
        .some(p => s.includes(p))
    ).length;
    score += 0.3 * (overlap / Math.max(recipe.signals.length, 1));

    // ── Price tier match (reduced from 0.2 to 0.1) ──────
    const tierMap: Record<string, string[]> = {
      entry: ['fast_catalog_discovery'],
      mid: ['fast_catalog_discovery', 'approachable_home_craft'],
      premium: ['luxury_editorial_launch', 'single_product_conversion', 'editorial_campaign'],
      luxury: ['luxury_editorial_launch'],
      ultra_luxury: ['luxury_editorial_launch'],
    };
    const recipeBaseId = recipe.id.replace('recipe.', '');
    if (tierMap[profile.price_tier ?? 'mid']?.includes(recipeBaseId)) score += 0.1;

    // ── Category-aware scoring (0.25 weight) ───────────
    if (dd) {
      const categorySignal = dd.brand.category;
      const aestheticSignal = dd.visual.aesthetic;

      // Base category + aesthetic match against recipe signals
      const categoryAestheticOverlap = recipe.signals.filter(s =>
        s.includes(categorySignal) || s.includes(aestheticSignal) ||
        categorySignal.includes(s) || aestheticSignal.includes(s)
      ).length;
      score += 0.25 * (categoryAestheticOverlap / Math.max(recipe.signals.length, 1));

      // Special category-recipe affinities
      if (categorySignal.includes('skincare')) {
        if (recipeBaseId === 'science_backed_skincare') score += 0.3;
      }
      if (
        (categorySignal.includes('fashion') || categorySignal.includes('clothing') || categorySignal.includes('jewelry')) &&
        dd.visual.aesthetic === 'editorial'
      ) {
        if (recipeBaseId === 'luxury_editorial_launch') score += 0.2;
      }
      if (
        (categorySignal.includes('fashion') || categorySignal.includes('clothing')) &&
        dd.visual.aesthetic === 'campaign'
      ) {
        if (recipeBaseId === 'editorial_campaign') score += 0.2;
      }
      if (categorySignal.includes('fitness') || categorySignal.includes('sport')) {
        if (recipeBaseId === 'gen_z_drop_energy') score += 0.3;
      }
      if (
        (categorySignal.includes('home') || categorySignal.includes('craft') || categorySignal.includes('furniture'))
      ) {
        if (recipeBaseId === 'approachable_home_craft') score += 0.2;
      }
      if (categorySignal.includes('electronics') || categorySignal.includes('tech')) {
        if (recipeBaseId === 'fast_catalog_discovery') score += 0.2;
      }
    }

    // ── Negative scoring: recipe.avoid list ────────────
    if (recipe.avoid.length > 0) {
      const brandSignals = [
        profile.category, profile.audience, profile.positioning, profile.mood,
      ];
      const avoidHits = recipe.avoid.filter(a =>
        brandSignals.some(s => a.includes(s) || s.includes(a))
      ).length;
      score -= 0.2 * avoidHits;
    }

    return { recipe, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].recipe;
}

// ── PUBLIC: Compose a store from design intent ───────────────

export async function composeStore(
  prompt: string,
): Promise<CompositionResult | null> {
  // Load library data
  const { components, recipes, tokens } = await loadDesignLibrary();

  // Extract design intent (heuristic-based, no LLM call needed)
  const profile = extractDesignIntentHeuristic(prompt);

  // Infer design direction (Phase 2 enrichment)
  const dd = inferDesignDirection(prompt, profile);

  // Select recipe (now category-aware)
  const recipe = selectRecipe(profile, recipes, dd);
  if (!recipe) return null;

  // Select variant for each role in the recipe
  const nodes: CompositionResult['nodes'] = [];
  const selectedIds: string[] = [];
  const variantSummaries: VariantSummary[] = [];
  const artDirections: ImageArtDirectionSummary[] = [];

  // GAP 5: Track whether we have selected a primary hero
  let heroSelected = false;

  for (const recipeNode of recipe.nodes) {
    // GAP 4: Skip sub-component families (button, product-card, navigation, commerce-pattern)
    // These are consumed by their parent sections, not standalone page nodes.
    const recipeFamily = recipeNode.component_id.split('.')[0];
    if (!isPageSection(recipeFamily)) continue;

    // GAP 5: Only allow ONE primary hero
    // Skip any additional orient-role nodes whose family is 'hero'
    if (recipeNode.role === 'orient' && recipeFamily === 'hero') {
      if (heroSelected) continue;
      heroSelected = true;
    }

    // Prefer the recipe's recommended component when it exists in the library.
    // This respects the recipe's curated composition instead of always scoring.
    let variant = componentRegistry.getByComponentId(recipeNode.component_id)
      ? components.find(c => c.id === recipeNode.component_id)
      : null;

    // Fall back to scored selection if recipe component not found
    if (!variant) {
      variant = selectVariantForRole(
        recipeNode.role,
        components,
        profile,
        selectedIds,
        dd,
      );
    }
    if (!variant) continue;

    selectedIds.push(variant.id);
    nodes.push({
      node_id: `n-${nodes.length}`,
      component_id: variant.id,
      role: recipeNode.role,
      order: nodes.length,
    });

    // Build variant summary for prompt injection
    const summary: VariantSummary = {
      componentId: variant.id,
      family: variant.family,
      variant: variant.variant,
      intent: variant.intent,
      use_when: variant.useWhen,
      content_rules: variant.contentRules,
      style_hooks: variant.styleHooks,
      slots: variant.slots,
      layout: variant.layout.desktop,
      hero_architecture: variant.heroArchitecture as VariantSummary['hero_architecture'],
      image_guidance: variant.imageGuidance as VariantSummary['image_guidance'],
    };
    variantSummaries.push(summary);

    // Build image art direction if available
    if (variant.imageGuidance) {
      for (const [slotType, brief] of Object.entries(variant.imageGuidance)) {
        if (brief && typeof brief === 'string' && slotType !== 'prompt_frame') {
          artDirections.push({
            componentId: variant.id,
            slotType,
            brief,
            avoid: (variant.imageGuidance.avoid as string | undefined)?.split(',').map(s => s.trim()),
          });
        }
      }
    }
  }

  // ── Resolve design tokens ─────────────────────────────────
  const typographySystem = recipe.recommended_theme ?? 'modern_grotesk';
  const densityPreset = profile.visual_energy === 'extreme' ? 'compact' : profile.visual_energy === 'calm' ? 'airy' : 'balanced';

  const tokens = resolveDesignTokens({
    typographySystem,
    densityPreset: densityPreset as 'airy' | 'balanced' | 'compact',
    designDirection: dd,
  });
  const tokenCssVars = getTokenCssVars(tokens);

  // ── Compute visual rhythm per section ──────────────────────
  const sectionInputs = nodes.map(n => ({
    type: n.component_id.split('.')[0],
    role: n.role,
  }));
  const rhythmMap = computeVisualRhythm(sectionInputs, {
    designDirection: dd,
    recipeId: recipe.id,
    densityPreset: densityPreset as 'airy' | 'balanced' | 'compact',
    visualEnergy: dd?.visual.visualEnergy,
  });

  const sectionRhythm = nodes.map((_, idx) => {
    const config = rhythmMap[String(idx)];
    if (!config) return null;
    return {
      nodeIndex: idx,
      rhythmConfig: config,
      rhythmCssVars: getRhythmCssVars(config),
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    brandProfile: profile,
    recipeId: recipe.id,
    recipeName: recipe.id.replace(/_/g, ' '),
    nodes,
    variantSummaries,
    imageArtDirections: artDirections,
    typographySystem,
    densityPreset,
    designDirection: dd,
    tokenCssVars,
    sectionRhythm,
  };
}

// ── Heuristic design intent extraction (no LLM needed) ──────

function extractDesignIntentHeuristic(prompt: string): BrandProfile {
  const p = prompt.toLowerCase();

  // Category detection
  const categoryMap: Record<string, string[]> = {
    skincare: ['skincare', 'beauty', 'skin', 'cosmetic', 'serum', 'moisturizer', 'toner'],
    jewelry: ['jewelry', 'ring', 'necklace', 'bracelet', 'earring', 'gold', 'silver', 'diamond'],
    fashion: ['fashion', 'clothing', 'apparel', 'wear', 'outfit', 'streetwear', 'shoe', 'bag'],
    food: ['food', 'beverage', 'drink', 'coffee', 'tea', 'snack', 'meal', 'bakery', 'restaurant'],
    home: ['home', 'furniture', 'decor', 'interior', 'kitchen', 'bedding', 'candle'],
    wellness: ['wellness', 'fitness', 'yoga', 'supplement', 'health', 'organic'],
    electronics: ['electronics', 'tech', 'gadget', 'phone', 'laptop', 'computer'],
    watches: ['watch', 'watches', 'timepiece', 'chronograph', 'luxury watch'],
    art: ['art', 'print', 'poster', 'gallery', 'studio', 'creative'],
  };

  let detectedCategory = 'general retail';
  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(kw => p.includes(kw))) { detectedCategory = cat; break; }
  }

  // Audience
  let audience = 'all';
  if (p.includes('luxury') || p.includes('premium') || p.includes('high-end')) audience = 'luxury buyers';
  else if (p.includes('streetwear')) audience = 'Gen Z / young adults';
  else if (p.includes('gen z') || p.includes('genz') || p.includes('youth')) audience = 'Gen Z / young adults';
  else if (p.includes('men') || p.includes('women') || p.includes('unisex')) audience = p.includes('men') && p.includes('women') ? 'all genders' : p.includes('men') ? 'men' : 'women';
  else if (p.includes('professional') || p.includes('busy')) audience = 'busy professionals';

  // Positioning
  let positioning = 'quality-focused';
  if (p.includes('affordable') || p.includes('budget') || p.includes('cheap')) positioning = 'value-focused';
  else if (p.includes('luxury') || p.includes('premium') || p.includes('high-end')) positioning = 'premium';
  else if (p.includes('minimalist') || p.includes('minimal') || p.includes('clean')) positioning = 'minimalist';
  else if (p.includes('trendy') || p.includes('fashion-forward')) positioning = 'trendsetter';

  // Mood
  let mood = 'modern';
  if (p.includes('luxurious') || p.includes('sophisticated') || p.includes('elegant')) mood = 'refined';
  else if (p.includes('bold') || p.includes('energetic') || p.includes('vibrant') || p.includes('streetwear')) mood = 'bold';
  else if (p.includes('calm') || p.includes('serene') || p.includes('peaceful') || p.includes('soft')) mood = 'calm';
  else if (p.includes('dark') || p.includes('moody') || p.includes('noir')) mood = 'dramatic';
  else if (p.includes('warm') || p.includes('organic') || p.includes('natural')) mood = 'warm';
  else if (p.includes('playful') || p.includes('fun') || p.includes('colorful')) mood = 'playful';

  // Streetwear detection → audience + mood overrides
  if (p.includes('streetwear')) {
    audience = 'Gen Z / young adults';
    mood = 'bold';
  }

  // Skincare + clinical → mood override to calm
  if ((p.includes('skincare') || p.includes('beauty') || p.includes('serum')) &&
      (p.includes('clinical') || p.includes('science') || p.includes('lab') || p.includes('dermatolog'))) {
    mood = 'calm';
  }

  // Visual energy
  let visual_energy: BrandProfile['visual_energy'] = 'moderate';
  if (p.includes('high energy') || p.includes('bold') || p.includes('streetwear') || p.includes('dark campaign') || p.includes('aggressive')) visual_energy = 'extreme';
  else if (p.includes('calm') || p.includes('serene') || p.includes('quiet') || p.includes('luxury') || p.includes('editorial')) visual_energy = 'calm';
  else if (p.includes('modern') || p.includes('minimal') || p.includes('clean') || p.includes('contemporary')) visual_energy = 'moderate';
  else if (p.includes('energetic') || p.includes('vibrant') || p.includes('playful') || p.includes('colorful')) visual_energy = 'high';

  // Conversion priority
  let conversion_priority: BrandProfile['conversion_priority'] = 'consideration';
  if (p.includes('buy now') || p.includes('shop now') || p.includes('limited') || p.includes('drop')) conversion_priority = 'conversion';
  else if (p.includes('explore') || p.includes('discover') || p.includes('learn')) conversion_priority = 'awareness';

  // Price tier
  let price_tier: BrandProfile['price_tier'] = 'mid';
  if (p.includes('ultra luxury')) price_tier = 'ultra_luxury';
  else if (p.includes('luxury')) price_tier = 'luxury';
  else if (p.includes('premium') || p.includes('high-end')) price_tier = 'premium';
  else if (p.includes('budget') || p.includes('affordable') || p.includes('entry')) price_tier = 'entry';
  else if (p.includes('mid-range')) price_tier = 'mid';

  return {
    category: detectedCategory,
    audience,
    positioning,
    mood,
    visual_energy,
    conversion_priority,
    price_tier,
  };
}
