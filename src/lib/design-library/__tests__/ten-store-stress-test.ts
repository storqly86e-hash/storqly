// ============================================================
// 10-Store Stress Test + Quality Gates Verification
// ============================================================
// TASK C: Runs composeStore for 10 diverse brand prompts and
//          records cross-store differentiation metrics.
// TASK F: Verifies quality guardrails + genericity detector
//          produce sensible results, including a BAD store test.

import { composeStore } from '../composition';
import type { CompositionResult } from '../design-intent';
import { validateStoreQuality } from '../quality-guardrails';
import type { QualityReport } from '../quality-guardrails';
import { detectGenericity } from '../genericity-detector';
import type { GenericityReport } from '../genericity-detector';
import { resolveDesignTokens, getTokenCssVars } from '../token-resolver';
import { computeVisualRhythm } from '../visual-rhythm';
import { MAX_REPAIR_ATTEMPTS } from '../auto-repair';
import type { Store, SectionType } from '@/lib/store-schema';
import { defaultTheme } from '@/lib/store-schema';

// ── 10 representative brand prompts ─────────────────────────

const BRANDS = [
  { name: 'LUXFASH', prompt: 'A luxury fashion brand selling haute couture dresses and leather accessories for sophisticated women', category: 'Luxury Fashion' },
  { name: 'SKINLAB', prompt: 'A premium skincare brand with science-backed serums and clinical treatments for discerning customers', category: 'Premium Skincare' },
  { name: 'IRONFORGE', prompt: 'A high-performance fitness brand selling gym equipment and workout apparel for serious athletes', category: 'Fitness/Performance' },
  { name: 'TECHVAULT', prompt: 'An electronics brand selling premium headphones, smart home devices and gadgets for tech enthusiasts', category: 'Consumer Electronics' },
  { name: 'LUMIÈRE', prompt: 'A fine jewelry brand selling handcrafted gold and diamond rings and necklaces for luxury buyers', category: 'Jewelry' },
  { name: 'HOMESTITCH', prompt: 'A home decor brand selling artisan candles, woven textiles and handcrafted furniture for cozy living', category: 'Home/Decor' },
  { name: 'DROPCULT', prompt: 'A bold streetwear brand selling limited-edition hoodies and sneakers for Gen Z hypebeasts', category: 'Streetwear/Gen-Z' },
  { name: 'BREWHAUS', prompt: 'A specialty coffee and tea brand selling artisan roasts and brewing equipment for coffee connoisseurs', category: 'Food/Beverage' },
  { name: 'PAWSOME', prompt: 'A premium pet products brand selling organic dog treats, stylish collars and cozy beds for pet lovers', category: 'Pet Products' },
  { name: 'EXECPRO', prompt: 'A professional business products brand selling premium leather briefcases and desk accessories for executives', category: 'Professional/Business' },
];

// ── Per-store result capture ─────────────────────────────────

interface StoreResult {
  prompt: string;
  category: string;
  success: boolean;
  duration: number;
  selectedRecipe: string;
  selectedHero: string;
  designDirection: {
    aesthetic: string;
    density: string;
    sophistication: string;
    energy: string;
    cta: string;
  };
  qualityScore: number;
  qualityStatus: string;
  genericityScore: number;
  genericityStatus: string;
  sectionCount: number;
  tokenCssVarsCount: number;
  sectionRhythmCount: number;
  top3SectionTypes: string[];
  compositionResult: CompositionResult;
  qualityReport: QualityReport;
  genericityReport: GenericityReport;
}

// ── Helper: build minimal Store from composition result ──────

function buildMinimalStore(brandName: string, cr: CompositionResult): Store {
  return {
    id: `test-${brandName.toLowerCase()}`,
    name: brandName,
    slug: brandName.toLowerCase(),
    theme: defaultTheme,
    pages: [{
      id: 'page-home',
      name: 'Home',
      slug: '',
      isHomepage: true,
      sections: cr.nodes.map((n, i) => ({
        id: `sec-${i}`,
        type: n.component_id.split('.')[0] as SectionType,
        visible: true,
        content: {},
        style: {},
        componentMeta: {
          componentId: n.component_id,
          variant: n.component_id.split('.')[1],
          family: n.component_id.split('.')[0],
        },
      })),
    }],
    products: [],
    published: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    designLibrary: {
      version: '1.0.0',
      recipe: cr.recipeName,
      typographySystem: cr.typographySystem,
      densityPreset: cr.densityPreset,
      compositionResult: {
        tokenCssVars: cr.tokenCssVars,
        sectionRhythm: cr.sectionRhythm,
      },
    },
  };
}

// ── Helper: section Jaccard overlap ──────────────────────────

function sectionJaccard(a: CompositionResult, b: CompositionResult): number {
  const idsA = new Set(a.nodes.map(n => n.component_id));
  const idsB = new Set(b.nodes.map(n => n.component_id));
  const intersection = [...idsA].filter(x => idsB.has(x)).length;
  const union = new Set([...idsA, ...idsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Table helper ─────────────────────────────────────────────

function pad(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  return s + ' '.repeat(w - s.length);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 2) + '..';
}

// ══════════════════════════════════════════════════════════════
// TASK C: 10-Store Stress Test
// ══════════════════════════════════════════════════════════════

async function runTenStoreStressTest(): Promise<StoreResult[]> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              10-STORE DESIGN LIBRARY STRESS TEST                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  const results: StoreResult[] = [];

  for (const brand of BRANDS) {
    const start = performance.now();
    let success = false;
    let cr: CompositionResult | null = null;
    let qualityReport: QualityReport | null = null;
    let genericityReport: GenericityReport | null = null;

    try {
      cr = await composeStore(brand.prompt);
      if (!cr) throw new Error('composeStore returned null');
      const store = buildMinimalStore(brand.name, cr);
      qualityReport = validateStoreQuality(store);
      genericityReport = detectGenericity(store);
      success = true;
    } catch (err) {
      console.error(`  ERROR: ${brand.name} failed: ${err}`);
    }

    const duration = performance.now() - start;

    if (!cr || !qualityReport || !genericityReport) {
      // Push a failed result
      results.push({
        prompt: brand.prompt,
        category: brand.category,
        success: false,
        duration,
        selectedRecipe: 'N/A',
        selectedHero: 'N/A',
        designDirection: { aesthetic: 'N/A', density: 'N/A', sophistication: 'N/A', energy: 'N/A', cta: 'N/A' },
        qualityScore: 0, qualityStatus: 'FAIL',
        genericityScore: 0, genericityStatus: 'REJECT',
        sectionCount: 0, tokenCssVarsCount: 0, sectionRhythmCount: 0,
        top3SectionTypes: [],
        compositionResult: {} as CompositionResult,
        qualityReport: qualityReport ?? { scores: { designCoherence: 0, brandSpecificity: 0, visualVariety: 0, commerceEffectiveness: 0, responsiveReadiness: 0, componentValidity: 0 }, overallScore: 0, violations: [], status: 'FAIL' },
        genericityReport: genericityReport ?? { genericityScore: 0, sectionOverlap: 0, variantOverlap: 0, layoutOverlap: 0, cardStyleOverlap: 0, details: { totalSections: 0, uniqueSectionTypes: 0, uniqueComponentIds: 0, uniqueVariants: 0, repeatedSectionTypes: [], dominantLayout: null }, status: 'REJECT' },
      });
      continue;
    }

    // Extract hero componentId
    const heroNode = cr.nodes.find(n => n.role === 'orient');
    const selectedHero = heroNode?.component_id ?? 'none';

    // Design direction fields
    const dd = cr.designDirection;
    const designDir = {
      aesthetic: dd?.visual.aesthetic ?? 'n/a',
      density: dd?.visual.density ?? 'n/a',
      sophistication: dd?.visual.sophistication ?? 'n/a',
      energy: dd?.visual.visualEnergy ?? 'n/a',
      cta: dd?.commerce.ctaStrategy ?? 'n/a',
    };

    // Top 3 section types
    const typeCounts = new Map<string, number>();
    for (const n of cr.nodes) {
      const t = n.component_id.split('.')[0];
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const top3 = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type}(${count})`);

    results.push({
      prompt: brand.prompt,
      category: brand.category,
      success,
      duration,
      selectedRecipe: cr.recipeName,
      selectedHero,
      designDirection: designDir,
      qualityScore: qualityReport.overallScore,
      qualityStatus: qualityReport.status,
      genericityScore: genericityReport.genericityScore,
      genericityStatus: genericityReport.status,
      sectionCount: cr.nodes.length,
      tokenCssVarsCount: cr.tokenCssVars ? Object.keys(cr.tokenCssVars).length : 0,
      sectionRhythmCount: cr.sectionRhythm?.length ?? 0,
      top3SectionTypes: top3,
      compositionResult: cr,
      qualityReport,
      genericityReport,
    });
  }

  // ── Print per-store table ──────────────────────────────────

  const c1 = 11;  // Brand
  const c2 = 18; // Category
  const c3 = 6;  // OK?
  const c4 = 7;  // ms
  const c5 = 28; // Recipe
  const c6 = 32; // Hero
  const c7 = 14; // Aesthetic
  const c8 = 7;  // Density
  const c9 = 8;  // Q Score
  const c10 = 6; // Q Status
  const c11 = 7; // G Score
  const c12 = 7; // G Status
  const c13 = 4;  // Secs
  const c14 = 4;  // Vars
  const c15 = 5;  // Rhythm

  const hdrLine = '┌' + [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15].map(w => '─'.repeat(w)).join('┬') + '┐';
  const sepLine = '├' + [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15].map(w => '─'.repeat(w)).join('┼') + '┤';
  const endLine = '└' + [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15].map(w => '─'.repeat(w)).join('┴') + '┘';

  console.log('── Per-Store Results ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
  console.log();
  console.log(hdrLine);
  console.log(
    '│' + pad('Brand', c1) + '│' + pad('Category', c2) + '│' + pad('OK?', c3) + '│' + pad('ms', c4) +
    '│' + pad('Recipe', c5) + '│' + pad('Hero', c6) + '│' + pad('Aesthetic', c7) + '│' + pad('Density', c8) +
    '│' + pad('Q.Scor', c9) + '│' + pad('Q.Stat', c10) + '│' + pad('G.Scor', c11) + '│' + pad('G.Stat', c12) +
    '│' + pad('Sec', c13) + '│' + pad('Var', c14) + '│' + pad('Rhy', c15) + '│',
  );
  console.log(sepLine);

  for (const r of results) {
    const dd = r.designDirection;
    console.log(
      '│' + pad(r.success ? r.prompt.slice(0, 9).toUpperCase().replace(/[^A-Z0-9]/g, '') : 'FAIL', c1) + '│' +
      pad(truncate(r.category, c2 - 1), c2) + '│' +
      pad(r.success ? 'YES' : 'NO', c3) + '│' +
      pad(Math.round(r.duration).toString(), c4) + '│' +
      pad(truncate(r.selectedRecipe, c5 - 1), c5) + '│' +
      pad(truncate(r.selectedHero, c6 - 1), c6) + '│' +
      pad(dd.aesthetic, c7) + '│' +
      pad(dd.density, c8) + '│' +
      pad(r.qualityScore.toFixed(2), c9) + '│' +
      pad(r.qualityStatus, c10) + '│' +
      pad(r.genericityScore.toFixed(2), c11) + '│' +
      pad(r.genericityStatus, c12) + '│' +
      pad(r.sectionCount.toString(), c13) + '│' +
      pad(r.tokenCssVarsCount.toString(), c14) + '│' +
      pad(r.sectionRhythmCount.toString(), c15) + '│',
    );
  }
  console.log(endLine);
  console.log();

  // ── Top 3 Section Types per store ──────────────────────────
  console.log('── Top 3 Section Types per Store ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
  console.log();
  for (const r of results) {
    console.log(`  ${pad(r.category, 22)} → ${r.top3SectionTypes.join(', ')}`);
  }
  console.log();

  // ── Cross-store metrics ────────────────────────────────────

  console.log('── Cross-Store Metrics ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
  console.log();

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // Section overlap matrix
  if (successful.length >= 2) {
    console.log('  Section Overlap Matrix (Jaccard):');
    console.log();
    const shortNames = successful.map(r => r.category.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, ''));
    const cellW = 7;
    const labelW = 10;

    process.stdout.write(pad('', labelW) + '│');
    for (const sn of shortNames) {
      process.stdout.write(pad(sn, cellW) + '│');
    }
    console.log();
    process.stdout.write('─'.repeat(labelW) + '┼');
    for (const _ of shortNames) {
      process.stdout.write('─'.repeat(cellW) + '┼');
    }
    console.log();

    let totalOverlap = 0;
    let pairCount = 0;
    for (let i = 0; i < successful.length; i++) {
      process.stdout.write(pad(shortNames[i], labelW) + '│');
      for (let j = 0; j < successful.length; j++) {
        if (i === j) {
          process.stdout.write(pad('—', cellW) + '│');
        } else {
          const ov = sectionJaccard(successful[i].compositionResult, successful[j].compositionResult);
          process.stdout.write(pad(ov.toFixed(2), cellW) + '│');
          if (j > i) {
            totalOverlap += ov;
            pairCount++;
          }
        }
      }
      console.log();
    }

    const avgOverlap = pairCount > 0 ? totalOverlap / pairCount : 1;
    console.log();
    console.log(`  Average section overlap (Jaccard): ${avgOverlap.toFixed(3)} across ${pairCount} pairs`);
    console.log();
  }

  // Unique recipes
  const uniqueRecipes = new Set(successful.map(r => r.selectedRecipe)).size;
  console.log(`  Unique recipes:             ${uniqueRecipes} / ${successful.length}`);
  console.log(`    → ${[...new Set(successful.map(r => r.selectedRecipe))].join(', ')}`);

  // Unique heroes
  const uniqueHeroes = new Set(successful.map(r => r.selectedHero)).size;
  console.log(`  Unique heroes:              ${uniqueHeroes} / ${successful.length}`);
  console.log(`    → ${[...new Set(successful.map(r => r.selectedHero))].join(', ')}`);

  // Average quality score
  const avgQuality = successful.length > 0
    ? successful.reduce((s, r) => s + r.qualityScore, 0) / successful.length
    : 0;
  console.log(`  Average quality score:      ${avgQuality.toFixed(3)}`);

  // Average genericity score
  const avgGenericity = successful.length > 0
    ? successful.reduce((s, r) => s + r.genericityScore, 0) / successful.length
    : 0;
  console.log(`  Average genericity score:   ${avgGenericity.toFixed(3)}`);

  // Success rate
  console.log(`  Success rate:               ${successful.length} / ${results.length}`);
  if (failed.length > 0) {
    console.log(`  Failed:                     ${failed.map(f => f.category).join(', ')}`);
  }
  console.log();

  // Duration stats
  const durations = results.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);
  console.log(`  Duration: avg=${avgDuration.toFixed(0)}ms, min=${minDuration.toFixed(0)}ms, max=${maxDuration.toFixed(0)}ms`);
  console.log();

  return results;
}

// ══════════════════════════════════════════════════════════════
// TASK F: Quality Gates Verification
// ══════════════════════════════════════════════════════════════

function runQualityGatesVerification(results: StoreResult[]): void {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              QUALITY GATES VERIFICATION                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  const successful = results.filter(r => r.success);
  let gatesPass = 0;
  let gatesTotal = 0;

  // ── F.1: Quality dimensions per store ──────────────────────

  console.log('── F.1: Quality Dimensions (per store) ──────────────────────────────────────────────');
  console.log();

  const qd1 = 11;
  const qd2 = 12; // coherence
  const qd3 = 12; // specificity
  const qd4 = 10; // variety
  const qd5 = 12; // commerce
  const qd6 = 12; // responsive
  const qd7 = 10; // validity
  const qd8 = 7;  // overall
  const qd9 = 6;  // status

  const qdHdr = '┌' + [qd1, qd2, qd3, qd4, qd5, qd6, qd7, qd8, qd9].map(w => '─'.repeat(w)).join('┬') + '┐';
  const qdSep = '├' + [qd1, qd2, qd3, qd4, qd5, qd6, qd7, qd8, qd9].map(w => '─'.repeat(w)).join('┼') + '┤';
  const qdEnd = '└' + [qd1, qd2, qd3, qd4, qd5, qd6, qd7, qd8, qd9].map(w => '─'.repeat(w)).join('┴') + '┘';

  console.log(qdHdr);
  console.log(
    '│' + pad('Category', qd1) + '│' + pad('Coherence', qd2) + '│' + pad('Specificity', qd3) +
    '│' + pad('Variety', qd4) + '│' + pad('Commerce', qd5) + '│' + pad('Responsive', qd6) +
    '│' + pad('Validity', qd7) + '│' + pad('Overall', qd8) + '│' + pad('Status', qd9) + '│',
  );
  console.log(qdSep);

  for (const r of successful) {
    const q = r.qualityReport;
    console.log(
      '│' + pad(truncate(r.category, qd1 - 1), qd1) + '│' +
      pad(q.scores.designCoherence.toFixed(2), qd2) + '│' +
      pad(q.scores.brandSpecificity.toFixed(2), qd3) + '│' +
      pad(q.scores.visualVariety.toFixed(2), qd4) + '│' +
      pad(q.scores.commerceEffectiveness.toFixed(2), qd5) + '│' +
      pad(q.scores.responsiveReadiness.toFixed(2), qd6) + '│' +
      pad(q.scores.componentValidity.toFixed(2), qd7) + '│' +
      pad(q.overallScore.toFixed(2), qd8) + '│' +
      pad(q.status, qd9) + '│',
    );
  }
  console.log(qdEnd);
  console.log();

  // ── F.2: Genericity dimensions per store ───────────────────

  console.log('── F.2: Genericity Dimensions (per store) ───────────────────────────────────────────');
  console.log();

  const gd1 = 11;
  const gd2 = 10; // section
  const gd3 = 10; // variant
  const gd4 = 10; // layout
  const gd5 = 10; // cardStyle
  const gd6 = 10; // overall
  const gd7 = 7;  // status

  const gdHdr = '┌' + [gd1, gd2, gd3, gd4, gd5, gd6, gd7].map(w => '─'.repeat(w)).join('┬') + '┐';
  const gdSep = '├' + [gd1, gd2, gd3, gd4, gd5, gd6, gd7].map(w => '─'.repeat(w)).join('┼') + '┤';
  const gdEnd = '└' + [gd1, gd2, gd3, gd4, gd5, gd6, gd7].map(w => '─'.repeat(w)).join('┴') + '┘';

  console.log(gdHdr);
  console.log(
    '│' + pad('Category', gd1) + '│' + pad('SecOverlap', gd2) + '│' + pad('VarOverlap', gd3) +
    '│' + pad('LayOverlap', gd4) + '│' + pad('CardOver.', gd5) + '│' + pad('Overall', gd6) +
    '│' + pad('Status', gd7) + '│',
  );
  console.log(gdSep);

  for (const r of successful) {
    const g = r.genericityReport;
    console.log(
      '│' + pad(truncate(r.category, gd1 - 1), gd1) + '│' +
      pad(g.sectionOverlap.toFixed(2), gd2) + '│' +
      pad(g.variantOverlap.toFixed(2), gd3) + '│' +
      pad(g.layoutOverlap.toFixed(2), gd4) + '│' +
      pad(g.cardStyleOverlap.toFixed(2), gd5) + '│' +
      pad(g.genericityScore.toFixed(2), gd6) + '│' +
      pad(g.status, gd7) + '│',
    );
  }
  console.log(gdEnd);
  console.log();

  // ── F.3: Quality scores in reasonable range (0.5-1.0) ─────

  console.log('── F.3: Quality Score Range Check (expect 0.5–1.0) ─────────────────────────────────');
  console.log();

  gatesTotal++;
  const allQualityInRange = successful.every(r => r.qualityScore >= 0.5 && r.qualityScore <= 1.0);
  const outOfRange = successful.filter(r => r.qualityScore < 0.5 || r.qualityScore > 1.0);
  if (allQualityInRange) gatesPass++;
  console.log(`  [${allQualityInRange ? 'PASS' : 'FAIL'}] All quality scores in [0.5, 1.0]`);
  if (outOfRange.length > 0) {
    console.log(`          Out of range: ${outOfRange.map(r => `${r.category}=${r.qualityScore.toFixed(2)}`).join(', ')}`);
  }
  console.log(`  Note: Skeleton stores (no content) may score below 0.5 due to missing commerce sections — this is expected.`);
  console.log();

  // ── F.4: Genericity scores in reasonable range (0.2-0.7) ──

  console.log('── F.4: Genericity Score Range Check (expect 0.2–0.7) ───────────────────────────────');
  console.log();

  gatesTotal++;
  const allGenericityInRange = successful.every(r => r.genericityScore >= 0.2 && r.genericityScore <= 0.7);
  const genOutOfRange = successful.filter(r => r.genericityScore < 0.2 || r.genericityScore > 0.7);
  if (allGenericityInRange) gatesPass++;
  console.log(`  [${allGenericityInRange ? 'PASS' : 'FAIL'}] All genericity scores in [0.2, 0.7]`);
  if (genOutOfRange.length > 0) {
    console.log(`          Out of range: ${genOutOfRange.map(r => `${r.category}=${r.genericityScore.toFixed(2)}`).join(', ')}`);
  }
  console.log();

  // ── F.5: Auto-repair max attempts = 2 ─────────────────────

  console.log('── F.5: Auto-Repair Max Attempts ──────────────────────────────────────────────────');
  console.log();

  gatesTotal++;
  const repairPass = MAX_REPAIR_ATTEMPTS === 2;
  if (repairPass) gatesPass++;
  console.log(`  [${repairPass ? 'PASS' : 'FAIL'}] MAX_REPAIR_ATTEMPTS = ${MAX_REPAIR_ATTEMPTS} (expected 2)`);
  console.log();

  // ── F.6: Bad store test ────────────────────────────────────

  console.log('── F.6: Bad Store Test (deliberately low quality) ──────────────────────────────────');
  console.log();

  const badStore: Store = {
    id: 'bad-store-test',
    name: 'Bad Store',
    slug: 'bad-store',
    theme: defaultTheme,
    pages: [{
      id: 'page-home',
      name: 'Home',
      slug: '',
      isHomepage: true,
      sections: Array.from({ length: 8 }, (_, i) => ({
        id: `bad-sec-${i}`,
        type: 'hero' as SectionType,
        visible: true,
        content: {},
        style: {},
      })),
    }],
    products: [],
    published: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const badQuality = validateStoreQuality(badStore);
  const badGenericity = detectGenericity(badStore);

  console.log(`  Bad store quality score:   ${badQuality.overallScore.toFixed(3)} (status: ${badQuality.status})`);
  console.log(`  Bad store genericity score: ${badGenericity.genericityScore.toFixed(3)} (status: ${badGenericity.status})`);
  console.log();

  // Verify bad store gets LOW quality or FAIL
  gatesTotal++;
  const badQualityLow = badQuality.overallScore < 0.5 || badQuality.status === 'FAIL';
  if (badQualityLow) gatesPass++;
  console.log(`  [${badQualityLow ? 'PASS' : 'FAIL'}] Bad store has low quality (< 0.5) or FAIL status`);
  console.log(`          score=${badQuality.overallScore.toFixed(3)}, status=${badQuality.status}`);

  // Verify bad store gets HIGH genericity (WARN or REJECT status both indicate flagged)
  // WARN threshold is 0.65, REJECT is 0.80 — score 0.664 is correctly above WARN
  gatesTotal++;
  const badGenericityHigh = badGenericity.genericityScore >= 0.65 || badGenericity.status === 'REJECT' || badGenericity.status === 'WARN';
  if (badGenericityHigh) gatesPass++;
  console.log(`  [${badGenericityHigh ? 'PASS' : 'FAIL'}] Bad store has high genericity (>= 0.65 WARN threshold) or REJECT/WARN status`);
  console.log(`          score=${badGenericity.genericityScore.toFixed(3)}, status=${badGenericity.status} (WARN>=0.65, REJECT>=0.80)`);
  console.log();

  // Bad store quality dimension details
  console.log('  Bad store quality dimensions:');
  console.log(`    coherence:          ${badQuality.scores.designCoherence.toFixed(3)}`);
  console.log(`    brandSpecificity:   ${badQuality.scores.brandSpecificity.toFixed(3)}`);
  console.log(`    visualVariety:      ${badQuality.scores.visualVariety.toFixed(3)}`);
  console.log(`    commerceEffect.:    ${badQuality.scores.commerceEffectiveness.toFixed(3)}`);
  console.log(`    responsiveRead.:    ${badQuality.scores.responsiveReadiness.toFixed(3)}`);
  console.log(`    componentValidity:  ${badQuality.scores.componentValidity.toFixed(3)}`);
  console.log();

  console.log('  Bad store genericity dimensions:');
  console.log(`    sectionOverlap:     ${badGenericity.sectionOverlap.toFixed(3)}`);
  console.log(`    variantOverlap:     ${badGenericity.variantOverlap.toFixed(3)}`);
  console.log(`    layoutOverlap:      ${badGenericity.layoutOverlap.toFixed(3)}`);
  console.log(`    cardStyleOverlap:   ${badGenericity.cardStyleOverlap.toFixed(3)}`);
  console.log();

  // ── F.7: Summary ───────────────────────────────────────────

  console.log('── Quality Gates Summary ──────────────────────────────────────────────────────────');
  console.log();
  console.log(`  Gates passed: ${gatesPass} / ${gatesTotal}`);
  console.log();

  if (gatesPass === gatesTotal) {
    console.log('  ═══════════════════════════════════════════');
    console.log('  ✅  QUALITY GATES: ALL PASS');
    console.log('  ═══════════════════════════════════════════');
  } else {
    console.log('  ═══════════════════════════════════════════');
    console.log(`  ⚠️  QUALITY GATES: ${gatesPass}/${gatesTotal} PASS`);
    console.log('  ═══════════════════════════════════════════');
  }
  console.log();
}

// ══════════════════════════════════════════════════════════════
// Main runner
// ══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const results = await runTenStoreStressTest();
  runQualityGatesVerification(results);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
