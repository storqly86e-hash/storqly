// ============================================================
// Generation Failure Modes Audit
// ============================================================
// Audits src/app/api/store/generate/route.ts for all known
// AI generation failure modes. For each mode, documents:
//   - Whether it is handled (YES / NO / PARTIAL)
//   - The handling mechanism
//   - Whether it logs internally, sends a safe user message,
//     and avoids leaking stack traces
//
// Run: bun run src/lib/design-library/__tests__/failure-modes-audit.ts

// ── Audit data ─────────────────────────────────────────────

type HandlingStatus = 'YES' | 'NO' | 'PARTIAL'

interface FailureMode {
  mode: string
  status: HandlingStatus
  mechanism: string
  hasInternalLog: boolean
  hasSafeUserMessage: boolean
  noStackLeak: boolean
  notes: string
  lineRef?: string
}

const FAILURE_MODES: FailureMode[] = [
  // ── 1. Timeout ──────────────────────────────────────────
  {
    mode: 'timeout (pre-AI call)',
    status: 'YES',
    mechanism: 'Checks elapsed() > TOTAL_TIME_BUDGET_MS before AI call. Sends SSE error event and returns early.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~551-555: warn() log + send("error", { message: "Generation timed out before AI could respond..." }). User message is generic, no stack trace.',
    lineRef: '551-555',
  },
  {
    mode: 'timeout (Phase 2 batch remaining)',
    status: 'YES',
    mechanism: 'Per-batch time budget check: if remaining() < MIN_REMAINING_MS (20s), skips remaining batches. Logs warning.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~675-678: warn() log. No explicit user error sent — proceeds with whatever products were generated. This is acceptable since Phase 2 is additive.',
    lineRef: '675-678',
  },
  {
    mode: 'timeout (executeAI internal)',
    status: 'YES',
    mechanism: 'executeAI has timeout param (90s Phase 1, 45s Phase 2). On timeout, returns { success: false, error: "..." }. Route checks !phase1Result.success.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~598-604: Phase 1 failure sends providerErrors (may include provider names but not stack traces). Phase 2 at ~698-700 logs warning and breaks.',
    lineRef: '598-604, 698-700',
  },

  // ── 2. Provider failure ────────────────────────────────
  {
    mode: 'provider failure (all providers exhausted)',
    status: 'YES',
    mechanism: 'executeAI returns { success: false, error, providerErrors }. Route sends SSE error with provider error list.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~598-604: logErr() logs the error + attempts. Sends error event with providerErrors array. Provider errors contain provider name + error message (not stack traces).',
    lineRef: '598-604',
  },
  {
    mode: 'provider failure (Phase 2 batch)',
    status: 'YES',
    mechanism: 'Phase 2 batch failure: logs warning, breaks the batch loop. Continues with already-generated products.',
    hasInternalLog: true,
    hasSafeUserMessage: false,
    noStackLeak: true,
    notes: 'Line ~698-700: warn() log. No explicit SSE error sent to user — user still gets a valid store with Phase 1 products. Acceptable degradation.',
    lineRef: '698-700',
  },

  // ── 3. Malformed JSON ──────────────────────────────────
  {
    mode: 'malformed JSON (Phase 1)',
    status: 'YES',
    mechanism: 'JSON.parse inside try/catch. On failure, sends SSE error with generic message.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~612-618: logErr() logs the error object (includes parse error details for debugging). User message: "AI returned invalid data. Please try again." — safe, no stack trace.',
    lineRef: '612-618',
  },
  {
    mode: 'malformed JSON (Phase 2 batch)',
    status: 'YES',
    mechanism: 'JSON.parse inside try/catch for each batch. On failure, logs warning and breaks batch loop.',
    hasInternalLog: true,
    hasSafeUserMessage: false,
    noStackLeak: true,
    notes: 'Line ~704-708: warn() log. No SSE error sent — acceptable since Phase 2 is additive and store is still valid.',
    lineRef: '704-708',
  },

  // ── 4. Partial AI output ───────────────────────────────
  {
    mode: 'partial AI output (normalization null)',
    status: 'YES',
    mechanism: 'normalizeStore returns null if it cannot process the parsed JSON into a valid Store. Route checks for null and sends error.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~621-627: warn() log. User message: "AI response could not be processed into a valid store. Please try again." — safe, no internal details.',
    lineRef: '621-627',
  },
  {
    mode: 'partial AI output (0 valid products in Phase 2 batch)',
    status: 'YES',
    mechanism: 'normalizeProducts returns empty array. Route checks for 0 products and breaks batch loop.',
    hasInternalLog: true,
    hasSafeUserMessage: false,
    noStackLeak: true,
    notes: 'Line ~726-729: warn() log. Store still valid with Phase 1 products. No SSE error needed.',
    lineRef: '726-729',
  },

  // ── 5. Invalid componentMeta ───────────────────────────
  {
    mode: 'invalid componentMeta',
    status: 'YES',
    mechanism: 'validateAndFixComponentMeta is called with library context. It validates IDs, finds replacements, or strips invalid meta. Never throws.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~644-653: Logs validation results (valid/fixed/attached counts + error details). Auto-fixes invalid IDs or strips them. Store always proceeds with valid or no meta. User gets valid store.',
    lineRef: '644-653',
  },

  // ── 6. Invalid style fields ────────────────────────────
  {
    mode: 'invalid style fields',
    status: 'PARTIAL',
    mechanism: 'bridgeSectionStyles transforms AI style tokens to renderer-consumable fields. Style bridge has ALLOWED_FIELDS whitelist + sanitizeValue. If it throws, caught by outer catch.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~641: bridgeSectionStyles called without try/catch of its own. If it throws, caught by the outer catch at line ~797-800. Style bridge itself has whitelist (ALLOWED_FIELDS) and sanitizeValue (CSS injection regex). No dedicated error path for style-specific failures — relies on generic catch.',
    lineRef: '641, 797-800',
  },

  // ── 7. Invalid CSS values ──────────────────────────────
  {
    mode: 'invalid CSS values',
    status: 'PARTIAL',
    mechanism: 'Style bridge sanitizeValue strips dangerous patterns (url(), expression(), -moz-binding). Invalid but safe values (e.g., "asdf") pass through to CSS vars — they just do nothing visually.',
    hasInternalLog: false,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'No explicit check for invalid CSS values in the generate route. The style bridge sanitizes for SECURITY (injection) not VALIDITY (bad values). Invalid CSS values are visually benign — they just render as defaults. Not a failure mode per se, but no dedicated logging.',
    lineRef: 'style-bridge.ts',
  },

  // ── 8. Missing sections ────────────────────────────────
  {
    mode: 'missing sections (empty store)',
    status: 'PARTIAL',
    mechanism: 'normalizeStore fills defaults for missing pages/sections. Quality guardrails check section count. If FAIL, auto-repair attempts to add sections.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'normalizeStore (line ~11): "Never throws — always returns a valid Store". If AI returns empty sections, normalization adds defaults. Quality guardrails (line ~769) score section count. If FAIL, auto-repair (line ~775) adds missing sections. No explicit user-facing error for empty stores — they get auto-repaired.',
    lineRef: '769-784',
  },

  // ── 9. Duplicate sections ──────────────────────────────
  {
    mode: 'duplicate sections',
    status: 'PARTIAL',
    mechanism: 'Quality guardrails include visual variety scoring. Low variety (e.g., all identical sections) reduces score but does not fail on its own.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Quality guardrails scoreVisualVariety checks for repeated section types. Deduplication is not explicitly enforced — if all sections are the same type, it gets a low score. Auto-repair may replace duplicate sections if overall quality FAILs. No explicit deduplication step.',
    lineRef: '769-784',
  },

  // ── 10. Empty content ──────────────────────────────────
  {
    mode: 'empty content (sections with no text)',
    status: 'PARTIAL',
    mechanism: 'Quality guardrails check brand specificity (penalizes generic/empty content). Auto-repair fills empty content if triggered.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Quality guardrails scoreBrandSpecificity checks content fields for emptiness/genericity. If overall quality FAILs, auto-repair attempts content filling. If auto-repair fails (best effort), store still proceeds to user with whatever content exists. Acceptable since empty sections are visually benign.',
    lineRef: '769-784',
  },

  // ── 11. Missing product data ───────────────────────────
  {
    mode: 'missing product data (invalid productIds in sections)',
    status: 'YES',
    mechanism: 'Post-generation product reference fixup: validates all productIds in featured-products sections against actual products, fills missing references.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~750-765: Iterates all featured-products sections, filters valid productIds, fills gaps with unlinked products. This is a silent repair — no error sent to user because it is a known normalization, not a failure. Log at line ~788 reports final product count.',
    lineRef: '750-765',
  },
  {
    mode: 'missing product data (0 products from AI)',
    status: 'PARTIAL',
    mechanism: 'normalizeProducts handles empty/malformed product arrays. Returns empty array if no valid products can be extracted.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'If AI returns 0 valid products, the store still generates with 0 products. Quality guardrails scoreCommerceEffectiveness penalizes missing products. Auto-repair may add placeholder products. No explicit check prevents shipping a 0-product store.',
    lineRef: '726-729, 769-784',
  },

  // ── 12. Database save failure ───────────────────────────
  {
    mode: 'database save failure',
    status: 'NO',
    mechanism: 'The generate route does NOT save to the database. It streams the store via SSE event "result". The client calls /api/store/save separately to persist.',
    hasInternalLog: false,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'DB persistence is handled by /api/store/save/route.ts (separate route). The generate route is a pure generation+streaming endpoint. If the client fails to save, that is a client-side concern. The save route has its own error handling (auth, validation, DB errors).',
    lineRef: 'N/A (separate route)',
  },

  // ── Bonus: Additional failure modes found during audit ──
  {
    mode: 'auth failure',
    status: 'YES',
    mechanism: 'requireAuth() called before stream is created. AuthError returns 401 JSON response.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~480-485: Caught before SSE stream is created. Returns standard 401 via authErrorResponse(). No stack trace leaked.',
    lineRef: '480-485',
  },
  {
    mode: 'invalid request body (malformed JSON)',
    status: 'YES',
    mechanism: 'req.json() in try/catch. Returns 400 JSON response.',
    hasInternalLog: false,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~488-496: Returns { error: "Invalid request body." } with 400 status. No internal logging (acceptable for client-level parse errors). No stack trace.',
    lineRef: '488-496',
  },
  {
    mode: 'empty/missing prompt',
    status: 'YES',
    mechanism: 'Checks prompt exists, is a string, and is non-empty. Sends SSE error event.',
    hasInternalLog: false,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~524-527: Sends { message: "A prompt is required." } via SSE. No logging needed — this is a client validation error.',
    lineRef: '524-527',
  },
  {
    mode: 'library composition failure',
    status: 'YES',
    mechanism: 'composeStore failure is caught and treated as non-fatal. Falls back to legacy (non-library) generation.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~569-578: try/catch around ensureLibraryRegistered + composeStore. warn() log. Falls back to system prompt without library context. User still gets a valid store.',
    lineRef: '569-578',
  },
  {
    mode: 'genericity rejection',
    status: 'YES',
    mechanism: 'detectGenericity runs after generation. If REJECT, auto-repair is attempted. If repair is best-effort, store still proceeds.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~770-784: Quality + genericity scored together. If REJECT, auto-repair attempts (line ~775). Logs quality/genericity scores. Auto-repair result logged. If repair is BEST_EFFORT, store still sent to user.',
    lineRef: '770-784',
  },
  {
    mode: 'unexpected/unhandled error',
    status: 'YES',
    mechanism: 'Outer try/catch around entire stream body. Catches any unanticipated error and sends safe SSE error.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~797-804: catch block logs error message (NOT stack trace — uses err.message only). Sends: { message: "An unexpected error occurred: <truncated message>. Please try again." }. Message truncated to 120 chars.',
    lineRef: '797-804',
  },
  {
    mode: 'SSE stream send failure',
    status: 'YES',
    mechanism: 'send() function wrapped in try/catch. Logs failure once (deduped via sendFailed flag).',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~503-511: If controller.enqueue fails (stream closed by client), logs once and stops attempting. No stack trace leaked. Graceful degradation.',
    lineRef: '503-511',
  },
  {
    mode: 'quality guardrails error',
    status: 'YES',
    mechanism: 'Quality + genericity check wrapped in try/catch. Errors are non-fatal — store proceeds without quality scoring.',
    hasInternalLog: true,
    hasSafeUserMessage: true,
    noStackLeak: true,
    notes: 'Line ~782-784: catch (guardErr) logs warning with error message. Store generation continues. User gets store without quality validation (acceptable since guardrails are a quality check, not a gate).',
    lineRef: '782-784',
  },
]

// ── Report runner ──────────────────────────────────────────

async function runAudit(): Promise<void> {
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════════════')
  console.log('  GENERATION FAILURE MODES AUDIT')
  console.log('  Route: src/app/api/store/generate/route.ts')
  console.log('═══════════════════════════════════════════════════════════════════════════')
  console.log('')

  const required = ['timeout', 'provider failure', 'malformed JSON', 'partial AI output',
    'invalid componentMeta', 'invalid style fields', 'invalid CSS values', 'missing sections',
    'duplicate sections', 'empty content', 'missing product data', 'database save failure']

  const colMode = 42
  const colStatus = 8
  const colLog = 6
  const colUser = 6
  const colStack = 6

  function pad(s: string, w: number): string {
    if (s.length >= w) return s.slice(0, w)
    return s + ' '.repeat(w - s.length)
  }

  // Header
  const header = '┌' + '─'.repeat(colMode) + '┬' + '─'.repeat(colStatus) + '┬' + '─'.repeat(colLog) + '┬' + '─'.repeat(colUser) + '┬' + '─'.repeat(colStack) + '┐'
  const sep    = '├' + '─'.repeat(colMode) + '┼' + '─'.repeat(colStatus) + '┼' + '─'.repeat(colLog) + '┼' + '─'.repeat(colUser) + '┼' + '─'.repeat(colStack) + '┤'
  const footer = '└' + '─'.repeat(colMode) + '┴' + '─'.repeat(colStatus) + '┴' + '─'.repeat(colLog) + '┴' + '─'.repeat(colUser) + '┴' + '─'.repeat(colStack) + '┘'

  console.log(header)
  console.log(
    '│' + pad('Failure Mode', colMode) +
    '│' + pad('Handled', colStatus) +
    '│' + pad('Log', colLog) +
    '│' + pad('User', colUser) +
    '│' + pad('NoLeak', colStack) + '│'
  )
  console.log(sep)

  let yesCount = 0
  let partialCount = 0
  let noCount = 0

  for (const fm of FAILURE_MODES) {
    const logIcon = fm.hasInternalLog ? '✅' : '⚠️'
    const userIcon = fm.hasSafeUserMessage ? '✅' : '⚠️'
    const stackIcon = fm.noStackLeak ? '✅' : '❌'

    if (fm.status === 'YES') yesCount++
    else if (fm.status === 'PARTIAL') partialCount++
    else noCount++

    console.log(
      '│' + pad(fm.mode, colMode) +
      '│' + pad(`[${fm.status}]`, colStatus) +
      '│' + pad(logIcon, colLog) +
      '│' + pad(userIcon, colUser) +
      '│' + pad(stackIcon, colStack) + '│'
    )
  }

  console.log(footer)
  console.log('')

  // Check all required modes are covered
  console.log('── Coverage Check ─────────────────────────────────────────────────────────')
  console.log('')
  const coveredModes = FAILURE_MODES.map(f => f.mode.toLowerCase())
  let allCovered = true
  for (const req of required) {
    const found = FAILURE_MODES.some(f => f.mode.toLowerCase().includes(req.toLowerCase()))
    const icon = found ? '✅' : '❌'
    if (!found) allCovered = false
    console.log(`  ${icon} ${req}`)
  }
  console.log('')

  // Summary
  console.log('── Summary ─────────────────────────────────────────────────────────────────')
  console.log('')
  console.log(`  Total failure modes audited: ${FAILURE_MODES.length}`)
  console.log(`  Fully handled (YES):          ${yesCount}`)
  console.log(`  Partially handled (PARTIAL):  ${partialCount}`)
  console.log(`  Not handled (NO):             ${noCount}`)
  console.log(`  All required modes covered:   ${allCovered ? 'YES' : 'NO'}`)
  console.log('')

  // Detail notes for PARTIAL/NO modes
  const needsAttention = FAILURE_MODES.filter(f => f.status !== 'YES')
  if (needsAttention.length > 0) {
    console.log('── Modes Needing Attention ─────────────────────────────────────────────────')
    console.log('')
    for (const fm of needsAttention) {
      console.log(`  [${fm.status}] ${fm.mode}`)
      console.log(`  Notes: ${fm.notes}`)
      console.log(`  Line ref: ${fm.lineRef ?? 'N/A'}`)
      console.log('')
    }
  }

  // Verdict
  console.log('═══════════════════════════════════════════════════════════════════════════')
  const verdict = noCount === 0
    ? (partialCount <= 3 ? 'GOOD — all critical modes handled, minor gaps in non-critical areas'
                         : 'ACCEPTABLE — all critical modes handled, several partial gaps')
    : 'NEEDS ATTENTION — unhandled failure modes exist'
  console.log(`  VERDICT: ${verdict}`)
  console.log('═══════════════════════════════════════════════════════════════════════════')
  console.log('')
}

runAudit().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
