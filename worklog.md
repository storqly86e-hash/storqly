# Storqly Worklog

---
## ⚠️  FEATURE LOCK PROTOCOL

**Rule:** Features below marked ✅ LOCKED have been manually confirmed working by the user.
Locked features MUST NOT be modified, refactored, or touched as a side effect of another fix — unless:
1. It is absolutely required to fix a different confirmed bug, AND
2. The developer explicitly flags BEFORE making the change:
   > "⚠️ REGRESSION RISK: This fix requires touching [locked feature X] because [reason]. Here is what will change."
3. After any such change, that locked feature must be re-tested before moving on.
4. If a locked feature breaks without prior flagging, it is treated as a regression bug.

**Baseline commit:** `lock-protocol-baseline` (2b59480) — output-size reduction, 15/15 test pass
**Every fix gets its own git commit** so regressions can be traced and reverted.

### Locked Feature List

| Feature | Status | Verified By | Commit |
|---------|--------|-------------|--------|
| Landing page design/branding | ❌ NOT YET | — | — |
| Store generation reliability (long + short prompts) | ❌ NOT YET (long prompt still failing) | — | — |
| Visual editor customization | ❌ NOT YET (needs re-verification) | — | — |
| Chat editor customization | ❌ NOT YET (needs re-verification) | — | — |
| Dual-sync (visual + chat together) | ❌ NOT YET | — | — |
| Publish flow (URL, copy, view live) | ✅ LOCKED | User manual test | 6de772b |
| Mobile responsiveness | ❌ NOT YET | — | — |

---
## Change History

---
Task ID: 1
Agent: Main
Task: Root cause investigation of 502 errors on store generation

Work Log:
- Checked dev server: RUNNING, all recent requests returned 200 locally
- Reviewed dev.log: all requests completing (25-126s), JSON malformation ~50% rate causing retries
- Identified: SSE streaming with 4s heartbeats was implemented but AI calls still too slow when retries needed
- Tested AI API connectivity: API works fine, no auth/quota/rate-limit issues
- Tested SDK: confirmed support for `response_format: { type: 'json_object' }`
- Tested JSON mode: 100% parse success rate in standalone tests
- Discovered executeAI timeout was BROKEN (AbortController never connected to SDK call — SDK ignores signal)

Stage Summary:
- Root cause was NOT AI API failure, NOT infrastructure outage, NOT auth/quota issues
- Root cause: AI generates malformed JSON ~50% of time → retry → total time exceeds ~60s proxy timeout → 502
- The fix is `response_format: { type: 'json_object' }` which prevents malformed JSON at the source
- Additionally: Promise.race timeout enforcement (old AbortController approach was completely non-functional)

---
Task ID: 2
Agent: Main
Task: Implement real fix and run test matrix

Work Log:
- Modified ai-orchestrator.ts: added responseFormat option, fixed broken timeout (Promise.race), added maxRetries option
- Rewrote route.ts: JSON mode, 45s per-call timeout, single attempt, time budget, simplified prompt
- Reduced system prompt: 4-5 products (was 5-7), 5 sections (was 6-8), shorter descriptions
- Verified via Agent Browser: both short and medium prompts generate stores successfully, no console errors
- Ran 15-prompt test matrix (5 short + 5 medium + 5 long)

Stage Summary:
- Test Matrix Results:
  - SHORT (3-5 words): 5/5 PASS (25.8s – 38.5s)
  - MEDIUM (1-2 sentences): 5/5 PASS (25.4s – 40.6s)
  - LONG (multi-sentence): 3/5 PASS, 2/5 FALLBACK (37.0s – 45.0s)
  - Overall: 13/15 PASS (86.7%), 2/15 FALLBACK (13.3%), 0/15 FAIL (0%)
  - ALL 15 returned HTTP 200 (zero 502 errors)
- Key improvement: 0% JSON malformation (was ~50%), 0% 502 errors, max time 45s (was 60-126s)

---
Task ID: 3
Agent: Main
Task: Fix 3 issues reported by user (fallback name, chat failure, sections scroll)

Work Log:
- Issue 1: extractStoreName() correctly extracts brand names. Verified with exact user prompt
- Issue 2: Found THREE root causes for chat failure:
  a) Turbopack parses arrow functions (=>) inside template literals as JSX
  b) executeAI timeout never cleaned up (unhandled promise rejection)
  c) Chat API didn't use json_object mode
- Fixed all three root causes
- Issue 3: Added overflow-hidden to VisualEditor root div

Stage Summary:
- All 3 issues fixed and verified via Agent Browser
- Store generation: 200, no errors, renders correctly
- Chat: applied successfully in ~1.6s
- Sections panel: overflow-hidden enables ScrollArea

---
Task ID: 1
Agent: Main
Task: Implement Schema Normalization Layer for store generation

Work Log:
- Confirmed ZhipuAI/GLM does NOT support json_schema structured output
- Built /src/lib/normalize-store.ts: deterministic type coercion layer (645 lines)
- Rewrote route.ts to use normalizeStore() instead of isValidStore()
- Ran 10-call test matrix: 9 AI success + 1 timeout fallback = 0 HTTP errors

Stage Summary:
- Schema Normalization Layer complete
- 9/9 AI success, 0 502s, 0 schema failures
- Confirmed single-model constraint (ZhipuAI/GLM only)

---
Task ID: 1
Agent: Main
Task: Reduce AI output size to bring generation under proxy timeout (~30s)

Work Log:
- Quantified reductions: products 4-5→3, variants removed, sections 5→4, testimonials 2→1, descriptions max 8 words
- Updated SYSTEM_PROMPT: compact format, only 4 section types, no variants in product schema
- Updated createFallbackStore(): 3 products (no variants), 4 sections, 1 testimonial
- Updated normalize-store.ts: ensureFeatured min 1 (was 2), featured-first productIds
- Ran 15-request long-prompt batch test

Stage Summary:
- 15/15 AI success (100%), 0 fallbacks, 0 failures
- Latency: min=18.5s, p50=21.0s, max=24.3s
- Output: ~2900 chars (was ~4200-5000)
- Baseline commit: lock-protocol-baseline (2b59480)

---
Task ID: 2-a
Agent: Main
Task: Fix Properties panel scroll (Issue 1)

Work Log:
- Audit found only 1 panel with missing scroll: Properties Panel
- Sections panel was already fixed in prior session
- Chat panel uses overflow-hidden approach (works)
- Root cause: same as Sections panel — missing min-h-0 at 3 levels in flex chain
- Added min-h-0 to: PropertiesPanel root div (line 624), ScrollArea (line 640), wrapper div (line 985)

Stage Summary:
- Commit: f1cc4e9
- No locked features touched

---
Task ID: 2-b
Agent: Main
Task: Fix chat edit destructive operations (Issue 2 — critical)

Work Log:
- Root cause analysis: 3 compounding problems:
  1. System prompt only showed section IDs/types (no content) — AI had no context of current values
  2. No enforcement of "only include changed fields" — AI returned full content objects with hallucinations
  3. No server-side validation — destructive operations passed through unchecked
- Rewrote /src/app/api/store/chat/route.ts with 3-layer defense:
  1. System prompt now includes FULL section content + CRITICAL SAFETY RULES with wrong/right examples + color hex guidance
  2. Server-side no-op filter: compares each field against current store, strips fields matching existing values, drops empty operations
  3. Detailed summary: shows specific fields changed (e.g. "Updated section: style.backgroundColor")
- Verified via Agent Browser: Properties panel opens, all fields visible, min-h-0 confirmed in DOM
- API tests (3 scenarios):
  - "make the hero background neon green" → only style.backgroundColor, no content fields (PASS)
  - "Hero section ka colour neon kar do" (Hindi) → only style.backgroundColor, headline/subheadline/ctaText untouched (PASS)
  - "change the CTA button text to Buy Now" → only ctaText, no other content fields (PASS)

Stage Summary:
- Commit: 0a9e24a
- The exact user scenario (Hindi color request) now works correctly
- No locked features touched (publish flow confirmed untouched)
- No-op filter provides defense-in-depth even if AI misbehaves
