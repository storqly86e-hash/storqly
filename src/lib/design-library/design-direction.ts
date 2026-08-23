// ========================================
// Design Direction — Canonical Type & Inference
// ========================================
//
// Defines the full DesignDirection interface that bridges
// the BrandProfile (heuristic extraction) to the composition
// engine's recipe/variant scoring. This is Phase 2's
// canonical design-direction module.

import type { BrandProfile } from './design-intent';

// ── DesignDirection interface ────────────────────────────────

export interface DesignDirection {
  brand: {
    category: string;
    subcategory: string;
    audience: string;
    pricePositioning: string;
    brandPersonality: string;
    productCharacteristics: string[];
  };
  visual: {
    aesthetic: string;
    mood: string;
    sophistication: 'low' | 'medium' | 'high' | 'ultra';
    visualEnergy: 'calm' | 'moderate' | 'high' | 'extreme';
    minimalism: 'low' | 'medium' | 'high';
    density: 'airy' | 'balanced' | 'compact';
    contrastLevel: 'low' | 'medium' | 'high';
    colorStrategy: 'monochrome' | 'neutral_accent' | 'rich_palette' | 'brand_bold';
    typographyStrategy: 'serif_led' | 'sans_led' | 'mono_led' | 'mixed_serif_sans';
    radiusLanguage: 'none' | 'sharp' | 'subtle' | 'rounded' | 'pill';
    elevationLanguage: 'flat' | 'subtle' | 'medium' | 'dramatic';
    imageDirection: 'studio' | 'lifestyle' | 'flat_lay' | 'ugc' | 'campaign' | 'ingredient';
  };
  commerce: {
    conversionObjective: string;
    merchandisingPriority: string;
    ctaStrategy: 'subtle' | 'inviting' | 'direct' | 'urgent';
    trustRequirements: 'low' | 'medium' | 'high';
  };
  content: {
    storytellingIntensity: 'low' | 'medium' | 'high';
    educationIntensity: 'low' | 'medium' | 'high';
    editorialIntensity: 'low' | 'medium' | 'high';
  };
  design: {
    compositionFamily: string;
    preferredHeroArchetype: string[];
    preferredCardArchetype: string;
    preferredGalleryArchetype: string;
    preferredCtaArchetype: string;
    preferredSectionRhythm: string;
  };
}

// ── Subcategory keyword map ──────────────────────────────────

const SUBCATEGORY_KEYWORDS: Record<string, Record<string, string[]>> = {
  skincare: {
    skincare_treatment: ['serum', 'treatment', 'retinol', 'acid', 'peel', 'essence'],
    skincare_cleansing: ['cleanser', 'wash', 'foam', 'balm', 'micellar'],
    skincare_moisturizing: ['moisturizer', 'cream', 'lotion', 'hydrating', 'gel cream'],
    skincare_sun: ['sunscreen', 'spf', 'sun protection'],
    skincare_masks: ['mask', 'sheet mask', 'clay mask', 'overnight'],
  },
  fashion: {
    accessories: ['handbags', 'bag', 'wallet', 'belt', 'scarf', 'hat'],
    outerwear: ['jacket', 'coat', 'blazer', 'parka', 'trench'],
    denim: ['denim', 'jeans', 'jacket'],
    knitwear: ['sweater', 'knit', 'cardigan', 'pullover'],
    dresses: ['dress', 'gown', 'frock', 'midi', 'maxi'],
  },
  jewelry: {
    fine_jewelry: ['gold', 'platinum', 'diamond', 'gemstone', 'fine'],
    fashion_jewelry: ['costume', 'statement', 'fashion jewelry', 'chunky'],
    watches: ['watch', 'timepiece', 'chronograph'],
  },
  food: {
    beverages: ['coffee', 'tea', 'juice', 'smoothie', 'drink', 'beverage'],
    snacks: ['snack', 'chip', 'bar', 'cookie', 'cracker'],
    bakery: ['bakery', 'bread', 'pastry', 'cake', 'muffin'],
    meals: ['meal', 'meal prep', 'ready to eat', 'frozen meal'],
  },
  home: {
    furniture: ['furniture', 'sofa', 'chair', 'table', 'desk', 'shelf'],
    decor: ['decor', 'candle', 'vase', 'frame', 'art print'],
    bedding: ['bedding', 'sheet', 'pillow', 'duvet', 'blanket'],
    kitchen: ['kitchen', 'cookware', 'cookware', 'utensil', 'pan', 'pot'],
  },
  wellness: {
    supplements: ['supplement', 'vitamin', 'protein', 'powder', 'capsule'],
    fitness: ['fitness', 'gym', 'workout', 'training', 'exercise', 'performance'],
    yoga: ['yoga', 'mat', 'meditation', 'mindfulness'],
  },
  electronics: {
    phones: ['phone', 'smartphone', 'iphone', 'android'],
    laptops: ['laptop', 'computer', 'macbook', 'pc'],
    audio: ['headphone', 'speaker', 'earbud', 'audio'],
    gadgets: ['gadget', 'accessory', 'charger', 'case'],
  },
};

// ── Subcategory inference from prompt ─────────────────────────

function inferSubcategory(prompt: string, category: string): string {
  const p = prompt.toLowerCase();
  const catMap = SUBCATEGORY_KEYWORDS[category];
  if (!catMap) return category;

  for (const [subcategory, keywords] of Object.entries(catMap)) {
    if (keywords.some(kw => p.includes(kw))) return subcategory;
  }
  return category;
}

// ── Aesthetic inference ───────────────────────────────────────

function inferAesthetic(
  prompt: string,
  mood: string,
  visualEnergy: string,
  positioning: string,
): string {
  const p = prompt.toLowerCase();

  // Direct aesthetic keywords in prompt
  if (p.includes('editorial') || p.includes('magazine')) return 'editorial';
  if (p.includes('clinical') || p.includes('lab') || p.includes('science')) return 'clinical';
  if (p.includes('campaign') || p.includes('lookbook')) return 'campaign';

  // Combinatorial inference
  if ((mood === 'refined' || mood === 'dramatic') && visualEnergy === 'calm' && positioning === 'premium') return 'editorial';
  if (mood === 'modern' && (p.includes('science') || p.includes('clinical') || p.includes('clean')) && positioning === 'quality-focused') return 'clinical';
  if (mood === 'bold' && (visualEnergy === 'high' || visualEnergy === 'extreme') && (p.includes('rebellious') || p.includes('streetwear'))) return 'energetic';
  if ((mood === 'warm' || p.includes('organic') || p.includes('natural')) && visualEnergy === 'calm') return 'warm';
  if ((mood === 'modern' || p.includes('minimal') || p.includes('clean')) && visualEnergy === 'moderate') return 'minimal';
  if ((mood === 'bold' || p.includes('bold')) && (p.includes('campaign') || p.includes('streetwear'))) return 'campaign';

  // Fallback heuristics
  if (positioning === 'premium' || positioning === 'minimalist') return 'editorial';
  if (mood === 'bold' || visualEnergy === 'high' || visualEnergy === 'extreme') return 'energetic';
  if (mood === 'warm' || mood === 'calm') return 'warm';
  if (mood === 'playful') return 'energetic';

  return 'minimal';
}

// ── Sophistication inference ──────────────────────────────────

function inferSophistication(
  priceTier: string | undefined,
  positioning: string,
): DesignDirection['visual']['sophistication'] {
  if (priceTier === 'ultra_luxury' || (priceTier === 'luxury' && positioning === 'premium')) return 'ultra';
  if (priceTier === 'luxury' || priceTier === 'premium' || positioning === 'premium') return 'high';
  if (priceTier === 'mid' || positioning === 'quality-focused') return 'medium';
  return 'low';
}

// ── Color strategy inference ──────────────────────────────────

function inferColorStrategy(aesthetic: string): DesignDirection['visual']['colorStrategy'] {
  const map: Record<string, DesignDirection['visual']['colorStrategy']> = {
    editorial: 'monochrome',
    clinical: 'neutral_accent',
    energetic: 'brand_bold',
    warm: 'rich_palette',
    minimal: 'neutral_accent',
    campaign: 'brand_bold',
  };
  return map[aesthetic] ?? 'neutral_accent';
}

// ── Typography strategy inference ─────────────────────────────

function inferTypographyStrategy(aesthetic: string): DesignDirection['visual']['typographyStrategy'] {
  const map: Record<string, DesignDirection['visual']['typographyStrategy']> = {
    editorial: 'mixed_serif_sans',
    clinical: 'sans_led',
    energetic: 'sans_led',
    warm: 'mixed_serif_sans',
    minimal: 'sans_led',
    campaign: 'sans_led',
  };
  return map[aesthetic] ?? 'sans_led';
}

// ── Card archetype inference ──────────────────────────────────

function inferPreferredCardArchetype(
  aesthetic: string,
  sophistication: DesignDirection['visual']['sophistication'],
  merchandisingPriority: string,
  ctaStrategy: string,
): string {
  if (aesthetic === 'editorial' && (sophistication === 'high' || sophistication === 'ultra')) return 'editorial_portrait';
  if (merchandisingPriority === 'utility' && (sophistication === 'low' || sophistication === 'medium')) return 'utility_dense';
  if (aesthetic === 'energetic' && sophistication === 'medium') return 'bold_utility';
  if (ctaStrategy === 'subtle' || ctaStrategy === 'inviting') return 'review_led';
  if (sophistication === 'high' || sophistication === 'ultra') return 'editorial_portrait';
  return 'utility_dense';
}

// ── Hero archetype inference ──────────────────────────────────

function inferPreferredHeroArchetype(
  aesthetic: string,
  visualEnergy: string,
): string[] {
  if (aesthetic === 'editorial' && (visualEnergy === 'calm' || visualEnergy === 'moderate')) {
    return ['editorial_product_still_life', 'split_context_product', 'editorial_masthead'];
  }
  if (aesthetic === 'clinical') {
    return ['ingredient_focus', 'split_context_product'];
  }
  if (aesthetic === 'energetic') {
    return ['asymmetric_offset_product', 'dark_campaign_statement', 'fullbleed_copy_safe_area'];
  }
  if (aesthetic === 'campaign') {
    return ['dark_campaign_statement', 'ugc_collage', 'editorial_masthead'];
  }
  if (aesthetic === 'minimal') {
    return ['split_context_product', 'category_portal'];
  }
  if (aesthetic === 'warm') {
    return ['split_context_product', 'editorial_product_still_life'];
  }
  // Fallback
  return ['split_context_product', 'editorial_masthead'];
}

// ── CTA archetype inference ───────────────────────────────────

function inferPreferredCtaArchetype(
  ctaStrategy: DesignDirection['commerce']['ctaStrategy'],
): string {
  const map: Record<string, string> = {
    subtle: 'premium_invitation',
    inviting: 'editorial_invite',
    direct: 'community_invite',
    urgent: 'urgency_panel',
  };
  return map[ctaStrategy] ?? 'editorial_invite';
}

// ── Gallery archetype inference ───────────────────────────────

function inferPreferredGalleryArchetype(
  imageDirection: DesignDirection['visual']['imageDirection'],
): string {
  if (imageDirection === 'lifestyle' || imageDirection === 'ugc') return 'lookbook_grid';
  if (imageDirection === 'studio' || imageDirection === 'campaign') return 'editorial_masonry';
  return 'editorial_masonry';
}

// ── CTA strategy inference ────────────────────────────────────

function inferCtaStrategy(
  conversionPriority: string,
  mood: string,
  visualEnergy: string,
): DesignDirection['commerce']['ctaStrategy'] {
  if (conversionPriority === 'conversion' && visualEnergy === 'extreme') return 'urgent';
  if (conversionPriority === 'conversion') return 'direct';
  if (mood === 'refined' || mood === 'calm') return 'subtle';
  if (mood === 'warm' || mood === 'playful') return 'inviting';
  return 'inviting';
}

// ── Trust requirements inference ──────────────────────────────

function inferTrustRequirements(
  priceTier: string | undefined,
  category: string,
): DesignDirection['commerce']['trustRequirements'] {
  if (priceTier === 'luxury' || priceTier === 'ultra_luxury') return 'high';
  if (priceTier === 'premium') return 'medium';
  if (category === 'skincare' || category === 'wellness' || category === 'supplements') return 'high';
  if (category === 'electronics' || category === 'jewelry') return 'medium';
  return 'low';
}

// ── Content intensity inference ───────────────────────────────

function inferContentIntensities(
  aesthetic: string,
  category: string,
  conversionPriority: string,
): DesignDirection['content'] {
  let storytellingIntensity: DesignDirection['content']['storytellingIntensity'] = 'medium';
  let educationIntensity: DesignDirection['content']['educationIntensity'] = 'medium';
  let editorialIntensity: DesignDirection['content']['editorialIntensity'] = 'medium';

  if (aesthetic === 'editorial' || aesthetic === 'campaign') {
    storytellingIntensity = 'high';
    editorialIntensity = 'high';
  }
  if (aesthetic === 'clinical' || category === 'skincare' || category === 'wellness') {
    educationIntensity = 'high';
  }
  if (aesthetic === 'minimal' || aesthetic === 'energetic') {
    storytellingIntensity = 'low';
    editorialIntensity = 'low';
  }
  if (conversionPriority === 'conversion') {
    storytellingIntensity = storytellingIntensity === 'high' ? 'medium' : storytellingIntensity;
  }

  return { storytellingIntensity, educationIntensity, editorialIntensity };
}

// ── Image direction inference ──────────────────────────────────

function inferImageDirection(
  imagePreference: string | undefined,
  aesthetic: string,
): DesignDirection['visual']['imageDirection'] {
  if (imagePreference && imagePreference !== 'mixed') {
    // Map from brand profile image_preference to design direction imageDirection
    const map: Record<string, DesignDirection['visual']['imageDirection']> = {
      studio: 'studio',
      lifestyle: 'lifestyle',
      flat_lay: 'flat_lay',
      ugc: 'ugc',
      mixed: 'lifestyle',
    };
    return map[imagePreference] ?? 'studio';
  }

  // Infer from aesthetic
  if (aesthetic === 'clinical') return 'ingredient';
  if (aesthetic === 'editorial') return 'studio';
  if (aesthetic === 'campaign') return 'campaign';
  if (aesthetic === 'warm') return 'lifestyle';
  if (aesthetic === 'energetic') return 'campaign';
  return 'studio';
}

// ── Density inference ─────────────────────────────────────────

function inferDensity(visualEnergy: string): DesignDirection['visual']['density'] {
  if (visualEnergy === 'calm') return 'airy';
  if (visualEnergy === 'extreme') return 'compact';
  return 'balanced';
}

// ── Minimalism inference ──────────────────────────────────────

function inferMinimalism(
  aesthetic: string,
  sophistication: DesignDirection['visual']['sophistication'],
): DesignDirection['visual']['minimalism'] {
  if (aesthetic === 'minimal') return 'high';
  if (aesthetic === 'editorial' && (sophistication === 'high' || sophistication === 'ultra')) return 'high';
  if (aesthetic === 'energetic' || aesthetic === 'campaign') return 'low';
  if (aesthetic === 'warm') return 'medium';
  return 'medium';
}

// ── Contrast level inference ──────────────────────────────────

function inferContrastLevel(
  aesthetic: string,
  sophistication: DesignDirection['visual']['sophistication'],
): DesignDirection['visual']['contrastLevel'] {
  if (aesthetic === 'editorial' && sophistication === 'ultra') return 'low';
  if (aesthetic === 'energetic' || aesthetic === 'campaign') return 'high';
  if (aesthetic === 'minimal') return 'low';
  if (aesthetic === 'clinical') return 'medium';
  return 'medium';
}

// ── Radius language inference ──────────────────────────────────

function inferRadiusLanguage(
  aesthetic: string,
  mood: string,
): DesignDirection['visual']['radiusLanguage'] {
  if (aesthetic === 'editorial' || aesthetic === 'minimal') return 'sharp';
  if (aesthetic === 'warm' || mood === 'playful') return 'rounded';
  if (aesthetic === 'energetic' || aesthetic === 'campaign') return 'subtle';
  if (aesthetic === 'clinical') return 'subtle';
  return 'subtle';
}

// ── Elevation language inference ───────────────────────────────

function inferElevationLanguage(
  aesthetic: string,
  sophistication: DesignDirection['visual']['sophistication'],
): DesignDirection['visual']['elevationLanguage'] {
  if (aesthetic === 'editorial' && sophistication === 'ultra') return 'flat';
  if (aesthetic === 'editorial') return 'subtle';
  if (aesthetic === 'minimal') return 'flat';
  if (aesthetic === 'clinical') return 'flat';
  if (aesthetic === 'warm') return 'subtle';
  return 'subtle';
}

// ── Merchandising priority inference ──────────────────────────

function inferMerchandisingPriority(
  conversionPriority: string,
  aesthetic: string,
): string {
  if (conversionPriority === 'conversion') return 'conversion';
  if (conversionPriority === 'awareness') return 'editorial';
  if (aesthetic === 'editorial' || aesthetic === 'campaign') return 'editorial';
  if (aesthetic === 'energetic') return 'discovery';
  return 'balanced';
}

// ── Brand personality inference ───────────────────────────────

function inferBrandPersonality(
  mood: string,
  positioning: string,
  visualEnergy: string,
): string {
  if (mood === 'refined' && positioning === 'premium') return 'sophisticated';
  if (mood === 'bold' && (visualEnergy === 'high' || visualEnergy === 'extreme')) return 'rebellious';
  if (mood === 'warm' || mood === 'calm') return 'approachable';
  if (mood === 'playful') return 'playful';
  if (mood === 'dramatic') return 'dramatic';
  if (positioning === 'minimalist') return 'minimalist';
  return 'modern';
}

// ── Product characteristics inference ─────────────────────────

function inferProductCharacteristics(
  prompt: string,
  category: string,
): string[] {
  const p = prompt.toLowerCase();
  const chars: string[] = [];

  if (p.includes('handmade') || p.includes('artisan') || p.includes('craft')) chars.push('handmade');
  if (p.includes('organic') || p.includes('natural')) chars.push('organic');
  if (p.includes('sustainable') || p.includes('eco')) chars.push('sustainable');
  if (p.includes('limited') || p.includes('exclusive') || p.includes('drop')) chars.push('limited_edition');
  if (p.includes('luxury') || p.includes('premium') || p.includes('high-end')) chars.push('luxury');
  if (p.includes('tech') || p.includes('smart') || p.includes('digital')) chars.push('tech_enabled');
  if (category === 'skincare' || category === 'wellness') chars.push('consumable');
  if (category === 'fashion' || category === 'jewelry') chars.push('wearable');
  if (category === 'electronics') chars.push('electronic');
  if (category === 'home') chars.push('home_goods');

  return chars.length > 0 ? chars : ['general'];
}

// ── Composition family inference ──────────────────────────────

function inferCompositionFamily(
  aesthetic: string,
  visualEnergy: string,
): string {
  if (aesthetic === 'editorial' && visualEnergy === 'calm') return 'editorial_vertical';
  if (aesthetic === 'campaign') return 'campaign_narrative';
  if (aesthetic === 'energetic') return 'dynamic_grid';
  if (aesthetic === 'minimal') return 'clean_vertical';
  if (aesthetic === 'clinical') return 'scientific_grid';
  if (aesthetic === 'warm') return 'lifestyle_flow';
  return 'standard_vertical';
}

// ── Section rhythm inference ──────────────────────────────────

function inferSectionRhythm(
  visualEnergy: string,
  sophistication: DesignDirection['visual']['sophistication'],
): string {
  if (visualEnergy === 'calm' && (sophistication === 'high' || sophistication === 'ultra')) return 'slow_expansive';
  if (visualEnergy === 'calm') return 'measured';
  if (visualEnergy === 'extreme') return 'rapid_staccato';
  if (visualEnergy === 'high') return 'dynamic_varied';
  return 'steady_rhythmic';
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: inferDesignDirection
// ══════════════════════════════════════════════════════════════

/**
 * Infer a full DesignDirection from a prompt and brand profile.
 * The brand profile provides the base signals; this function
 * enriches them into the granular design direction needed by
 * the composition engine.
 */
export function inferDesignDirection(
  prompt: string,
  brandProfile: BrandProfile,
): DesignDirection {
  const p = prompt.toLowerCase();
  const aesthetic = inferAesthetic(
    p,
    brandProfile.mood,
    brandProfile.visual_energy,
    brandProfile.positioning,
  );
  const sophistication = inferSophistication(brandProfile.price_tier, brandProfile.positioning);
  const ctaStrategy = inferCtaStrategy(brandProfile.conversion_priority, brandProfile.mood, brandProfile.visual_energy);
  const merchandisingPriority = inferMerchandisingPriority(brandProfile.conversion_priority, aesthetic);
  const imageDirection = inferImageDirection(brandProfile.image_preference, aesthetic);
  const brandPersonality = inferBrandPersonality(brandProfile.mood, brandProfile.positioning, brandProfile.visual_energy);

  return {
    brand: {
      category: brandProfile.category,
      subcategory: inferSubcategory(prompt, brandProfile.category),
      audience: brandProfile.audience,
      pricePositioning: brandProfile.price_tier ?? 'mid',
      brandPersonality,
      productCharacteristics: inferProductCharacteristics(p, brandProfile.category),
    },
    visual: {
      aesthetic,
      mood: brandProfile.mood,
      sophistication,
      visualEnergy: brandProfile.visual_energy,
      minimalism: inferMinimalism(aesthetic, sophistication),
      density: inferDensity(brandProfile.visual_energy),
      contrastLevel: inferContrastLevel(aesthetic, sophistication),
      colorStrategy: inferColorStrategy(aesthetic),
      typographyStrategy: inferTypographyStrategy(aesthetic),
      radiusLanguage: inferRadiusLanguage(aesthetic, brandProfile.mood),
      elevationLanguage: inferElevationLanguage(aesthetic, sophistication),
      imageDirection,
    },
    commerce: {
      conversionObjective: brandProfile.conversion_priority,
      merchandisingPriority,
      ctaStrategy,
      trustRequirements: inferTrustRequirements(brandProfile.price_tier, brandProfile.category),
    },
    content: inferContentIntensities(aesthetic, brandProfile.category, brandProfile.conversion_priority),
    design: {
      compositionFamily: inferCompositionFamily(aesthetic, brandProfile.visual_energy),
      preferredHeroArchetype: inferPreferredHeroArchetype(aesthetic, brandProfile.visual_energy),
      preferredCardArchetype: inferPreferredCardArchetype(aesthetic, sophistication, merchandisingPriority, ctaStrategy),
      preferredGalleryArchetype: inferPreferredGalleryArchetype(imageDirection),
      preferredCtaArchetype: inferPreferredCtaArchetype(ctaStrategy),
      preferredSectionRhythm: inferSectionRhythm(brandProfile.visual_energy, sophistication),
    },
  };
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: designDirectionToStrings
// ══════════════════════════════════════════════════════════════

/**
 * Flatten a DesignDirection into a simple key→string record
 * for prompt injection into the LLM system prompt.
 */
export function designDirectionToStrings(dd: DesignDirection): Record<string, string> {
  return {
    brand_category: dd.brand.category,
    brand_subcategory: dd.brand.subcategory,
    brand_audience: dd.brand.audience,
    brand_price_positioning: dd.brand.pricePositioning,
    brand_personality: dd.brand.brandPersonality,
    brand_product_characteristics: dd.brand.productCharacteristics.join(', '),
    visual_aesthetic: dd.visual.aesthetic,
    visual_mood: dd.visual.mood,
    visual_sophistication: dd.visual.sophistication,
    visual_energy: dd.visual.visualEnergy,
    visual_minimalism: dd.visual.minimalism,
    visual_density: dd.visual.density,
    visual_contrast_level: dd.visual.contrastLevel,
    visual_color_strategy: dd.visual.colorStrategy,
    visual_typography_strategy: dd.visual.typographyStrategy,
    visual_radius_language: dd.visual.radiusLanguage,
    visual_elevation_language: dd.visual.elevationLanguage,
    visual_image_direction: dd.visual.imageDirection,
    commerce_conversion_objective: dd.commerce.conversionObjective,
    commerce_merchandising_priority: dd.commerce.merchandisingPriority,
    commerce_cta_strategy: dd.commerce.ctaStrategy,
    commerce_trust_requirements: dd.commerce.trustRequirements,
    content_storytelling: dd.content.storytellingIntensity,
    content_education: dd.content.educationIntensity,
    content_editorial: dd.content.editorialIntensity,
    design_composition_family: dd.design.compositionFamily,
    design_hero_archetypes: dd.design.preferredHeroArchetype.join(', '),
    design_card_archetype: dd.design.preferredCardArchetype,
    design_gallery_archetype: dd.design.preferredGalleryArchetype,
    design_cta_archetype: dd.design.preferredCtaArchetype,
    design_section_rhythm: dd.design.preferredSectionRhythm,
  };
}
