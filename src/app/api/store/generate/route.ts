// ========================================
// Store Generation API — SSE Streaming + 2-Phase Chunked Product Generation
// ========================================
// Phase 1: AI generates store structure (theme, pages, sections) + first batch of products (up to 8)
// Phase 2 (if requested > 8): Additional product-only batches of 6, with independent normalization & image enrichment
//
// Safety nets:
// - SSE heartbeats every 4s to keep the proxy connection alive
// - Hard time budget: 300s total (5 min) for the entire generation
// - Per-batch time budget check — abort remaining batches if < 20s remaining
// - Auth guard: returns 401 JSON before creating the SSE stream (defense-in-depth)

import { NextRequest } from 'next/server';
import { executeAI } from '@/lib/ai-orchestrator';
import { getProviders } from '@/lib/ai-providers';
import { normalizeStore, normalizeProducts } from '@/lib/normalize-store';
import { sanitizePrompt, extractProductCount } from '@/lib/sanitize-prompt';
import type { Store, StoreProduct } from '@/lib/store-schema';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';
import { ensureLibraryRegistered } from '@/lib/design-library/ensure-registered';
import { composeStore } from '@/lib/design-library/composition';
import type { CompositionResult } from '@/lib/design-library/design-intent';
import { buildLibraryPromptContext, buildHeroLibraryBlock, buildImageArtDirectionPrompt } from '@/lib/design-library/prompt-context';
import { getVariantMapping } from '@/lib/design-library/variant-mapping';
import { validateAndFixComponentMeta } from '@/lib/design-library/componentmeta-validator';
import { bridgeSectionStyles } from '@/lib/design-library/style-bridge';
import { validateStoreQuality } from '@/lib/design-library/quality-guardrails';
import { detectGenericity } from '@/lib/design-library/genericity-detector';
import { attemptAutoRepair } from '@/lib/design-library/auto-repair';
import type { ComponentMeta } from '@/lib/store-schema';
import { logGeneration } from '@/lib/logger';

// ─── Timestamped logging helper (for debugging timing issues) ─
const ts = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
const log = (msg: string) => console.log(`[${ts()}] ${msg}`);
const warn = (msg: string) => console.warn(`[${ts()}] ${msg}`);
const logErr = (msg: string, ...args: unknown[]) => console.error(`[${ts()}] ${msg}`, ...args);

// ─── Batch size constants ──────────────────────────────────────
const PHASE1_BATCH_SIZE = 8;
const PHASE2_BATCH_SIZE = 6;

// ─── Soft cap: quality degrades past ~30 products (dupes, image failures) ─
const MAX_PRACTICAL_PRODUCTS = 30;

// ─── Time budgets ────────────────────────────────────────────
const TOTAL_TIME_BUDGET_MS = 300_000; // 5 min total
const MIN_REMAINING_MS = 20_000;      // Abort remaining batches if < 20s left

// ─── Unsplash Image Database ────────────────────────────────
// Comprehensive image URLs organized by store category.
// Each category has hero images (w=1400) and product images (w=600).

const HERO_URLS: Record<string, string[]> = {
  'skincare/beauty/spa': [
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1400',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400',
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1400',
    'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=1400',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1400',
    'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1400',
  ],
  'fashion/clothing/apparel': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1400',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1400',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1400',
    'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=1400',
  ],
  'jewelry/watches/accessories': [
    'https://images.unsplash.com/photo-1515562141589-67f0d569b6c3?w=1400',
    'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1400',
    'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=1400',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1400',
    'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=1400',
    'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=1400',
  ],
  'food/coffee/bakery': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1400',
    'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=1400',
    'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=1400',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1400',
  ],
  'furniture/home/decor': [
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1400',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1400',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1400',
  ],
  'electronics/tech/gadgets': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1400',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1400',
  ],
  'fitness/sports/outdoor': [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1400',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1400',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1400',
  ],
  'books/education/stationery': [
    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1400',
    'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1400',
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1400',
  ],
  'pets/animals': [
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1400',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1400',
    'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=1400',
  ],
  'automotive/cars': [
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1400',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1400',
    'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1400',
  ],
  'travel/luggage/adventure': [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1400',
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1400',
    'https://images.unsplash.com/photo-1503220317266-8e5b70a21ed6?w=1400',
  ],
  'plants/garden/eco': [
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1400',
    'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=1400',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=1400',
  ],
  'kids/baby/toys': [
    'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1400',
    'https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=1400',
    'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1400',
  ],
  'music/instruments/art': [
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=1400',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1400',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1400',
  ],
  'general/lifestyle': [
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400',
    'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=1400',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1400',
  ],
};

const PRODUCT_URLS: Record<string, string[]> = {
  'skincare/beauty': [
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600',
    'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=600',
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600',
    'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
    'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=600',
  ],
  'fashion/clothing': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600',
    'https://images.unsplash.com/photo-1434389677669-e08b4cda3a01?w=600',
  ],
  'jewelry/accessories': [
    'https://images.unsplash.com/photo-1515562141589-67f0d569b6c3?w=600',
    'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=600',
    'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=600',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600',
    'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600',
    'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600',
    'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=600',
    'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600',
    'https://images.unsplash.com/photo-1576022162028-3a434f67e5e0?w=600',
    'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=600',
  ],
  'food/coffee': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600',
    'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=600',
    'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=600',
    'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=600',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600',
  ],
  'furniture/home': [
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600',
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600',
    'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600',
  ],
  'electronics/tech': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=600',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600',
  ],
  'fitness/sports': [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600',
  ],
  'books/education': [
    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600',
    'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600',
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600',
  ],
  'pets/animals': [
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600',
    'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600',
  ],
  'general': [
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
  ],
  'automotive/cars': [
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600',
    'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600',
    'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600',
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600',
  ],
  'travel/luggage': [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600',
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600',
    'https://images.unsplash.com/photo-1503220317266-8e5b70a21ed6?w=600',
    'https://images.unsplash.com/photo-1548013146-72479768bada?w=600',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600',
  ],
  'plants/garden': [
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600',
    'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=600',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600',
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600',
  ],
  'kids/baby': [
    'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600',
    'https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=600',
    'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600',
    'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=600',
  ],
  'music/instruments': [
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600',
    'https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=600',
  ],
};

// ─── Category Detection ─────────────────────────────────────

function pickCategory(keys: string[]): string {
  const lower = keys.join(' ').toLowerCase();
  for (const [cat, ] of Object.entries(HERO_URLS)) {
    const catParts = cat.split('/');
    if (catParts.some(p => lower.includes(p))) return cat;
  }
  return 'general/lifestyle';
}

function formatUrlsForPrompt(urls: string[]): string {
  return urls.map((u, i) => `  URL ${i+1}: ${u}`).join('\n');
}

// ─── Category-specific product examples & forbidden items ──

const CATEGORY_PRODUCT_GUIDANCE: Record<string, { examples: string[]; forbidden: string[]; categoryHint: string }> = {
  'skincare/beauty/spa': {
    categoryHint: 'skincare, beauty, cosmetics, spa products',
    examples: ['Hydrating Rose Serum', 'Vitamin C Brightening Cream', 'Retinol Night Repair Oil', 'Gentle Foam Cleanser', 'Niacinamide Pore Minimizer', 'SPF 50 Sunscreen Lotion', 'Hyaluronic Acid Face Mist', 'Exfoliating AHA Toner'],
    forbidden: ['electronics', 'phone', 'laptop', 'camera', 'headphone', 'speaker', 'keyboard', 'watch', 'shoe', 'jacket', 'furniture'],
  },
  'fashion/clothing/apparel': {
    categoryHint: 'clothing, apparel, fashion garments, accessories',
    examples: ['Silk Wrap Blouse', 'Tailored Linen Trousers', 'Cashmere Crewneck Sweater', 'Structured Wool Blazer', 'High-Rise Straight Jeans', 'Pleated Midi Skirt', 'Cotton Oxford Shirt', 'Oversized Knit Cardigan'],
    forbidden: ['electronics', 'phone', 'laptop', 'camera', 'headphone', 'speaker', 'serum', 'cream', 'lotion', 'skincare', 'ring', 'necklace', 'bracelet', 'furniture'],
  },
  'jewelry/watches/accessories': {
    categoryHint: 'jewelry, watches, rings, necklaces, bracelets, earrings, fine jewelry, fashion accessories',
    examples: ['Gold Signet Ring', 'Pearl Drop Earrings', 'Diamond Tennis Bracelet', 'Sapphire Pendant Necklace', 'Rose Gold Chain Bracelet', 'Emerald Stud Earrings', 'Vintage cameo brooch', 'Sterling Silver Anklet', 'Opal Cocktail Ring', 'Layered Gold Necklace Set'],
    forbidden: ['camera', 'polaroid', 'headphone', 'speaker', 'laptop', 'phone', 'keyboard', 'monitor', 'printer', 'serum', 'cream', 'lotion', 'skincare', 'shoe', 'sneaker', 'jacket', 'tshirt', 'jeans', 'furniture', 'sofa', 'chair'],
  },
  'food/coffee/bakery': {
    categoryHint: 'food, coffee, bakery, snacks, beverages, gourmet food',
    examples: ['Single Origin Ethiopian Coffee Beans', 'Artisan Sourdough Loaf', 'Organic Matcha Powder', 'Dark Chocolate Truffle Box', 'Cold Brew Concentrate', 'Vanilla Bean Extract', 'Gluten-Free Granola Mix', 'Himalayan Pink Salt'],
    forbidden: ['electronics', 'phone', 'laptop', 'camera', 'headphone', 'ring', 'necklace', 'bracelet', 'clothing', 'jacket', 'furniture'],
  },
  'furniture/home/decor': {
    categoryHint: 'furniture, home decor, interior design, home accessories',
    examples: ['Walnut Dining Table', 'Linen Accent Armchair', 'Handwoven Jute Rug', 'Ceramic Table Lamp', 'Floating Wall Shelf Set', 'Velvet Throw Pillow Cover', 'Marble Coaster Set', 'Brass Floor Lamp'],
    forbidden: ['electronics', 'phone', 'laptop', 'camera', 'headphone', 'serum', 'cream', 'skincare', 'ring', 'necklace', 'bracelet', 'clothing', 'jacket', 'shoe'],
  },
  'electronics/tech/gadgets': {
    categoryHint: 'electronics, tech gadgets, computer accessories, smart devices',
    examples: ['Wireless Noise-Cancelling Headphones', 'Mechanical Gaming Keyboard', '4K Ultra-Wide Monitor', 'Portable Bluetooth Speaker', 'USB-C Docking Station', 'Smart Home Hub', 'Wireless Charging Pad', 'HD Webcam'],
    forbidden: ['serum', 'cream', 'lotion', 'skincare', 'ring', 'necklace', 'bracelet', 'clothing', 'jacket', 'shoe', 'furniture', 'sofa', 'coffee', 'bread', 'cake'],
  },
  'fitness/sports/outdoor': {
    categoryHint: 'fitness equipment, sports gear, outdoor gear, athletic wear',
    examples: ['Adjustable Dumbbell Set', 'Yoga Mat Premium', 'Resistance Band Kit', 'Stainless Steel Water Bottle', 'Running Compression Socks', 'Foam Muscle Roller', 'Jump Rope Speed Pro', 'Pull-Up Bar Doorway'],
    forbidden: ['electronics', 'laptop', 'phone', 'serum', 'cream', 'skincare', 'ring', 'necklace', 'bracelet', 'furniture', 'sofa', 'bread', 'cake'],
  },
  'books/education/stationery': {
    categoryHint: 'books, educational materials, stationery, office supplies',
    examples: ['Leather-Bound Journal', 'Fountain Pen Set', 'Watercolor Paint Kit', 'Desk Organizer Bamboo', 'Classic Literature Box Set', 'Moleskine Notebook Pack', 'Mechanical Pencil Set', 'Bookend Marble Pair'],
    forbidden: ['electronics', 'laptop', 'phone', 'headphone', 'serum', 'cream', 'skincare', 'ring', 'necklace', 'furniture'],
  },
  'pets/animals': {
    categoryHint: 'pet supplies, animal products, pet food, pet accessories',
    examples: ['Organic Dog Treats', 'Memory Foam Pet Bed', 'Adjustable Dog Harness', 'Interactive Cat Toy', 'Stainless Steel Pet Bowl', 'Grooming Brush Set', 'Cat Scratching Post', 'Pet Car Seat Cover'],
    forbidden: ['electronics', 'laptop', 'phone', 'headphone', 'serum', 'cream', 'skincare', 'ring', 'necklace', 'furniture', 'sofa'],
  },
  'automotive/cars': {
    categoryHint: 'automotive, car accessories, auto parts, vehicle supplies',
    examples: ['Leather Steering Wheel Cover', 'Portable Car Vacuum', 'Dash Camera 4K', 'LED Headlight Bulbs', 'Car Phone Mount', 'Seat Covers Premium Set', 'Tire Pressure Gauge', 'Car Wax Kit'],
    forbidden: ['serum', 'cream', 'skincare', 'ring', 'necklace', 'bracelet', 'clothing', 'jacket', 'bread', 'cake', 'furniture'],
  },
  'travel/luggage/adventure': {
    categoryHint: 'travel gear, luggage, bags, travel accessories',
    examples: ['Hardshell Carry-On Suitcase', 'Travel Neck Pillow Memory Foam', 'Packing Cube Set', 'Anti-Theft Backpack', 'Passport Holder Leather', 'Universal Travel Adapter', 'Compression Socks Set', 'Toiletry Bag Waterproof'],
    forbidden: ['furniture', 'sofa', 'serum', 'cream', 'skincare', 'laptop', 'monitor', 'keyboard', 'ring', 'necklace'],
  },
  'plants/garden/eco': {
    categoryHint: 'plants, garden supplies, eco-friendly products, sustainable goods',
    examples: ['Ceramic Planter Set', 'Indoor Herb Garden Kit', 'Organic Potting Soil Mix', 'Garden Tool Set', 'Bamboo Wind Chimes', 'Compost Bin Kitchen', 'LED Grow Light Panel', 'Pruning Shears Pro'],
    forbidden: ['electronics', 'laptop', 'phone', 'headphone', 'serum', 'cream', 'skincare', 'ring', 'necklace', 'clothing', 'jacket'],
  },
  'kids/baby/toys': {
    categoryHint: 'kids products, baby items, toys, children clothing',
    examples: ['Wooden Building Blocks', 'Soft Plush Teddy Bear', 'Musical Activity Cube', 'Organic Cotton Baby Onesie', 'Kids Watercolor Art Set', 'Balance Bike Toddler', 'Storybook Collection Box', 'Night Light Projector'],
    forbidden: ['electronics', 'laptop', 'phone', 'headphone', 'serum', 'cream', 'skincare', 'alcohol', 'wine'],
  },
  'music/instruments/art': {
    categoryHint: 'musical instruments, art supplies, music accessories, creative tools',
    examples: ['Acoustic Guitar Starter Kit', 'Digital Piano Keyboard', 'Studio Monitor Speakers', 'Canvas Paint Set Professional', 'Violin Full Size', 'Microphone Condenser USB', 'Drum Stick Pair Pro', 'Sketch Pencil Set'],
    forbidden: ['serum', 'cream', 'skincare', 'ring', 'necklace', 'bracelet', 'furniture', 'sofa', 'bread', 'cake'],
  },
};

// Fallback for uncategorized stores
const DEFAULT_PRODUCT_GUIDANCE = {
  categoryHint: '',
  examples: [],
  forbidden: [],
};

function getProductGuidance(category: string) {
  // Check both HERO_URLS and PRODUCT_URLS keys since categories may differ slightly
  for (const [key, guidance] of Object.entries(CATEGORY_PRODUCT_GUIDANCE)) {
    const keyParts = key.split('/');
    const catParts = category.split('/');
    // Match if any part overlaps
    if (keyParts.some(p => catParts.some(c => c.includes(p) || p.includes(c)))) {
      return guidance;
    }
  }
  return DEFAULT_PRODUCT_GUIDANCE;
}

function pickProductCategory(keys: string[]): string {
  const lower = keys.join(' ').toLowerCase();
  for (const [cat, ] of Object.entries(PRODUCT_URLS)) {
    const catParts = cat.split('/');
    if (catParts.some(p => lower.includes(p))) return cat;
  }
  return 'general';
}

// ─── Phase 1 System Prompt (SUPERCHARGED for complex stores) ──

function buildPhase1SystemPrompt(productCount: number, userPrompt: string): string {
  const promptWords = userPrompt.toLowerCase();
  const heroCategory = pickCategory([promptWords]);
  const productCategory = pickProductCategory([promptWords]);
  const heroUrls = HERO_URLS[heroCategory] || HERO_URLS['general/lifestyle'];
  const productUrls = PRODUCT_URLS[productCategory] || PRODUCT_URLS['general'];
  const guidance = getProductGuidance(heroCategory);

  // Detect complexity signals from the prompt
  const isComplex = (
    promptWords.includes('multi-page') || promptWords.includes('multiple page') ||
    promptWords.includes('about us') || promptWords.includes('contact') || promptWords.includes('shop all') ||
    promptWords.includes('collection') || promptWords.includes('gallery') || promptWords.includes('categories') ||
    promptWords.includes('story') || promptWords.includes('brand') || promptWords.includes('faq') ||
    promptWords.includes('testimonials') || promptWords.includes('reviews') ||
    promptWords.includes('luxury') || promptWords.includes('premium') || promptWords.includes('editorial') ||
    promptWords.includes('campaign') || promptWords.includes('complex') || promptWords.includes('comprehensive')
  );

  return `You are a world-class e-commerce store architect. You build stunning, conversion-optimized Shopify stores from design specifications.

═══ CORE PRINCIPLES ═══
1. USER INTENT IS LAW: Every explicit requirement in the user prompt MUST appear in the output. AI fills in unspecified details intelligently but NEVER replaces explicit requirements with generic defaults.
2. VISUAL IMPACT: Every section must be visually rich and professionally composed. No generic or empty-looking sections.
3. COHESIVE DESIGN: All sections share the same design language — consistent colors, spacing, typography, and visual rhythm.
4. REALISM: Use realistic product names, prices, descriptions. No placeholder text.
5. COMPLETENESS: Every section must have ALL its required fields populated with meaningful content.

═══ OUTPUT FORMAT ═══
- Raw JSON ONLY. No markdown fences. No explanation.
- NEVER put newlines or double-quotes inside any string value. Use single quotes for emphasis.
- Fresh UUIDs (crypto.randomUUID format) for all "id" fields.
- KEEP OUTPUT MINIMAL — short strings, no unnecessary fields.
- Return a SINGLE JSON object, not an array.

═══ TOP-LEVEL SCHEMA ═══
{
  "id": "<uuid>",
  "name": "<store name>",
  "slug": "<url-safe-slug>",
  "description": "<compelling 1-sentence description>",
  "announcementText": "<short promo like 'Free shipping on orders over $50'>",
  "theme": { ... },
  "pages": [ ... ],
  "products": [ ... ],
  "published": false,
  "createdAt": "<ISO>",
  "updatedAt": "<ISO>"
}

═══ THEME DESIGN SYSTEM ═══
The theme must perfectly match the brand aesthetic. Generate a COHESIVE color palette:
{
  "colors": {
    "primary": "<brand's primary hex — most used color>",
    "secondary": "<complementary hex — used for accents, badges, hover states>",
    "accent": "<CTA/highlight hex — buttons, links, important elements>",
    "background": "<page background hex — usually white or near-white>",
    "surface": "<card/section background hex — slightly different from background>",
    "text": "<primary text hex — high contrast on background>",
    "textMuted": "<secondary text hex — for descriptions, labels>",
    "border": "<border/divider hex — subtle, matches surface>",
  },
  "fonts": {
    "heading": "<font name: Inter, Playfair Display, Montserrat, Poppins, DM Sans, Crimson Text, Oswald, Space Grotesk, or similar>",
    "body": "<font name: Inter, Open Sans, Lato, Source Sans Pro, DM Sans, or similar>"
  },
  "spacing": "normal",
  "borderRadius": "md"
}

TYPOGRAPHY RULES:
- Luxury/premium stores: heading='Playfair Display' or 'Crimson Text', body='Inter' or 'Lato'
- Modern/tech stores: heading='Space Grotesk' or 'Montserrat', body='Inter' or 'DM Sans'
- Fashion/editorial: heading='Montserrat' or 'Oswald', body='Inter' or 'Open Sans'
- Organic/natural: heading='DM Sans' or 'Poppins', body='Lato' or 'Source Sans Pro'
- Bold/energetic: heading='Oswald' or 'Montserrat', body='Inter' or 'Poppins'

COLOR PALETTE STRATEGY:
- Analyze the brand mood from the prompt and generate a matching palette.
- Dark/moody brands: dark backgrounds (#111827, #0f172a), light text, vivid accents
- Luxury brands: neutral backgrounds, gold/silver accents, elegant typography
- Bright/energetic: white backgrounds, vibrant primary + secondary, playful accent
- Minimal/clean: white/light gray backgrounds, one accent color, lots of whitespace
- Nature/organic: earthy tones (greens, browns, warm grays), cream backgrounds

═══ SECTION SYSTEM ═══
Each section: {"id":"<uuid>","type":"<type>","content":{...},"style":{...},"visible":true,"componentMeta":{...}}

COMPONENTMETA — Required for EVERY section:
{"componentId":"<family.variant>","family":"<family>","variant":"<variant>","role":"<role>"}

SECTION STYLE defaults (use these unless user overrides):
{"paddingY":"lg","paddingX":"md","maxWidth":"xl","borderRadius":"none"}

═══ HERO SECTION — THE STAR ═══
The hero is the PRIMARY visual statement. It MUST be visually stunning.

CONTENT FIELDS: headline, subheadline, ctaText, ctaLink, alignment (left/center/right), height (sm/md/lg/xl), badge (uppercase label), secondaryCtaText (optional), layout, visualPriority, backgroundTreatment, vignette, heroImages, carouselEnabled, carouselInterval

LAYOUT SELECTION (choose based on brand, NOT default):
- "minimal": Full-bleed background image + centered text overlay. NO product column. BEST for: luxury, editorial, campaigns, skincare, cosmetics, fashion campaigns, premium brands. Use when prompt says "editorial", "premium", "campaign", "lifestyle".
- "split-left": Text 50% left + product image 50% right. Good for product-focused stores.
- "split-right": Product image 50% left + text 50% right. Mirror of split-left.
- "product-first": Product image 60% dominant + text 40%. Use when product is the hero.
- "text-first": Text 60% dominant + product image 40%. Use when message is the hero.

HERO IMAGE SYSTEM (CRITICAL):
- heroImages: Array of EXACTLY 3 objects: {"src":"<URL from list>","alt":"<descriptive>","role":"<one of: product-hero, editorial-lifestyle, product-detail, campaign, brand-atmosphere>"}
- Assign DISTINCT, MEANINGFUL roles to each image.
- carouselEnabled: true (always)
- carouselInterval: 5 (always)
- style.backgroundImage: 1st hero image URL
- style.overlay: true
- backgroundTreatment: "editorial" for premium/fashion, "dramatic" for bold campaigns, "soft" for gentle brands, "none" only if user says no treatment
- vignette: true
- height: "xl" for editorial/premium, "lg" for standard
- visualPriority: "headline" for minimal, "balanced" for split, "product" for product-first

═══ ALL SECTION TYPES — DETAILED SPECS ═══

1. HERO (always first section, non-negotiable):
   See above. Must be visually impactful.

2. FEATURED-PRODUCTS:
   {headline, subtitle, productIds: [array of product IDs], columns: 3 or 4, showPrice: true, showAddToCart: true}
   - This is the main product showcase section. Always include it.

3. PRODUCT-GRID (alternative to featured-products for larger catalogs):
   {headline, columns: 3 or 4, showPrice: true, showAddToCart: true}
   - Use this when there are many products or when showing all products.

4. TEXT-BANNER:
   {headline, body, alignment, size}
   - Great for brand statements, value propositions, or transitions between sections.
   - body should be 1-2 compelling sentences.

5. CTA (call-to-action):
   {headline, body, ctaText, ctaLink, style: "solid"|"outline"|"gradient"}
   - High-impact conversion section. Place before newsletter or at end.
   - Use "gradient" style for premium brands, "solid" for standard.

6. TESTIMONIALS:
   {headline, items: [{id, quote (realistic customer words), author, role (e.g. 'Verified Buyer'), rating: 4-5}]}
   - Include 3 testimonials with diverse, realistic quotes.
   - Style: backgroundColor should be surface color or a subtle tint.

7. NEWSLETTER:
   {headline, subtitle, placeholderText, buttonText}
   - Style: backgroundColor = primary color, textColor = white.

8. IMAGE-GALLERY:
   {images: [{src, alt, caption}], columns: 3 or 4, gap: "md"}
   - Great for lifestyle brands, lookbooks, behind-the-scenes.
   - Use Unsplash URLs from the hero list for gallery images.

9. CATEGORIES:
   {headline, items: [{id, name, image, slug, productCount}], columns: 3 or 4}
   - Perfect for stores with multiple product categories.
   - Generate 3-6 categories based on the store's product range.

10. FAQ:
    {headline, items: [{id, question (realistic), answer (helpful, 1-2 sentences)}]}
    - Include 4-6 FAQs relevant to the store's niche.
    - Questions should address real customer concerns (shipping, returns, materials, sizing).

11. BRAND-STATEMENT:
    {headline, body (2-3 sentences about brand story/mission), backgroundImage, alignment}
    - Use for 'About Us' content inline on the home page.

═══ PAGE COMPOSITION STRATEGY ═══
For a HOME page, build a visual narrative flow:
1. HERO (always first — sets the visual tone)
2. FEATURED-PRODUCTS or CATEGORIES (show what you sell)
3. TEXT-BANNER or BRAND-STATEMENT (tell your story)
4. IMAGE-GALLERY (show lifestyle/aspiration) — optional
5. TESTIMONIALS (social proof)
6. CTA (conversion push)
7. NEWSLETTER (retention)

${isComplex ? `COMPLEX STORE GUIDANCE:
- This is a complex store request. Include MORE sections (7-10 sections).
- Use diverse section types to create a rich, multi-layered page.
- Include CATEGORIES section with 4-6 product categories.
- Include IMAGE-GALLERY for lifestyle/lookbook content.
- Include FAQ with 4-6 relevant questions.
- Consider adding TEXT-BANNER sections as visual transitions between content blocks.
- Make the hero extra impactful — use "minimal" or "split-left" layout.
- Use richer, more detailed content in every section.`
: `STANDARD STORE: Include 6-8 sections for a focused, brand-specific page. Follow the composition structure when provided.`}

═══ PRODUCT SCHEMA ═══
{id:"<uuid>", name:"<short, realistic name>", price:<number>, compareAtPrice:null, images:["<one REAL URL from product list>"], description:"<max 8 words, compelling>", category:"<category>", featured:false, inStock:true}

═══ CRITICAL: PRODUCT NICHE ENFORCEMENT ═══
This store sells: ${guidance.categoryHint ? guidance.categoryHint : 'products matching the user\'s prompt description'}.
ALL ${productCount} products MUST be from this exact niche. This is NON-NEGOTIABLE.
${guidance.examples.length > 0 ? `
EXAMPLES of correct product names for this niche (use similar style, do NOT copy exactly):
${guidance.examples.map(e => `  - ${e}`).join('\n')}
` : ''}
${guidance.forbidden.length > 0 ? `
FORBIDDEN — Do NOT generate these types of products:
${guidance.forbidden.map(f => `  - ${f}`).join('\n')}
If any product name contains or implies any of the above forbidden categories, the ENTIRE generation is INVALID.
` : ''}

PRODUCT RULES:
- Generate EXACTLY ${productCount} products. Mark 1 as featured.
- Descriptions max 8 words. Make them compelling (not generic).
- Names MUST be specific to the niche listed above. Every single product must belong to this category.
- Prices should vary realistically (e.g., $29-$299 for mid-range, $100-$2000+ for luxury).
- Cycle through the product image URLs. Do NOT invent URLs.
- NO "variants" field on products.

═══ IMAGE URLS — USE THESE EXACT URLS ═══
HERO IMAGES (pick 3 for heroImages, use 1st also as style.backgroundImage):
${formatUrlsForPrompt(heroUrls)}

PRODUCT IMAGES (cycle through these for each product):
${formatUrlsForPrompt(productUrls)}

═══ DESIGN LIBRARY COMPONENT IDs ═══
You MUST use the exact componentMeta values specified in the Page Composition section below.
Each section MUST include a componentMeta object with: componentId, family, variant, role.
These IDs come from the Design Library — NEVER invent or guess component IDs.
If no composition is provided below, use these valid fallback IDs:
- Hero: "hero.editorial_product_still_life" or "hero.split_context_product" or "hero.fullbleed_copy_safe_area" or "hero.editorial_masthead" or "hero.product_stack_vertical"
- Featured Products: "featured-product.proof_led" or "featured-product.routine_builder"
- Testimonials: "testimonials.quote_wall" or "testimonials.rating_rail" or "testimonials.ugc_rail"
- CTA: "cta.premium_invitation" or "cta.strong_statement" or "cta.community_invite" or "cta.urgency_panel" or "cta.editorial_invite"
- Newsletter: "newsletter.split_capture" or "newsletter.editorial_capture" or "newsletter.waitlist_capture"
- Brand Statement: "brand-story.split_art-directed" or "brand-story.founder_note" or "brand-story.timeline"
- Image Gallery: "gallery.editorial_masonry" or "gallery.lookbook_grid"
- Categories: "collection.lookbook_tiles" or "collection.filter_sidebar" or "collection.story_chapters"
- Text Banner: "trust.proof_strip" or "trust.certification_row"
- Product Grid: "product-grid.luxury_gallery" or "product-grid.utility_dense" or "product-grid.bold_rail"

═══ NON-NEGOTIABLE RULES ═══
1. heroImages MUST have exactly 3 objects with REAL URLs from the list above.
2. Each heroImage MUST have a "role" field.
3. carouselEnabled MUST be true, carouselInterval MUST be 5.
4. Do NOT add header, footer, spacer, or divider sections.
5. NO variants field on products.
6. Every section MUST have componentMeta with a valid componentId.
7. style.maxWidth should be "xl" for professional, expansive feel.
8. Theme colors MUST match the brand aesthetic described in the prompt.
9. If user specifies exact colors/fonts/layout, use THOSE exactly.

USER PROMPT (this is the design specification — follow it precisely):
${userPrompt}`;
}

// ─── Phase 2 System Prompt (products only) ────────────────────────
function buildPhase2SystemPrompt(
  count: number,
  storeName: string,
  storeDescription: string,
  existingProductNames: string[],
  userPrompt: string,
): string {
  const promptWords = userPrompt.toLowerCase();
  const category = pickCategory([promptWords]);
  const guidance = getProductGuidance(category);
  return `You are a product catalog generator. Return a JSON ARRAY of product objects — no markdown, no explanation, no wrapping object.

FORMAT RULES:
1. Raw JSON array ONLY. No markdown fences. No object wrapper.
2. NEVER put newlines or double-quotes inside any string.
3. Fresh UUIDs for all "id" fields.
4. KEEP OUTPUT MINIMAL — short strings, no unnecessary fields.

═══ NICHE: ${guidance.categoryHint || storeDescription} ═══
ALL ${count} products MUST be from this exact niche. NON-NEGOTIABLE.
${guidance.examples.length > 0 ? `
EXAMPLES of correct product names (use similar style, do NOT copy):
${guidance.examples.slice(0, 5).map(e => `  - ${e}`).join('\n')}
` : ''}
${guidance.forbidden.length > 0 ? `
FORBIDDEN product types (NEVER generate these):
${guidance.forbidden.slice(0, 10).map(f => `  - ${f}`).join('\n')}
` : ''}

Each product must be:
{id: "<uuid>", name: "<short realistic name>", price: <number>, compareAtPrice: null, images: ["https://images.unsplash.com/photo-<id>?w=600"], description: "<max 8 words, compelling>", category: "<category>", featured: false, inStock: true}

RULES:
- Generate EXACTLY ${count} products for the ${storeName} store (${storeDescription}).
- Each product MUST belong to the niche listed above. No exceptions.
- Each product must be UNIQUE — do NOT duplicate any of these existing products: ${existingProductNames.join(', ')}.
- NO variants field.
- Prices should vary realistically for the product category.
- Product names should be creative and realistic, not generic.`;
}

// ─── POST handler — SSE stream ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return authErrorResponse(e);
    throw e;
  }

  let prompt: string | undefined;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let sendFailed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          if (!sendFailed) {
            sendFailed = true;
            logErr(`[Store Generate] send('${event}') failed — stream likely closed. Error: ${e instanceof Error ? e.message : e}`);
          }
        }
      };

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); }
        catch { clearInterval(heartbeat); }
      }, 4000);

      const startTime = Date.now();
      const elapsed = () => Date.now() - startTime;
      const remaining = () => TOTAL_TIME_BUDGET_MS - elapsed();

      try {
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          send('error', { message: 'A prompt is required.' });
          return;
        }

        const trimmedPrompt = prompt.trim();
        const sanitizedPrompt = sanitizePrompt(trimmedPrompt);
        let requestedCount = extractProductCount(trimmedPrompt);

        const wasCapped = requestedCount > MAX_PRACTICAL_PRODUCTS;
        if (wasCapped) {
          console.log(`[Store Generate] Soft cap: user requested ${requestedCount}, capped to ${MAX_PRACTICAL_PRODUCTS}`);
          requestedCount = MAX_PRACTICAL_PRODUCTS;
        }

        const phase1Count = Math.min(requestedCount, PHASE1_BATCH_SIZE);
        const needsPhase2 = requestedCount > PHASE1_BATCH_SIZE;
        const phase2BatchCount = needsPhase2
          ? Math.ceil((requestedCount - PHASE1_BATCH_SIZE) / PHASE2_BATCH_SIZE)
          : 0;

        log(`[Store Generate] Requested: ${requestedCount} products. Phase 1: ${phase1Count}. Phase 2 batches: ${phase2BatchCount}.`);

        if (sanitizedPrompt.length < trimmedPrompt.length) {
          log(`[Store Generate] Prompt sanitized: ${trimmedPrompt.length} -> ${sanitizedPrompt.length} chars (long lists collapsed)`);
        }

        logGeneration({ event: 'generation_started', details: { prompt_length: sanitizedPrompt.length, product_count: requestedCount } });

        if (elapsed() > TOTAL_TIME_BUDGET_MS) {
          warn(`[Store Generate] Time budget exceeded before AI call (${elapsed()}ms).`);
          send('error', { message: 'Generation timed out before AI could respond. Please try again.' });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // PHASE 1: Store Structure + First Batch of Products
        // ═══════════════════════════════════════════════════════════
        const providerChain = getProviders();
        log(`[Store Generate] Provider chain: ${providerChain.map(p => p.name).join(' -> ')} (${providerChain.length} providers, NODE_ENV=${process.env.NODE_ENV || 'not set'})`);

        send('progress', { stage: 'analyzing', message: 'Analyzing your store vision...' });
        log(`[Store Generate] Phase 1: Generating store with ${phase1Count} products...`);

        // ── Library-aware composition ────────────────────────────────
        send('progress', { stage: 'design-direction', message: 'Creating design direction...' });
        let libraryCtx: CompositionResult | null = null;
        let libraryPromptSection = '';
        try {
          ensureLibraryRegistered();
          libraryCtx = await composeStore(sanitizedPrompt);
          if (libraryCtx) {
            log(`[Store Generate] Library composition: ${libraryCtx.recipeName} (${libraryCtx.nodes.length} sections)`);
            libraryPromptSection = buildLibraryPromptContext(libraryCtx);
          }
        } catch (e) {
          warn(`[Store Generate] Library composition failed (non-fatal): ${e}. Using legacy generation.`);
        }

        const userMessage = `Generate an e-commerce store: ${sanitizedPrompt}`;

        const systemPrompt = libraryCtx
          ? buildPhase1SystemPrompt(phase1Count, sanitizedPrompt) + '\n\n' + libraryPromptSection
          : buildPhase1SystemPrompt(phase1Count, sanitizedPrompt);
        log(`[Store Generate] System prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 4)} tokens). Library context: ${libraryPromptSection.length > 0 ? libraryPromptSection.length + ' chars' : 'none'}`);

        send('progress', { stage: 'building-store', message: 'Building your store with AI...' });
        logGeneration({ event: 'generation_stage_changed', duration_ms: elapsed(), details: { stage: 'building-store' } });

        const phase1Result = await executeAI('store-generation', [
          { role: 'user', content: userMessage },
        ], {
          systemPrompt,
          temperature: 0.6,
          timeout: 90_000,
          maxRetries: 3,
          responseFormat: 'json_object',
          enableThinking: true,
          maxTokens: 16000,
        });

        if (!phase1Result.success || !phase1Result.content) {
          logErr(`[Store Generate] Phase 1 AI failed: ${phase1Result.error}. Attempts: ${phase1Result.attempts}`);
          const providerDetails = phase1Result.providerErrors
            ?.map(e => `* ${e.provider}: ${e.error}`)
            .join('\n') || phase1Result.error || 'Unknown error';
          send('error', { message: `AI generation failed. Each provider error:\n${providerDetails}`, providerErrors: phase1Result.providerErrors });
          return;
        }

        log(`[Store Generate] Phase 1 AI returned ${phase1Result.content.length} chars in ${elapsed()}ms (${phase1Result.attempts} API attempts, provider: ${phase1Result.provider})`);

        // ── Parse JSON ──
        send('progress', { stage: 'processing', message: 'Processing AI response...' });
        logGeneration({ event: 'generation_ai_completed', duration_ms: elapsed(), details: { chars: phase1Result.content.length, attempts: phase1Result.attempts, provider: phase1Result.provider } });

        // Guard against oversized AI responses (potential OOM vector)
        const MAX_RESPONSE_CHARS = 500_000; // ~125K tokens — well above any reasonable store
        if (phase1Result.content.length > MAX_RESPONSE_CHARS) {
          logErr(`[Store Generate] Phase 1 response too large: ${phase1Result.content.length} chars (max ${MAX_RESPONSE_CHARS})`);
          logGeneration({ event: 'generation_failed', duration_ms: elapsed(), details: { reason: 'response_too_large', size: phase1Result.content.length } });
          send('error', { message: 'AI response was too large. Please try again with a simpler prompt.' });
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(phase1Result.content);
        } catch (e) {
          logErr(`[Store Generate] Phase 1 JSON parse failed:`, e);
          send('error', { message: 'AI returned invalid data. Please try again.' });
          return;
        }

        // ── Normalize to Store schema ──
        const normResult = normalizeStore(parsed, trimmedPrompt, phase1Count);

        if (!normResult) {
          warn(`[Store Generate] normalizeStore returned null.`);
          logGeneration({ event: 'normalization_failed', duration_ms: elapsed(), details: { reason: 'normalizeStore returned null' } });
          send('error', { message: 'AI response could not be processed into a valid store. Please try again.' });
          return;
        }

        if (normResult.normalizationCount > 0) {
          log(`[Store Generate] Normalization applied (${normResult.summary}):`);
          for (const line of normResult.log) {
            log(`  ${line}`);
          }
        } else {
          log(`[Store Generate] Normalization: 0 fixes needed — clean output.`);
        }

        let store = normResult.store;

        // ── Bridge AI style tokens → renderer-consumable fields ──
        send('progress', { stage: 'applying-design', message: 'Applying design system...' });
        store = bridgeSectionStyles(store);

        // ── Hero image backfill (CRITICAL: prevents plain/solid hero) ──
        // The AI sometimes omits heroImages or provides empty arrays.
        // This safety net ensures every hero has 3 category-appropriate images
        // and carousel is enabled, regardless of AI compliance.
        try {
          const heroCategory = pickCategory([sanitizedPrompt]);
          const heroImagePool = HERO_URLS[heroCategory] || HERO_URLS['general/lifestyle'];
          for (const page of store.pages) {
            for (const section of page.sections) {
              if (section.type !== 'hero') continue;
              const content = section.content as Record<string, unknown>;
              const style = section.style as Record<string, unknown>;

              // Determine current image sources
              let heroImages = content.heroImages;
              if (!Array.isArray(heroImages) || heroImages.length === 0) {
                // No heroImages at all — backfill from category pool
                const images = heroImagePool.slice(0, 3).map((url, i) => ({
                  src: url,
                  alt: `${store.name} hero image ${i + 1}`,
                  role: ['product-hero', 'editorial-lifestyle', 'brand-atmosphere'][i],
                }));
                content.heroImages = images;
                log(`[Store Generate] Hero backfill: injected 3 hero images from category ${heroCategory}`);
              } else {
                // Validate existing heroImages — replace any with invalid/empty src
                let hadInvalid = false;
                const validated = (heroImages as Array<Record<string, unknown>>).slice(0, 3).map((img, i) => {
                  const src = typeof img?.src === 'string' && img.src.startsWith('https://') ? img.src : '';
                  if (!src) hadInvalid = true;
                  return {
                    src: src || heroImagePool[i % heroImagePool.length],
                    alt: typeof img?.alt === 'string' ? img.alt : `${store.name} hero image ${i + 1}`,
                    role: typeof img?.role === 'string' ? img.role : ['product-hero', 'editorial-lifestyle', 'brand-atmosphere'][i],
                  };
                });
                if (hadInvalid) {
                  content.heroImages = validated;
                  log(`[Store Generate] Hero validation: replaced invalid hero image URLs`);
                }
              }

              // Force carousel enabled
              content.carouselEnabled = true;
              content.carouselInterval = 5;

              // Ensure style.backgroundImage is set as fallback
              if (!style.backgroundImage || typeof style.backgroundImage !== 'string') {
                style.backgroundImage = heroImagePool[0];
                log(`[Store Generate] Hero: set style.backgroundImage fallback`);
              }

              // Ensure overlay is set for text readability
              if (style.overlay === undefined) {
                style.overlay = true;
              }
            }
          }
        } catch (heroErr) {
          warn(`[Store Generate] Hero image backfill error (non-fatal): ${heroErr instanceof Error ? heroErr.message : String(heroErr)}`);
        }

        // ── Validate and fix componentMeta ─────────────────────
        if (libraryCtx) {
          const { store: validatedStore, result: vr } = validateAndFixComponentMeta(store, libraryCtx);
          store = validatedStore;
          if (vr.fixedMeta > 0 || vr.errors.length > 0) {
            log(`[Store Generate] componentMeta validation: ${vr.validMeta} valid, ${vr.fixedMeta} fixed, ${vr.attachedMissingMeta} attached, ${vr.errors.length} errors`);
            for (const e of vr.errors) log(`  [componentMeta] ${e}`);
            if (vr.errors.length > 0) {
              logGeneration({ event: 'validation_failed', duration_ms: elapsed(), details: { valid: vr.validMeta, fixed: vr.fixedMeta, errors: vr.errors.length } });
            }
          } else {
            log(`[Store Generate] componentMeta: ${vr.validMeta} valid, ${vr.attachedMissingMeta} attached from composition`);
          }

          // ── Apply per-section rhythm CSS vars to section.style ──
          // The composition engine produces sectionRhythm with rhythmCssVars,
          // but these must be applied to the actual section.style so the
          // renderer can consume them via section.style._rhythmCssVars.
          if (libraryCtx.sectionRhythm && libraryCtx.sectionRhythm.length > 0) {
            const homepage = store.pages.find(p => p.isHomepage);
            if (homepage) {
              const visibleSections = homepage.sections.filter(s => s.visible);
              for (const rhythm of libraryCtx.sectionRhythm) {
                const section = visibleSections[rhythm.nodeIndex];
                if (section && rhythm.rhythmCssVars && Object.keys(rhythm.rhythmCssVars).length > 0) {
                  (section.style as Record<string, unknown>)._rhythmCssVars = rhythm.rhythmCssVars;
                }
              }
              log(`[Store Generate] Applied rhythm CSS vars to ${Math.min(libraryCtx.sectionRhythm.length, visibleSections.length)} sections`);
            }
          }
        }

        log(`[Store Generate] Phase 1 complete: ${store.products.length} products in ${elapsed()}ms`);

        // ═══════════════════════════════════════════════════════════
        // PHASE 2: Additional Product Batches
        // ═══════════════════════════════════════════════════════════
        if (needsPhase2) {
          const productsStillNeeded = requestedCount - store.products.length;

          if (productsStillNeeded > 0 && remaining() > MIN_REMAINING_MS) {
            log(`[Store Generate] Phase 2: Need ${productsStillNeeded} more products (${phase2BatchCount} batches). ${Math.round(remaining() / 1000)}s remaining.`);

            const existingNames = store.products.map(p => p.name);
            const storeDescription = store.description || 'e-commerce store';
            let batchNum = 0;

            for (let offset = store.products.length; offset < requestedCount; offset += PHASE2_BATCH_SIZE) {
              batchNum++;
              const thisBatchSize = Math.min(PHASE2_BATCH_SIZE, requestedCount - offset);
              const batchRange = `${offset + 1}-${offset + thisBatchSize}`;

              if (remaining() < MIN_REMAINING_MS) {
                warn(`[Store Generate] Phase 2: Only ${Math.round(remaining() / 1000)}s remaining — skipping remaining batches. Have ${store.products.length} products total.`);
                break;
              }

              send('progress', { stage: 'generating', message: `Generating products ${batchRange}...` });
              log(`[Store Generate] Phase 2 batch ${batchNum}: Generating ${thisBatchSize} products (range ${batchRange})...`);

              try {
                const batchResult = await executeAI('product-batch', [
                  { role: 'user', content: `Generate ${thisBatchSize} products.` },
                ], {
                  systemPrompt: buildPhase2SystemPrompt(
                    thisBatchSize,
                    store.name,
                    storeDescription,
                    existingNames,
                    sanitizedPrompt,
                  ),
                  responseFormat: 'json_object',
                  maxRetries: 1,
                  timeout: 45_000,
                });

                if (!batchResult.success || !batchResult.content) {
                  warn(`[Store Generate] Phase 2 batch ${batchNum} failed: ${batchResult.error}. Keeping ${store.products.length} products.`);
                  break;
                }

                let batchParsed: unknown;
                try {
                  batchParsed = JSON.parse(batchResult.content);
                } catch (e) {
                  warn(`[Store Generate] Phase 2 batch ${batchNum} JSON parse failed. Keeping ${store.products.length} products.`);
                  break;
                }

                let batchProducts: unknown[];
                if (Array.isArray(batchParsed)) {
                  batchProducts = batchParsed;
                } else if (batchParsed && typeof batchParsed === 'object' && !Array.isArray(batchParsed)) {
                  const obj = batchParsed as Record<string, unknown>;
                  batchProducts = Array.isArray(obj.products) ? obj.products
                    : Array.isArray(obj.items) ? obj.items
                    : Array.isArray(obj.data) ? obj.data
                    : [];
                } else {
                  batchProducts = [];
                }

                const normalizedBatch: StoreProduct[] = normalizeProducts(batchProducts);

                // ── Phase 2 image enrichment: replace AI-generated images ──
                // Phase 2 products get random AI-chosen Unsplash URLs.
                // Replace them with category-appropriate images from PRODUCT_URLS.
                const p2Category = pickProductCategory([sanitizedPrompt]);
                const p2ImagePool = PRODUCT_URLS[p2Category] || PRODUCT_URLS['general'];
                let p2ImagesReplaced = 0;
                for (const p of normalizedBatch) {
                  if (p.images.length > 0) {
                    // Replace with a deterministic category-appropriate image
                    const imgIdx = (p.name.length * 7 + p.name.charCodeAt(0) * 13) % p2ImagePool.length;
                    const prevImg = p.images[0];
                    p.images[0] = p2ImagePool[imgIdx];
                    if (prevImg !== p.images[0]) p2ImagesReplaced++;
                  }
                }
                if (p2ImagesReplaced > 0) {
                  log(`[Store Generate] Phase 2 batch ${batchNum}: replaced ${p2ImagesReplaced}/${normalizedBatch.length} images with category-appropriate ones (category: ${p2Category})`);
                }

                if (normalizedBatch.length === 0) {
                  warn(`[Store Generate] Phase 2 batch ${batchNum} produced 0 valid products. Keeping ${store.products.length} products.`);
                  break;
                }

                for (const p of normalizedBatch) {
                  existingNames.push(p.name);
                  store.products.push(p);
                }

                log(`[Store Generate] Phase 2 batch ${batchNum} complete: +${normalizedBatch.length} products. Total: ${store.products.length}. ${Math.round(remaining() / 1000)}s remaining.`);

              } catch (batchErr) {
                const batchMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
                warn(`[Store Generate] Phase 2 batch ${batchNum} error: ${batchMsg}. Keeping ${store.products.length} products.`);
                break;
              }
            }
          } else {
            log(`[Store Generate] Phase 2 skipped: ${productsStillNeeded > 0 ? 'not enough time remaining' : 'already have enough products'}.`);
          }
        }

        // ── Fix product references in featured-products sections ──
        const allProductIds = store.products.map(p => p.id);
        for (const page of store.pages) {
          for (const section of page.sections) {
            if (section.type === 'featured-products' && Array.isArray(section.content.productIds)) {
              const validIds = (section.content.productIds as string[]).filter(id => allProductIds.includes(id));
              const usedIds = new Set(validIds);
              for (const pid of allProductIds) {
                if (!usedIds.has(pid)) {
                  validIds.push(pid);
                  usedIds.add(pid);
                }
              }
              section.content.productIds = validIds;
            }
          }
        }

        // ── Quality guardrails + genericity detection + auto-repair ──
        send('progress', { stage: 'quality-check', message: 'Running quality checks...' });
        let finalQualityScore = 0;
        try {
          const qualityReport = validateStoreQuality(store);
          const genericityReport = detectGenericity(store);
          finalQualityScore = qualityReport.overallScore;
          log(`[Store Generate] Quality: ${qualityReport.status} (score=${qualityReport.overallScore.toFixed(2)}, violations=${qualityReport.violations.length}). Genericity: ${genericityReport.status} (score=${genericityReport.genericityScore.toFixed(2)})`);

          if (genericityReport.status === 'REJECT') {
            logGeneration({ event: 'genericity_rejected', duration_ms: elapsed(), details: { score: genericityReport.genericityScore } });
          }

          if (qualityReport.status === 'FAIL' || genericityReport.status === 'REJECT') {
            log(`[Store Generate] Attempting auto-repair...`);
            logGeneration({ event: 'auto_repair_started', duration_ms: elapsed(), details: { quality_status: qualityReport.status, genericity_status: genericityReport.status, quality_score: qualityReport.overallScore, genericity_score: genericityReport.genericityScore, attempt: 1 } });
            const repairResult = await attemptAutoRepair(store, sanitizedPrompt);
            store = repairResult.store;
            log(`[Store Generate] Repair: ${repairResult.repaired ? 'SUCCESS' : 'BEST_EFFORT'} (${repairResult.attempts} attempts, actions: ${repairResult.repairActions.join(', ') || 'none'})`);
            logGeneration({ event: 'auto_repair_completed', duration_ms: elapsed(), details: { succeeded: repairResult.repaired, attempts: repairResult.attempts, actions: repairResult.repairActions } });
            log(`[Store Generate] Post-repair quality: ${repairResult.qualityReport.status} (score=${repairResult.qualityReport.overallScore.toFixed(2)}). Genericity: ${repairResult.genericityReport.status} (score=${repairResult.genericityReport.genericityScore.toFixed(2)})`);
          } else if (qualityReport.status === 'WARN') {
            log(`[Store Generate] Quality WARN — ${qualityReport.violations.filter(v => v.severity === 'warning').map(v => v.rule).join(', ')}`);
          }
        } catch (guardErr) {
          warn(`[Store Generate] Quality guardrails error (non-fatal): ${guardErr instanceof Error ? guardErr.message : String(guardErr)}`);
        }

        // ── Image relevance enforcement ──
        // Ensure ALL product images are category-appropriate.
        // Products with generic/wrong images get replaced.
        try {
          const productCategory = pickProductCategory([sanitizedPrompt]);
          const safeImagePool = PRODUCT_URLS[productCategory] || PRODUCT_URLS['general'];
          // Build a set of known-bad image patterns (electronics/general for non-electronics stores)
          const isElectronicsStore = productCategory === 'electronics/tech';
          const badPatterns = isElectronicsStore
            ? [] // electronics stores can have any electronics images
            : ['headphone', 'laptop', 'camera', 'keyboard', 'monitor', 'speaker', 'printer'];
          let imagesFixed = 0;
          for (const p of store.products) {
            if (p.images.length === 0) continue;
            const img = p.images[0];
            // Check if image is from the wrong category
            const isFromWrongCategory = !isElectronicsStore && badPatterns.some(bp => img.toLowerCase().includes(bp));
            // Check if image is from the generic pool
            const isGeneric = img.includes('photo-1523275335684') || img.includes('photo-1505740420928') || img.includes('photo-1526170375885');
            if (isFromWrongCategory || isGeneric) {
              // Replace with a deterministic category-appropriate image
              const imgIdx = (p.name.length * 7 + p.name.charCodeAt(0) * 13) % safeImagePool.length;
              p.images[0] = safeImagePool[imgIdx];
              imagesFixed++;
            }
          }
          if (imagesFixed > 0) {
            log(`[Store Generate] Image relevance: replaced ${imagesFixed}/${store.products.length} wrong-category/generic images (category: ${productCategory})`);
          }
        } catch (imgErr) {
          warn(`[Store Generate] Image relevance check error (non-fatal): ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
        }

        // ── Final result ──
        send('progress', { stage: 'finalizing', message: 'Finalizing your store...' });
        const sectionCount = store.pages.reduce((sum, p) => sum + p.sections.length, 0);
        log(`[Store Generate] Success in ${elapsed()}ms. Store: "${store.name}" (${store.products.length} products, ${sectionCount} sections, ${normResult.normalizationCount} normalizations)`);
        logGeneration({ event: 'generation_completed', storeId: store.id, duration_ms: elapsed(), details: { section_count: sectionCount, product_count: store.products.length, quality_score: finalQualityScore, recipe_name: libraryCtx?.recipeName ?? 'legacy' } });

        send('result', {
          store,
          _normalizations: normResult.normalizationCount,
          _productCapHit: wasCapped,
          _requestedCount: wasCapped ? extractProductCount(trimmedPrompt) : undefined,
          _generatedCount: store.products.length,
        });
        logGeneration({ event: 'store_saved', storeId: store.id, duration_ms: elapsed() });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logErr(`[Store Generate] Unexpected error after ${elapsed()}ms:`, msg);
        logGeneration({ event: 'generation_failed', duration_ms: elapsed(), details: { error_message: msg } });
        send('error', { message: `An unexpected error occurred: ${msg.substring(0, 120)}. Please try again.` });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
