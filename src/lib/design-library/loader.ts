// ========================================
// Design Library Loader
// ========================================
//
// Loads all 9 JSON data files from the design library,
// normalizes them into a unified format, registers them
// in the component registry, and provides lookup functions.

import { componentRegistry } from '@/lib/component-registry'
import type { DesignRole } from '@/lib/store-schema'
import type { CompositionRecipe } from '@/lib/design-library-contract'

// ── JSON imports ───────────────────────────────────────────

import heroesData from '@/data/design-library/heroes.json'
import merchandisingData from '@/data/design-library/merchandising.json'
import conversionData from '@/data/design-library/conversion.json'
import storytellingData from '@/data/design-library/storytelling.json'
import globalPrimitivesData from '@/data/design-library/global-primitives.json'
import recipesData from '@/data/design-library/composition-recipes.json'
import aiGuidanceData from '@/data/design-library/ai-guidance.json'

// ── JSON file interfaces ───────────────────────────────────

/** Heroes file: flat { records: [...] } */
interface HeroesJson {
  family: string
  version: string
  records: LibraryRecordRaw[]
}

/** Other library files: nested { families: { name: { records: [...] } } } */
interface FamiliesJson {
  version: string
  families: Record<string, { records: LibraryRecordRaw[] }>
}

/** Raw record shape from JSON — matches every field present across all 73 records. */
export interface LibraryRecordRaw {
  id: string
  family: string
  variant: string
  intent: string
  use_when: string[]
  avoid_when: string[]
  slots: string[]
  layout: {
    desktop: string
    alignment?: string
    layer_order?: string[]
  }
  responsive: {
    mobile_behavior?: string
    tablet_behavior?: string
    text_width?: string
    [key: string]: unknown
  }
  style_hooks: string[]
  compatible_with: string[]
  content_rules: Record<string, unknown>
  motion: string
  tags: string[]
  visual_style: string[]
  industries: string[]
  brand_personalities: string[]
  incompatible_with: string[]
  conflict_scope: string
  hero_architecture?: Record<string, unknown>
  image_guidance?: {
    background?: string
    product?: string
    prompt_frame?: string
    [key: string]: unknown
  }
}

// ── Normalized library record ──────────────────────────────

/** Layout description from a library record. */
export interface LibraryLayout {
  desktop: string
  alignment?: string
  layer_order?: string[]
}

/** Responsive behavior description from a library record. */
export interface LibraryResponsive {
  mobile_behavior?: string
  tablet_behavior?: string
  text_width?: string
  [key: string]: unknown
}

/** Image guidance from a library record. */
export interface LibraryImageGuidance {
  background?: string
  product?: string
  prompt_frame?: string
  [key: string]: unknown
}

/** A single component record normalized from the design library JSON files. */
export interface LibraryComponent {
  id: string
  family: string
  variant: string
  intent: string
  useWhen: string[]
  avoidWhen: string[]
  slots: string[]
  layout: LibraryLayout
  responsive: LibraryResponsive
  styleHooks: string[]
  compatibleWith: string[]
  incompatibleWith: string[]
  conflictScope: string
  contentRules: Record<string, unknown>
  motion: string
  tags: string[]
  visualStyle: string[]
  industries: string[]
  brandPersonalities: string[]
  heroArchitecture?: Record<string, unknown>
  imageGuidance?: LibraryImageGuidance
  /** Which DesignRole(s) this component best fulfills. Inferred from tags + intent. */
  roles: DesignRole[]
}

// ── Design tokens (from composition recipes / global primitives) ──

export interface DesignTokens {
  /** Shared primitives — component IDs used across all recipes */
  sharedPrimitives: {
    primaryActions: string[]
    commerceControls: string[]
    catalogNavigation: string[]
  }
}

// ── Responsive rules (extracted from component records) ────

export interface ResponsiveRules {
  /** Per-component-id responsive behavior descriptions */
  behaviors: Record<string, {
    mobile?: string
    tablet?: string
  }>
}

// ── AI guidance ────────────────────────────────────────────

export interface AIGuidance {
  selectionPipeline: Array<{
    step: number
    name: string
    output: string
    rule: string
  }>
  scoring: {
    formula: string
    scale: string
    penalties: Array<{
      name: string
      amount: number
    }>
  }
  selectionSignals: Record<string, string[]>
  compositionRules: string[]
  imageArtDirection: {
    requiredPromptFields: string[]
    basePrompt: string
    avoidPhrases: string[]
    slotGuidance: Record<string, string>
  }
  qualityGuardrails: {
    rejectIf: string[]
    approvalQuestions: string[]
  }
}

// ── Full loaded library ────────────────────────────────────

export interface LoadedDesignLibrary {
  components: LibraryComponent[]
  recipes: CompositionRecipe[]
  tokens: DesignTokens
  responsiveRules: ResponsiveRules
  guidance: AIGuidance
}

// ── Library metadata (stored separately for lookup) ────────

/** Extended metadata kept in a sidecar Map, not on the registry entry itself. */
export interface LibraryMetadata {
  componentId: string
  intent: string
  useWhen: string[]
  avoidWhen: string[]
  slots: string[]
  styleHooks: string[]
  compatibleWith: string[]
  incompatibleWith: string[]
  conflictScope: string
  contentRules: Record<string, unknown>
  imageGuidance?: LibraryImageGuidance
  heroArchitecture?: Record<string, unknown>
  motion: string
  visualStyle: string[]
  industries: string[]
  brandPersonalities: string[]
  responsive: LibraryResponsive
  roles: DesignRole[]
}

// ── Normalization helpers ──────────────────────────────────

/** Convert a raw JSON record into the normalized LibraryComponent format. */
function normalizeRecord(raw: LibraryRecordRaw): LibraryComponent {
  return {
    id: raw.id,
    family: raw.family,
    variant: raw.variant,
    intent: raw.intent,
    useWhen: raw.use_when,
    avoidWhen: raw.avoid_when,
    slots: raw.slots,
    layout: raw.layout,
    responsive: raw.responsive,
    styleHooks: raw.style_hooks,
    compatibleWith: raw.compatible_with,
    incompatibleWith: raw.incompatible_with,
    conflictScope: raw.conflict_scope,
    contentRules: raw.content_rules,
    motion: raw.motion,
    tags: raw.tags,
    visualStyle: raw.visual_style,
    industries: raw.industries,
    brandPersonalities: raw.brand_personalities,
    heroArchitecture: raw.hero_architecture,
    imageGuidance: raw.image_guidance,
    roles: inferRoles(raw),
  }
}

/** Infer design roles from a record's tags, intent, and slots. */
function inferRoles(raw: LibraryRecordRaw): DesignRole[] {
  const roles: DesignRole[] = []
  const text = `${raw.intent} ${raw.tags.join(' ')} ${raw.use_when.join(' ')}`.toLowerCase()
  const slots = new Set(raw.slots)

  // orient — heroes, headers, announcements, navigation
  if (
    raw.family === 'hero' ||
    raw.family === 'header' ||
    raw.family === 'announcement-bar' ||
    raw.family === 'announcement' ||
    raw.family === 'navigation' ||
    raw.tags.includes('orient')
  ) {
    roles.push('orient')
  }

  // merchandise — product grids, collections, categories, featured products
  if (
    raw.family === 'product-grid' ||
    raw.family === 'collection' ||
    raw.family === 'category' ||
    raw.family === 'featured-product' ||
    text.includes('merchandis') ||
    text.includes('product') ||
    text.includes('catalog')
  ) {
    roles.push('merchandise')
  }

  // educate — feature-benefits, editorial longform
  if (
    raw.family === 'feature-benefits' ||
    raw.family === 'editorial' ||
    text.includes('educat') ||
    text.includes('ingredient') ||
    text.includes('benefit') ||
    text.includes('learn')
  ) {
    roles.push('educate')
  }

  // differentiate — brand-story, gallery
  if (
    raw.family === 'brand-story' ||
    raw.family === 'gallery' ||
    text.includes('differentiat') ||
    text.includes('brand') ||
    text.includes('story')
  ) {
    roles.push('differentiate')
  }

  // reassure — testimonials, trust
  if (
    raw.family === 'testimonials' ||
    raw.family === 'trust' ||
    text.includes('reassur') ||
    text.includes('trust') ||
    text.includes('proof') ||
    text.includes('review') ||
    text.includes('social proof')
  ) {
    roles.push('reassure')
  }

  // engage — promotions, gallery (also), UGC
  if (
    raw.family === 'promotion' ||
    raw.family === 'gallery' ||
    text.includes('engage') ||
    text.includes('ugc') ||
    text.includes('campaign')
  ) {
    if (!roles.includes('engage')) roles.push('engage')
  }

  // convert — CTA, urgency, promotions
  if (
    raw.family === 'cta' ||
    text.includes('convert') ||
    text.includes('urgency') ||
    text.includes('cta')
  ) {
    roles.push('convert')
  }

  // retain — newsletter, footer
  if (
    raw.family === 'newsletter' ||
    raw.family === 'footer' ||
    text.includes('retain') ||
    text.includes('subscri') ||
    text.includes('newsletter')
  ) {
    roles.push('retain')
  }

  // Sub-components (button, product-card, commerce-pattern) don't have page-level roles
  if (roles.length === 0) {
    roles.push('orient') // fallback
  }

  return roles
}

/** Extract all records from a families-style JSON file. */
function extractFamilyRecords(data: FamiliesJson): LibraryRecordRaw[] {
  return Object.values(data.families).flatMap(
    (familyGroup) => familyGroup.records,
  )
}

// ── Library metadata sidecar ───────────────────────────────

const libraryMetadata = new Map<string, LibraryMetadata>()

// ── loadDesignLibrary() ────────────────────────────────────

/**
 * Loads all design library JSON files and normalizes them into
 * a unified structure suitable for registration and lookup.
 *
 * This function is safe to call multiple times — it re-reads
 * the JSON imports and produces a fresh snapshot each time.
 */
export function loadDesignLibrary(): LoadedDesignLibrary {
  // 1. Collect all raw records from every file
  const heroRecords = (heroesData as unknown as HeroesJson).records
  const merchRecords = extractFamilyRecords(merchandisingData as unknown as FamiliesJson)
  const conversionRecords = extractFamilyRecords(conversionData as unknown as FamiliesJson)
  const storyRecords = extractFamilyRecords(storytellingData as unknown as FamiliesJson)
  const primitivesRecords = extractFamilyRecords(globalPrimitivesData as unknown as FamiliesJson)

  const allRaw = [
    ...heroRecords,
    ...merchRecords,
    ...conversionRecords,
    ...storyRecords,
    ...primitivesRecords,
  ]

  // 2. Normalize into LibraryComponent[]
  const components = allRaw.map(normalizeRecord)

  // 3. Extract composition recipes
  const recipesRaw = recipesData as unknown as {
    version: string
    recipes: Array<{
      id: string
      signals: string[]
      recommended_theme: string
      nodes: Array<{ role: DesignRole; component_id: string }>
      rhythm: string[]
      substitutions: Record<string, string[]>
      avoid: string[]
    }>
    shared_primitives: DesignTokens['sharedPrimitives']
  }

  const recipes: CompositionRecipe[] = recipesRaw.recipes.map((r) => ({
    id: r.id,
    signals: r.signals,
    recommended_theme: r.recommended_theme,
    nodes: r.nodes,
    rhythm: r.rhythm,
    substitutions: r.substitutions,
    avoid: r.avoid,
  }))

  // 4. Build design tokens from shared_primitives
  const tokens: DesignTokens = {
    sharedPrimitives: recipesRaw.shared_primitives,
  }

  // 5. Build responsive rules index
  const behaviors: ResponsiveRules['behaviors'] = {}
  for (const comp of components) {
    behaviors[comp.id] = {
      mobile: comp.responsive.mobile_behavior,
      tablet: comp.responsive.tablet_behavior,
    }
  }
  const responsiveRules: ResponsiveRules = { behaviors }

  // 6. Type the AI guidance
  const guidance = aiGuidanceData as unknown as AIGuidance

  return { components, recipes, tokens, responsiveRules, guidance }
}

// ── registerLibraryComponents() ────────────────────────────

/**
 * Loads the design library and registers ALL components in the
 * componentRegistry. Also populates the libraryMetadata Map for
 * rich metadata lookup.
 *
 * Call this once at app initialization (e.g. in a layout or provider).
 * Subsequent calls are safe — they simply re-register (the registry
 * overwrites by componentId).
 */
export function registerLibraryComponents(): void {
  const { components } = loadDesignLibrary()

  for (const comp of components) {
    // Register in the component registry (family + variant → componentId)
    componentRegistry.register({
      family: comp.family,
      variant: comp.variant,
      componentId: comp.id,
      sectionType: inferSectionType(comp.family),
      tags: comp.tags,
      conflictsWith: comp.incompatibleWith,
    })

    // Store extended metadata in the sidecar map
    libraryMetadata.set(comp.id, {
      componentId: comp.id,
      intent: comp.intent,
      useWhen: comp.useWhen,
      avoidWhen: comp.avoidWhen,
      slots: comp.slots,
      styleHooks: comp.styleHooks,
      compatibleWith: comp.compatibleWith,
      incompatibleWith: comp.incompatibleWith,
      conflictScope: comp.conflictScope,
      contentRules: comp.contentRules,
      imageGuidance: comp.imageGuidance,
      heroArchitecture: comp.heroArchitecture,
      motion: comp.motion,
      visualStyle: comp.visualStyle,
      industries: comp.industries,
      brandPersonalities: comp.brandPersonalities,
      responsive: comp.responsive,
      roles: comp.roles,
    })
  }
}

/** Map a library family name to a Storqly SectionType for registry entries. */
function inferSectionType(family: string): string {
  const mapping: Record<string, string> = {
    'hero': 'hero',
    'product-grid': 'product-grid',
    'collection': 'categories',
    'category': 'categories',
    'featured-product': 'featured-products',
    'testimonials': 'testimonials',
    'trust': 'text-banner',
    'promotion': 'cta',
    'cta': 'cta',
    'newsletter': 'newsletter',
    'brand-story': 'brand-statement',
    'editorial': 'rich-text',
    'feature-benefits': 'faq',
    'gallery': 'image-gallery',
    'footer': 'footer',
    'header': 'header',
    'announcement-bar': 'text-banner',
    'announcement': 'text-banner',
    'navigation': 'rich-text',
    'button': 'spacer',
    'product-card': 'product-grid',
    'commerce-pattern': 'spacer',
  }
  return mapping[family] ?? 'spacer'
}

// ── Lookup functions ───────────────────────────────────────

/**
 * Retrieve extended library metadata for a registered component.
 * Returns undefined if the componentId is not in the library.
 */
export function getLibraryMetadata(componentId: string): LibraryMetadata | undefined {
  return libraryMetadata.get(componentId)
}

/**
 * Get all library components belonging to a given family.
 * Uses the componentRegistry's family index.
 */
export function getComponentsByFamily(family: string): LibraryComponent[] {
  const entries = componentRegistry.getVariantsByFamily(family)
  return entries
    .map((entry): LibraryComponent | null => {
      const meta = libraryMetadata.get(entry.componentId)
      if (!meta) return null
      return {
        id: entry.componentId,
        family: entry.family,
        variant: entry.variant,
        intent: meta.intent,
        useWhen: meta.useWhen,
        avoidWhen: meta.avoidWhen,
        slots: meta.slots,
        layout: { desktop: '' },
        responsive: meta.responsive,
        styleHooks: meta.styleHooks,
        compatibleWith: meta.compatibleWith,
        incompatibleWith: meta.incompatibleWith,
        conflictScope: meta.conflictScope,
        contentRules: meta.contentRules,
        motion: meta.motion,
        tags: entry.tags ?? [],
        visualStyle: meta.visualStyle,
        industries: meta.industries,
        brandPersonalities: meta.brandPersonalities,
        heroArchitecture: meta.heroArchitecture,
        imageGuidance: meta.imageGuidance,
        roles: meta.roles,
      }
    })
    .filter((c): c is LibraryComponent => c !== null)
}

/**
 * Get all library components that fulfill a given DesignRole.
 */
export function getComponentsByRole(role: string): LibraryComponent[] {
  const results: LibraryComponent[] = []
  libraryMetadata.forEach((meta, componentId) => {
    if (meta.roles.includes(role as DesignRole)) {
      const entry = componentRegistry.getByComponentId(componentId)
      if (entry) {
        results.push({
          id: entry.componentId,
          family: entry.family,
          variant: entry.variant,
          intent: meta.intent,
          useWhen: meta.useWhen,
          avoidWhen: meta.avoidWhen,
          slots: meta.slots,
          layout: { desktop: '' },
          responsive: meta.responsive,
          styleHooks: meta.styleHooks,
          compatibleWith: meta.compatibleWith,
          incompatibleWith: meta.incompatibleWith,
          conflictScope: meta.conflictScope,
          contentRules: meta.contentRules,
          motion: meta.motion,
          tags: entry.tags ?? [],
          visualStyle: meta.visualStyle,
          industries: meta.industries,
          brandPersonalities: meta.brandPersonalities,
          heroArchitecture: meta.heroArchitecture,
          imageGuidance: meta.imageGuidance,
          roles: meta.roles,
        })
      }
    }
  })
  return results
}

/**
 * Find the list of component IDs compatible with a given component.
 * Returns an empty array if the component is not found or has no
 * compatible_with entries.
 */
export function findCompatibleComponents(componentId: string): string[] {
  const meta = libraryMetadata.get(componentId)
  return meta?.compatibleWith ?? []
}

/**
 * Get all composition recipes from the design library.
 */
export function getCompositionRecipes(): CompositionRecipe[] {
  const { recipes } = loadDesignLibrary()
  return recipes
}
