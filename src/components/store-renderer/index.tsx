'use client';

import { useEffect, useMemo, useState, Fragment, useCallback } from 'react';
import type { Store, Section, PageType, StorePage, SectionType } from '@/lib/store-schema';
import { renderSection, SocialIcon } from './sections';
import {
  CollectionPage,
  ProductDetailPage,
  CartPage,
  CheckoutPage,
} from './template-pages';
import { useCartStore } from '@/lib/cart-store';
import {
  SECTION_TYPE_ICONS,
  SECTION_TYPE_LABELS,
  ADDABLE_SECTION_TYPES,
} from '@/lib/section-meta';

// Visible build ID for sync debugging — matches the one in page.tsx footer
const BUILD_ID = 'dev';

// ─── Props ──────────────────────────────────────────────────────────────

export interface StoreRendererProps {
  store: Store;
  onSelectSection?: (sectionId: string | null) => void;
  selectedSectionId?: string | null;
  /** External page control (editor mode): when set, renderer syncs to this page ID */
  externalCurrentPageId?: string | null;
  /** Callback when renderer navigates internally (editor mode) */
  onPageChange?: (pageId: string) => void;
  /** Callback when user adds a section from the empty-page picker (editor mode) */
  onAddSectionClick?: (type: SectionType) => void;
}

// ─── Helper: extract header/footer from sections ────────────────────────

function separateHeaderFooter(sections: Section[]): {
  header: Section | null;
  footer: Section | null;
  body: Section[];
} {
  let header: Section | null = null;
  let footer: Section | null = null;
  const body: Section[] = [];

  for (const section of sections) {
    if (!section.visible) continue;
    if (section.type === 'header' && !header) {
      header = section;
    } else if (section.type === 'footer' && !footer) {
      footer = section;
    } else {
      body.push(section);
    }
  }

  return { header, footer, body };
}

// ─── Auto-generated header when none exists ────────────────────────────

function AutoHeader({ store, theme, onNavigate, cartCount, currentPageId }: {
  store: Store;
  theme: Store['theme'];
  onNavigate: (pageId: string) => void;
  cartCount: number;
  currentPageId: string;
}) {
  const cartPageId = store.pages.find((p) => p.type === 'cart')?.id;
  const homePageId = store.pages.find((p) => p.isHomepage)?.id;

  return (
    <>
      {store.announcementText && (
        <div
          className="w-full py-2 text-center text-xs font-medium"
          style={{
            backgroundColor: theme.colors.primary,
            color: '#ffffff',
          }}
        >
          {store.announcementText}
        </div>
      )}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span
          className="cursor-pointer text-lg font-bold tracking-tight transition-opacity hover:opacity-70"
          style={{ color: theme.colors.text }}
          onClick={() => {
            if (homePageId) onNavigate(homePageId);
          }}
        >
          {store.name}
        </span>
        <nav className="hidden items-center gap-6 md:flex">
          {store.pages
            .filter((p) => p.isHomepage || (p.type && p.type !== 'product'))
            .map((page) => (
              <button
                key={page.id}
                onClick={() => onNavigate(page.id)}
                className={`text-sm font-medium transition-colors hover:opacity-70 ${
                  page.id === currentPageId ? 'opacity-100' : ''
                }`}
                style={{ color: page.id === currentPageId ? theme.colors.text : theme.colors.textMuted }}
              >
                {page.name}
              </button>
            ))}
        </nav>
        {/* Mobile nav: show all non-product pages */}
        <nav className="flex items-center gap-4 md:hidden">
          {store.pages
            .filter((p) => p.isHomepage || (p.type && p.type !== 'product'))
            .slice(0, 4)
            .map((page) => (
              <button
                key={page.id}
                onClick={() => onNavigate(page.id)}
                className="text-xs font-medium transition-colors hover:opacity-70"
                style={{ color: page.id === currentPageId ? theme.colors.text : theme.colors.textMuted }}
              >
                {page.name}
              </button>
            ))}
        </nav>
        <div className="flex items-center gap-4">
          <button
            className="relative transition-opacity hover:opacity-70"
            style={{ color: theme.colors.textMuted }}
            onClick={() => cartPageId && onNavigate(cartPageId)}
            aria-label="Cart"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[#a855f7] text-[10px] font-bold text-white">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
      </header>
    </>
  );
}

// ─── Auto-generated footer when none exists ────────────────────────────
// Phase 3B: Rich footer with brand, quick links, support, social icons

function AutoFooter({ store, theme }: { store: Store; theme: Store['theme'] }) {
  const year = new Date().getFullYear();
  const textMuted = theme.colors.textMuted;
  const textPrimary = theme.colors.text;
  const primary = theme.colors.primary;
  const border = theme.colors.border;

  // Derive quick links from store pages
  const homePage = store.pages.find(p => p.isHomepage);
  const shopPage = store.pages.find(p => p.type === 'collection');
  const quickLinks = [
    { label: 'Home', href: homePage ? `#${homePage.slug || ''}` : '#' },
    ...(shopPage ? [{ label: 'Shop', href: `#${shopPage.slug}` }] : []),
  ];

  const supportLinks = [
    { label: 'FAQ', href: '#' },
    { label: 'Shipping', href: '#' },
    { label: 'Returns', href: '#' },
    { label: 'Contact', href: '#' },
  ];

  return (
    <footer
      className="border-t mt-auto"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: border,
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div>
            <span className="text-lg font-bold" style={{ color: textPrimary }}>
              {store.name}
            </span>
            {store.description && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: textMuted }}>
                {store.description}
              </p>
            )}
            {/* Social icons row */}
            <div className="mt-4 flex gap-2.5">
              {['instagram', 'twitter', 'facebook'].map((platform) => (
                <span
                  key={platform}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: primary + '12', color: primary }}
                  title={platform.charAt(0).toUpperCase() + platform.slice(1)}
                >
                  <SocialIcon platform={platform} className="h-4 w-4" />
                </span>
              ))}
            </div>
          </div>

          {/* Quick Links column */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {quickLinks.map(link => (
                <li key={link.label}>
                  <span className="text-sm transition-colors hover:opacity-70 cursor-pointer" style={{ color: textMuted }}>
                    {link.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Support column */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
              Support
            </h4>
            <ul className="space-y-2.5">
              {supportLinks.map(link => (
                <li key={link.label}>
                  <span className="text-sm transition-colors hover:opacity-70 cursor-pointer" style={{ color: textMuted }}>
                    {link.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Powered by column */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
              Powered By
            </h4>
            <p className="text-sm" style={{ color: textMuted }}>
              Built with Storqly AI
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-8 flex flex-col items-center justify-between gap-2 border-t pt-6 sm:flex-row"
          style={{ borderColor: border }}
        >
          <p className="text-xs" style={{ color: textMuted }}>
            &copy; {year} {store.name}. All rights reserved.
          </p>
          <p className="text-[10px] font-mono opacity-30">{BUILD_ID}</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Template Page Router ──────────────────────────────────────────────

function TemplatePageRenderer({
  store,
  page,
  pageType,
  productId,
  onNavigate,
  onViewProduct,
}: {
  store: Store;
  page?: StorePage;
  pageType: PageType;
  productId?: string;
  onNavigate: (pageId: string) => void;
  onViewProduct?: (productId: string) => void;
}) {
  const props = { store, page, onNavigate, onViewProduct };

  switch (pageType) {
    case 'collection':
      return <CollectionPage {...props} />;
    case 'product':
      return <ProductDetailPage key={productId} {...props} productId={productId} />;
    case 'cart':
      return <CartPage {...props} />;
    case 'checkout':
      return <CheckoutPage {...props} />;
    default:
      return null;
  }
}

// ─── Typography + Density CSS Variables (GAP 6) ──────────────────────

/**
 * Resolves typography system and density preset from the store's
 * designLibrary metadata into CSS custom properties that sections
 * can consume via var(--sq-*).
 *
 * Typography systems:
 *   - editorial_serif_sans: serif headings, sans body, looser leading
 *   - modern_geometric: geometric sans for both, tight tracking
 *   - brutalist_mono: monospace headings, sans body, raw feel
 *   - minimal_clean: same sans for both, generous whitespace
 *   - editorial_sans_serif: inverse of editorial_serif_sans
 *
 * Density presets:
 *   - airy: generous padding/margins, larger gaps
 *   - balanced: default spacing
 *   - compact: reduced padding/margins, tighter gaps
 */
function resolveTypographyDensity(store: Store): Record<string, string> {
  const vars: Record<string, string> = {};
  const typo = store.designLibrary?.typographySystem;
  const density = store.designLibrary?.densityPreset;

  // ── Typography systems ──
  // Names come from composition-recipes.json recommended_theme.
  // Aliases (modern_geometric, brutalist_mono, minimal_clean, editorial_sans_serif)
  // are kept for backward compatibility.
  if (typo === 'editorial_serif_sans' || typo === 'editorial_sans_serif') {
    vars['--sq-font-heading'] = 'Georgia, "Times New Roman", serif';
    vars['--sq-heading-weight'] = '400';
    vars['--sq-heading-letter-spacing'] = '-0.01em';
    vars['--sq-heading-line-height'] = '1.15';
    vars['--sq-body-line-height'] = '1.7';
  } else if (typo === 'modern_grotesk' || typo === 'modern_geometric') {
    vars['--sq-font-heading'] = '"Inter", "Helvetica Neue", sans-serif';
    vars['--sq-heading-weight'] = '600';
    vars['--sq-heading-letter-spacing'] = '-0.03em';
    vars['--sq-heading-line-height'] = '1.1';
    vars['--sq-body-line-height'] = '1.55';
  } else if (typo === 'soft_humanist' || typo === 'minimal_clean') {
    vars['--sq-font-heading'] = '"Inter", system-ui, sans-serif';
    vars['--sq-heading-weight'] = '300';
    vars['--sq-heading-letter-spacing'] = '0.005em';
    vars['--sq-heading-line-height'] = '1.25';
    vars['--sq-body-line-height'] = '1.75';
  } else if (typo === 'compressed_utility' || typo === 'brutalist_mono') {
    vars['--sq-font-heading'] = '"Inter", "Helvetica Neue", sans-serif';
    vars['--sq-heading-weight'] = '700';
    vars['--sq-heading-letter-spacing'] = '0.02em';
    vars['--sq-heading-line-height'] = '1.1';
    vars['--sq-heading-text-transform'] = 'uppercase';
    vars['--sq-body-line-height'] = '1.5';
  }

  // ── Density presets ──
  if (density === 'airy') {
    vars['--sq-section-py'] = '6rem';
    vars['--sq-section-px'] = '2rem';
    vars['--sq-grid-gap'] = '2rem';
    vars['--sq-element-gap'] = '1.5rem';
    vars['--sq-text-spacing'] = '0.5rem';
  } else if (density === 'compact') {
    vars['--sq-section-py'] = '2rem';
    vars['--sq-section-px'] = '1rem';
    vars['--sq-grid-gap'] = '0.75rem';
    vars['--sq-element-gap'] = '0.75rem';
    vars['--sq-text-spacing'] = '0.25rem';
  }
  // 'balanced' = default, no overrides needed

  return vars;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function StoreRenderer({
  store,
  onSelectSection,
  selectedSectionId,
  externalCurrentPageId,
  onPageChange,
  onAddSectionClick,
}: StoreRendererProps) {
  // State for section picker visibility on empty pages
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  // Internal page state (used when no external control)
  const [internalPageId, setInternalPageId] = useState<string>(
    () => store.pages.find((p) => p.isHomepage)?.id || store.pages[0]?.id || ''
  );

  // Use external page ID when available, otherwise use internal state
  const currentPageId = externalCurrentPageId ?? internalPageId;

  // Unified page setter that syncs externally when in editor mode
  const setCurrentPageId = useCallback((pageId: string) => {
    if (onPageChange) {
      onPageChange(pageId);
    } else {
      setInternalPageId(pageId);
    }
    onSelectSection?.(null);
  }, [onPageChange, onSelectSection]);

  // Dynamic product pages — created on-the-fly when clicking a product
  const [dynamicPages, setDynamicPages] = useState<StorePage[]>([]);

  // Initialize per-store cart when store ID changes
  const initForStore = useCartStore((s) => s.initForStore);
  useEffect(() => {
    if (store.id) initForStore(store.id);
  }, [store.id, initForStore]);

  const theme = store.theme;
  const products = store.products;
  const cartCount = useCartStore((s) => s.getItemCount());

  // Merge store pages with dynamic product pages
  const effectivePages = useMemo(
    () => [...store.pages, ...dynamicPages],
    [store.pages, dynamicPages]
  );

  const currentPage = useMemo(
    () => effectivePages.find((p) => p.id === currentPageId) || effectivePages[0],
    [effectivePages, currentPageId]
  );

  // Determine if current page is a template page
  // Custom pages are section-based (like home), only collection/cart/checkout/product are templates
  const pageType = currentPage?.type;
  const isTemplatePage = !!pageType && pageType !== 'home' && pageType !== 'custom';

  // Only separate header/footer for non-template pages
  const { header, footer, body } = useMemo(
    () => (isTemplatePage ? { header: null, footer: null, body: [] as Section[] } : separateHeaderFooter(currentPage?.sections || [])),
    [currentPage, isTemplatePage]
  );

  // Navigate to a product detail page (creates dynamically if needed)
  const handleViewProduct = useCallback(
    (productId: string) => {
      // Check if a dynamic page already exists
      const existing = effectivePages.find((p) => p.type === 'product' && p.productId === productId);
      if (existing) {
        setCurrentPageId(existing.id);
        return;
      }
      // Find the product
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      // Create a dynamic product page
      const newPage: StorePage = {
        id: crypto.randomUUID(),
        name: product.name,
        slug: product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        type: 'product',
        isHomepage: false,
        productId: product.id,
        sections: [],
      };
      setDynamicPages((prev) => [...prev, newPage]);
      setCurrentPageId(newPage.id);
    },
    [effectivePages, products, setCurrentPageId]
  );

  // Navigate to a page by ID
  const handleNavigate = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
  }, [setCurrentPageId]);

  // Home page: card click → navigate to Shop/Collection page
  const handleHomeCardClick = useCallback(
    (_productId: string) => {
      const shopPage = store.pages.find((p) => p.type === 'collection');
      if (shopPage) handleNavigate(shopPage.id);
    },
    [store.pages, handleNavigate]
  );

  if (!currentPage) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: theme.colors.background }}>
        <p style={{ color: theme.colors.textMuted }}>No pages to display.</p>
      </div>
    );
  }

  // GAP 6: Resolve typography + density CSS variables from design library
  const typoDensityVars = resolveTypographyDensity(store);
  const hasTypoDensityVars = Object.keys(typoDensityVars).length > 0;

  // Merge typography/density vars into the base theme style.
  // Typography system vars override the theme font when set.
  const baseStyle: Record<string, string | undefined> = {
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    fontFamily: theme.fonts.body ? `"${theme.fonts.body}", system-ui, sans-serif` : undefined,
    '--sq-primary': theme.colors.primary,
    '--sq-secondary': theme.colors.secondary,
    '--sq-accent': theme.colors.accent,
    '--sq-background': theme.colors.background,
    '--sq-surface': theme.colors.surface,
    '--sq-text': theme.colors.text,
    '--sq-text-muted': theme.colors.textMuted,
    '--sq-border': theme.colors.border,
    '--sq-font-heading': theme.fonts.heading ? `"${theme.fonts.heading}", system-ui, sans-serif` : undefined,
    '--sq-font-body': theme.fonts.body ? `"${theme.fonts.body}", system-ui, sans-serif` : undefined,
  };
  // Typography/density vars take precedence (e.g. --sq-font-heading from editorial_serif_sans)
  if (hasTypoDensityVars) {
    Object.entries(typoDensityVars).forEach(([key, value]) => {
      baseStyle[key] = value;
    });
  }

  return (
    <div
      className="min-h-screen flex flex-col font-sans antialiased"
      style={baseStyle as React.CSSProperties}
      onClick={() => onSelectSection?.(null)}
    >
      {/* Header */}
      {!isTemplatePage && header
        ? renderSection({ section: header, theme, selectedSectionId, onSelectSection, products, onViewProduct: handleViewProduct, onNavigate: handleNavigate })
        : <AutoHeader store={{ ...store, pages: effectivePages }} theme={theme} onNavigate={handleNavigate} cartCount={cartCount} currentPageId={currentPageId} />
      }

      {/* Main content */}
      <main className="flex-1">
        {isTemplatePage ? (
          <TemplatePageRenderer
            store={{ ...store, pages: effectivePages }}
            page={currentPage}
            pageType={pageType}
            productId={currentPage.productId}
            onNavigate={handleNavigate}
            onViewProduct={handleViewProduct}
          />
        ) : (
          <>
            {body.map((section) => (
              <Fragment key={section.id}>
                {renderSection({
                  section,
                  theme,
                  selectedSectionId,
                  onSelectSection,
                  products,
                  onViewProduct: handleHomeCardClick,
                  onNavigate: handleNavigate,
                  forceHideAddToCart: true,
                })}
              </Fragment>
            ))}
            {body.length === 0 && (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowSectionPicker(v => !v); }}
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors bg-gray-100 hover:bg-gray-200 cursor-pointer"
                    aria-label="Add a section to this page"
                  >
                    <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                    This page has no sections yet.
                  </p>
                  <p className="mt-1 text-xs" style={{ color: theme.colors.textMuted }}>
                    Click + to choose a section type
                  </p>
                  {showSectionPicker && onAddSectionClick && (
                    <div
                      className="mt-6 mx-auto max-w-xs rounded-xl border bg-white p-2 shadow-lg"
                      style={{ borderColor: theme.colors.border }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-3 gap-1">
                        {ADDABLE_SECTION_TYPES.map((type) => {
                          const Icon = SECTION_TYPE_ICONS[type];
                          const label = SECTION_TYPE_LABELS[type];
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                onAddSectionClick(type);
                                setShowSectionPicker(false);
                              }}
                              className="flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            >
                              <Icon className="h-5 w-5" />
                              <span className="leading-tight text-center">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      {!isTemplatePage && footer
        ? renderSection({ section: footer, theme, selectedSectionId, onSelectSection, products, onNavigate: handleNavigate })
        : <AutoFooter store={store} theme={theme} />
      }
    </div>
  );
}

export default StoreRenderer;
