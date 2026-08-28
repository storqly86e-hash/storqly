import { NextResponse } from 'next/server';
import { composeStore } from '@/lib/design-library/composition';
import { ensureLibraryRegistered } from '@/lib/design-library/ensure-registered';
import { validateAndFixComponentMeta } from '@/lib/design-library/componentmeta-validator';
import { resolveVariantConfig } from '@/lib/design-library/variant-config-resolver';
import { registerLibraryComponents } from '@/lib/design-library/loader';
import { bridgeSectionStyles } from '@/lib/design-library/style-bridge';
import { normalizeStore } from '@/lib/normalize-store';
import type { Store, StoreTheme } from '@/lib/store-schema';

// Ensure library is loaded
ensureLibraryRegistered();
registerLibraryComponents();

// Minimal theme for testing
const TEST_THEME: StoreTheme = {
  colors: {
    primary: '#000000',
    secondary: '#333333',
    accent: '#c9a96e',
    background: '#ffffff',
    surface: '#f9f9f7',
    text: '#111111',
    textMuted: '#666666',
    border: '#dddddd',
  },
  fonts: { heading: 'Playfair Display', body: 'Inter' },
  spacing: 'normal',
  borderRadius: 'md',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get('prompt') || 'premium luxury fashion store';

  const trace: Record<string, unknown> = { prompt };

  // ── Stage 1: composeStore ──
  try {
    const compResult = await composeStore(prompt);
    if (!compResult) {
      trace['stage1_composeStore'] = { error: 'returned null' };
      return NextResponse.json(trace);
    }
    trace['stage1_composeStore'] = {
      recipe: compResult.recipeName,
      recipeId: compResult.recipeId,
      typography: compResult.typographySystem,
      density: compResult.densityPreset,
      nodeCount: compResult.nodes.length,
      nodes: compResult.nodes.map(n => ({ role: n.role, component_id: n.component_id })),
      tokenCssVarCount: Object.keys(compResult.tokenCssVars || {}).length,
      rhythmCount: (compResult.sectionRhythm || []).length,
    };

    // ── Stage 2: Simulate AI-generated store (minimal, no componentMeta) ──
    const fakeStore: Store = {
      id: 'debug-test', name: 'Test Store', slug: 'test-store',
      description: 'Test', theme: TEST_THEME,
      pages: [{
        id: 'p1', name: 'Home', slug: '', type: 'home', isHomepage: true,
        sections: [
          { id: 's-header', type: 'header', content: { storeName: 'Test' }, style: { paddingY: 'sm' }, visible: true },
          { id: 's-hero', type: 'hero', content: { headline: 'Welcome', subheadline: 'Subtitle', ctaText: 'Shop Now', ctaLink: '/shop', alignment: 'center', height: 'lg' }, style: { paddingY: 'xl' }, visible: true },
          { id: 's-products', type: 'product-grid', content: { heading: 'Our Products' }, style: { paddingY: 'lg' }, visible: true },
          { id: 's-testimonials', type: 'testimonials', content: { heading: 'Reviews' }, style: { paddingY: 'lg' }, visible: true },
          { id: 's-cta', type: 'cta', content: { headline: 'Shop Now', body: 'Discover our collection' }, style: { paddingY: 'lg' }, visible: true },
          { id: 's-newsletter', type: 'newsletter', content: { heading: 'Join Us' }, style: { paddingY: 'lg' }, visible: true },
          { id: 's-footer', type: 'footer', content: {}, style: { paddingY: 'sm' }, visible: true },
        ],
      }],
      products: [], published: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    // ── Stage 3: validateAndFixComponentMeta ──
    const { store: validatedStore, result: vr } = validateAndFixComponentMeta(fakeStore, compResult);
    trace['stage3_componentMeta'] = {
      totalSections: vr.totalSections,
      sectionsWithMeta: vr.sectionsWithMeta,
      validMeta: vr.validMeta, fixedMeta: vr.fixedMeta,
      attachedMissingMeta: vr.attachedMissingMeta, errors: vr.errors,
      sections: validatedStore.pages[0].sections.map(s => ({
        type: s.type, componentMeta: s.componentMeta,
      })),
    };

    // ── Stage 4: resolveVariantConfig per section ──
    const variantResults = validatedStore.pages[0].sections.map(s => {
      if (!s.componentMeta?.componentId) {
        return { type: s.type, componentId: null, resolved: false, reason: 'no componentMeta' };
      }
      const config = resolveVariantConfig(s, TEST_THEME);
      return {
        type: s.type, componentId: s.componentMeta.componentId, resolved: true,
        contentOverrideCount: Object.keys(config.contentOverrides).length,
        styleOverrideCount: Object.keys(config.styleOverrides).length,
        cssVarCount: Object.keys(config.cssVars).length,
        cssVars: config.cssVars, extraClasses: config.extraClasses, cardStyle: config.cardStyle,
      };
    });
    trace['stage4_resolveVariantConfig'] = variantResults;

    // ── Stage 5: designLibrary metadata ──
    trace['stage5_designLibrary'] = validatedStore.designLibrary
      ? { version: validatedStore.designLibrary.version, recipe: validatedStore.designLibrary.recipe,
          typography: validatedStore.designLibrary.typographySystem, density: validatedStore.designLibrary.densityPreset,
          tokenCssVars: validatedStore.designLibrary.compositionResult?.tokenCssVars
            ? Object.keys(validatedStore.designLibrary.compositionResult.tokenCssVars).length + ' vars' : 'none' }
      : { error: 'designLibrary not attached' };

    // ── Stage 6: bridgeSectionStyles ──
    try { bridgeSectionStyles(validatedStore); trace['stage6_bridgeSectionStyles'] = 'OK'; }
    catch (e) { trace['stage6_bridgeSectionStyles'] = { error: String(e) }; }

    // ── Stage 7: normalizeStore preserves DL data ──
    try {
      const normResult = normalizeStore(validatedStore, prompt);
      if (normResult) {
        const ns = normResult.store;
        trace['stage7_normalizeStore'] = {
          designLibraryPresent: !!ns.designLibrary, recipe: ns.designLibrary?.recipe,
          sectionsWithMeta: ns.pages[0].sections.filter(s => s.componentMeta?.componentId).length,
          totalSections: ns.pages[0].sections.length,
          metaDetails: ns.pages[0].sections.map(s => ({
            type: s.type, componentId: s.componentMeta?.componentId || 'MISSING',
          })),
        };
      } else { trace['stage7_normalizeStore'] = { error: 'null' }; }
    } catch (e) { trace['stage7_normalizeStore'] = { error: String(e) }; }

    // ── Verdict ──
    const contentSections = variantResults.filter(r => !['header','footer','spacer','divider'].includes(r.type));
    const allHaveVars = contentSections.every(r => r.resolved && (r as any).cssVarCount > 0);
    trace['verdict'] = {
      allContentSectionsHaveDL: allHaveVars,
      totalContentSections: contentSections.length,
      sectionsWithZeroVars: contentSections.filter(r => (r as any).cssVarCount === 0).map(r => ({ type: r.type, componentId: (r as any).componentId })),
      status: allHaveVars ? 'ALL_GREEN' : 'ISSUES_FOUND',
    };

  } catch (e) {
    trace['error'] = String(e);
    trace['stack'] = (e as Error).stack?.substring(0, 500);
  }

  return NextResponse.json(trace);
}
