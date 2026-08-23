// ========================================
// Token Resolver — Design Token Resolution
// ========================================
//
// Loads design-tokens.json, resolves a full token object
// based on typography system, density preset, and
// DesignDirection overrides. Produces CSS custom
// properties for renderer consumption.

import designTokensData from '@/data/design-library/design-tokens.json';
import type { DesignDirection } from './design-direction';

// ── Types ────────────────────────────────────────────────────

type DensityPreset = 'airy' | 'balanced' | 'compact';

export interface ResolvedTypeToken {
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  fontWeight: number;
  textTransform?: string;
}

export interface ResolvedTypography {
  display: {
    xl: ResolvedTypeToken;
    lg: ResolvedTypeToken;
  };
  heading: {
    xl: ResolvedTypeToken;
    lg: ResolvedTypeToken;
    md: ResolvedTypeToken;
    sm: ResolvedTypeToken;
  };
  body: {
    lg: ResolvedTypeToken;
    md: ResolvedTypeToken;
    sm: ResolvedTypeToken;
  };
  label: {
    md: ResolvedTypeToken;
    sm: ResolvedTypeToken;
  };
}

export interface ResolvedSpacing {
  section_y: string;
  grid_gap: string;
  content_max: string;
}

export interface ResolvedRadii {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  pill: string;
}

export interface ResolvedElevation {
  none: string;
  subtle: string;
  raised: string;
  floating: string;
}

export interface ResolvedFontFamilies {
  heading: string;
  body: string;
  label: string;
}

export interface ResolvedTokens {
  typography: ResolvedTypography;
  spacing: ResolvedSpacing;
  radii: ResolvedRadii;
  elevation: ResolvedElevation;
  fontFamilies: ResolvedFontFamilies;
  /** Which radius key is the DD-prefferred default */
  defaultRadius: string;
  /** Which elevation key is the DD-preferred default */
  defaultElevation: string;
}

export interface ResolveDesignTokensParams {
  typographySystem?: string;
  densityPreset?: DensityPreset;
  designDirection?: DesignDirection;
  overrides?: Record<string, unknown>;
}

// ── Helpers ──────────────────────────────────────────────────

const TYPE_SCALE_KEYS = [
  'display.xl', 'display.lg',
  'heading.xl', 'heading.lg', 'heading.md', 'heading.sm',
  'body.lg', 'body.md', 'body.sm',
  'label.md', 'label.sm',
] as const;

type TypeScaleKey = (typeof TYPE_SCALE_KEYS)[number];

function toTypeToken(raw: {
  font_size: string;
  line_height: number;
  letter_spacing: string;
  weight: number;
  transform?: string;
}): ResolvedTypeToken {
  const token: ResolvedTypeToken = {
    fontSize: raw.font_size,
    lineHeight: String(raw.line_height),
    letterSpacing: raw.letter_spacing,
    fontWeight: raw.weight,
  };
  if (raw.transform) {
    token.textTransform = raw.transform;
  }
  return token;
}

function nestTypeTokens(raw: Record<string, unknown>): ResolvedTypography {
  const result: Record<string, Record<string, ResolvedTypeToken>> = {
    display: {},
    heading: {},
    body: {},
    label: {},
  };

  for (const key of TYPE_SCALE_KEYS) {
    const rawToken = raw[key] as {
      font_size: string;
      line_height: number;
      letter_spacing: string;
      weight: number;
      transform?: string;
    };
    if (!rawToken) continue;

    const [group, size] = key.split('.');
    if (!result[group]) result[group] = {};
    result[group][size] = toTypeToken(rawToken);
  }

  return result as unknown as ResolvedTypography;
}

function mapRadiusLanguage(language: string): string {
  switch (language) {
    case 'none':
    case 'sharp':
      return 'none';
    case 'subtle':
      return 'sm';
    case 'rounded':
      return 'lg';
    case 'pill':
      return 'pill';
    default:
      return 'sm';
  }
}

function mapElevationLanguage(language: string): string {
  switch (language) {
    case 'flat':
      return 'none';
    case 'subtle':
      return 'subtle';
    case 'medium':
      return 'raised';
    case 'dramatic':
      return 'floating';
    default:
      return 'subtle';
  }
}

function selectTypographySystem(
  systemKey: string | undefined,
  dd: DesignDirection | undefined,
): string {
  if (systemKey && designTokensData.typography_systems[systemKey as keyof typeof designTokensData.typography_systems]) {
    return systemKey;
  }

  // Infer from DesignDirection's typography strategy
  if (dd) {
    const strategy = dd.visual.typographyStrategy;
    if (strategy === 'mixed_serif_sans') return 'editorial_serif_sans';
    if (strategy === 'serif_led') return 'editorial_serif_sans';
    if (strategy === 'sans_led') return 'modern_grotesk';
    if (strategy === 'mono_led') return 'compressed_utility';
  }

  return 'modern_grotesk';
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: resolveDesignTokens
// ══════════════════════════════════════════════════════════════

/**
 * Resolve a full set of design tokens based on inputs.
 *
 * Priority (highest to lowest):
 *  1. explicit overrides
 *  2. DesignDirection fields
 *  3. densityPreset / typographySystem params
 *  4. design-tokens.json defaults
 */
export function resolveDesignTokens(params: ResolveDesignTokensParams = {}): ResolvedTokens {
  const { typographySystem, densityPreset, designDirection, overrides } = params;

  // ── Typography ───────────────────────────────────────────
  const typeScale = designTokensData.primitives.type_scale;
  const typography = nestTypeTokens(typeScale);

  // ── Density / Spacing ────────────────────────────────────
  const effectiveDensity: DensityPreset =
    designDirection?.visual.density ?? densityPreset ?? 'balanced';

  const spacing: ResolvedSpacing = {
    ...designTokensData.density_presets[effectiveDensity],
  };

  // ── Font Families ───────────────────────────────────────
  const sysKey = selectTypographySystem(typographySystem, designDirection);
  const sys = designTokensData.typography_systems[
    sysKey as keyof typeof designTokensData.typography_systems
  ];
  const fontFamilies: ResolvedFontFamilies = {
    heading: sys.display,
    body: sys.body,
    label: sys.label,
  };

  // ── Radii ───────────────────────────────────────────────
  const radii: ResolvedRadii = { ...designTokensData.primitives.radii };

  // ── Elevation ───────────────────────────────────────────
  const elevation: ResolvedElevation = { ...designTokensData.primitives.elevation };

  // ── DesignDirection overrides ───────────────────────────
  let defaultRadius = 'sm';
  let defaultElevation = 'subtle';

  if (designDirection) {
    defaultRadius = mapRadiusLanguage(designDirection.visual.radiusLanguage);
    defaultElevation = mapElevationLanguage(designDirection.visual.elevationLanguage);
  }

  // ── Explicit overrides (deep merge top-level only) ──────
  if (overrides) {
    if (overrides.spacing) {
      Object.assign(spacing, overrides.spacing);
    }
    if (overrides.radii) {
      Object.assign(radii, overrides.radii);
    }
    if (overrides.elevation) {
      Object.assign(elevation, overrides.elevation);
    }
    if (overrides.fontFamilies) {
      Object.assign(fontFamilies, overrides.fontFamilies);
    }
  }

  return {
    typography,
    spacing,
    radii,
    elevation,
    fontFamilies,
    defaultRadius,
    defaultElevation,
  };
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getTokenCssVars
// ══════════════════════════════════════════════════════════════

/**
 * Convert resolved tokens to CSS custom properties for the renderer.
 * Returns a flat Record<string, string> suitable for a style object.
 */
export function getTokenCssVars(tokens: ResolvedTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  // ── Font families ───────────────────────────────────────
  vars['--sq-font-heading'] = tokens.fontFamilies.heading;
  vars['--sq-font-body'] = tokens.fontFamilies.body;
  vars['--sq-font-label'] = tokens.fontFamilies.label;

  // ── Spacing ─────────────────────────────────────────────
  vars['--sq-spacing-section-y'] = tokens.spacing.section_y;
  vars['--sq-spacing-grid-gap'] = tokens.spacing.grid_gap;
  vars['--sq-spacing-content-max'] = tokens.spacing.content_max;

  // ── Radii ───────────────────────────────────────────────
  vars['--sq-radius-none'] = tokens.radii.none;
  vars['--sq-radius-xs'] = tokens.radii.xs;
  vars['--sq-radius-sm'] = tokens.radii.sm;
  vars['--sq-radius-md'] = tokens.radii.md;
  vars['--sq-radius-lg'] = tokens.radii.lg;
  vars['--sq-radius-pill'] = tokens.radii.pill;
  vars['--sq-radius-default'] = tokens.radii[tokens.defaultRadius as keyof ResolvedRadii];

  // ── Elevation ───────────────────────────────────────────
  vars['--sq-elevation-none'] = tokens.elevation.none;
  vars['--sq-elevation-subtle'] = tokens.elevation.subtle;
  vars['--sq-elevation-raised'] = tokens.elevation.raised;
  vars['--sq-elevation-floating'] = tokens.elevation.floating;
  vars['--sq-elevation-default'] = tokens.elevation[tokens.defaultElevation as keyof ResolvedElevation];

  // ── Typography (flat vars per scale key) ────────────────
  const flattenTypography = (prefix: string, group: Record<string, ResolvedTypeToken>) => {
    for (const [size, token] of Object.entries(group)) {
      const p = `--sq-type-${prefix}-${size}`;
      vars[`${p}-font-size`] = token.fontSize;
      vars[`${p}-line-height`] = token.lineHeight;
      vars[`${p}-letter-spacing`] = token.letterSpacing;
      vars[`${p}-font-weight`] = String(token.fontWeight);
      if (token.textTransform) {
        vars[`${p}-text-transform`] = token.textTransform;
      }
    }
  };

  flattenTypography('display', tokens.typography.display);
  flattenTypography('heading', tokens.typography.heading);
  flattenTypography('body', tokens.typography.body);
  flattenTypography('label', tokens.typography.label);

  return vars;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getTypeScaleCss
// ══════════════════════════════════════════════════════════════

/**
 * Returns a React.CSSProperties object for a given type scale token name.
 * @param tokenName - e.g. "heading.lg", "body.md", "label.sm"
 * @param tokens - The resolved tokens object
 */
export function getTypeScaleCss(
  tokenName: string,
  tokens: ResolvedTokens,
): React.CSSProperties {
  const [group, size] = tokenName.split('.');
  const groupTokens = tokens.typography[group as keyof ResolvedTypography];
  if (!groupTokens) return {};

  const token = (groupTokens as Record<string, ResolvedTypeToken>)[size];
  if (!token) return {};

  const css: React.CSSProperties = {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    fontWeight: token.fontWeight,
  };

  if (token.textTransform) {
    css.textTransform = token.textTransform as React.CSSProperties['textTransform'];
  }

  return css;
}
