# Storqly Architecture Map — Premium Design Engine v2

## Pipeline Overview (16 Stages)

```
USER PROMPT
    |
[1] extractDesignIntentHeuristic() -- category, audience, mood, energy, tier
    |
[2] inferDesignDirection() -- full DesignDirection (aesthetic, density, sophistication, etc.)
    |
[3] selectRecipe() -- category-aware recipe scoring (0.25 category affinity weight)
    |
[4] selectVariantForRole() -- per-role variant scoring with DD archetype bonuses
    |
[5] resolveDesignTokens() -- design-tokens.json -> CSS vars (typography, spacing, radii, elevation)
    |
[6] computeVisualRhythm() -- per-section density, surface, content-width, spacing, weight
    |
[7] buildLibraryPromptContext() -- composition + tokens + rhythm -> AI prompt section
    |
[8] executeAI() -- AI generates full Store JSON
    |
[9] normalizeStore() -- field validation & coercion
    |
[10] bridgeSectionStyles() -- AI style fields -> renderer-consumable fields (whitelist + sanitize)
    |
[11] validateAndFixComponentMeta() -- attach componentMeta, save compositionResult to store.designLibrary
    |
[12] validateStoreQuality() -- 6-dimension quality scoring (coherence, specificity, variety, commerce, responsive, validity)
    |
[13] detectGenericity() -- 4-dimension genericity detection (section, variant, layout, card overlap)
    |
[14] attemptAutoRepair() -- bounded repair (max 2 attempts) if FAIL/REJECT
    |
[15] FINAL STORE -> saved to DB with designLibrary.compositionResult
    |
[16] RENDERER: tokenCssVars -> baseStyle, sectionRhythm -> per-section overrides, variantCssVars -> component props
```

## File Map

| File | Role |
|---|---|
| `src/lib/design-library/design-direction.ts` | DesignDirection type + inference from prompt (~590 lines) |
| `src/lib/design-library/composition.ts` | Recipe selection + variant selection + token/rhythm computation (~465 lines) |
| `src/lib/design-library/design-intent.ts` | BrandProfile, CompositionResult, DesignDirection types |
| `src/lib/design-library/variant-config-resolver.ts` | Per-family CSS var resolution (~1200 lines) |
| `src/lib/design-library/variant-mapping.ts` | 73 variant definitions |
| `src/lib/design-library/variant-categories.ts` | Page-section vs sub-component classification |
| `src/lib/design-library/loader.ts` | JSON library data loader |
| `src/lib/design-library/token-resolver.ts` | design-tokens.json resolution -> CSS vars (~250 lines) |
| `src/lib/design-library/visual-rhythm.ts` | Per-section rhythm computation (~220 lines) |
| `src/lib/design-library/responsive-resolver.ts` | Responsive layout adaptations (~120 lines) |
| `src/lib/design-library/style-bridge.ts` | AI style -> renderer fields (11 section handlers + whitelist + sanitize) |
| `src/lib/design-library/quality-guardrails.ts` | 6-dimension quality validation (~290 lines) |
| `src/lib/design-library/genericity-detector.ts` | 4-dimension genericity detection (~305 lines) |
| `src/lib/design-library/auto-repair.ts` | Bounded auto-repair (max 2 attempts) (~430 lines) |
| `src/lib/design-library/componentmeta-validator.ts` | componentMeta validation/attachment + designLibrary save |
| `src/lib/design-library/prompt-context.ts` | Composition -> AI prompt context |
| `src/lib/design-library/ensure-registered.ts` | Component registry hydration |
| `src/data/design-library/design-tokens.json` | Typography systems, spacing, radii, elevation, density presets |
| `src/data/design-library/responsive-rules.json` | Breakpoints, layout adaptations, image rules |
| `src/data/design-library/composition-recipes.json` | 8 composition recipes with signals/avoid |
| `src/data/design-library/ai-guidance.json` | Selection pipeline, scoring, quality guardrail rules |
| `src/components/store-renderer/index.tsx` | Store renderer entry, token+rhythm wiring |
| `src/components/store-renderer/sections.tsx` | 16 section components, ~3000+ lines, ~100% CSS var consumption |
| `src/app/api/store/generate/route.ts` | Generation API with guardrails + repair integration |

## Key Types

```typescript
interface DesignDirection {
  brand: { category, subcategory, audience, pricePositioning, brandPersonality, productCharacteristics }
  visual: { aesthetic, mood, sophistication, visualEnergy, minimalism, density, contrastLevel, colorStrategy, typographyStrategy, radiusLanguage, elevationLanguage, imageDirection }
  commerce: { conversionObjective, merchandisingPriority, ctaStrategy, trustRequirements }
  content: { storytellingIntensity, educationIntensity, editorialIntensity }
  design: { compositionFamily, preferredHeroArchetype[], preferredCardArchetype, preferredGalleryArchetype, preferredCtaArchetype, preferredSectionRhythm }
}

interface CompositionResult {
  brandProfile: BrandProfile
  recipeId: string; recipeName: string
  nodes: Array<{ node_id, component_id, role, order }>
  variantSummaries: VariantSummary[]
  imageArtDirections: ImageArtDirectionSummary[]
  typographySystem: string
  densityPreset: string
  designDirection: DesignDirection
  designHints?: { radius, elevation, density, ctaStrategy, imageDirection }
  tokenCssVars?: Record<string, string>  // ~64 CSS vars from design-tokens.json
  sectionRhythm?: Array<{ nodeIndex, rhythmConfig, rhythmCssVars }>  // per-section rhythm
}

interface QualityReport {
  scores: { designCoherence, brandSpecificity, visualVariety, commerceEffectiveness, responsiveReadiness, componentValidity }  // 0-1 each
  overallScore: number  // weighted average
  violations: Array<{ rule, severity, sectionIndex?, details }>
  status: 'PASS' | 'WARN' | 'FAIL'
}

interface GenericityReport {
  genericityScore: number  // 0-1, higher = more generic
  sectionOverlap: number; variantOverlap: number; layoutOverlap: number; cardStyleOverlap: number
  details: { totalSections, uniqueSectionTypes, uniqueComponentIds, repeatedSectionTypes[], dominantLayout }
  status: 'PASS' | 'WARN' | 'REJECT'  // REJECT >= 0.8
}
```

## Renderer Architecture

`store-renderer/index.tsx` reads `store.designLibrary.compositionResult`:
- `tokenCssVars` -> merged into `baseStyle` (root div inline CSS vars)
- `sectionRhythm` -> per-section `_rhythmCssVars` merged into `section.style`

`renderSection()` in `sections.tsx`:
1. Resolves variant config via `resolveVariantConfig(section, theme)` -> `cssVars`, `contentOverrides`, `styleOverrides`, `cardStyle`
2. Merges `_rhythmCssVars` from section.style into `variantCssVars`
3. Passes merged vars to each section component

`SectionWrapper` consumes:
- `--rhythm-surface` -> muted (lighten bg) / inverse (text color as bg)
- `--rhythm-content-width` -> full (100%) / narrow (48rem) / wide (90rem)
- `--rhythm-vertical-spacing` -> inline paddingTop/paddingBottom

## CSS Variable Flow

```
variant-config-resolver.ts -> cssVars (146 unique var names)
    -> renderSection() sets as inline CSS custom properties on wrapper div
    -> each section reads via v('--var-name', 'fallback')

token-resolver.ts -> tokenCssVars (~64 vars)
    -> composition.ts returns in CompositionResult
    -> componentmeta-validator saves to store.designLibrary.compositionResult
    -> renderer index.tsx merges into baseStyle (root div)
    -> sections read via v() or direct variantCssVars access

visual-rhythm.ts -> sectionRhythm (per-section rhythmCssVars)
    -> composition.ts returns in CompositionResult
    -> renderer index.tsx merges into section.style._rhythmCssVars
    -> renderSection merges into variantCssVars
    -> SectionWrapper reads --rhythm-* vars
```

## Before/After Metrics

| Metric | Before | After |
|---|---|---|
| CSS var consumption | 45% | ~100% |
| Unique recipes / 6 brands | 2/3 | 4/6 |
| Section overlap (avg) | ~80% | ~34% |
| Design tokens wired | No | Yes (64 CSS vars) |
| Visual rhythm | No | Yes (per-section) |
| Quality guardrails | No | 6-dimension scoring |
| Genericity detector | No | 4-dimension scoring |
| Auto-repair | No | Bounded 2-attempt |
| AI style bridge | No | 11 handlers + whitelist |
| Responsive enhancement | Basic | Tailwind responsive classes |
