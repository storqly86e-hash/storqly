// Design Library Recovery — Regression Tests
// Tests the non-UI parts of the pipeline

import { describe, it, expect, beforeAll } from 'bun:test';
import { getVariantMapping } from '../variant-mapping';
import { resolveVariantConfig } from '../variant-config-resolver';
import { validateAndFixComponentMeta } from '../componentmeta-validator';
import { componentRegistry } from '@/lib/component-registry';
import { ensureLibraryRegistered } from '../ensure-registered';
import { composeStore } from '../composition';
import type { Store, Section } from '@/lib/store-schema';

function makeSection(type: string, idx: number = 0): Section {
  return { id: `s-${idx}`, type, content: {}, style: {}, visible: true };
}

function makeTheme() {
  return {
    colors: { primary: '#000000', secondary: '#333333', accent: '#666666', background: '#ffffff', surface: '#f5f5f5', text: '#111111', textMuted: '#666666', border: '#e5e5e5' },
    fonts: { heading: 'Inter', body: 'Inter' },
    spacing: 'normal' as const, borderRadius: 'md' as const,
  };
}

function makeStore(sections: Section[]): Store {
  return { id: 'test', name: 'Test', slug: 'test', pages: [{ id: 'p1', name: 'Home', slug: 'home', isHomepage: true, sections, metadata: {} }], products: [], theme: makeTheme(), published: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

describe('Design Library Recovery', () => {
  beforeAll(() => { ensureLibraryRegistered(); });

  describe('Real library component IDs are accepted', () => {
    const ids = ['hero.editorial_product_still_life','hero.split_context_product','hero.fullbleed_copy_safe_area','hero.editorial_masthead','hero.product_stack_vertical','hero.dark_campaign_statement','hero.ingredient_focus','hero.ugc_collage','hero.collection_rail','hero.asymmetric_offset_product','product-grid.luxury_gallery','product-grid.utility_dense','cta.premium_invitation','cta.strong_statement','cta.editorial_invite','cta.urgency_panel','newsletter.split_capture','newsletter.editorial_capture','newsletter.waitlist_capture','testimonials.quote_wall','brand-story.split_art-directed','brand-story.founder_note','gallery.editorial_masonry'];
    for (const id of ids) { it(`accepts: ${id}`, () => { const m = getVariantMapping(id); expect(m.componentId).toBe(id); expect(m.sectionType).not.toBe('spacer'); }); }
  });

  describe('Phantom IDs are rejected', () => {
    const phantoms = ['hero.premium_invitation','hero.minimalist_centered','featured-product.grid_3col','testimonials.cards_3col','cta.full_width_banner','newsletter.standard_form','brand-story.full_width','gallery.masonry_grid','collection.grid_3col','faq.accordion','feature-benefits.icon_rows'];
    for (const id of phantoms) { it(`rejects: ${id}`, () => { expect(componentRegistry.getByComponentId(id)).toBeUndefined(); }); }
  });

  describe('Hero variants produce different CSS configs', () => {
    const variants = ['hero.editorial_product_still_life','hero.split_context_product','hero.editorial_masthead','hero.dark_campaign_statement','hero.product_stack_vertical','hero.fullbleed_copy_safe_area'];
    const configs = new Map<string, string[]>();
    for (const vid of variants) {
      it(`${vid} produces CSS vars`, () => {
        const s = makeSection('hero'); s.componentMeta = { componentId: vid, family: 'hero', variant: vid.split('.')[1] };
        const c = resolveVariantConfig(s, makeTheme()); expect(c).not.toBeNull(); const k = Object.keys(c!.cssVars); expect(k.length).toBeGreaterThan(0); configs.set(vid, k);
      });
    }
    it('configs are differentiated', () => { const strs = Array.from(configs.values()).map(k => k.sort().join(',')); expect(new Set(strs).size).toBeGreaterThanOrEqual(4); });
  });

  describe('CTA variants produce CSS configs', () => {
    for (const vid of ['cta.premium_invitation','cta.strong_statement','cta.urgency_panel','cta.editorial_invite']) {
      it(`${vid} produces CSS vars`, () => { const s = makeSection('cta'); s.componentMeta = { componentId: vid, family: 'cta', variant: vid.split('.')[1] }; const c = resolveVariantConfig(s, makeTheme()); expect(c).not.toBeNull(); expect(Object.keys(c!.cssVars).length).toBeGreaterThan(0); });
    }
  });

  describe('Newsletter variants produce CSS configs', () => {
    for (const vid of ['newsletter.split_capture','newsletter.editorial_capture','newsletter.waitlist_capture']) {
      it(`${vid} produces CSS vars`, () => { const s = makeSection('newsletter'); s.componentMeta = { componentId: vid, family: 'newsletter', variant: vid.split('.')[1] }; const c = resolveVariantConfig(s, makeTheme()); expect(c).not.toBeNull(); expect(Object.keys(c!.cssVars).length).toBeGreaterThan(0); });
    }
  });

  describe('Composition type-compatible mapping', () => {
    it('luxury prompt selects luxury recipe', async () => { const r = await composeStore('premium luxury fashion brand with editorial art direction'); expect(r).not.toBeNull(); expect(r!.recipeId).toContain('luxury'); expect(r!.nodes.length).toBeGreaterThan(0); });
    it('skincare prompt selects appropriate recipe', async () => { const r = await composeStore('natural organic skincare brand with ingredient storytelling'); expect(r).not.toBeNull(); expect(r!.nodes.length).toBeGreaterThan(0); });
    it('fitness prompt selects high-energy recipe', async () => { const r = await composeStore('high-energy performance fitness brand with bold athletic identity'); expect(r).not.toBeNull(); expect(r!.nodes.length).toBeGreaterThan(0); });
  });

  describe('Validator uses type-compatible matching', () => {
    it('hero node maps to hero section only', async () => {
      const r = await composeStore('luxury fashion brand'); expect(r).not.toBeNull();
      const store = makeStore([makeSection('hero',0),makeSection('featured-products',1),makeSection('testimonials',2),makeSection('cta',3),makeSection('newsletter',4)]);
      const { store: v } = validateAndFixComponentMeta(store, r!);
      expect(v.pages[0].sections[0].componentMeta?.family).toBe('hero');
      expect(v.pages[0].sections[3].componentMeta?.family).toBe('cta');
      expect(v.pages[0].sections[4].componentMeta?.family).toBe('newsletter');
    });
    it('incompatible nodes not assigned to wrong sections', async () => {
      const r = await composeStore('organic skincare brand'); expect(r).not.toBeNull();
      const store = makeStore([makeSection('hero',0),makeSection('product-grid',1),makeSection('newsletter',2),makeSection('brand-statement',3),makeSection('testimonials',4)]);
      const { store: v } = validateAndFixComponentMeta(store, r!);
      expect(['hero',undefined]).toContain(v.pages[0].sections[0].componentMeta?.family);
      expect(v.pages[0].sections[2].componentMeta?.family).toBe('newsletter');
    });
  });

  describe('Stores without componentMeta render correctly', () => {
    it('no composition validates without errors', () => { const s = makeStore([makeSection('hero',0),makeSection('featured-products',1),makeSection('newsletter',2)]); const { result: vr } = validateAndFixComponentMeta(s, null); expect(vr.errors.length).toBe(0); });
    it('validator attaches inferred meta', () => { const s = makeStore([makeSection('hero',0),makeSection('cta',1),makeSection('newsletter',2)]); const { result: vr } = validateAndFixComponentMeta(s, null); expect(vr.attachedMissingMeta).toBeGreaterThanOrEqual(2); });
  });

  describe('No isNewComponent points to nonexistent files', () => {
    for (const id of ['hero.asymmetric_offset_product','hero.collection_rail','hero.dark_campaign_statement','hero.ingredient_focus','hero.ugc_collage']) {
      it(`${id} is NOT isNewComponent`, () => { expect(getVariantMapping(id).isNewComponent).toBe(false); });
    }
  });
});
