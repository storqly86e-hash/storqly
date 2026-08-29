// ========================================
// Composition Architecture Enforcement
// ========================================
//
// Ensures the AI-generated store matches the composition recipe's
// required section architecture. When the AI returns fewer sections
// than the recipe calls for, this module injects scaffold sections
// with the correct componentMeta, type, and branded placeholder content.
//
// This is the "Step 5" enforcement layer from the Phase 2 spec:
//   1. Composition Engine selects recipe
//   2. Recipe produces the required section plan
//   3. AI generates content/configuration for the planned sections
//   4. THIS MODULE validates AI output against the selected recipe
//   5. THIS MODULE injects missing sections using DL variants
//   6. Validation runs again (in quality guardrails)

import type { Store, Section, StoreProduct } from '@/lib/store-schema';
import type { CompositionResult } from './design-intent';
import { getVariantMapping } from './variant-mapping';
import { isPageSection } from './variant-categories';

// ── Types ─────────────────────────────────────────────────

export interface EnforcementResult {
  store: Store;
  injectedCount: number;
  matchedCount: number;
  totalNodes: number;
  injectedFamilies: string[];
}

// ── Main enforcement function ──────────────────────────────

export function enforceCompositionArchitecture(
  store: Store,
  libraryCtx: CompositionResult,
  heroImagePool: string[],
): EnforcementResult {
  const homepage = store.pages.find(p => p.isHomepage);
  if (!homepage) {
    return { store, injectedCount: 0, matchedCount: 0, totalNodes: 0, injectedFamilies: [] };
  }

  const nodes = libraryCtx.nodes;
  const totalNodes = nodes.length;
  if (totalNodes === 0) {
    return { store, injectedCount: 0, matchedCount: 0, totalNodes: 0, injectedFamilies: [] };
  }

  // Get existing section componentIds for matching
  const existingSections = homepage.sections.filter(s => s.visible);
  const matchedComponentIds = new Set<string>();
  const matchedFamilies = new Set<string>();

  // Track which composition nodes are satisfied by existing sections
  for (const section of existingSections) {
    const cid = section.componentMeta?.componentId;
    if (cid) {
      matchedComponentIds.add(cid);
      if (section.componentMeta?.family) {
        matchedFamilies.add(section.componentMeta.family);
      }
    }
  }

  // Also match by section type for nodes where AI generated the right type
  // but without componentMeta
  const typeMatchedNodes = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (matchedComponentIds.has(node.component_id)) continue;

    const mapping = getVariantMapping(node.component_id);
    const sectionType = mapping?.sectionType;
    if (!sectionType || sectionType === 'spacer') continue;

    // Check if any existing section has this type (without componentMeta)
    const hasTypeMatch = existingSections.some(
      s => s.type === sectionType && !s.componentMeta?.componentId
    );
    if (hasTypeMatch) {
      typeMatchedNodes.add(i);
    }
  }

  // Build list of nodes that need injection
  const nodesToInject: Array<{
    index: number;
    componentId: string;
    family: string;
    role: string;
    sectionType: string;
    order: number;
  }> = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const family = node.component_id.split('.')[0];

    // Skip sub-components (button, product-card, navigation, commerce-pattern)
    if (!isPageSection(family)) continue;

    // Skip if already matched by componentId
    if (matchedComponentIds.has(node.component_id)) continue;

    // Skip if type-matched (AI generated right type, just without meta)
    if (typeMatchedNodes.has(i)) continue;

    // Skip header/footer (chrome — always present via normalization)
    if (family === 'header' || family === 'footer') continue;

    const mapping = getVariantMapping(node.component_id);
    const sectionType = mapping?.sectionType ?? 'text-banner';
    if (sectionType === 'spacer') continue;

    // Skip if this family/role is already covered by an existing section
    // (e.g., if we already have a product-grid, don't inject another)
    const isDuplicate = nodesToInject.some(n => n.family === family && n.role === node.role);
    if (isDuplicate) continue;

    nodesToInject.push({
      index: i,
      componentId: node.component_id,
      family,
      role: node.role,
      sectionType,
      order: node.order,
    });
  }

  if (nodesToInject.length === 0) {
    const matchedCount = matchedComponentIds.size + typeMatchedNodes.size;
    return { store, injectedCount: 0, matchedCount, totalNodes, injectedFamilies: [] };
  }

  // Inject scaffold sections
  const sections = [...homepage.sections];
  const brandName = store.name || 'Our Brand';
  const brandDesc = store.description || 'Discover our curated collection';
  const products = store.products;
  const theme = store.theme;
  const injectedFamilies: string[] = [];

  // Sort by order to maintain recipe sequence
  nodesToInject.sort((a, b) => a.order - b.order);

  for (const node of nodesToInject) {
    const scaffold = buildScaffoldSection({
      componentId: node.componentId,
      family: node.family,
      role: node.role,
      sectionType: node.sectionType,
      brandName,
      brandDesc,
      products,
      theme,
      heroImagePool,
    });

    // Insert in recipe order: append at the end
    // (sections are sorted by recipe order, so appending preserves sequence)
    const footerIdx = sections.findIndex(s => s.type === 'footer');
    const insertIdx = footerIdx >= 0 ? footerIdx : sections.length;
    sections.splice(insertIdx, 0, scaffold);
    injectedFamilies.push(node.family);
  }

  const newStore: Store = {
    ...store,
    pages: store.pages.map(p =>
      p.isHomepage ? { ...p, sections } : p
    ),
  };

  const matchedCount = matchedComponentIds.size + typeMatchedNodes.size;
  return {
    store: newStore,
    injectedCount: nodesToInject.length,
    matchedCount,
    totalNodes,
    injectedFamilies,
  };
}

// ── Scaffold builder ───────────────────────────────────────

interface ScaffoldParams {
  componentId: string;
  family: string;
  role: string;
  sectionType: string;
  brandName: string;
  brandDesc: string;
  products: StoreProduct[];
  theme: Store['theme'];
  heroImagePool: string[];
}

function buildScaffoldSection(params: ScaffoldParams): Section {
  const { componentId, family, role, sectionType, brandName, brandDesc, products, theme, heroImagePool } = params;
  const mapping = getVariantMapping(componentId);
  const configOverrides = mapping?.configOverrides ?? {};

  const base: Section = {
    id: `enforced-${family}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: sectionType as Section['type'],
    content: {},
    style: { paddingY: 'lg' },
    visible: true,
    componentMeta: {
      componentId,
      family,
      variant: componentId.split('.').slice(1).join('.'),
      role: role as Section['componentMeta']['role'],
    },
  };

  // Apply configOverrides from the variant mapping to content
   for (const [key, value] of Object.entries(configOverrides)) {
    (base.content as Record<string, unknown>)[key] = value;
  }

  // Build type-specific content
  switch (sectionType) {
    case 'product-grid':
    case 'featured-products': {
      const productIds = products.slice(0, 6).map(p => p.id);
      base.content = {
        ...base.content,
        headline: base.content.headline || (role === 'merchandise' ? 'Our Collection' : 'Featured Products'),
        subtitle: base.content.subtitle || `Explore the ${brandName} collection`,
        productIds,
        columns: base.content.columns || 3,
        showPrice: true,
        showAddToCart: true,
      };
      break;
    }
    case 'testimonials': {
      base.content = {
        ...base.content,
        headline: base.content.headline || 'What Our Customers Say',
        items: [
          { id: 'enf-t1', quote: `Absolutely love the quality from ${brandName}. Exceeded my expectations in every way.`, author: 'Sarah M.', role: 'Verified Buyer', rating: 5 },
          { id: 'enf-t2', quote: `The attention to detail is remarkable. ${brandName} has become my go-to for gifts.`, author: 'James K.', role: 'Verified Buyer', rating: 5 },
          { id: 'enf-t3', quote: `Fast shipping, beautiful packaging, and the product itself is stunning. Highly recommend.`, author: 'Priya R.', role: 'Verified Buyer', rating: 5 },
        ],
      };
      break;
    }
    case 'cta': {
      base.content = {
        ...base.content,
        headline: base.content.headline || `Ready to Experience ${brandName}?`,
        body: base.content.body || brandDesc,
        ctaText: base.content.ctaText || 'Shop Now',
        ctaLink: base.content.ctaLink || '#',
        alignment: base.content.alignment || 'center',
      };
      break;
    }
    case 'newsletter': {
      base.content = {
        ...base.content,
        headline: base.content.headline || `Join the ${brandName} Community`,
        subtitle: base.content.subtitle || 'Get early access to new arrivals and exclusive offers.',
        placeholderText: 'Enter your email',
        buttonText: 'Subscribe',
      };
      break;
    }
    case 'brand-statement': {
      const img = heroImagePool.length > 1 ? heroImagePool[1] : undefined;
      base.content = {
        ...base.content,
        headline: base.content.headline || 'Our Story',
        body: base.content.body || brandDesc,
        alignment: 'left',
        ...(img ? { backgroundImage: img } : {}),
      };
      break;
    }
    case 'image-gallery': {
      const galleryImages = heroImagePool.slice(0, 4).map((src, i) => ({
        src,
        alt: `${brandName} gallery image ${i + 1}`,
      }));
      base.content = {
        ...base.content,
        headline: base.content.headline || 'Gallery',
        images: galleryImages,
        columns: base.content.columns || 3,
        gap: 'md',
      };
      break;
    }
    case 'text-banner': {
      base.content = {
        ...base.content,
        headline: base.content.headline || (role === 'promote' ? `New Arrivals at ${brandName}` : brandName),
        alignment: 'center',
        size: 'md',
      };
      // For promotions, add a CTA
      if (role === 'promote') {
        (base.content as Record<string, unknown>).body = 'Discover our latest collection.';
        (base.content as Record<string, unknown>).ctaText = 'Shop Now';
      }
      break;
    }
    case 'faq': {
      base.content = {
        ...base.content,
        headline: base.content.headline || 'Frequently Asked Questions',
        items: [
          { id: 'enf-f1', question: `What makes ${brandName} different?`, answer: `At ${brandName}, we focus on quality craftsmanship and exceptional materials. Every product is carefully curated to meet our high standards.` },
          { id: 'enf-f2', question: 'What is your shipping policy?', answer: 'We offer complimentary shipping on all orders. Standard delivery takes 3-5 business days, with express options available at checkout.' },
          { id: 'enf-f3', question: 'What is your return policy?', answer: 'We accept returns within 30 days of purchase. Items must be in original condition with tags attached. Contact us to initiate a return.' },
          { id: 'enf-f4', question: 'How can I contact customer support?', answer: 'Reach our team via email or through the contact form on our website. We typically respond within 24 hours.' },
        ],
      };
      break;
    }
    case 'categories': {
      const cats = [...new Set(products.slice(0, 8).map(p => p.category).filter(Boolean))];
      if (cats.length < 3) cats.push('Featured', 'New Arrivals', 'Best Sellers');
      base.content = {
        ...base.content,
        headline: base.content.headline || 'Shop by Category',
        items: cats.slice(0, 6).map((name, i) => ({
          id: `enf-cat-${i}`,
          name: name as string,
          slug: (name as string).toLowerCase().replace(/\s+/g, '-'),
          productCount: products.filter(p => p.category === name).length,
        })),
        columns: base.content.columns || 3,
      };
      break;
    }
    case 'rich-text': {
      base.content = {
        ...base.content,
        html: `<h2>The ${brandName} Difference</h2><p>${brandDesc}</p><p>Every piece in our collection is thoughtfully designed and carefully crafted. We believe in quality over quantity, creating products that stand the test of time.</p>`,
      };
      break;
    }
    default:
      // Generic fallback for unhandled types
      base.content = {
        headline: brandName,
        body: brandDesc,
        alignment: 'center',
      };
  }

  return base;
}
