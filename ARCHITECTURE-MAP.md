# Storqly Architecture Map — Complete Generation Data Flow

## Pipeline Overview

```
USER PROMPT
    ↓
[composeStore()] — Heuristic brand profile extraction
    ↓
BRAND PROFILE (category, audience, mood, energy, tier)
    ↓
[selectRecipe()] — Recipe scoring against brand profile
    ↓
RECIPE + COMPOSITION NODES (role → component_id)
    ↓
[selectVariantForRole()] — Per-node variant scoring
    ↓
VARIANT SELECTIONS + VARIANT SUMMARIES
    ↓
[buildLibraryPromptContext()] — Composition → prompt text
    ↓
[executeAI()] — AI generates full Store JSON
    ↓
AI STORE OUTPUT (sections with componentMeta, style, content)
    ↓
[normalizeStore()] — Field validation & coercion
    ↓
[validateAndFixComponentMeta()] — componentMeta validation/attachment
    ↓
FINAL STORE SCHEMA
    ↓
[renderSection() → resolveVariantConfig()] — Variant CSS vars + content overrides
    ↓
RENDERER PROPS (variantCssVars, cardStyle, contentOverrides, styleOverrides)
    ↓
SECTION COMPONENTS → DOM
```

## Where Design Intent Gets Lost (8 Critical Points)

### LOSS POINT 1: Recipe Scoring Dominated by Price Tier
**File**: `src/lib/design-library/composition.ts:131-157`
**Problem**: `selectRecipe()` uses 0.3 weight for signal overlap and 0.2 weight for price tier. But the brand profile heuristic maps "premium" and "luxury" keywords to the same `price_tier=luxury`. Result: NOIRÉ (luxury fashion) and VERDÉA (premium skincare) both select `recipe.luxury_editorial_launch`.
**Impact**: IDENTICAL composition for fundamentally different brands.

### LOSS POINT 2: Variant Scoring Uses Generic Signal Matching
**File**: `src/lib/design-library/composition.ts:44-84, 89-127`
**Problem**: `scoreComponent()` matches component `useWhen` tags against brand profile keywords. The matching is substring-based and too coarse. A component tagged "editorial" matches any brand with "editorial" in any field. Energy matching is binary (high/not-high).
**Impact**: Same variants selected for similar-tier brands regardless of category nuance.

### LOSS POINT 3: design-tokens.json Is Orphaned
**File**: `src/data/design-library/design-tokens.json` (5.5KB)
**Problem**: Never imported by loader.ts. Contains typography systems (4), density presets (3), spacing scales, radii, elevation — all disconnected from runtime.
**Impact**: Typography, spacing, and density are hardcoded in renderer, not driven by design tokens.

### LOSS POINT 4: responsive-rules.json Is Orphaned
**File**: `src/data/design-library/responsive-rules.json` (3.4KB)
**Problem**: Never imported by loader.ts. Contains breakpoints, layout adaptations, universal rules — all disconnected.
**Impact**: Responsive behavior is hardcoded per-component, not driven by centralized rules.

### LOSS POINT 5: AI Style Metadata Not Bridged to Renderer
**Files**: AI output → `normalize-store.ts` → renderer
**Problem**: AI generates section.style fields like `typographySystem`, `surfaceTheme`, `contentAlignment`, `productScale`, `mediaCrop`, `vignetteStrength`, `sectionHeight`, `density`, `masonryPattern`, `quoteScale`, `cardMode`, etc. `normalize-store.ts` does NOT convert these to renderer-consumable fields. The renderer never reads them.
**Impact**: ~30+ AI-generated style properties per store are silently discarded.

### LOSS POINT 6: 196 CSS Custom Properties Are Write-Only
**File**: `src/components/store-renderer/sections.tsx`
**Problem**: The variant config resolver produces ~196 CSS vars that are set on wrapper divs but never consumed by child components.
**Breakdown**:
- `--card-*` (105 vars): ProductCard uses `cardStyle` prop, not CSS vars
- `--brand-*` (16 vars): BrandStatementSection doesn't accept variantCssVars
- `--gallery-*` (9 vars): ImageGallerySection doesn't accept variantCssVars
- `--trust-*` (10 vars): TextBannerSection doesn't accept variantCssVars
- `--promo-*` (14 vars): No "promotion" section type exists in renderer
- Other unconsumed (42 vars): scattered across newsletter, testimonials, hero, cta, grid

### LOSS POINT 7: 8 of 16 Section Types Have Zero Variant Awareness
**Components that DON'T accept variantCssVars**:
- HeaderSection, TextBannerSection, ImageGallerySection, BrandStatementSection
- FAQSection, CategoriesSection, RichTextSection, FooterSection

### LOSS POINT 8: No Visual Rhythm Engine
**Problem**: Section spacing is uniform (`py-16` or style.paddingY). No concept of alternating density, background transitions, or art-directed rhythm. Every section gets the same vertical spacing regardless of its role or the surrounding context.

## Existing Reusable Infrastructure (DO NOT REWRITE)

| Component | Location | Status | Reuse Strategy |
|---|---|---|---|
| 73 component definitions | `src/data/design-library/*.json` | ✅ Production-quality | Extend metadata where needed |
| 8 composition recipes | `composition-recipes.json` | ✅ Good diversity | Fix scoring, keep recipes |
| Variant mapping (73 entries) | `variant-mapping.ts` | ✅ Complete | Keep, extend with new fields |
| Variant config resolver | `variant-config-resolver.ts` | ✅ Rich output | Keep per-family resolvers, add missing families |
| Component registry | `component-registry.ts` | ✅ Working | Keep, add card style routing |
| Composition engine | `composition.ts` | ⚠️ Needs scoring fix | Fix selectRecipe/selectVariantForRole |
| Prompt context builder | `prompt-context.ts` | ✅ Working | Keep, enhance with design direction |
| Normalization pipeline | `normalize-store.ts` | ✅ Robust | Add AI style bridge layer |
| componentMeta validator | `componentmeta-validator.ts` | ✅ Working | Unify duplicate maps |
| AI orchestrator | `ai-orchestrator.ts` | ✅ Working | Keep |
| AI providers | `ai-providers.ts` | ✅ Working | Keep |
| Renderer sections | `sections.tsx` | ⚠️ 45% consumption | Add variantCssVars to 8 sections |
| ProductCard | `sections.tsx:193-416` | ⚠️ No CSS var support | Add CSS var consumption |
| design-tokens.json | Orphaned | ❌ Not loaded | Wire into loader + renderer |
| responsive-rules.json | Orphaned | ❌ Not loaded | Wire into loader + renderer |

## Renderer Consumption Map (Current State)

| Family | Vars Produced | Vars Consumed | Gap | % |
|---|---|---|---|---|
| hero | 25 | 20 | 5 | 80% |
| product-grid (section) | 7 | 7 | 0 | 100% |
| product-grid (card CSS vars) | 15 | 0 | 15 | 0% |
| cta | 10 | 7 | 3 | 70% |
| testimonials | 13 | 8 | 5 | 62% |
| newsletter | 12 | 6 | 6 | 50% |
| brand-story | 16 | 0 | 16 | 0% |
| gallery | 9 | 0 | 9 | 0% |
| trust | 10 | 0 | 10 | 0% |
| promotion (no section) | 14 | 0 | 14 | 0% |
| featured-product | 3 | 0 | 3 | 0% |
| announcement | 3 | 0 | 3 | 0% |
| generic --section-* | 11 | 0 | 11 | 0% |
| **TOTAL** | **~148** | **~48** | **~100** | **32%** |
