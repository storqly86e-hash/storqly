// ========================================
// Composition Architecture Enforcement (v2)
// ========================================
//
// Ensures the AI-generated store matches the composition recipe's
// required section architecture. When the AI returns fewer sections
// than the recipe calls for, this module injects scaffold sections
// with the correct componentMeta, type, and branded placeholder content.
//
// V2 fixes over v1:
// - One-to-one type matching: one existing section type covers at most
//   ONE recipe node (v1 allowed one section to cover ALL nodes of that type)
// - Recipe-order merge: final section list follows recipe sequence
// - Proper header/footer preservation at first/last positions
// - Better scaffold content with role-aware and category-aware text
//
// Pipeline position:
//   1. Composition Engine selects recipe
//   2. Recipe produces the required section plan (nodes[])
//   3. AI generates content for the planned sections
//   4. THIS MODULE validates AI output against recipe
//   5. THIS MODULE injects missing sections using DL variants
//   6. Validation runs again (in quality guardrails)

import type { Store, Section, StoreProduct } from '@/lib/store-schema';
import type { CompositionResult } from './design-intent';
import { getVariantMapping } from './variant-mapping';

// ── Types ─────────────────────────────────────────────────

export interface EnforcementResult {
  store: Store;
  injectedCount: number;
  matchedCount: number;
  totalNodes: number;
  injectedFamilies: string[];
}

// ── Role → display labels for scaffold content ──────────

const ROLE_LABELS: Record<string, string> = {
  orient: 'Welcome',
  merchandise: 'Shop',
  educate: 'Discover',
  differentiate: 'Why Us',
  reassure: 'Trust',
  engage: 'Explore',
  convert: 'Act Now',
  retain: 'Stay Connected',
};

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

  // ── Step 1: Build the recipe's page section plan ──
  // Filter out sub-components (spacer) and chrome (header/footer)
  // that are already handled separately.
  const recipePlan = nodes
    .map((node, idx) => {
      const family = node.component_id.split('.')[0];
      const mapping = getVariantMapping(node.component_id);
      const sectionType = mapping?.sectionType ?? 'text-banner';
      return { idx, node, family, sectionType };
    })
    .filter(item => {
      // Sub-components (button, commerce-pattern) map to 'spacer' — skip
      if (item.sectionType === 'spacer') return false;
      // Header/footer are always present via normalization — skip
      if (item.family === 'header' || item.family === 'footer') return false;
      return true;
    });

  if (recipePlan.length === 0) {
    return { store, injectedCount: 0, matchedCount: 0, totalNodes, injectedFamilies: [] };
  }

  // ── Step 2: Index existing visible non-chrome sections ──
  const existingEntries = homepage.sections
    .map((s, idx) => ({ section: s, idx, type: s.type }))
    .filter(item => {
      if (!item.section.visible) return false;
      if (item.type === 'header' || item.type === 'footer') return false;
      return true;
    });

  // ── Step 3: Two-pass matching ──
  // Pass 1: Exact componentId match
  // Pass 2: One-to-one type match (each type covers at most one node)

  const sectionUsed = new Set<number>();   // existing section indices that are matched
  const nodeMatched = new Set<number>();   // recipePlan indices that are matched
  const matchMap = new Map<number, number>(); // recipePlanIdx → existing section idx

  // Pass 1: Exact componentId
  for (const rp of recipePlan) {
    if (nodeMatched.has(rp.idx)) continue;
    for (const es of existingEntries) {
      if (sectionUsed.has(es.idx)) continue;
      if (es.section.componentMeta?.componentId === rp.node.component_id) {
        sectionUsed.add(es.idx);
        nodeMatched.add(rp.idx);
        matchMap.set(rp.idx, es.idx);
        break;
      }
    }
  }

  // Pass 2: One-to-one type match
  // Build: type → queue of unmatched recipePlan entries needing this type
  const typeNeeds = new Map<string, number[]>();
  for (const rp of recipePlan) {
    if (nodeMatched.has(rp.idx)) continue;
    const list = typeNeeds.get(rp.sectionType) || [];
    list.push(rp.idx);
    typeNeeds.set(rp.sectionType, list);
  }

  // For each remaining existing section (without componentMeta),
  // try to satisfy ONE type need.
  for (const es of existingEntries) {
    if (sectionUsed.has(es.idx)) continue;
    // Sections with componentMeta were either matched in pass 1 or have
    // a DL ID that doesn't match any recipe node — don't type-match them
    if (es.section.componentMeta?.componentId) continue;

    const needs = typeNeeds.get(es.type);
    if (needs && needs.length > 0) {
      const rpIdx = needs.shift()!;
      sectionUsed.add(es.idx);
      nodeMatched.add(rpIdx);
      matchMap.set(rpIdx, es.idx);
      if (needs.length === 0) typeNeeds.delete(es.type);
      else typeNeeds.set(es.type, needs);
    }
  }

  // ── Step 4: Identify nodes to inject ──
  const nodesToInject = recipePlan.filter(rp => !nodeMatched.has(rp.idx));

  if (nodesToInject.length === 0) {
    return { store, injectedCount: 0, matchedCount: nodeMatched.size, totalNodes, injectedFamilies: [] };
  }

  // ── Step 5: Build scaffold sections for missing nodes ──
  const brandName = store.name || 'Our Brand';
  const brandDesc = store.description || 'Discover our curated collection';
  const products = store.products;
  const theme = store.theme;
  const injectedFamilies: string[] = [];

  const scaffolds = new Map<number, Section>();
  for (const rp of nodesToInject) {
    scaffolds.set(rp.idx, buildScaffoldSection({
      componentId: rp.node.component_id,
      family: rp.family,
      role: rp.node.role,
      sectionType: rp.sectionType,
      brandName,
      brandDesc,
      products,
      theme,
      heroImagePool,
    }));
    if (!injectedFamilies.includes(rp.family)) {
      injectedFamilies.push(rp.family);
    }
  }

  // ── Step 6: Merge in recipe order ──
  const headerSection = homepage.sections.find(s => s.type === 'header');
  const footerSection = homepage.sections.find(s => s.type === 'footer');

  // Collect existing sections NOT matched to any recipe node (AI extras)
  const unmatchedExisting = existingEntries
    .filter(es => !sectionUsed.has(es.idx))
    .map(es => es.section);

  const finalSections: Section[] = [];

  // Header first
  if (headerSection) finalSections.push(headerSection);

  // Sections in recipe order
  for (const rp of recipePlan) {
    if (matchMap.has(rp.idx)) {
      finalSections.push(homepage.sections[matchMap.get(rp.idx)!]);
    } else if (scaffolds.has(rp.idx)) {
      finalSections.push(scaffolds.get(rp.idx)!);
    }
  }

  // Append unmatched existing sections (AI-generated extras not in recipe)
  for (const s of unmatchedExisting) {
    finalSections.push(s);
  }

  // Footer last
  if (footerSection) finalSections.push(footerSection);

  const newStore: Store = {
    ...store,
    pages: store.pages.map(p =>
      p.isHomepage ? { ...p, sections: finalSections } : p
    ),
  };

  return {
    store: newStore,
    injectedCount: nodesToInject.length,
    matchedCount: nodeMatched.size,
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
    id: `enf-${family}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

  // Build type-specific content with role-aware text
  switch (sectionType) {
    case 'hero': {
      const imgs = heroImagePool.slice(0, 3);
      base.content = {
        ...base.content,
        headline: base.content.headline || `Welcome to ${brandName}`,
        subheadline: base.content.subheadline || brandDesc,
        ctaText: 'Shop Now',
        ctaLink: '#',
        alignment: 'center',
        height: 'xl',
        layout: base.content.layout || 'minimal',
        visualPriority: 'headline',
        backgroundTreatment: 'editorial',
        vignette: true,
        heroImages: imgs.map((url, i) => ({
          src: url,
          alt: `${brandName} hero image ${i + 1}`,
          role: ['product-hero', 'editorial-lifestyle', 'brand-atmosphere'][i],
        })),
        carouselEnabled: true,
        carouselInterval: 5,
        badge: base.content.badge || 'NEW COLLECTION',
      };
      base.style = {
        ...base.style,
        backgroundImage: imgs[0],
        overlay: true,
      };
      break;
    }
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
      const roleLabel = ROLE_LABELS[role] || 'Customers';
      base.content = {
        ...base.content,
        headline: base.content.headline || `What ${roleLabel} Say`,
        items: [
          { id: 'enf-t1', quote: `Absolutely love the quality from ${brandName}. Exceeded my expectations in every way.`, author: 'Sarah M.', role: 'Verified Buyer', rating: 5 },
          { id: 'enf-t2', quote: `The attention to detail is remarkable. ${brandName} has become my go-to for gifts.`, author: 'James K.', role: 'Verified Buyer', rating: 5 },
          { id: 'enf-t3', quote: `Fast shipping, beautiful packaging, and the product itself is stunning. Highly recommend.`, author: 'Priya R.', role: 'Verified Buyer', rating: 4 },
        ],
      };
      break;
    }
    case 'cta': {
      const isUrgent = role === 'convert' || componentId.includes('urgency');
      const isEditorial = componentId.includes('editorial');
      base.content = {
        ...base.content,
        headline: base.content.headline || (isUrgent
          ? `Limited Time: ${brandName}`
          : isEditorial
            ? `Experience ${brandName}`
            : `Ready to Explore ${brandName}?`),
        body: base.content.body || (isUrgent
          ? 'Don\'t miss out on our exclusive collection.'
          : brandDesc),
        ctaText: base.content.ctaText || (isUrgent ? 'Shop Now' : 'Discover More'),
        ctaLink: '#',
        alignment: 'center',
      };
      if (base.content.style === undefined) {
        (base.content as Record<string, unknown>).style = isEditorial ? 'outline' : 'solid';
      }
      break;
    }
    case 'newsletter': {
      const isWaitlist = componentId.includes('waitlist');
      base.content = {
        ...base.content,
        headline: base.content.headline || (isWaitlist
          ? `Join the ${brandName} Waitlist`
          : `Join the ${brandName} Community`),
        subtitle: base.content.subtitle || (isWaitlist
          ? 'Be the first to know when we launch.'
          : 'Get early access to new arrivals and exclusive offers.'),
        placeholderText: 'Enter your email',
        buttonText: isWaitlist ? 'Join Waitlist' : 'Subscribe',
      };
      break;
    }
    case 'brand-statement': {
      const img = heroImagePool.length > 1 ? heroImagePool[1] : undefined;
      const isFounder = componentId.includes('founder');
      const isTimeline = componentId.includes('timeline');
      base.content = {
        ...base.content,
        headline: base.content.headline || (isFounder ? 'A Note From Our Founder' : isTimeline ? 'Our Journey' : 'Our Story'),
        body: base.content.body || (isFounder
          ? `When I started ${brandName}, I had one goal: to create products that people genuinely love. Every detail matters to us, and I hope you feel that when you experience our collection.`
          : isTimeline
            ? `From a small studio to a growing brand, ${brandName} has been on a journey driven by passion for quality and design. ${brandDesc}`
            : `${brandDesc} We believe in quality craftsmanship, sustainable materials, and creating pieces that tell a story.`),
        alignment: 'left',
        ...(img ? { backgroundImage: img } : {}),
      };
      break;
    }
    case 'image-gallery': {
      const galleryImages = heroImagePool.slice(0, 4).map((src, i) => ({
        src,
        alt: `${brandName} gallery image ${i + 1}`,
        caption: ['', 'Behind the scenes', 'In the studio', 'Our materials'][i],
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
      const isTrust = family === 'trust';
      const isPromotion = family === 'promotion';
      const isAnnouncement = family === 'announcement';
      base.content = {
        ...base.content,
        headline: base.content.headline || (isTrust
          ? `Trusted by Thousands of ${brandName} Customers`
          : isPromotion
            ? `New Arrivals at ${brandName}`
            : isAnnouncement
              ? `${brandName} — Free Shipping on All Orders`
              : brandName),
        alignment: 'center',
        size: 'md',
      };
      if (isTrust) {
        (base.content as Record<string, unknown>).body = 'Quality guaranteed | Free returns | Secure checkout | 5-star reviews';
      }
      if (isPromotion) {
        (base.content as Record<string, unknown>).body = 'Discover our latest collection of curated products.';
        (base.content as Record<string, unknown>).ctaText = 'Shop Now';
      }
      break;
    }
    case 'faq': {
      const isFeatureBenefits = family === 'feature-benefits';
      if (isFeatureBenefits) {
        base.content = {
          ...base.content,
          headline: base.content.headline || 'Why Choose Us',
          items: [
            { id: 'enf-fb1', question: `What makes ${brandName} products special?`, answer: `Every ${brandName} product is crafted with premium materials and meticulous attention to detail. We partner with skilled artisans who share our commitment to excellence.` },
            { id: 'enf-fb2', question: 'Are your products sustainably made?', answer: 'Sustainability is at the core of everything we do. We use ethically sourced materials, minimal packaging, and work with certified responsible suppliers.' },
            { id: 'enf-fb3', question: 'How do I find the right product for me?', answer: `Our collection is designed to offer something for everyone. Browse our categories or reach out to our team for personalized recommendations.` },
            { id: 'enf-fb4', question: 'What is your quality guarantee?', answer: `We stand behind every product with a comprehensive quality guarantee. If you are not completely satisfied, we will make it right.` },
          ],
        };
      } else {
        base.content = {
          ...base.content,
          headline: base.content.headline || 'Frequently Asked Questions',
          items: [
            { id: 'enf-f1', question: `What makes ${brandName} different?`, answer: `At ${brandName}, we focus on quality craftsmanship and exceptional materials. Every product is carefully curated to meet our high standards.` },
            { id: 'enf-f2', question: 'What is your shipping policy?', answer: 'We offer complimentary shipping on all orders. Standard delivery takes 3-5 business days, with express options available at checkout.' },
            { id: 'enf-f3', question: 'What is your return policy?', answer: 'We accept returns within 30 days of purchase. Items must be in original condition with tags attached.' },
            { id: 'enf-f4', question: 'How can I contact customer support?', answer: 'Reach our team via email or through the contact form. We typically respond within 24 hours.' },
          ],
        };
      }
      break;
    }
    case 'categories': {
      const cats = [...new Set(products.slice(0, 8).map(p => p.category).filter(Boolean))];
      if (cats.length < 3) cats.push('Featured', 'New Arrivals', 'Best Sellers');
      const isCollection = family === 'collection';
      base.content = {
        ...base.content,
        headline: base.content.headline || (isCollection ? 'Our Collections' : 'Shop by Category'),
        items: cats.slice(0, 6).map((name, i) => ({
          id: `enf-cat-${i}`,
          name: name as string,
          slug: (name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          image: heroImagePool[i % heroImagePool.length],
          productCount: Math.max(products.filter(p => p.category === name).length, 4 + Math.floor(Math.random() * 12)),
        })),
        columns: base.content.columns || 3,
      };
      break;
    }
    case 'rich-text': {
      const isEditorialFamily = family === 'editorial';
      const isQuote = componentId.includes('quote');
      if (isQuote) {
        base.content = {
          ...base.content,
          html: `<blockquote style="font-size: 1.5rem; font-style: italic; text-align: center; padding: 2rem 0;">"Quality is never an accident; it is always the result of intelligent effort."</blockquote><p style="text-align: center; color: #666;">— The philosophy behind every ${brandName} product</p>`,
        };
      } else if (isEditorialFamily) {
        base.content = {
          ...base.content,
          html: `<h2>The ${brandName} Difference</h2><p>${brandDesc}</p><p>Every piece in our collection is thoughtfully designed and carefully crafted. We believe in quality over quantity, creating products that stand the test of time.</p><p>Our commitment to excellence extends beyond the products themselves — from the materials we source to the artisans we partner with, every decision reflects our dedication to creating something truly special.</p>`,
        };
      } else {
        base.content = {
          ...base.content,
          html: `<h2>The ${brandName} Difference</h2><p>${brandDesc}</p><p>Every piece in our collection is thoughtfully designed and carefully crafted.</p>`,
        };
      }
      break;
    }
    default: {
      // Generic fallback for unhandled types
      base.content = {
        headline: brandName,
        body: brandDesc,
        alignment: 'center',
      };
    }
  }

  return base;
}
