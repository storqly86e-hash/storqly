# Storqly Premium Design Generation Engine — Implementation Plan

## Phase 2: Canonical Design Intent + Design Director

### Goal
Create one authoritative `DesignDirection` object that flows through the entire pipeline, replacing the thin `BrandProfile` with a rich, multi-dimensional design specification.

### Files to Create/Modify

1. **CREATE** `src/lib/design-library/design-direction.ts`
   - Export `DesignDirection` interface (brand, visual, commerce, content, design fields per spec)
   - Export `inferDesignDirection(prompt: string, brandProfile: BrandProfile): DesignDirection`
   - Expand the heuristic extraction from `composition.ts:extractDesignIntentHeuristic()` into a richer inference
   - Add: aesthetic, sophistication, minimalism, image_direction, contrast_strategy, color_strategy, typography_strategy, radius_language, elevation_language, merchandising_strategy, cta_strategy, storytelling_intensity, education_intensity, editorial_intensity, composition_family, preferred_hero_archetype, preferred_card_archetype, preferred_gallery_archetype, preferred_cta_archetype, density
   - This becomes the source of truth for ALL downstream decisions

2. **MODIFY** `src/lib/design-library/composition.ts`
   - Change `composeStore()` to return `DesignDirection` alongside `CompositionResult`
   - Pass `DesignDirection` to `selectRecipe()` and `selectVariantForRole()` instead of raw `BrandProfile`

3. **MODIFY** `src/lib/design-library/design-intent.ts`
   - Export `DesignDirection` from the canonical module (or re-export from design-direction.ts)

### DesignDirection Interface Shape
```typescript
interface DesignDirection {
  // Brand (expanded from BrandProfile)
  brand: {
    category: string;
    subcategory: string;
    audience: string;
    pricePositioning: string;
    brandPersonality: string;
    productCharacteristics: string[];
  };
  // Visual
  visual: {
    aesthetic: 'editorial' | 'clinical' | 'energetic' | 'warm' | 'bold' | 'minimal' | 'campaign';
    mood: string;
    sophistication: 'low' | 'medium' | 'high' | 'ultra';
    visualEnergy: 'calm' | 'moderate' | 'high' | 'extreme';
    minimalism: 'low' | 'medium' | 'high';
    density: 'airy' | 'balanced' | 'compact';
    contrastLevel: 'low' | 'medium' | 'high';
    colorStrategy: 'monochrome' | 'neutral+accent' | 'rich_palette' | 'brand_bold';
    typographyStrategy: 'serif_led' | 'sans_led' | 'mono_led' | 'mixed_serif_sans';
    radiusLanguage: 'none' | 'sharp' | 'subtle' | 'rounded' | 'pill';
    elevationLanguage: 'flat' | 'subtle' | 'medium' | 'dramatic';
    imageDirection: 'studio' | 'lifestyle' | 'flat_lay' | 'ugc' | 'campaign' | 'ingredient';
  };
  // Commerce
  commerce: {
    conversionObjective: 'awareness' | 'consideration' | 'conversion';
    merchandisingPriority: 'editorial' | 'utility' | 'performance' | 'discovery';
    productDiscoveryStrategy: 'curated' | 'catalog' | 'guided' | 'routine';
    ctaStrategy: 'subtle' | 'inviting' | 'direct' | 'urgent';
    trustRequirements: 'low' | 'medium' | 'high';
  };
  // Content
  content: {
    storytellingIntensity: 'low' | 'medium' | 'high';
    educationIntensity: 'low' | 'medium' | 'high';
    editorialIntensity: 'low' | 'medium' | 'high';
  };
  // Design (specific variant archetypes)
  design: {
    compositionFamily: string;
    preferredHeroArchetype: string[];
    preferredCardArchetype: string;
    preferredGalleryArchetype: string;
    preferredCtaArchetype: string;
    preferredSectionRhythm: string;
  };
}
```

---

## Phase 3: Composition Differentiation

### Goal
Fix recipe and variant scoring so different brand categories produce different compositions.

### Files to Modify

1. **MODIFY** `src/lib/design-library/composition.ts`
   - **`selectRecipe()`** (line 131): Add category-aware weighting:
     ```
     - Add 0.15 weight for category-recipe affinity
     - skincare signals → boost recipe.science_backed_skincare
     - fashion signals → boost recipe.luxury_editorial_launch or recipe.editorial_campaign
     - fitness/streetwear → boost recipe.gen_z_drop_energy
     - home/craft → boost recipe.approachable_home_craft
     - electronics/tech → boost recipe.fast_catalog_discovery
     - Reduce price_tier weight from 0.2 to 0.1
     - Add negative scoring for avoid lists
     ```
   - **`selectVariantForRole()`** (line 89): Use DesignDirection fields:
     ```
     - Score against visual.aesthetic, visual.sophistication, visual.minimalism
     - Score against commerce.merchandisingPriority, commerce.ctaStrategy
     - Score against design.preferredHeroArchetype, design.preferredCardArchetype
     - Add variantSelectionReason logging
     ```
   - **`scoreComponent()`** (line 44): Use DesignDirection instead of BrandProfile
   - **`extractDesignIntentHeuristic()`** (line 266): Keep as base, extend subcategory detection

2. **MODIFY** `src/lib/design-library/design-intent.ts`
   - Add `CompositionResult` field: `designDirection: DesignDirection`

### Expected Outcome
- NOIRÉ (luxury fashion) → `luxury_editorial_launch` with editorial hero, luxury gallery cards
- VERDÉA (premium skincare) → `science_backed_skincare` with ingredient hero, bestseller grid
- IRONFORGE (fitness) → `gen_z_drop_energy` with asymmetric hero, bold rail grid

---

## Phase 4: Variant Selection + Visual Rhythm

### Goal
Ensure variant selections are semantically coherent and page has visual rhythm.

### Files to Modify

1. **MODIFY** `src/lib/design-library/composition.ts`
   - After variant selection, add rhythm analysis:
     ```
     - Count alignment repetitions (center/center/center → bad)
     - Count full-bleed vs contained alternation
     - Check for visual monotony (same card style, same spacing)
     - If monotony detected, swap one variant for a compatible alternative
     - Log rhythm score for observability
     ```
   - Add compatibility scoring between adjacent sections

2. **MODIFY** `src/lib/design-library/variant-config-resolver.ts`
   - Add section-level density CSS var: `--section-density` with values from DesignDirection
   - Add background alternation logic based on section index

---

## Phase 5: Renderer Contract + ProductCard (CRITICAL)

### Goal
Achieve 100% consumption of important design-library properties.

### 5A: Add variantCssVars to 8 Unaware Sections

**MODIFY** `src/components/store-renderer/sections.tsx`

For each of these sections, add `variantCssVars` prop and `v()` helper:

1. **BrandStatementSection** (~line 1500)
   - Add `variantCssVars` to destructured props
   - Add `const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;`
   - Read: `--brand-layout` → split vs centered layout
   - Read: `--brand-split-ratio` → grid columns (e.g., '5/7' → `grid-cols-5`/`grid-cols-7`)
   - Read: `--brand-image-bleed` → whether image extends beyond its container
   - Read: `--brand-type-pairing` → heading font (serif vs sans)
   - Read: `--brand-caption-style` → caption font size/weight
   - **IMPORTANT**: Remove self-built wrapper, use SectionWrapper instead (so cssVars/extraClasses from renderSection actually apply)

2. **ImageGallerySection** (~line 1200)
   - Add `variantCssVars` to props
   - Read: `--gallery-layout` → 'masonry' vs 'grid'
   - Read: `--gallery-columns` → column count (2/3/4)
   - Read: `--gallery-gap` → gap size
   - Read: `--gallery-captions` → 'overlay' vs 'below' vs 'none'
   - Read: `--gallery-masonry-pattern` → 'staggered' vs 'uniform'

3. **HeaderSection** (~line 440)
   - Add `variantCssVars` to props
   - Read: header-specific vars for logo scale, nav spacing, border mode, height

4. **FooterSection** (~line 1850)
   - Add `variantCssVars` to props
   - Read: column count, surface, divider mode

5. **TextBannerSection** (trust family)
   - Add `variantCssVars` to props
   - Read: `--trust-layout`, `--trust-density`, `--trust-icon-style`, `--trust-alignment`

6. **FAQSection** (feature-benefits family)
   - Add `variantCssVars` to props
   - Read: `--trust-columns`, `--trust-divider-mode`, `--trust-density`

7. **CategoriesSection**
   - Add `variantCssVars` to props
   - Read: category-specific layout and tile style vars

8. **FeaturedProductsSection**
   - Add `variantCssVars` to props (it already has `cardStyle`)
   - Read featured-product specific vars

### 5B: ProductCard CSS Var Consumption

**MODIFY** `src/components/store-renderer/sections.tsx` (ProductCard function, lines 193-416)

The card currently uses `cardStyle` string prop with hardcoded if/else branches. Two options:

**Option A (Preferred)**: Keep `cardStyle` prop but ALSO read CSS vars as overrides:
```typescript
// In ProductCard, read CSS vars from parent wrapper via CSS custom properties
// The vars are set on the section wrapper div, so they cascade to children
const cardRadius = v('--card-radius', '0.5rem');
const cardPadding = v('--card-padding', '1rem');
const cardImageRatio = v('--card-image-ratio', '3/4');
// Apply these as inline styles
```

**Option B**: Extend `cardStyle` to pass through to ProductCard as additional config.

Recommended: Option A. CSS vars already cascade from the wrapper div. ProductCard just needs to read them.

### 5C: Fix Read-But-Unused Vars

In CTASection, the vars `--cta-urgency-level`, `--cta-contrast`, `--cta-proof-style` are destructured but never used. Connect them to visual output:
- `--cta-urgency-level` → urgency indicator styling
- `--cta-contrast` → high contrast mode (inverted colors)
- `--cta-proof-style` → social proof element visibility

### 5D: Remove Dead --card-* CSS Var Production

**MODIFY** `src/lib/design-library/variant-config-resolver.ts`

Since ProductCard uses `cardStyle` prop (not CSS vars), the CARD_STYLE_CONFIGS CSS vars are dead. Two options:
- Remove CSS vars from CARD_STYLE_CONFIGS, keep only the style logic
- OR better: make ProductCard read the CSS vars (Option A above)

Recommended: Make ProductCard read the CSS vars. This makes the card system truly CSS-driven.

---

## Phase 6: AI Style Bridge

### Goal
Convert AI-generated section.style fields into renderer-consumable properties.

### Files to Create/Modify

1. **CREATE** `src/lib/design-library/style-bridge.ts`
   - Export `bridgeSectionStyles(section: Section, designDirection: DesignDirection): Section`
   - Maps AI style fields → content/style fields the renderer reads:
     ```
     section.style.typographySystem → section.content.headingFontFamily (or style override)
     section.style.surfaceTheme → section.style.backgroundColor (light→white, dark→dark)
     section.style.contentAlignment → section.content.alignment
     section.style.productScale → section.content.productScale
     section.style.sectionHeight → section.style.paddingY
     section.style.density → style override for spacing
     section.style.masonryPattern → section.content.layout (for gallery)
     section.style.quoteScale → style override for text size (for testimonials)
     section.style.cardMode → content override for card display
     section.style.splitRatio → style override for grid columns
     section.style.typePairing → style override for font family
     section.style.captionStyle → content override for caption rendering
     ```
   - Run AFTER normalizeStore, BEFORE componentMeta validation
   - Preserve backward compatibility: only transform known fields, pass through unknowns

2. **MODIFY** `src/app/api/store/generate/route.ts`
   - After normalizeStore (line 617), before validateAndFixComponentMeta (line 638):
     ```
     import { bridgeSectionStyles } from '@/lib/design-library/style-bridge';
     store = bridgeSectionStyles(store, designDirection);
     ```

3. **MODIFY** `src/components/store-renderer/sections.tsx`
   - In SectionWrapper and per-section components, consume the bridged fields
   - E.g., HeroSection reads `content.headingFontFamily` → applies to headline
   - E.g., ImageGallerySection reads `content.layout` → switches between masonry/grid

---

## Phase 7: Design Tokens + Responsive Rules

### Goal
Connect the orphaned design-tokens.json and responsive-rules.json to the runtime.

### Files to Modify

1. **MODIFY** `src/lib/design-library/loader.ts`
   - Add imports for design-tokens.json and responsive-rules.json
   - Add to `LoadedDesignLibrary` interface: `tokens: DesignTokens`, `responsiveRules: ResponsiveRules`
   - Parse and expose them

2. **MODIFY** `src/lib/design-library/variant-config-resolver.ts`
   - Use design tokens for typography scale, spacing, radii
   - Map DesignDirection.density → density preset → token values
   - Map DesignDirection.typographyStrategy → typography system → token values

3. **MODIFY** `src/components/store-renderer/sections.tsx`
   - Use token-derived values for heading sizes, body sizes, spacing
   - Replace hardcoded `text-3xl`/`text-5xl` with token-driven values via section-level overrides

---

## Phase 8: Quality Guardrails + Observability

### Goal
Detect and fix generic stores automatically.

### Files to Create

1. **CREATE** `src/lib/design-library/quality-guard.ts`
   - Export `evaluateStoreQuality(store: Store, designDirection: DesignDirection): QualityReport`
   - Check:
     - Recipe appropriate for brand category
     - Hero variant matches brand energy
     - Card variant matches brand positioning
     - Section diversity (no >3 same-alignment sections in a row)
     - Density consistency with brand direction
     - Typography consistency
   - Return score 0-100 and list of issues

2. **CREATE** `src/lib/design-library/design-fingerprint.ts`
   - Export `generateFingerprint(store: Store, composition: CompositionResult): DesignFingerprint`
   - Machine-readable object for comparing stores

3. **MODIFY** `src/app/api/store/generate/route.ts`
   - After full generation, call `evaluateStoreQuality()`
   - If score < 70, log warnings (future: auto-refine)
   - Include quality score and fingerprint in SSE progress events

---

## Phase 9: Multi-Brand Regression Tests

### Files to Create

1. **CREATE** `src/lib/design-library/__tests__/composition-differentiation.test.ts`
   - Test 6 brands: luxury fashion, premium skincare, fitness, streetwear, jewelry, electronics
   - Verify: different recipes where appropriate
   - Verify: different hero variants
   - Verify: different card variants
   - Verify: different section sequences

2. **CREATE** `src/lib/design-library/__tests__/variant-consumption.test.ts`
   - For each family, verify: every produced CSS var has a consumer in the renderer
   - For each family, verify: contentOverrides are valid section.content fields

3. **CREATE** `src/lib/design-library/__tests__/style-bridge.test.ts`
   - Verify: AI style fields are correctly bridged to renderer fields

4. **CREATE** `src/lib/design-library/__tests__/quality-guard.test.ts`
   - Verify: luxury brand gets high quality score
   - Verify: generic detection works

---

## Execution Order (Dependencies)

```
Phase 2: Design Direction (no deps)
    ↓
Phase 3: Composition Fix (depends on Phase 2)
    ↓
Phase 5: Renderer Contract (no deps on 2-4, can parallelize)
    ↓
Phase 6: AI Style Bridge (no deps, can parallelize with 3)
    ↓
Phase 4: Visual Rhythm (depends on Phase 2-3)
    ↓
Phase 7: Design Tokens (depends on Phase 5 for consumption)
    ↓
Phase 8: Quality Guardrails (depends on Phase 2-7)
    ↓
Phase 9: Tests (depends on all)
```

## Files Changed Per Phase

| Phase | Files Created | Files Modified | Lines Changed (est.) |
|---|---|---|---|
| 2 | 1 | 2 | ~300 |
| 3 | 0 | 1 | ~150 |
| 4 | 0 | 2 | ~100 |
| 5 | 0 | 1 | ~400 |
| 6 | 1 | 1 | ~200 |
| 7 | 0 | 3 | ~200 |
| 8 | 2 | 1 | ~200 |
| 9 | 4 | 0 | ~400 |
| **TOTAL** | **8** | **~7** | **~1950** |
