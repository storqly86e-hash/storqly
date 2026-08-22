// ========================================
// Library Prompt Context Builder
// ========================================
// Converts a CompositionResult into injectable prompt text
// that guides the LLM to generate library-aware store JSON.
//
// GAP 1: Injects componentMeta instructions so the AI outputs
// valid componentId on each section, plus the list of valid IDs.

import type { CompositionResult, VariantSummary, ImageArtDirectionSummary, BrandProfile } from './design-intent';
import { getVariantMapping } from './variant-mapping';
import { componentRegistry } from '@/lib/component-registry';

export function buildLibraryPromptContext(ctx: CompositionResult): string {
  const lines: string[] = [];

  // ── Brand context ──────────────────────────────
  lines.push('## Brand Design Intent');
  lines.push(`- Category: ${ctx.brandProfile.category}`);
  lines.push(`- Audience: ${ctx.brandProfile.audience}`);
  lines.push(`- Positioning: ${ctx.brandProfile.positioning}`);
  lines.push(`- Mood: ${ctx.brandProfile.mood}`);
  lines.push(`- Visual energy: ${ctx.brandProfile.visual_energy}`);
  lines.push(`- Price tier: ${ctx.brandProfile.price_tier}`);
  lines.push(`- Conversion priority: ${ctx.brandProfile.conversion_priority}`);
  lines.push('');

  // ── Composition recipe ─────────────────────────
  lines.push('## Page Composition');
  lines.push(`Recipe: ${ctx.recipeName}`);
  lines.push(`Typography system: ${ctx.typographySystem}`);
  lines.push(`Density: ${ctx.densityPreset}`);
  lines.push('');
  lines.push('Page sections (in order):');

  for (const node of ctx.nodes) {
    const mapping = getVariantMapping(node.component_id);
    const summary = ctx.variantSummaries.find(s => s.componentId === node.component_id);
    lines.push(`  ${node.order + 1}. [${node.role}] ${node.component_id} -> section type: ${mapping.sectionType}`);
    if (summary) {
      lines.push(`     Intent: ${summary.intent}`);
      lines.push(`     Layout: ${summary.layout || 'default'}`);
      if (summary.style_hooks?.length) {
        lines.push(`     Style hooks: ${summary.style_hooks.join(', ')}`);
      }
      if (summary.content_rules) {
        const rules = Object.entries(summary.content_rules);
        const rulesStr = rules.map(([k, v]) => `${k}: ${v}`).join('; ');
        lines.push(`     Content rules: ${rulesStr}`);
      }
    }
    lines.push('');
  }

  // ── Design tokens & visual rhythm ────────────────
  if (ctx.tokenCssVars && Object.keys(ctx.tokenCssVars).length > 0) {
    lines.push('## Design Tokens & Visual Rhythm');
    lines.push(`Typography system: ${ctx.typographySystem}, Density preset: ${ctx.densityPreset}`);

    // Summarize type scale tokens
    const typeVars = Object.entries(ctx.tokenCssVars)
      .filter(([k]) => k.startsWith('--sq-type-') && k.endsWith('-font-size'))
      .map(([k, v]) => `  ${k}: ${v}`);
    if (typeVars.length > 0) {
      lines.push('Resolved type scale (font sizes):');
      lines.push(typeVars.join('\n'));
    }

    // Summarize font families
    const fontVars = Object.entries(ctx.tokenCssVars)
      .filter(([k]) => k.startsWith('--sq-font-'));
    if (fontVars.length > 0) {
      lines.push('Font families:');
      lines.push(fontVars.map(([k, v]) => `  ${k}: ${v}`).join('\n'));
    }

    // Summarize spacing
    const spacingVars = Object.entries(ctx.tokenCssVars)
      .filter(([k]) => k.startsWith('--sq-spacing-'));
    if (spacingVars.length > 0) {
      lines.push('Spacing:');
      lines.push(spacingVars.map(([k, v]) => `  ${k}: ${v}`).join('\n'));
    }

    lines.push('');
  }

  if (ctx.sectionRhythm && ctx.sectionRhythm.length > 0) {
    if (!ctx.tokenCssVars || Object.keys(ctx.tokenCssVars).length === 0) {
      lines.push('## Visual Rhythm Plan');
    }
    lines.push('Per-section rhythm (follow these when writing section content):');
    for (const sr of ctx.sectionRhythm) {
      const node = ctx.nodes[sr.nodeIndex];
      const label = node ? `${node.component_id}` : `section ${sr.nodeIndex}`;
      lines.push(`  ${sr.nodeIndex + 1}. ${label}`);
      lines.push(`     density: ${sr.rhythmConfig.density}, surface: ${sr.rhythmConfig.surfaceStyle}, width: ${sr.rhythmConfig.contentWidth}, weight: ${sr.rhythmConfig.visualWeight}`);
      lines.push(`     vertical spacing: ${sr.rhythmConfig.verticalSpacing}`);
    }
    lines.push('');
  }

  // ── GAP 1: componentMeta instructions ────────────
  lines.push('## CRITICAL: componentMeta on Every Section');
  lines.push('Each section object MUST include a componentMeta field with valid library IDs.');
  lines.push('The first section (hero) MUST use the hero variant from the composition above.');
  lines.push('');
  lines.push('Section format:');
  lines.push('{"id":"<uuid>","type":"<type>","content":{...},"style":{...},"visible":true,"componentMeta":{"componentId":"<from list below>","family":"<family>","variant":"<variant>","role":"<role>"}}');
  lines.push('');

  // Build the section-to-componentMeta mapping for the AI
  lines.push('Assign these EXACT componentMeta values to sections:');
  for (let i = 0; i < ctx.nodes.length; i++) {
    const node = ctx.nodes[i];
    const mapping = getVariantMapping(node.component_id);
    const [family, variant] = node.component_id.split('.');
    lines.push(`  Section ${i + 1} (type: ${mapping.sectionType}): componentMeta: {"componentId":"${node.component_id}","family":"${family}","variant":"${variant}","role":"${node.role}"}`);
  }
  lines.push('');

  // ── Image art directions ────────────────────────────
  const artDirs = ctx.imageArtDirections;
  if (artDirs.length > 0) {
    lines.push('## Image Art Direction');
    for (const dir of artDirs) {
      lines.push(`  Section: ${dir.componentId} (${dir.slotType})`);
      if (dir.brief) lines.push(`     Brief: ${dir.brief}`);
      if (dir.aspectRatio) lines.push(`     Aspect ratio: ${dir.aspectRatio}`);
      if (dir.mood?.length) lines.push(`     Mood: ${dir.mood.join(', ')}`);
      if (dir.avoid?.length) lines.push(`     Avoid: ${dir.avoid.join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** Build a content rules summary for a specific variant for the system prompt */
export function buildVariantPromptBlock(summary: VariantSummary, index: number): string {
  const lines: string[] = [];
  lines.push(`### Section ${index}: ${summary.componentId}`);
  lines.push(`Family: ${summary.family}, Variant: ${summary.variant}`);
  lines.push(`Intent: ${summary.intent}`);
  lines.push(`Use this component when: ${summary.use_when.slice(0, 5).join(', ')}`);
  lines.push(`Slots: ${summary.slots?.join(', ')}`);

  if (summary.content_rules) {
    const rules = Object.entries(summary.content_rules);
    const rulesStr = rules.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    lines.push(`Content rules:\n${rulesStr}`);
  }

  if (summary.hero_architecture) {
    lines.push('Hero architecture:');
    lines.push(`  Structure: ${summary.hero_architecture.structure}`);
    lines.push(`  Text: ${summary.hero_architecture.text_placement}`);
    lines.push(`  Product: ${summary.hero_architecture.product_placement}`);
    lines.push(`  Background: ${summary.hero_architecture.background_requirements}`);
  }

  if (summary.image_guidance) {
    lines.push('Image guidance:');
    const entries = Object.entries(summary.image_guidance)
      .filter(([k, v]) => k !== 'prompt_frame')
      .map(([k, v]) => `  ${k}: ${v}`);
    lines.push(entries.join('\n'));
  }

  return lines.join('\n');
}

/** Build the library-aware section of the system prompt for the hero */
export function buildHeroLibraryBlock(summary: VariantSummary): string {
  const lines: string[] = [];
  lines.push(`HERO VARIANT: ${summary.componentId}`);
  lines.push(`This is a ${summary.variant} hero with ${summary.intent.toLowerCase()}.`);
  lines.push(`Layout: ${summary.hero_architecture?.structure ?? summary.layout ?? 'default'}.`);
  lines.push(`Text: ${summary.hero_architecture?.text_placement ?? 'default'}.`);
  lines.push(`Product: ${summary.hero_architecture?.product_placement ?? 'default'}.`);
  if (summary.hero_architecture?.overlay_behavior) {
    lines.push(`Overlay: ${summary.hero_architecture.overlay_behavior}.`);
  }
  if (summary.hero_architecture?.typography_behavior) {
    lines.push(`Typography: ${summary.hero_architecture.typography_behavior}.`);
  }
  if (summary.image_guidance) {
    const bg = summary.image_guidance.background || summary.image_guidance.campaign;
    const prod = summary.image_guidance.product;
    if (bg) lines.push(`Background image: ${bg}`);
    if (prod) lines.push(`Product image: ${prod}`);
  }
  const cr = summary.content_rules;
  if (cr) {
    if (cr.headline_max_words) lines.push(`Max ${cr.headline_max_words} words in headline.`);
    if (cr.subheadline_max_words) lines.push(`Max ${cr.subheadline_max_words} words in subheadline.`);
    if (cr.badge_max_words) lines.push(`Max ${cr.badge_max_words} words in badge.`);
    if (cr.cta_count) lines.push(`CTA: ${cr.cta_count}.`);
  }
  lines.push('The hero MUST have editable HTML text (not baked into images).');
  return lines.join('\n');
}

/** Build image art direction prompt for a specific section */
export function buildImageArtDirectionPrompt(dir: ImageArtDirectionSummary): string {
  const parts: string[] = [];
  if (dir.brief) parts.push(dir.brief);
  if (dir.aspectRatio) parts.push(`Aspect ratio: ${dir.aspectRatio}`);
  if (dir.mood?.length) parts.push(`Mood: ${dir.mood.join(', ')}`);
  if (dir.avoid?.length) parts.push(`Avoid: ${dir.avoid.join(', ')}`);
  return parts.join('. ');
}
