// ========================================
// Genericity Detector — Identifies when a generated store looks too similar to a generic template
// ========================================
// Measures 4 overlap dimensions: section types, variants, layout, and card styles.
// Produces a single genericityScore and a REJECT/WARN/PASS status.

import type { Store, Section } from '@/lib/store-schema';

// ── Public types ──────────────────────────────────────────

export interface GenericityReport {
  genericityScore: number;
  sectionOverlap: number;
  variantOverlap: number;
  layoutOverlap: number;
  cardStyleOverlap: number;
  details: {
    totalSections: number;
    uniqueSectionTypes: number;
    uniqueComponentIds: number;
    uniqueVariants: number;
    repeatedSectionTypes: Array<{ type: string; count: number }>;
    dominantLayout: string | null;
  };
  status: 'PASS' | 'WARN' | 'REJECT';
}

export const GENERICITY_THRESHOLDS = {
  warn: 0.65,
  reject: 0.8,
} as const;

// ── Common template pattern ───────────────────────────────

const COMMON_TEMPLATE_TYPES = new Set([
  'hero',
  'product-grid',
  'testimonials',
  'cta',
  'newsletter',
  'faq',
  'brand-statement',
  'image-gallery',
]);

// ── Helpers ───────────────────────────────────────────────

function getHomepageSections(store: Store): Section[] {
  const homepage = store.pages.find(p => p.isHomepage);
  return homepage?.sections ?? [];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Count occurrences of each section type */
function countByType(sections: Section[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sections) {
    counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  }
  return counts;
}

// ── Overlap dimensions ────────────────────────────────────

/**
 * sectionOverlap: What fraction of section types match the most common template pattern.
 * High overlap = sections are all from the common/generic set.
 * Score = 1 - (unique_types / total_sections). If all sections are from the common set
 * with no unusual types, overlap is high.
 */
function computeSectionOverlap(sections: Section[]): { overlap: number; uniqueTypes: number; total: number } {
  const visible = sections.filter(s => s.visible && s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider');
  const total = visible.length;
  if (total === 0) return { overlap: 0, uniqueTypes: 0, total: 0 };

  const types = visible.map(s => s.type);
  const uniqueTypes = new Set(types).size;

  // What fraction are from the common template set?
  const commonCount = types.filter(t => COMMON_TEMPLATE_TYPES.has(t)).length;
  const commonRatio = commonCount / total;

  // How many unusual (non-common) types exist?
  const hasUnusual = uniqueTypes > 0 && types.some(t => !COMMON_TEMPLATE_TYPES.has(t));
  const unusualBonus = hasUnusual ? 0.15 : 0;

  // Low unique-to-total ratio = generic
  const diversityRatio = 1 - (uniqueTypes / total);

  // Combine: high commonRatio + low diversity = high overlap
  const overlap = clamp01(commonRatio * 0.7 + diversityRatio * 0.3 - unusualBonus);

  return { overlap, uniqueTypes, total };
}

/**
 * variantOverlap: What fraction of componentMeta.componentId values are empty
 * or the most common default. If most sections have NO componentMeta or use the
 * same variant, overlap is high.
 */
function computeVariantOverlap(sections: Section[]): { overlap: number; uniqueComponentIds: number; uniqueVariants: number } {
  const visible = sections.filter(s => s.visible && s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider');
  const total = visible.length;
  if (total === 0) return { overlap: 0, uniqueComponentIds: 0, uniqueVariants: 0 };

  const componentIds: string[] = [];
  const variants: string[] = [];

  for (const s of visible) {
    const meta = s.componentMeta;
    if (meta?.componentId) {
      componentIds.push(meta.componentId);
    }
    if (meta?.variant) {
      variants.push(meta.variant);
    }
  }

  const uniqueComponentIds = new Set(componentIds).size;
  const uniqueVariants = new Set(variants).size;

  // If most sections lack componentMeta, high overlap (generic)
  const metaCoverage = componentIds.length / total;
  const noMetaPenalty = 1 - metaCoverage;

  // If all componentIds are the same, high overlap
  let variantUniformity = 0;
  if (componentIds.length > 1) {
    const idCounts = new Map<string, number>();
    for (const id of componentIds) {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
    let maxCount = 0;
    idCounts.forEach(count => { if (count > maxCount) maxCount = count; });
    variantUniformity = maxCount / componentIds.length;
  } else if (componentIds.length === 1) {
    variantUniformity = 1.0;
  }

  const overlap = clamp01(noMetaPenalty * 0.5 + variantUniformity * 0.5);

  return { overlap, uniqueComponentIds, uniqueVariants };
}

/**
 * layoutOverlap: How many sections use the default/identical layout.
 * Check section.style for layout clues. If most sections have no special
 * layout config, overlap is high.
 */
function computeLayoutOverlap(sections: Section[]): { overlap: number; dominantLayout: string | null } {
  const visible = sections.filter(s => s.visible && s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider');
  const total = visible.length;
  if (total === 0) return { overlap: 0, dominantLayout: null };

  let sectionsWithCustomLayout = 0;
  const layoutSignatures: string[] = [];

  for (const s of visible) {
    const style = s.style;
    const content = s.content as Record<string, unknown>;

    // Build a layout "signature" from style + content layout clues
    const sigParts: string[] = [];

    if (style.maxWidth) sigParts.push(`mw:${style.maxWidth}`);
    if (style.paddingX) sigParts.push(`px:${style.paddingX}`);
    if (style.borderRadius) sigParts.push(`br:${style.borderRadius}`);
    if (style.backgroundImage) sigParts.push('has-bg-img');
    if (style.overlay) sigParts.push('overlay');

    // Content-level layout clues
    if (content.layout) sigParts.push(`layout:${content.layout}`);
    if (content.alignment) sigParts.push(`align:${content.alignment}`);
    if (content.columns) sigParts.push(`cols:${content.columns}`);
    if (content.height) sigParts.push(`height:${content.height}`);

    const sig = sigParts.length > 0 ? sigParts.join('|') : 'default';
    layoutSignatures.push(sig);

    if (sig !== 'default') {
      sectionsWithCustomLayout++;
    }
  }

  // Default layout ratio (high = generic)
  const defaultRatio = 1 - (sectionsWithCustomLayout / total);

  // Dominant layout concentration
  const sigCounts = new Map<string, number>();
  for (const sig of layoutSignatures) {
    sigCounts.set(sig, (sigCounts.get(sig) ?? 0) + 1);
  }
  let dominantLayout: string | null = null;
  let maxSigCount = 0;
  sigCounts.forEach((count, sig) => {
    if (count > maxSigCount) {
      maxSigCount = count;
      dominantLayout = sig;
    }
  });
  const dominantRatio = maxSigCount / total;

  const overlap = clamp01(defaultRatio * 0.5 + dominantRatio * 0.5);

  return { overlap, dominantLayout };
}

/**
 * cardStyleOverlap: If product sections exist, check if they all use the same card style.
 * Score = 1 if all same, 0 if all different.
 */
function computeCardStyleOverlap(sections: Section[]): number {
  const productSections = sections.filter(
    s => s.visible && (s.type === 'product-grid' || s.type === 'featured-products'),
  );

  if (productSections.length <= 1) {
    // Not enough product sections to measure card style variety
    return productSections.length === 0 ? 0 : 0.5;
  }

  // Extract card style signatures from componentMeta or style
  const cardSigs: string[] = [];
  for (const s of productSections) {
    const meta = s.componentMeta;
    const style = s.style;
    const content = s.content as Record<string, unknown>;

    const parts: string[] = [];
    if (meta?.componentId) parts.push(`cid:${meta.componentId}`);
    if (meta?.variant) parts.push(`var:${meta.variant}`);
    if (style.borderRadius) parts.push(`br:${style.borderRadius}`);
    if (content.columns) parts.push(`cols:${content.columns}`);
    if (style.backgroundColor) parts.push(`bg:${style.backgroundColor}`);

    cardSigs.push(parts.length > 0 ? parts.join('|') : 'default');
  }

  const uniqueSigs = new Set(cardSigs).size;
  const total = cardSigs.length;

  // All same = 1, all different = 0
  if (uniqueSigs === 1) return 1.0;
  if (uniqueSigs === total) return 0.0;
  return 1 - (uniqueSigs / total);
}

// ── Main detection function ───────────────────────────────

export function detectGenericity(store: Store): GenericityReport {
  const sections = getHomepageSections(store);

  // Compute all dimensions
  const sectionResult = computeSectionOverlap(sections);
  const variantResult = computeVariantOverlap(sections);
  const layoutResult = computeLayoutOverlap(sections);
  const cardOverlap = computeCardStyleOverlap(sections);

  // Weighted genericity score
  const genericityScore = clamp01(
    sectionResult.overlap * 0.3
    + variantResult.overlap * 0.35
    + layoutResult.overlap * 0.2
    + cardOverlap * 0.15,
  );

  // Build repeated section types
  const typeCounts = countByType(
    sections.filter(s => s.visible && s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider'),
  );
  const repeatedSectionTypes = Array.from(typeCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Determine status
  let status: GenericityReport['status'];
  if (genericityScore >= GENERICITY_THRESHOLDS.reject) {
    status = 'REJECT';
  } else if (genericityScore >= GENERICITY_THRESHOLDS.warn) {
    status = 'WARN';
  } else {
    status = 'PASS';
  }

  return {
    genericityScore,
    sectionOverlap: sectionResult.overlap,
    variantOverlap: variantResult.overlap,
    layoutOverlap: layoutResult.overlap,
    cardStyleOverlap: cardOverlap,
    details: {
      totalSections: sectionResult.total,
      uniqueSectionTypes: sectionResult.uniqueTypes,
      uniqueComponentIds: variantResult.uniqueComponentIds,
      uniqueVariants: variantResult.uniqueVariants,
      repeatedSectionTypes,
      dominantLayout: layoutResult.dominantLayout,
    },
    status,
  };
}
