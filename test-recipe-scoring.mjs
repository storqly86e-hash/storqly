import { composeStore } from './src/lib/design-library/composition.ts';
import { ensureLibraryRegistered } from './src/lib/design-library/ensure-registered.ts';
import { loadDesignLibrary } from './src/lib/design-library/loader.ts';

ensureLibraryRegistered();

// Manually trace recipe scoring for 'Premium luxury watch brand'
const { recipes } = await loadDesignLibrary();
const profile = {
  category: 'watches',
  audience: 'luxury buyers',
  positioning: 'premium',
  mood: 'refined',
  visual_energy: 'calm',
  conversion_priority: 'consideration',
  price_tier: 'luxury',
};

const tierMap = {
  entry: ['fast_catalog_discovery'],
  mid: ['fast_catalog_discovery', 'approachable_home_craft'],
  premium: ['luxury_editorial_launch', 'single_product_conversion', 'editorial_campaign'],
  luxury: ['luxury_editorial_launch'],
  ultra_luxury: ['luxury_editorial_launch'],
};

console.log('=== RECIPE SCORING FOR WATCH BRAND ===');
for (const recipe of recipes) {
  let score = 0.5;
  const profileValues = [profile.category, profile.audience, profile.positioning, profile.mood, profile.visual_energy];
  const overlap = recipe.signals.filter(s => profileValues.some(p => s.includes(p))).length;
  score += 0.3 * (overlap / Math.max(recipe.signals.length, 1));
  
  const tierBonus = tierMap[profile.price_tier]?.includes(recipe.id);
  if (tierBonus) score += 0.2;
  
  console.log(`${recipe.id}: overlap=${overlap}/${recipe.signals.length}, tierBonus=${tierBonus}, score=${score.toFixed(3)}`);
}
