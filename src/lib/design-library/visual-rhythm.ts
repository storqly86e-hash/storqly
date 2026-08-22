// ========================================
// Visual Rhythm — Section Rhythm Computation
// ========================================
//
// Computes per-section rhythm configs (density, surface style,
// content width, vertical spacing, visual weight) so that
// the rendered page has a deliberate, non-monotonous flow.

import type { DesignDirection } from './design-direction';

// ── Types ────────────────────────────────────────────────────

export interface SectionRhythmConfig {
  density: 'airy' | 'balanced' | 'compact';
  surfaceStyle: 'default' | 'muted' | 'inverse' | 'accent';
  contentWidth: 'full' | 'wide' | 'standard' | 'narrow';
  verticalSpacing: string;
  visualWeight: 'light' | 'medium' | 'heavy';
}

export interface SectionInput {
  type: string;
  role?: string;
}

export interface ComputeVisualRhythmParams {
  designDirection?: DesignDirection;
  recipeId?: string;
  densityPreset?: 'airy' | 'balanced' | 'compact';
  visualEnergy?: 'calm' | 'moderate' | 'high' | 'extreme';
}

// ── Constants ────────────────────────────────────────────────

const DENSITY_SPACING: Record<string, Record<string, string>> = {
  airy: {
    base: 'clamp(5rem, 11vw, 10rem)',
    after_heavy: 'clamp(6rem, 13vw, 12rem)',
    text_section: 'clamp(5.5rem, 12vw, 11rem)',
  },
  balanced: {
    base: 'clamp(4rem, 8vw, 7rem)',
    after_heavy: 'clamp(5rem, 10vw, 9rem)',
    text_section: 'clamp(4.5rem, 9vw, 8rem)',
  },
  compact: {
    base: 'clamp(3rem, 6vw, 5rem)',
    after_heavy: 'clamp(3.5rem, 7.5vw, 6rem)',
    text_section: 'clamp(3.25rem, 6.5vw, 5.5rem)',
  },
};

// Visual weight by section type (base defaults)
const SECTION_VISUAL_WEIGHT: Record<string, 'light' | 'medium' | 'heavy'> = {
  hero: 'heavy',
  'hero-split': 'heavy',
  'hero-asymmetric': 'heavy',
  'hero-campaign': 'heavy',
  'text-banner': 'light',
  'brand-statement': 'medium',
  'product-grid': 'medium',
  'featured-products': 'medium',
  'categories': 'medium',
  gallery: 'medium',
  cta: 'medium',
  'trust-bar': 'light',
  testimonials: 'light',
  faq: 'light',
  footer: 'light',
  'featured-collection': 'medium',
};

// Content width by section type (base defaults)
const SECTION_CONTENT_WIDTH: Record<string, 'full' | 'wide' | 'standard' | 'narrow'> = {
  hero: 'full',
  'hero-split': 'full',
  'hero-asymmetric': 'full',
  'hero-campaign': 'full',
  'text-banner': 'standard',
  'brand-statement': 'narrow',
  'product-grid': 'wide',
  'featured-products': 'wide',
  'categories': 'standard',
  gallery: 'wide',
  cta: 'standard',
  'trust-bar': 'wide',
  testimonials: 'narrow',
  faq: 'narrow',
  footer: 'full',
  'featured-collection': 'wide',
};

// ── Helpers ──────────────────────────────────────────────────

function getBaseDensity(dd: DesignDirection | undefined, preset: 'airy' | 'balanced' | 'compact' | undefined): 'airy' | 'balanced' | 'compact' {
  if (dd) return dd.visual.density;
  return preset ?? 'balanced';
}

function getBaseEnergy(dd: DesignDirection | undefined, energy: 'calm' | 'moderate' | 'high' | 'extreme' | undefined): 'calm' | 'moderate' | 'high' | 'extreme' {
  if (dd) return dd.visual.visualEnergy;
  return energy ?? 'moderate';
}

/**
 * Text-heavy sections: brand-statement, testimonials, faq, text-banner.
 */
function isTextHeavy(type: string): boolean {
  return ['brand-statement', 'testimonials', 'faq', 'text-banner'].includes(type);
}

/**
 * Full-bleed / visually dominant sections.
 */
function isDominant(type: string): boolean {
  return ['hero', 'hero-split', 'hero-asymmetric', 'hero-campaign', 'gallery'].includes(type);
}

/**
 * Determine section visual weight, considering energy adjustments.
 */
function resolveVisualWeight(
  type: string,
  energy: 'calm' | 'moderate' | 'high' | 'extreme',
): 'light' | 'medium' | 'heavy' {
  let base = SECTION_VISUAL_WEIGHT[type] ?? 'medium';

  // High/extreme energy can bump gallery and product-grid to heavy
  if ((type === 'gallery') && (energy === 'high' || energy === 'extreme')) {
    base = 'heavy';
  }
  if ((type === 'product-grid' || type === 'featured-products') && energy === 'extreme') {
    base = 'heavy';
  }

  return base;
}

/**
 * Determine section content width, considering sophistication.
 */
function resolveContentWidth(
  type: string,
  _sophistication: 'low' | 'medium' | 'high' | 'ultra',
): 'full' | 'wide' | 'standard' | 'narrow' {
  return SECTION_CONTENT_WIDTH[type] ?? 'standard';
}

/**
 * Pick the best surface style to avoid monotony.
 */
function pickSurfaceStyle(
  index: number,
  type: string,
  previousConfigs: SectionRhythmConfig[],
  energy: 'calm' | 'moderate' | 'high' | 'extreme',
): SectionRhythmConfig['surfaceStyle'] {
  // First section (usually hero): default
  if (index === 0) return 'default';

  // Footer: default
  if (type === 'footer') return 'default';

  // Count consecutive 'default' surfaces before this index
  let consecutiveDefaults = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (previousConfigs[i]?.surfaceStyle === 'default') {
      consecutiveDefaults++;
    } else {
      break;
    }
  }

  // If 2+ consecutive defaults, force a non-default surface
  if (consecutiveDefaults >= 2) {
    // After a dominant section (hero/gallery), prefer muted
    const prevConfig = previousConfigs[index - 1];
    if (prevConfig && prevConfig.visualWeight === 'heavy') {
      return 'muted';
    }

    // For high/extreme energy, alternate more aggressively
    if (energy === 'high' || energy === 'extreme') {
      return index % 3 === 0 ? 'inverse' : 'muted';
    }

    return 'muted';
  }

  // After a heavy or dominant section, prefer muted for breathing room
  const prevConfig = previousConfigs[index - 1];
  if (prevConfig && (prevConfig.visualWeight === 'heavy' || isDominant(type))) {
    if (energy === 'extreme' && index > 1) {
      return 'inverse';
    }
    return 'muted';
  }

  // Calm energy: keep mostly default with occasional muted
  if (energy === 'calm') {
    return consecutiveDefaults === 1 ? 'muted' : 'default';
  }

  // Moderate: alternate default and muted
  return consecutiveDefaults === 1 ? 'muted' : 'default';
}

/**
 * Compute vertical spacing for a section based on density,
 * surrounding context, and energy.
 */
function pickVerticalSpacing(
  type: string,
  density: 'airy' | 'balanced' | 'compact',
  prevConfig: SectionRhythmConfig | undefined,
  energy: 'calm' | 'moderate' | 'high' | 'extreme',
): string {
  const densityTable = DENSITY_SPACING[density];

  // After a heavy section, add more breathing room
  if (prevConfig && prevConfig.visualWeight === 'heavy') {
    return densityTable.after_heavy;
  }

  // Text-heavy sections get slightly more spacing for readability
  if (isTextHeavy(type)) {
    return densityTable.text_section;
  }

  // Calm energy: use generous spacing consistently
  if (energy === 'calm') {
    return density === 'compact'
      ? densityTable.text_section  // bump compact up slightly for calm
      : densityTable.after_heavy;   // use the larger spacing
  }

  // Extreme energy: use tighter spacing
  if (energy === 'extreme') {
    return densityTable.base;
  }

  return densityTable.base;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: computeVisualRhythm
// ══════════════════════════════════════════════════════════════

/**
 * Compute visual rhythm for a sequence of sections.
 * Returns a Record keyed by section index (string).
 */
export function computeVisualRhythm(
  sections: SectionInput[],
  params: ComputeVisualRhythmParams = {},
): Record<string, SectionRhythmConfig> {
  const { designDirection: dd, densityPreset, visualEnergy } = params;

  const baseDensity = getBaseDensity(dd, densityPreset);
  const energy = getBaseEnergy(dd, visualEnergy);
  const sophistication = dd?.visual.sophistication ?? 'medium';

  const result: Record<string, SectionRhythmConfig> = {};
  const previousConfigs: SectionRhythmConfig[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const type = section.type;

    // Density: DD density overrides, but calm energy can nudge toward airy,
    // extreme toward compact.
    let density = baseDensity;
    if (!dd?.visual.density && visualEnergy) {
      if (energy === 'calm' && density !== 'airy') density = 'airy';
      if (energy === 'extreme' && density !== 'compact') density = 'compact';
    }

    const surfaceStyle = pickSurfaceStyle(i, type, previousConfigs, energy);
    const contentWidth = resolveContentWidth(type, sophistication);
    const visualWeight = resolveVisualWeight(type, energy);
    const verticalSpacing = pickVerticalSpacing(type, density, previousConfigs[i - 1], energy);

    const config: SectionRhythmConfig = {
      density,
      surfaceStyle,
      contentWidth,
      verticalSpacing,
      visualWeight,
    };

    result[String(i)] = config;
    previousConfigs.push(config);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getRhythmCssVars
// ══════════════════════════════════════════════════════════════

/**
 * Convert a SectionRhythmConfig to CSS custom properties.
 */
export function getRhythmCssVars(config: SectionRhythmConfig): Record<string, string> {
  return {
    '--rhythm-density': config.density,
    '--rhythm-surface': config.surfaceStyle,
    '--rhythm-content-width': config.contentWidth,
    '--rhythm-vertical-spacing': config.verticalSpacing,
    '--rhythm-visual-weight': config.visualWeight,
  };
}
