// ========================================
// Auto-Repair — Bounded repair of stores that fail quality/genericity checks
// ========================================
// Attempts heuristic-only repairs (no AI provider calls).
// Uses composeStore for variant re-composition when needed.
// Always creates copies — never mutates the original store.

import type { Store, Section } from '@/lib/store-schema';
import type { QualityReport } from './quality-guardrails';
import type { GenericityReport } from './genericity-detector';
import { composeStore } from './composition';
import { validateStoreQuality } from './quality-guardrails';
import { detectGenericity } from './genericity-detector';
import { getVariantMapping } from './variant-mapping';

// ── Constants ────────────────────────────────────────────

export const MAX_REPAIR_ATTEMPTS = 2;

// ── Public types ──────────────────────────────────────────

export interface RepairResult {
  store: Store;
  attempts: number;
  qualityReport: QualityReport;
  genericityReport: GenericityReport;
  repaired: boolean;
  repairActions: string[];
}

// ── Helpers ───────────────────────────────────────────────

/** Deep clone a store via structuredClone */
function cloneStore(store: Store): Store {
  return structuredClone(store);
}

/** Get homepage sections from a store */
function getHomepageSections(store: Store): Section[] {
  const homepage = store.pages.find(p => p.isHomepage);
  return homepage?.sections ?? [];
}

/** Set homepage sections on a store (returns new store) */
function setHomepageSections(store: Store, sections: Section[]): Store {
  return {
    ...store,
    pages: store.pages.map(p =>
      p.isHomepage ? { ...p, sections } : p,
    ),
  };
}

const PADDING_OPTIONS: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];

// ── Repair strategies (pure, return modified store copy) ──

/**
 * Vary section spacing to improve visual variety.
 * Alternates paddingY values instead of using the same value everywhere.
 */
function repairSpacingVariety(store: Store): { store: Store; action: string } {
  let storeCopy = cloneStore(store);
  const homepage = storeCopy.pages.find(p => p.isHomepage);
  if (!homepage) return { store: storeCopy, action: 'varied section spacing' };

  const modified = homepage.sections.map((s, i) => {
    if (!s.visible) return s;
    // Alternate padding: sm, lg, md, xl, sm, lg, ...
    const variantIndex = i % 3;
    const newPadding = PADDING_OPTIONS[variantIndex === 0 ? 0 : variantIndex === 1 ? 2 : 1];
    return {
      ...s,
      style: { ...s.style, paddingY: newPadding },
    };
  });

  storeCopy = setHomepageSections(storeCopy, modified);
  return { store: storeCopy, action: 'varied section spacing' };
}

/**
 * Add componentMeta to sections that lack it, using composeStore results.
 */
async function repairVariantMetadata(store: Store, prompt: string): Promise<{ store: Store; action: string }> {
  let storeCopy = cloneStore(store);
  const homepage = storeCopy.pages.find(p => p.isHomepage);
  if (!homepage) return { store: storeCopy, action: 'recomposed section variants' };

  try {
    const compResult = await composeStore(prompt);
    if (!compResult?.variantSummaries || compResult.variantSummaries.length === 0) {
      return { store: storeCopy, action: 'recomposed section variants (no variants returned)' };
    }

    const modified = homepage.sections.map((s, i) => {
      if (!s.visible) return s;
      if (s.componentMeta) return s; // already has metadata

      // Try to find a matching variant summary by role or type
      const node = compResult.nodes[i];
      const variantSummary = node
        ? compResult.variantSummaries.find(vs => vs.componentId === node.component_id)
        : undefined;

      if (variantSummary) {
        return {
          ...s,
          componentMeta: {
            componentId: variantSummary.componentId,
            family: variantSummary.family,
            variant: variantSummary.variant,
            role: node?.role,
          },
        };
      }

      // Fallback: use the i-th variant summary if available
      if (i < compResult.variantSummaries.length) {
        const vs = compResult.variantSummaries[i];
        return {
          ...s,
          componentMeta: {
            componentId: vs.componentId,
            family: vs.family,
            variant: vs.variant,
          },
        };
      }

      return s;
    });

    storeCopy = setHomepageSections(storeCopy, modified);
    return { store: storeCopy, action: 'recomposed section variants' };
  } catch {
    return { store: storeCopy, action: 'recomposed section variants (compose failed)' };
  }
}

/**
 * Re-compose with the original prompt to get different components,
 * then apply the variant metadata to the existing store structure.
 */
async function repairGenericityByRecompose(store: Store, prompt: string): Promise<{ store: Store; action: string }> {
  let storeCopy = cloneStore(store);
  const homepage = storeCopy.pages.find(p => p.isHomepage);
  if (!homepage) return { store: storeCopy, action: 'recomposed store to reduce genericity' };

  try {
    const compResult = await composeStore(prompt);
    if (!compResult?.nodes || compResult.nodes.length === 0) {
      return { store: storeCopy, action: 'recomposed store to reduce genericity (no nodes returned)' };
    }

    const modified = homepage.sections.map((s, i) => {
      if (!s.visible) return s;

      const node = compResult.nodes[i];
      if (!node) return s;

      // Get the variant mapping to find config overrides
      const mapping = getVariantMapping(node.component_id);

      // Apply variant metadata
      const newMeta = {
        componentId: node.component_id,
        family: node.component_id.split('.')[0],
        variant: node.component_id.split('.').slice(1).join('.'),
        role: node.role,
      };

      // Apply config overrides from the variant mapping
      const styleOverrides: Record<string, unknown> = {};
      if (mapping.configOverrides) {
        // Copy style-related overrides into section style
        const styleKeys = ['layout', 'backgroundTreatment', 'vignette', 'visualPriority', 'headlineSize', 'ctaStyle', 'productTreatment', 'badgeStyle'];
        for (const key of styleKeys) {
          if (key in mapping.configOverrides) {
            styleOverrides[key] = mapping.configOverrides[key];
          }
        }
      }

      return {
        ...s,
        componentMeta: newMeta,
        content: {
          ...s.content,
          ...Object.fromEntries(
            Object.entries(mapping.configOverrides ?? {}).filter(([k]) => !['layout', 'backgroundTreatment', 'vignette', 'visualPriority', 'headlineSize', 'ctaStyle', 'productTreatment', 'badgeStyle'].includes(k)),
          ),
        },
        style: { ...s.style, ...styleOverrides } as Section['style'],
      };
    });

    // Also update designLibrary metadata
    storeCopy = {
      ...storeCopy,
      designLibrary: {
        ...(storeCopy.designLibrary ?? {}),
        recipe: compResult.recipeId,
        typographySystem: compResult.typographySystem,
        densityPreset: compResult.densityPreset,
      },
    };

    storeCopy = setHomepageSections(storeCopy, modified);
    return { store: storeCopy, action: 'recomposed store to reduce genericity' };
  } catch {
    return { store: storeCopy, action: 'recomposed store to reduce genericity (compose failed)' };
  }
}

/**
 * Ensure a CTA section exists for commerce effectiveness.
 */
function repairMissingCta(store: Store): { store: Store; action: string } {
  const homepage = store.pages.find(p => p.isHomepage);
  if (!homepage) return { store: cloneStore(store), action: 'added CTA section' };

  const hasCta = homepage.sections.some(s => s.visible && (s.type === 'cta' || s.type === 'newsletter'));
  if (hasCta) return { store: cloneStore(store), action: '' };

  // Create a simple CTA section
  const ctaSection: Section = {
    id: `repair-cta-${Date.now()}`,
    type: 'cta',
    visible: true,
    content: {
      headline: 'Ready to Explore?',
      body: 'Discover our full collection and find your perfect match.',
      ctaText: 'Shop Now',
      ctaLink: '#',
      style: 'solid',
    },
    style: {
      paddingY: 'lg',
      backgroundColor: store.theme.colors.primary,
      textColor: store.theme.colors.background,
    },
  };

  // Insert before the last section (typically footer)
  const sections = [...homepage.sections];
  let lastContentIdx = -1;
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i];
    if (s.visible && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider') {
      lastContentIdx = i;
      break;
    }
  }
  const insertIdx = lastContentIdx >= 0 ? lastContentIdx + 1 : sections.length - 1;
  sections.splice(insertIdx, 0, ctaSection);

  const storeCopy = setHomepageSections(cloneStore(store), sections);
  return { store: storeCopy, action: 'added CTA section' };
}

/**
 * Ensure hero is first visible non-chrome section and footer is last.
 */
function repairSectionOrder(store: Store): { store: Store; action: string } {
  const homepage = store.pages.find(p => p.isHomepage);
  if (!homepage) return { store: cloneStore(store), action: '' };

  let sections = [...homepage.sections];
  let modified = false;
  const actions: string[] = [];

  // Find hero and footer indices
  const heroIdx = sections.findIndex(s => s.visible && s.type === 'hero');
  const footerIdx = sections.findIndex(s => s.visible && s.type === 'footer');

  // Find the position after the header (if any)
  let headerEndIdx = -1;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].type === 'header') {
      headerEndIdx = i;
      break;
    }
  }
  const afterHeader = headerEndIdx >= 0 ? headerEndIdx + 1 : 0;

  // Move hero to right after header if not already there
  if (heroIdx >= 0 && heroIdx !== afterHeader) {
    const [hero] = sections.splice(heroIdx, 1);
    const insertAt = afterHeader > heroIdx ? afterHeader - 1 : afterHeader;
    sections.splice(insertAt, 0, hero);
    modified = true;
    actions.push('moved hero to first position');
  }

  // Move footer to last if not already there
  const newFooterIdx = sections.findIndex(s => s.visible && s.type === 'footer');
  if (newFooterIdx >= 0 && newFooterIdx !== sections.length - 1) {
    const [footer] = sections.splice(newFooterIdx, 1);
    sections.push(footer);
    modified = true;
    actions.push('moved footer to last position');
  }

  if (!modified) return { store: cloneStore(store), action: '' };

  return {
    store: setHomepageSections(cloneStore(store), sections),
    action: actions.join(', '),
  };
}

// ── Main repair function ──────────────────────────────────

export async function attemptAutoRepair(
  store: Store,
  originalPrompt: string,
): Promise<RepairResult> {
  // 1. Run initial quality + genericity checks
  const initialQuality = validateStoreQuality(store);
  const initialGenericity = detectGenericity(store);

  // 2. If both PASS, return immediately
  if (initialQuality.status === 'PASS' && initialGenericity.status === 'PASS') {
    return {
      store,
      attempts: 0,
      qualityReport: initialQuality,
      genericityReport: initialGenericity,
      repaired: false,
      repairActions: [],
    };
  }

  // Track best result
  let bestStore = cloneStore(store);
  let bestQuality = initialQuality;
  let bestGenericity = initialGenericity;
  let bestActions: string[] = [];

  // Helper: compute a composite score (higher = better)
  const compositeScore = (q: QualityReport, g: GenericityReport) =>
    q.overallScore - g.genericityScore * 0.3;

  let bestComposite = compositeScore(bestQuality, bestGenericity);

  // 3. Attempt repairs
  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    let currentStore = cloneStore(bestStore);
    const attemptActions: string[] = [];

    // Always start from the best so far
    const quality = validateStoreQuality(currentStore);
    const genericity = detectGenericity(currentStore);

    // --- Strategy: designCoherence < 0.5: fix section order ---
    if (quality.scores.designCoherence < 0.5) {
      const result = repairSectionOrder(currentStore);
      if (result.action) {
        currentStore = result.store;
        attemptActions.push(result.action);
      }
    }

    // --- Strategy: commerceEffectiveness < 0.5: add CTA ---
    if (quality.scores.commerceEffectiveness < 0.5) {
      const result = repairMissingCta(currentStore);
      if (result.action) {
        currentStore = result.store;
        attemptActions.push(result.action);
      }
    }

    // --- Strategy: visualVariety < 0.5: vary spacing ---
    if (quality.scores.visualVariety < 0.5) {
      const result = repairSpacingVariety(currentStore);
      currentStore = result.store;
      attemptActions.push(result.action);
    }

    // --- Strategy: brandSpecificity < 0.5: add variant metadata ---
    if (quality.scores.brandSpecificity < 0.5) {
      const result = await repairVariantMetadata(currentStore, originalPrompt);
      currentStore = result.store;
      attemptActions.push(result.action);
    }

    // --- Strategy: genericityScore >= 0.65: re-compose ---
    if (genericity.genericityScore >= 0.65) {
      const result = await repairGenericityByRecompose(currentStore, originalPrompt);
      currentStore = result.store;
      attemptActions.push(result.action);
    }

    if (attemptActions.length === 0) {
      // Nothing to repair
      break;
    }

    // Re-run checks
    const newQuality = validateStoreQuality(currentStore);
    const newGenericity = detectGenericity(currentStore);

    // Check if this is the best result
    const newComposite = compositeScore(newQuality, newGenericity);
    if (newComposite > bestComposite) {
      bestStore = currentStore;
      bestQuality = newQuality;
      bestGenericity = newGenericity;
      bestActions = attemptActions;
      bestComposite = newComposite;
    }

    // If both PASS, we're done
    if (newQuality.status === 'PASS' && newGenericity.status === 'PASS') {
      return {
        store: bestStore,
        attempts: attempt + 1,
        qualityReport: bestQuality,
        genericityReport: bestGenericity,
        repaired: true,
        repairActions: bestActions,
      };
    }
  }

  // 4. Return best result even if not perfect
  const bothPass = bestQuality.status === 'PASS' && bestGenericity.status === 'PASS';
  return {
    store: bestStore,
    attempts: Math.min(MAX_REPAIR_ATTEMPTS, bestActions.length > 0 ? MAX_REPAIR_ATTEMPTS : 1),
    qualityReport: bestQuality,
    genericityReport: bestGenericity,
    repaired: bothPass,
    repairActions: bestActions,
  };
}
