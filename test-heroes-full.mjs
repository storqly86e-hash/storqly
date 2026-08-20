import { composeStore } from './src/lib/design-library/composition.ts';
import { ensureLibraryRegistered } from './src/lib/design-library/ensure-registered.ts';

ensureLibraryRegistered();

const PROMPTS = [
  'Luxury Korean skincare brand with premium packaging, elegant typography, and a sophisticated hero section showcasing product still life imagery',
  'Gen-Z streetwear fashion brand with bold graphics, oversized typography, and an edgy urban hero',
  'Premium luxury watch brand with Swiss craftsmanship, refined serif typography, and an editorial hero',
  'Consumer electronics brand with clean minimalist design, tech-forward aesthetic',
  'Minimal premium furniture brand with Scandinavian design, natural materials, and an airy layout',
];

for (const prompt of PROMPTS) {
  const result = await composeStore(prompt);
  if (!result) { console.log('NO RESULT'); continue; }
  
  const orientNodes = result.nodes.filter(n => n.role === 'orient');
  const heroFamilyNodes = result.nodes.filter(n => n.component_id.startsWith('hero.'));
  
  console.log('\n=== PROMPT ===');
  console.log(prompt.substring(0, 60) + '...');
  console.log('Recipe:', result.recipeId);
  console.log('Typography:', result.typographySystem);
  console.log('Orient-role nodes:', orientNodes.map(n => n.component_id).join(', '));
  console.log('Hero-family nodes:', heroFamilyNodes.map(n => n.component_id).join(', '));
}
