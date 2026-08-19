import { composeStore } from './src/lib/design-library/composition';
import { ensureLibraryRegistered } from './src/lib/design-library/ensure-registered';
import { componentRegistry } from './src/lib/component-registry';
import { validateAndFixComponentMeta } from './src/lib/design-library/componentmeta-validator';
import { resolveVariantConfig } from './src/lib/design-library/variant-config-resolver';
import { isPageSection } from './src/lib/design-library/variant-categories';
import { normalizeStore } from './src/lib/normalize-store';
import type { Store, Section } from './src/lib/store-schema';

const PROMPTS = [
  'Luxury Korean skincare brand with premium packaging, elegant typography, and a sophisticated hero section showcasing product still life imagery',
  'Gen-Z streetwear fashion brand with bold graphics, oversized typography, and an edgy urban hero',
  'Premium luxury watch brand with Swiss craftsmanship, refined serif typography, and an editorial hero',
  'Consumer electronics brand with clean minimalist design, tech-forward aesthetic',
  'Minimal premium furniture brand with Scandinavian design, natural materials, and an airy layout',
];

async function main() {
  console.log('=== STORQLY DESIGN LIBRARY PIPELINE TEST ===\n');
  
  // Register library
  ensureLibraryRegistered();
  const allEntries = componentRegistry.getAll();
  console.log(`Registry: ${allEntries.length} variants registered`);
  
  // Count families
  const families = new Set(allEntries.map(e => e.family));
  console.log(`Families: ${families.size}`);
  
  for (const prompt of PROMPTS) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`PROMPT: ${prompt.substring(0, 80)}...`);
    console.log(`${'='.repeat(80)}`);
    
    try {
      const result = await composeStore(prompt);
      if (!result) {
        console.log('  COMPOSITION: FAILED (returned null)');
        continue;
      }
      
      console.log(`  Recipe: ${result.recipeName}`);
      console.log(`  Recipe ID: ${result.recipeId}`);
      console.log(`  Typography: ${result.typographySystem}`);
      console.log(`  Density: ${result.densityPreset}`);
      console.log(`  Nodes: ${result.nodes.length}`);
      
      // Check for single hero
      const heroNodes = result.nodes.filter(n => n.role === 'orient' || n.component_id.startsWith('hero.'));
      console.log(`  Hero nodes: ${heroNodes.length}`);
      
      // Check for sub-components at page level
      const subComponentNodes = result.nodes.filter(n => {
        const [family] = n.component_id.split('.');
        return !isPageSection(family);
      });
      console.log(`  Sub-components at page level: ${subComponentNodes.length}`);
      
      // Validate all component IDs exist in registry
      let validIds = 0;
      let invalidIds: string[] = [];
      for (const node of result.nodes) {
        const entry = componentRegistry.getByComponentId(node.component_id);
        if (entry) validIds++;
        else invalidIds.push(node.component_id);
      }
      console.log(`  Valid component IDs: ${validIds}/${result.nodes.length}`);
      if (invalidIds.length > 0) console.log(`  INVALID: ${invalidIds.join(', ')}`);
      
      // Test variant config resolution for each node
      console.log(`  --- Variant Config Resolution ---`);
      for (const node of result.nodes) {
        const [family, variant] = node.component_id.split('.');
        const mockSection: Section = {
          id: 'test',
          type: 'hero', // will vary
          content: {},
          style: {},
          visible: true,
          componentMeta: {
            componentId: node.component_id,
            family,
            variant,
            role: node.role,
          },
        };
        
        // Map to correct section type
        const mapping = componentRegistry.getByComponentId(node.component_id);
        if (mapping?.sectionType) {
          mockSection.type = mapping.sectionType as any;
        }
        
        const config = resolveVariantConfig(mockSection, {
          colors: { primary: '#000', secondary: '#666', accent: '#999', background: '#fff', surface: '#f5f5f5', text: '#111', textMuted: '#888', border: '#ddd' },
          fonts: { heading: 'Inter', body: 'Inter' },
          spacing: 'normal',
          borderRadius: 'md',
        });
        
        const hasContentOverrides = config && Object.keys(config.contentOverrides).length > 0;
        const hasStyleOverrides = config && Object.keys(config.styleOverrides).length > 0;
        const hasCssVars = config && Object.keys(config.cssVars).length > 0;
        const hasExtraClasses = config && (config.extraClasses || '').length > 0;
        const hasCardStyle = config && !!config.cardStyle;
        
        const hasAnyVisual = hasContentOverrides || hasStyleOverrides || hasCssVars || hasExtraClasses || hasCardStyle;
        console.log(`    ${node.component_id}: ${hasAnyVisual ? 'VISUAL DIFF' : 'NO DIFF'} (${hasContentOverrides ? 'content ' : ''}${hasStyleOverrides ? 'style ' : ''}${hasCssVars ? 'css ' : ''}${hasExtraClasses ? 'classes ' : ''}${hasCardStyle ? 'card ' : ''})`);
        if (config && hasCssVars) {
          console.log(`      CSS vars: ${JSON.stringify(config.cssVars)}`);
        }
        if (config && hasExtraClasses) {
          console.log(`      Extra classes: ${config.extraClasses}`);
        }
      }
      
    } catch (err) {
      console.log(`  ERROR: ${err}`);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('TEST COMPLETE');
  console.log(`${'='.repeat(80)}`);
}

main().catch(console.error);
