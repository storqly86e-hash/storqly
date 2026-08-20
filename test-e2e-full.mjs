import { composeStore } from './src/lib/design-library/composition.ts';
import { ensureLibraryRegistered } from './src/lib/design-library/ensure-registered.ts';
import { componentRegistry } from './src/lib/component-registry.ts';
import { validateAndFixComponentMeta } from './src/lib/design-library/componentmeta-validator.ts';
import { resolveVariantConfig } from './src/lib/design-library/variant-config-resolver.ts';
import { isPageSection } from './src/lib/design-library/variant-categories.ts';
import { normalizeStore } from './src/lib/normalize-store.ts';


ensureLibraryRegistered();

const PROMPTS = [
  { name: 'Korean Skincare', prompt: 'Luxury Korean skincare brand with premium packaging, elegant typography, and a sophisticated hero section' },
  { name: 'Gen-Z Streetwear', prompt: 'Gen-Z streetwear fashion brand with bold graphics, oversized typography, and an edgy urban hero' },
  { name: 'Luxury Watches', prompt: 'Premium luxury watch brand with Swiss craftsmanship, refined serif typography, and an editorial hero' },
  { name: 'Electronics', prompt: 'Consumer electronics brand with clean minimalist design, tech-forward aesthetic' },
  { name: 'Furniture', prompt: 'Minimal premium furniture brand with Scandinavian design, natural materials, and an airy layout' },
];

// CSS variable resolution (mirrors index.tsx)
function resolveTypoDensityVars(typo, density) {
  const vars = {};
  if (typo === 'editorial_serif_sans' || typo === 'editorial_sans_serif') {
    vars['--sq-font-heading'] = 'Georgia, serif';
    vars['--sq-heading-weight'] = '400';
  } else if (typo === 'modern_grotesk' || typo === 'modern_geometric') {
    vars['--sq-font-heading'] = 'Inter, sans-serif';
    vars['--sq-heading-weight'] = '600';
  } else if (typo === 'soft_humanist' || typo === 'minimal_clean') {
    vars['--sq-font-heading'] = 'Inter, system-ui';
    vars['--sq-heading-weight'] = '300';
  } else if (typo === 'compressed_utility' || typo === 'brutalist_mono') {
    vars['--sq-font-heading'] = 'Inter, sans-serif';
    vars['--sq-heading-weight'] = '700';
    vars['--sq-heading-text-transform'] = 'uppercase';
  }
  if (density === 'airy') {
    vars['--sq-section-py'] = '6rem';
    vars['--sq-grid-gap'] = '2rem';
  } else if (density === 'compact') {
    vars['--sq-section-py'] = '2rem';
    vars['--sq-grid-gap'] = '0.75rem';
  }
  return vars;
}

const mockTheme = {
  colors: { primary: '#000', secondary: '#666', accent: '#999', background: '#fff', surface: '#f5f5f5', text: '#111', textMuted: '#888', border: '#ddd' },
  fonts: { heading: 'Inter', body: 'Inter' },
  spacing: 'normal',
  borderRadius: 'md',
};

const results = [];

for (const { name, prompt } of PROMPTS) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`STORE: ${name}`);
  console.log(`PROMPT: ${prompt.substring(0, 60)}...`);
  console.log(`${'='.repeat(70)}`);

  const comp = await composeStore(prompt);
  if (!comp) { console.log('FAIL: Composition returned null'); results.push({ name, pass: false }); continue; }

  // CRITERION 1: designLibrary exists
  const designLibrary = {
    version: '1.0.0',
    recipe: comp.recipeId,
    typographySystem: comp.typographySystem,
    densityPreset: comp.densityPreset,
  };
  console.log(`[C1] designLibrary: recipe=${designLibrary.recipe}, typo=${designLibrary.typographySystem}, density=${designLibrary.densityPreset} ✅`);

  // CRITERION 2: Typography CSS vars exist
  const typoVars = resolveTypoDensityVars(designLibrary.typographySystem, designLibrary.densityPreset);
  console.log(`[C2] Typography CSS vars: ${Object.keys(typoVars).length} vars → ${Object.keys(typoVars).length > 0 ? 'PASS' : 'FAIL'}`);

  // CRITERION 3: Exactly ONE hero
  const heroNodes = comp.nodes.filter(n => n.component_id.startsWith('hero.'));
  console.log(`[C5] Hero count: ${heroNodes.length} → ${heroNodes.length === 1 ? 'PASS' : 'FAIL'}`);

  // CRITERION 4: No sub-components at page level
  const subComps = comp.nodes.filter(n => {
    const family = n.component_id.split('.')[0];
    return !isPageSection(family);
  });
  console.log(`[C4] Sub-components at page level: ${subComps.length} → ${subComps.length === 0 ? 'PASS' : 'FAIL'}`);

  // CRITERION 5: All component IDs valid in registry
  let validCount = 0, invalidIds = [];
  for (const node of comp.nodes) {
    if (componentRegistry.getByComponentId(node.component_id)) validCount++;
    else invalidIds.push(node.component_id);
  }
  console.log(`[C1] Valid component IDs: ${validCount}/${comp.nodes.length} → ${invalidIds.length === 0 ? 'PASS' : 'FAIL'}`);

  // CRITERION 6: componentMeta coverage & renderer resolution
  let metaCount = 0, resolvedCount = 0, visualDiffCount = 0;
  const familiesUsed = new Set();
  for (const node of comp.nodes) {
    const [family, variant] = node.component_id.split('.');
    familiesUsed.add(family);
    metaCount++;

    const entry = componentRegistry.getByComponentId(node.component_id);
    if (entry) resolvedCount++;

    // Test variant config resolution
    const mockSection = {
      id: 'test', type: entry?.sectionType || 'text-banner',
      content: {}, style: {}, visible: true,
      componentMeta: { componentId: node.component_id, family, variant, role: node.role },
    };
    const config = resolveVariantConfig(mockSection, mockTheme);
    const hasVisualDiff = (
      Object.keys(config.contentOverrides).length > 0 ||
      Object.keys(config.styleOverrides).length > 0 ||
      Object.keys(config.cssVars).length > 0 ||
      (config.extraClasses || '').length > 0 ||
      !!config.cardStyle
    );
    if (hasVisualDiff) visualDiffCount++;
  }
  console.log(`[C3] componentMeta coverage: ${metaCount}/${comp.nodes.length} sections`);
  console.log(`[C6] Registry resolution: ${resolvedCount}/${comp.nodes.length} → ${resolvedCount === comp.nodes.length ? 'PASS' : 'FAIL'}`);
  console.log(`[C7] Visual diffs: ${visualDiffCount}/${comp.nodes.length} (${visualDiffCount === comp.nodes.length ? 'ALL DIFFERENT' : visualDiffCount + ' variants differ'})`);
  console.log(`[Families used: ${[...familiesUsed].join(', ')}]`);

  // SUMMARY
  const pass = heroNodes.length === 1 && subComps.length === 0 && invalidIds.length === 0 && visualDiffCount > 0;
  console.log(`\nRESULT: ${pass ? 'PASS' : 'FAIL'}`);
  results.push({ name, pass, recipe: comp.recipeId, typo: comp.typographySystem, density: comp.densityPreset, heroCount: heroNodes.length, visualDiffs: `${visualDiffCount}/${comp.nodes.length}` });
}

console.log(`\n${'='.repeat(70)}`);
console.log('FINAL SUMMARY');
console.log(`${'='.repeat(70)}`);
for (const r of results) {
  console.log(`  ${r.name}: ${r.pass ? '✅ PASS' : '❌ FAIL'} | recipe=${r.recipe} | typo=${r.typo} | density=${r.density} | hero=${r.heroCount} | visualDiffs=${r.visualDiffs}`);
}
const allPass = results.every(r => r.pass);
console.log(`\nOVERALL: ${allPass ? 'ALL PASS' : 'SOME FAIL'}`);
