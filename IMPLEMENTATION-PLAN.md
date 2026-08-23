# Storqly Implementation Plan — Current Status

## Completed Phases

### Phase 1: Architecture Audit
- Mapped complete 16-stage pipeline
- Identified 8 data flow break points
- All 73 components, 8 recipes, cross-references validated

### Phase 2: DesignDirection Layer
- Created `design-direction.ts` with full DD type + inference
- Category-aware recipe scoring (0.25 category affinity weight)
- Variant scoring uses DD preferred archetypes (+0.15 hero, +0.1 card)
- Result: 4 unique recipes / 6 brands (was 2/3)

### Phase 3: Composition Differentiation
- Category-specific recipe affinities (skincare -> science_backed, fitness -> gen_z_drop)
- Adjacency penalties in variant selection
- Result: Average section overlap 34% (was 80%)

### Phase 4: Variant CSS Var Consumption
- Added variantCssVars to all 16 section components
- ProductCard reads 13 --card-* CSS vars
- 24 previously unconsumed vars added (14 promo + 10 generic --section-*)
- Result: ~100% consumption (was 45%)

### Phase 5: DesignDirection Full Control
- DD influences: recipe, hero, card, gallery, CTA, density, radius, elevation
- densityPreset now reads from DD.visual.density (was ignoring it)
- designHints field carries radius/elevation/density/CTA/imageDirection downstream

### Phase 6: AI Style Bridge
- 11 section type handlers with whitelist validation
- CSS injection prevention (blocks ;, {}, url(), expression(), etc.)
- Integrated in generate route after normalization

### Phase 7: Design Token Resolution
- `token-resolver.ts` reads design-tokens.json
- Resolves typography systems (4), density presets (3), spacing, radii, elevation
- DD overrides: radiusLanguage -> defaultRadius, elevationLanguage -> defaultElevation
- ~64 CSS vars produced per store

### Phase 8: Visual Rhythm Engine
- `visual-rhythm.ts` computes per-section: density, surface, content-width, spacing, weight
- Surface alternation (max 2 consecutive default)
- Density-driven vertical spacing with after_heavy variants
- Energy influence (calm -> airy, extreme -> compact)

### Phase 9: Responsive Enhancement
- SectionWrapper: responsive padding (py-8 md:py-14 lg:py-20 for xl)
- Hero: vh-based min-height, responsive headline sizes, full-width CTA on mobile
- ProductGrid: 2-col mobile, responsive gaps
- ImageGallery: 1-col mobile masonry, responsive grid
- Testimonials: true single-column mobile
- CTA: full-width buttons, responsive text alignment

### Phase 10: Quality Guardrails
- `quality-guardrails.ts`: 6 scored dimensions
- Weights: coherence 0.2, specificity 0.25, variety 0.2, commerce 0.15, responsive 0.1, validity 0.1
- ai-guidance.json reject rules implemented as heuristics
- Status: PASS (>=0.7), WARN (>=0.5), FAIL (<0.5 or error-severity violation)

### Phase 11: Genericity Detector
- `genericity-detector.ts`: 4 overlap dimensions
- Weights: section 0.3, variant 0.35, layout 0.2, cardStyle 0.15
- Thresholds: WARN >= 0.65, REJECT >= 0.8

### Phase 12: Auto-Repair
- `auto-repair.ts`: bounded to MAX_REPAIR_ATTEMPTS = 2
- 5 strategies: section order, missing CTA, spacing variety, variant metadata, full recompose
- Returns best result even if not perfect

### Phase 13: Pipeline Integration
- Data flow fix: compositionResult saved to store.designLibrary.compositionResult
- Guardrails + genericity + repair integrated into generate route
- Non-fatal: quality errors never crash generation

## Design Library JSON Files

| File | Size | Content | Status |
|---|---|---|---|
| design-tokens.json | 126 lines | 4 typography systems, 3 density presets, type scale, radii, elevation, motion | Wired via token-resolver |
| responsive-rules.json | 69 lines | 3 breakpoints, 6 layout adaptations, image rules, universal rules | Referenced for responsive patterns |
| composition-recipes.json | 8 recipes | Recipe nodes, signals, avoid lists, recommended themes | Consumed by composition.ts |
| ai-guidance.json | 78 lines | Selection pipeline, scoring formula, composition rules, quality guardrails | Quality rules implemented |

## Regression Test

Run: `bun run src/lib/design-library/__tests__/six-brand-regression.ts`

Validates 8 criteria across 6 brands:
1. Unique recipes (>= 4)
2. Unique heroes (>= 3)
3. Unique aesthetics (>= 3)
4. Average section overlap (< 0.50)
5. Token CSS vars (>= 20 each)
6. Section rhythm matches nodes
7. Density preset varies
8. Genericity (no REJECT)

Current result: **8/8 PASS**

## Known Limitations

1. Sandbox OOM prevents full AI generation + rendering in test environment
2. Visual browser verification requires agent browser (not yet done)
3. Pre-existing lint errors in carousel.tsx, auth-modal.tsx, use-mobile.ts (3 errors + 3 warnings)
4. Quality guardrails on skeleton test stores show FAIL (expected - no real content)
5. responsive-resolver.ts exists but is used as reference, not directly imported by renderer (responsive patterns applied via Tailwind classes)
