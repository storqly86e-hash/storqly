// ========================================
// Quality Guardrails — Validates generated stores against quality rules
// ========================================
// Scoring dimensions: coherence, brand specificity, visual variety,
// commerce effectiveness, responsive readiness, component validity.
// Reject rules from ai-guidance.json are checked as heuristics.

import type { Store, Section } from '@/lib/store-schema';
import aiGuidance from '@/data/design-library/ai-guidance.json';

// ── Public types ──────────────────────────────────────────

export interface QualityReport {
  scores: {
    designCoherence: number;
    brandSpecificity: number;
    visualVariety: number;
    commerceEffectiveness: number;
    responsiveReadiness: number;
    componentValidity: number;
  };
  overallScore: number;
  violations: Array<{
    rule: string;
    severity: 'error' | 'warning' | 'info';
    sectionIndex?: number;
    details: string;
  }>;  
  status: 'PASS' | 'WARN' | 'FAIL';
}

// ── Helpers ───────────────────────────────────────────────

function getHomepageSections(store: Store): Section[] {
  const homepage = store.pages.find(p => p.isHomepage);
  return homepage?.sections ?? [];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── Scoring dimensions ────────────────────────────────────

function scoreDesignCoherence(sections: Section[], store: Store): { score: number; violations: QualityReport['violations'] } {
  let score = 1.0;
  const violations: QualityReport['violations'] = [];

  // Check typography system is consistent
  const dl = store.designLibrary;
  if (!dl?.typographySystem) {
    score -= 0.2;
    violations.push({
      rule: 'designCoherence.typography',
      severity: 'warning',
      details: 'No typography system set in designLibrary metadata',
    });
  }

  // Check density preset is set
  if (!dl?.densityPreset) {
    score -= 0.15;
    violations.push({
      rule: 'designCoherence.density',
      severity: 'warning',
      details: 'No density preset set in designLibrary metadata',
    });
  }

  // Check hero is first (skip header)
  const nonChrome = sections.filter(s => s.visible && s.type !== 'header' && s.type !== 'spacer' && s.type !== 'divider');
  if (nonChrome.length > 0 && nonChrome[0].type !== 'hero') {
    score -= 0.25;
    violations.push({
      rule: 'designCoherence.heroFirst',
      severity: 'error',
      sectionIndex: sections.indexOf(nonChrome[0]),
      details: `First visible non-chrome section is '${nonChrome[0].type}', expected 'hero'`,
    });
  }

  // Check footer is last (skip spacer/divider)
  const trailingNonChrome = sections.filter(s => s.visible && s.type !== 'spacer' && s.type !== 'divider');
  if (trailingNonChrome.length > 1) {
    const lastVisible = trailingNonChrome[trailingNonChrome.length - 1];
    if (lastVisible.type !== 'footer') {
      score -= 0.15;
      violations.push({
        rule: 'designCoherence.footerLast',
        severity: 'warning',
        sectionIndex: sections.indexOf(lastVisible),
        details: `Last non-chrome section is '${lastVisible.type}', expected 'footer'`,
      });
    }
  }

  return { score: clamp01(score), violations };
}

function scoreBrandSpecificity(sections: Section[]): { score: number; violations: QualityReport['violations'] } {
  let score = 1.0;
  const violations: QualityReport['violations'] = [];

  const visible = sections.filter(s => s.visible);
  if (visible.length === 0) return { score: 1.0, violations: [] };

  // Check that NOT all sections have the same paddingY
  const paddingValues = visible.map(s => s.style.paddingY ?? 'md');
  const uniquePadding = new Set(paddingValues);
  if (uniquePadding.size === 1) {
    score -= 0.25;
    violations.push({
      rule: 'brandSpecificity.uniformSpacing',
      severity: 'warning',
      details: `All sections have the same paddingY ('${Array.from(uniquePadding)[0]}')`,
    });
  }

  // Check that there are at least 2 different section types (excluding chrome)
  const contentTypes = visible
    .filter(s => s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider')
    .map(s => s.type);
  const uniqueTypes = new Set(contentTypes);
  if (uniqueTypes.size < 2) {
    score -= 0.35;
    violations.push({
      rule: 'brandSpecificity.lowTypeCount',
      severity: 'error',
      details: `Only ${uniqueTypes.size} unique section type(s): [${Array.from(uniqueTypes).join(', ')}]`,
    });
  } else if (uniqueTypes.size <= 2) {
    score -= 0.15;
    violations.push({
      rule: 'brandSpecificity.lowTypeCount',
      severity: 'warning',
      details: `Only 2 unique section types: [${Array.from(uniqueTypes).join(', ')}]`,
    });
  }

  // Check that variantCssVars or componentMeta exists on at least 50% of content sections
  const contentSections = visible.filter(
    s => s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider',
  );
  const sectionsWithMeta = contentSections.filter(
    s => s.componentMeta || (s as Section & { variantCssVars?: Record<string, string> }).variantCssVars,
  );
  const metaRatio = contentSections.length > 0 ? sectionsWithMeta.length / contentSections.length : 1;
  if (metaRatio < 0.5) {
    score -= 0.25;
    violations.push({
      rule: 'brandSpecificity.noVariantMetadata',
      severity: 'warning',
      details: `Only ${Math.round(metaRatio * 100)}% of content sections have variant metadata (need ≥50%)`,
    });
  }

  return { score: clamp01(score), violations };
}

function scoreVisualVariety(sections: Section[]): { score: number; violations: QualityReport['violations'] } {
  let score = 1.0;
  const violations: QualityReport['violations'] = [];

  const visible = sections.filter(s => s.visible);
  if (visible.length === 0) return { score: 1.0, violations: [] };

  // Count unique section types / total sections
  const types = visible.map(s => s.type);
  const uniqueTypes = new Set(types);
  const typeRatio = uniqueTypes.size / visible.length;
  if (typeRatio < 0.3) {
    score -= 0.3;
    violations.push({
      rule: 'visualVariety.lowTypeDiversity',
      severity: 'warning',
      details: `Type diversity ratio is ${typeRatio.toFixed(2)} (${uniqueTypes.size}/${visible.length} unique types)`,
    });
  } else if (typeRatio < 0.5) {
    score -= 0.15;
    violations.push({
      rule: 'visualVariety.lowTypeDiversity',
      severity: 'info',
      details: `Type diversity ratio is ${typeRatio.toFixed(2)} (${uniqueTypes.size}/${visible.length} unique types)`,
    });
  }

  // Check that no section type appears more than 3 times consecutively
  let consecutiveCount = 1;
  for (let i = 1; i < types.length; i++) {
    if (types[i] === types[i - 1]) {
      consecutiveCount++;
      if (consecutiveCount > 3) {
        score -= 0.2;
        violations.push({
          rule: 'visualVariety.consecutiveRepetition',
          severity: 'warning',
          sectionIndex: i,
          details: `Section type '${types[i]}' appears ${consecutiveCount} times consecutively`,
        });
        break;
      }
    } else {
      consecutiveCount = 1;
    }
  }

  // Check for background alternation
  const contentVisible = visible.filter(
    s => s.type !== 'header' && s.type !== 'footer' && s.type !== 'spacer' && s.type !== 'divider',
  );
  if (contentVisible.length > 2) {
    const bgColors = contentVisible.map(s => s.style.backgroundColor ?? null);
    const uniqueBg = new Set(bgColors);
    if (uniqueBg.size <= 1) {
      score -= 0.2;
      violations.push({
        rule: 'visualVariety.uniformBackgrounds',
        severity: 'warning',
        details: 'All content sections have the same background color',
      });
    }
  }

  return { score: clamp01(score), violations };
}

function scoreCommerceEffectiveness(sections: Section[]): { score: number; violations: QualityReport['violations'] } {
  let score = 1.0;
  const violations: QualityReport['violations'] = [];

  const visible = sections.filter(s => s.visible);
  const types = visible.map(s => s.type);

  // Check that at least one CTA or newsletter section exists
  const hasConversion = types.some(t => t === 'cta' || t === 'newsletter');
  if (!hasConversion) {
    score -= 0.3;
    violations.push({
      rule: 'commerceEffectiveness.noConversionSection',
      severity: 'warning',
      details: 'No CTA or newsletter section found — missing conversion opportunity',
    });
  }

  // Check that at least one product section exists
  const hasProduct = types.some(t => t === 'product-grid' || t === 'featured-products');
  if (!hasProduct) {
    score -= 0.35;
    violations.push({
      rule: 'commerceEffectiveness.noProductSection',
      severity: 'error',
      details: 'No product-grid or featured-products section found — missing revenue section',
    });
  }

  // Check that header and footer exist
  const hasHeader = types.includes('header');
  const hasFooter = types.includes('footer');
  if (!hasHeader) {
    score -= 0.15;
    violations.push({
      rule: 'commerceEffectiveness.noHeader',
      severity: 'warning',
      details: 'No header section found',
    });
  }
  if (!hasFooter) {
    score -= 0.15;
    violations.push({
      rule: 'commerceEffectiveness.noFooter',
      severity: 'warning',
      details: 'No footer section found',
    });
  }

  return { score: clamp01(score), violations };
}

function scoreResponsiveReadiness(sections: Section[]): { score: number; violations: QualityReport['violations'] } {
  // Baseline 0.7, deduct for obvious issues
  let score = 0.7;
  const violations: QualityReport['violations'] = [];

  const visible = sections.filter(s => s.visible);

  for (let i = 0; i < visible.length; i++) {
    const s = visible[i];
    const styleStr = JSON.stringify(s.style ?? {});
    const contentStr = JSON.stringify(s.content ?? {});
    const combined = styleStr + ' ' + contentStr;

    // Check for hardcoded pixel widths (e.g., width: "1200px")
    const hardPixelWidths = combined.match(/"width"\s*:\s*"\d+px"/g);
    if (hardPixelWidths && hardPixelWidths.length > 0) {
      score -= 0.1 * Math.min(hardPixelWidths.length, 3);
      violations.push({
        rule: 'responsiveReadiness.hardcodedPixelWidth',
        severity: 'warning',
        sectionIndex: i,
        details: `${hardPixelWidths.length} hardcoded pixel width(s) found in section`,
      });
    }

    // Check product grids have reasonable column counts
    if (s.type === 'product-grid' || s.type === 'featured-products') {
      const cols = (s.content as Record<string, unknown>).columns;
      if (typeof cols === 'number' && cols > 4) {
        score -= 0.1;
        violations.push({
          rule: 'responsiveReadiness.excessiveColumns',
          severity: 'warning',
          sectionIndex: i,
          details: `Product grid has ${cols} columns — may break on mobile`,
        });
      }
    }
  }

  // Check for very long text content that might overflow
  for (let i = 0; i < visible.length; i++) {
    const s = visible[i];
    const content = s.content as Record<string, unknown>;
    // Check headline length
    const headline = content.headline as string | undefined;
    if (headline && headline.length > 120) {
      score -= 0.05;
      violations.push({
        rule: 'responsiveReadiness.longHeadline',
        severity: 'info',
        sectionIndex: i,
        details: `Headline is ${headline.length} chars — may need truncation on mobile`,
      });
    }
  }

  return { score: clamp01(score), violations };
}

function scoreComponentValidity(sections: Section[]): { score: number; violations: QualityReport['violations'] } {
  let score = 1.0;
  const violations: QualityReport['violations'] = [];

  const visible = sections.filter(s => s.visible);

  for (let i = 0; i < visible.length; i++) {
    const s = visible[i];
    const meta = s.componentMeta;

    if (!meta) continue;

    // Check that componentId contains a dot (family.variant format)
    if (meta.componentId && !meta.componentId.includes('.')) {
      score -= 0.2;
      violations.push({
        rule: 'componentValidity.invalidComponentId',
        severity: 'error',
        sectionIndex: i,
        details: `componentId '${meta.componentId}' does not contain a dot (expected 'family.variant' format)`,
      });
    }

    // Check that if componentId exists, variantId also exists (or the variant field)
    if (meta.componentId && !meta.variant && !meta.family) {
      score -= 0.15;
      violations.push({
        rule: 'componentValidity.missingVariantInfo',
        severity: 'warning',
        sectionIndex: i,
        details: `componentId '${meta.componentId}' exists but no variant or family field`,
      });
    }
  }

  return { score: clamp01(score), violations };
}

// ── Reject rules from ai-guidance.json ───────────────────

function checkRejectRules(sections: Section[]): QualityReport['violations'] {
  const violations: QualityReport['violations'] = [];
  const rejectRules = aiGuidance.quality_guardrails?.reject_if ?? [];

  const visible = sections.filter(s => s.visible);
  const types = visible.map(s => s.type);

  // Card-based sections
  const cardBasedTypes = new Set(['product-grid', 'featured-products', 'testimonials', 'categories', 'image-gallery']);

  for (const rule of rejectRules) {
    // 'more than three consecutive card-based sections appear without a layout reset'
    if (rule.includes('consecutive card-based sections')) {
      let consecutiveCards = 0;
      for (let i = 0; i < types.length; i++) {
        if (cardBasedTypes.has(types[i])) {
          consecutiveCards++;
          if (consecutiveCards >= 4) {
            violations.push({
              rule: 'reject.consecutiveCardSections',
              severity: 'error',
              sectionIndex: i,
              details: `${consecutiveCards} consecutive card-based sections without a layout reset`,
            });
            break;
          }
        } else {
          consecutiveCards = 0;
        }
      }
    }

    // 'the same section geometry is repeated solely with a new color'
    if (rule.includes('same section geometry') && rule.includes('new color')) {
      for (let i = 1; i < visible.length; i++) {
        const prev = visible[i - 1];
        const curr = visible[i];
        if (prev.type !== curr.type) continue;

        // Check if layout/content structure is the same, only backgroundColor differs
        const prevStyleNoBg = { ...prev.style, backgroundColor: undefined };
        const currStyleNoBg = { ...curr.style, backgroundColor: undefined };
        const prevContentKeys = Object.keys(prev.content).sort();
        const currContentKeys = Object.keys(curr.content).sort();

        const layoutSame = JSON.stringify(prevStyleNoBg) === JSON.stringify(currStyleNoBg)
          && JSON.stringify(prevContentKeys) === JSON.stringify(currContentKeys);
        const bgDifferent = prev.style.backgroundColor !== curr.style.backgroundColor;

        if (layoutSame && bgDifferent) {
          violations.push({
            rule: 'reject.sameGeometryNewColor',
            severity: 'warning',
            sectionIndex: i,
            details: `Sections ${i - 1} and ${i} have identical structure but different backgroundColor only`,
          });
          break;
        }
      }
    }

    // 'primary CTA is not visible or understandable on mobile' — hard to check without rendering
    if (rule.includes('CTA') && rule.includes('mobile')) {
      violations.push({
        rule: 'reject.mobileCtaVisibility',
        severity: 'info',
        details: 'Cannot verify mobile CTA visibility without rendering — manual review recommended',
      });
    }

    // 'text is baked into the hero image' — heuristic: check if hero has backgroundImage + no text overlay
    if (rule.includes('text is baked into the hero image')) {
      for (let i = 0; i < visible.length; i++) {
        const s = visible[i];
        if (s.type === 'hero') {
          const content = s.content as Record<string, unknown>;
          if (content.backgroundImage && !content.headline && !content.subheadline) {
            violations.push({
              rule: 'reject.textBakedInHeroImage',
              severity: 'error',
              sectionIndex: i,
              details: 'Hero has backgroundImage but no headline/subheadline — text may be baked into image',
            });
          }
        }
      }
    }

    // 'hero background is unrelated to product or brand context'
    // Cannot fully check without semantic analysis, but can flag if hero has a random/placeholder image
    if (rule.includes('hero background is unrelated')) {
      for (let i = 0; i < visible.length; i++) {
        const s = visible[i];
        if (s.type === 'hero') {
          const content = s.content as Record<string, unknown>;
          const bg = content.backgroundImage as string | undefined;
          if (bg && (bg.includes('unsplash') || bg.includes('placeholder') || bg.includes('lorem'))) {
            violations.push({
              rule: 'reject.heroBackgroundUnrelated',
              severity: 'warning',
              sectionIndex: i,
              details: 'Hero uses a generic stock/placeholder image — may be unrelated to product',
            });
          }
        }
      }
    }
  }

  return violations;
}

// ── Main validation function ──────────────────────────────

export function validateStoreQuality(store: Store): QualityReport {
  const sections = getHomepageSections(store);
  const allViolations: QualityReport['violations'] = [];

  const coherence = scoreDesignCoherence(sections, store);
  const specificity = scoreBrandSpecificity(sections);
  const variety = scoreVisualVariety(sections);
  const commerce = scoreCommerceEffectiveness(sections);
  const responsive = scoreResponsiveReadiness(sections);
  const validity = scoreComponentValidity(sections);

  allViolations.push(...coherence.violations);
  allViolations.push(...specificity.violations);
  allViolations.push(...variety.violations);
  allViolations.push(...commerce.violations);
  allViolations.push(...responsive.violations);
  allViolations.push(...validity.violations);

  // Check reject rules from ai-guidance.json
  const rejectViolations = checkRejectRules(sections);
  allViolations.push(...rejectViolations);

  // Weighted average
  const overallScore = clamp01(
    coherence.score * 0.2
    + specificity.score * 0.25
    + variety.score * 0.2
    + commerce.score * 0.15
    + responsive.score * 0.1
    + validity.score * 0.1,
  );

  // Determine status
  const hasError = allViolations.some(v => v.severity === 'error');
  let status: QualityReport['status'];
  if (overallScore < 0.5 || hasError) {
    status = 'FAIL';
  } else if (overallScore < 0.7) {
    status = 'WARN';
  } else {
    status = 'PASS';
  }

  return {
    scores: {
      designCoherence: coherence.score,
      brandSpecificity: specificity.score,
      visualVariety: variety.score,
      commerceEffectiveness: commerce.score,
      responsiveReadiness: responsive.score,
      componentValidity: validity.score,
    },
    overallScore,
    violations: allViolations,
    status,
  };
}
