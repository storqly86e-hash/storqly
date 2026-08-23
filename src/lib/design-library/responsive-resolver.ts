// ========================================
// Responsive Resolver — Layout Adaptation Utilities
// ========================================
//
// Provides responsive design utilities based on
// responsive-rules.json. All functions are pure
// with no side effects.

import responsiveRules from '@/data/design-library/responsive-rules.json';

// ── Types ────────────────────────────────────────────────────

export interface ResponsiveAdaptation {
  desktop: string;
  tablet: string;
  mobile: string;
}

// ── Constants ────────────────────────────────────────────────

export const BREAKPOINTS = {
  mobile: 639,
  tablet: 1023,
  desktop: 1024,
} as const;

/**
 * Maps layout type + breakpoint to grid-cols Tailwind class.
 * Derived from layout_adaptations column counts.
 */
const GRID_COLS_MAP: Record<string, Record<string, string>> = {
  two_column: {
    desktop: 'grid-cols-2',
    tablet: 'grid-cols-2',
    mobile: 'grid-cols-1',
  },
  three_column: {
    desktop: 'grid-cols-3',
    tablet: 'grid-cols-2',
    mobile: 'grid-cols-1',
  },
  four_column: {
    desktop: 'grid-cols-4',
    tablet: 'grid-cols-2',
    mobile: 'grid-cols-2',
  },
  // Non-grid layouts: single column fallback
  horizontal_rail: {
    desktop: 'grid-cols-1',
    tablet: 'grid-cols-1',
    mobile: 'grid-cols-1',
  },
  split_hero: {
    desktop: 'grid-cols-2',
    tablet: 'grid-cols-1',
    mobile: 'grid-cols-1',
  },
  asymmetric_hero: {
    desktop: 'grid-cols-2',
    tablet: 'grid-cols-1',
    mobile: 'grid-cols-1',
  },
};

// ── Default adaptation for unknown layouts ───────────────────

const DEFAULT_ADAPTATION: ResponsiveAdaptation = {
  desktop: 'grid-template-columns: 1fr',
  tablet: 'grid-template-columns: 1fr',
  mobile: 'grid-template-columns: 1fr',
};

// ══════════════════════════════════════════════════════════════
// PUBLIC: getLayoutAdaptation
// ══════════════════════════════════════════════════════════════

/**
 * Get the responsive adaptation rules for a layout type.
 * Falls back to a sensible single-column default if the
 * layout type is not found in responsive-rules.json.
 */
export function getLayoutAdaptation(layoutType: string): ResponsiveAdaptation {
  const adaptation = responsiveRules.layout_adaptations[
    layoutType as keyof typeof responsiveRules.layout_adaptations
  ];

  if (!adaptation) return DEFAULT_ADAPTATION;

  return {
    desktop: adaptation.desktop,
    tablet: adaptation.tablet,
    mobile: adaptation.mobile,
  };
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getImageObjectPosition
// ══════════════════════════════════════════════════════════════

/**
 * Get the default object-position for an image type.
 * Returns '50% 50%' as a safe fallback.
 */
export function getImageObjectPosition(imageType: string): string {
  return responsiveRules.image_rules.object_position_defaults[
    imageType as keyof typeof responsiveRules.image_rules.object_position_defaults
  ] ?? '50% 50%';
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getContainerGutter
// ══════════════════════════════════════════════════════════════

/**
 * Get the gutter (horizontal padding) for a given viewport.
 */
export function getContainerGutter(
  viewport: 'mobile' | 'tablet' | 'desktop',
): string {
  return responsiveRules.container.gutter[viewport];
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getContainerMaxWidth
// ══════════════════════════════════════════════════════════════

/**
 * Get the max-width for a given width type.
 */
export function getContainerMaxWidth(
  widthType: 'wide' | 'standard' | 'narrow',
): string {
  const map: Record<string, string> = {
    wide: responsiveRules.container.wide_max,
    standard: responsiveRules.container.standard_max,
    narrow: responsiveRules.container.narrow_max,
  };
  return map[widthType] ?? responsiveRules.container.standard_max;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC: getGridColsForBreakpoint
// ══════════════════════════════════════════════════════════════

/**
 * Returns a Tailwind grid-cols class for a given layout type
 * and breakpoint. Falls back to 'grid-cols-1'.
 */
export function getGridColsForBreakpoint(
  layoutType: string,
  breakpoint: 'mobile' | 'tablet' | 'desktop',
): string {
  return GRID_COLS_MAP[layoutType]?.[breakpoint] ?? 'grid-cols-1';
}
