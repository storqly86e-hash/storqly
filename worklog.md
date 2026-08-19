---
Task ID: 1
Agent: Main Orchestrator
Task: Fix all image pipeline + generation + layout issues for Railway deploy

Work Log:
- Fixed hydration mismatch: dynamic BUILD_HASH with suppressHydrationWarning
- Traced full image pipeline: LLM → heroImages → normalize → renderer → browser
- ROOT CAUSE 1: LLM generates fake Unsplash URLs (photo-<id>) that 404
- ROOT CAUSE 2: heroImages never enriched (only style.backgroundImage was)
- ROOT CAUSE 3: On Railway, z-ai CLI unavailable so ALL enrichment was skipped
- ROOT CAUSE 4: Generation prompt restricted to 4 generic sections, ignoring user intent
- ROOT CAUSE 5: Layout too narrow (maxWidth lg instead of xl)
- Added 9 categories of curated real Unsplash URLs to generation prompt
- Category auto-detection from user prompt keywords
- Removed 4-section limit, allowed all user-requested section types
- Added heroImageQueries to enrich-images route
- Added heroImages scanning and enrichment to client trigger
- Changed default maxWidth from lg to xl, paddingY from md to lg
- Static BUILD_ID in store-renderer to prevent hydration issues

- Committed all changes, push requires GitHub credentials

Stage Summary:
- Files changed: generate/route.ts, enrich-images/route.ts, page.tsx, normalize-store.ts, store-renderer/index.tsx
- Lint: 0 new errors (3 pre-existing shadcn/ui errors remain)
- Dev server: HTTP 200, compiles correctly
- Committed as dcc4095
- Push to GitHub requires manual credentials (no tokens in sandbox)
