import { composeStore } from './src/lib/design-library/composition.ts';
import { ensureLibraryRegistered } from './src/lib/design-library/ensure-registered.ts';

ensureLibraryRegistered();

const PROMPTS = [
  'Luxury Korean skincare brand',
  'Gen-Z streetwear fashion brand', 
  'Premium luxury watch brand',
  'Consumer electronics brand',
  'Minimal premium furniture brand',
];

for (const prompt of PROMPTS) {
  const result = await composeStore(prompt);
  if (!result) { console.log(`NO RESULT: ${prompt}`); continue; }
  
  const heroNodes = result.nodes.filter(n => n.component_id.startsWith('hero.'));
  console.log(`\n=== ${prompt.substring(0, 40)} ===`);
  console.log(`Recipe: ${result.recipeId}`);
  console.log(`Typography: ${result.typographySystem}`);
  console.log(`All hero nodes:`);
  for (const h of heroNodes) {
    console.log(`  ${h.component_id} (role: ${h.role})`);
  }
}
