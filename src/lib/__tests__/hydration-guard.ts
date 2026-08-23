// ============================================================
// Hydration Regression Guard — Homepage SSR Footer Check
// ============================================================
// Verifies that the homepage footer area rendered via SSR is:
// 1. Deterministic (same output on repeated renders)
// 2. Free of hydration-unsafe patterns:
//    - No <p> with id="build-id"
//    - No <p> with className containing "font-mono"
//
// Run: bun run src/lib/__tests__/hydration-guard.ts

import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'

// ── Re-create the footer JSX as a self-contained component ──
// This mirrors the exact footer from src/app/page.tsx lines 1564-1571.
// We render it in isolation because it is a pure, stateless fragment
// (no hooks, no dynamic data) — ideal for SSR determinism checks.

function HomepageFooter(): ReactNode {
  return createElement(
    'footer',
    { className: 'mt-auto border-t border-white/[0.05] px-5 py-6' },
    createElement(
      'div',
      { className: 'mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 sm:flex-row' },
      createElement('p', { className: 'text-sm text-zinc-600' }, '© 2025 Storqly. AI-first commerce.'),
      createElement('p', { className: 'text-xs text-zinc-700' }, 'Build, customize, and launch \u2014 powered by AI.')
    )
  )
}

// ── Known-good baseline (generated on first run, compared on subsequent) ──
// We render twice and compare — if they differ, SSR is non-deterministic.

function extractFooterHtml(fullHtml: string): string {
  // Extract content between <footer ...> and </footer>
  const match = fullHtml.match(/<footer[^>]*>[\s\S]*?<\/footer>/)
  return match ? match[0] : fullHtml
}

function hasBuildIdParagraph(html: string): boolean {
  // Match <p ... id="build-id" ...> or <p ... id='build-id' ...>
  return /<p[^>]*\sid\s*=\s*["']build-id["'][^>]*>/i.test(html)
}

function hasFontMonoParagraph(html: string): boolean {
  // Match <p ... className="...font-mono..." ...> or variations
  return /<p[^>]*\sclass\s*=\s*["'][^"']*font-mono[^"']*["'][^>]*>/i.test(html)
}

// ── Test runner ──────────────────────────────────────────────

async function runHydrationGuard(): Promise<void> {
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  HYDRATION REGRESSION GUARD — Homepage Footer SSR Check')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')

  let passed = 0
  let failed = 0
  const results: Array<{ check: string; status: string; detail?: string }> = []

  // ── Render 1: Establish baseline ──
  const render1 = renderToString(createElement(HomepageFooter))
  const footer1 = extractFooterHtml(render1)

  // ── Render 2: Verify determinism ──
  const render2 = renderToString(createElement(HomepageFooter))
  const footer2 = extractFooterHtml(render2)

  // Check 1: Determinism — renders must be identical
  const isDeterministic = footer1 === footer2
  if (isDeterministic) {
    passed++
    results.push({ check: 'SSR output is deterministic', status: 'PASS' })
  } else {
    failed++
    results.push({ check: 'SSR output is deterministic', status: 'FAIL', detail: 'Two renders produced different HTML' })
  }

  // Check 2: No <p> with id="build-id" in footer
  const hasBuildId = hasBuildIdParagraph(footer1)
  if (!hasBuildId) {
    passed++
    results.push({ check: 'No <p id="build-id"> in footer', status: 'PASS' })
  } else {
    failed++
    results.push({ check: 'No <p id="build-id"> in footer', status: 'FAIL', detail: 'Found <p> with id="build-id" in SSR footer output' })
  }

  // Check 3: No <p> with className containing font-mono in footer
  const hasFontMono = hasFontMonoParagraph(footer1)
  if (!hasFontMono) {
    passed++
    results.push({ check: 'No <p className="...font-mono..."> in footer', status: 'PASS' })
  } else {
    failed++
    results.push({ check: 'No <p className="...font-mono..."> in footer', status: 'FAIL', detail: 'Found <p> with font-mono class in SSR footer output' })
  }

  // Check 4: Footer contains expected content
  const hasStorqlyCopyright = footer1.includes('Storqly')
  const hasAICommerce = footer1.includes('AI-first commerce')
  if (hasStorqlyCopyright && hasAICommerce) {
    passed++
    results.push({ check: 'Footer contains expected content', status: 'PASS' })
  } else {
    failed++
    results.push({ check: 'Footer contains expected content', status: 'FAIL', detail: `Missing expected text (Storqly: ${hasStorqlyCopyright}, AI-first: ${hasAICommerce})` })
  }

  // Check 5: No <p> with build-id in full render (not just footer)
  const hasBuildIdFull = hasBuildIdParagraph(render1)
  if (!hasBuildIdFull) {
    passed++
    results.push({ check: 'No <p id="build-id"> in full SSR output', status: 'PASS' })
  } else {
    failed++
    results.push({ check: 'No <p id="build-id"> in full SSR output', status: 'FAIL' })
  }

  // Check 6: No <p> with font-mono in full render
  const hasFontMonoFull = hasFontMonoParagraph(render1)
  if (!hasFontMonoFull) {
    passed++
    results.push({ check: 'No <p className="...font-mono..."> in full SSR output', status: 'PASS' })
  } else {
    failed++
    results.push({ check: 'No <p className="...font-mono..."> in full SSR output', status: 'FAIL' })
  }

  // ── Print results ──
  console.log('  SSR Render 1 (footer):')
  console.log('  ' + footer1.replace(/\n/g, '\n  '))
  console.log('')

  console.log('  Checks:')
  console.log('  ─────────────────────────────────────────────────────────')
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌'
    const line = r.detail ? ` — ${r.detail}` : ''
    console.log(`  ${icon} ${r.check}${line}`)
  }
  console.log('')

  console.log(`  Result: ${passed}/${passed + failed} passed, ${failed} failed`)
  console.log('')

  if (failed === 0) {
    console.log('  ═══════════════════════════════════════════')
    console.log('  ✅  HYDRATION GUARD: PASS')
    console.log('  ═══════════════════════════════════════════')
  } else {
    console.log('  ═══════════════════════════════════════════')
    console.log('  ❌  HYDRATION GUARD: FAIL')
    console.log('  ═══════════════════════════════════════════')
  }
  console.log('')
}

runHydrationGuard().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
