'use client';

import { useMemo, useState, Fragment, useCallback } from 'react';
import type { Store, Section, PageType, StorePage } from '@/lib/store-schema';
import { renderSection } from './sections';
import {
  CollectionPage,
  ProductDetailPage,
  CartPage,
  CheckoutPage,
} from './template-pages';
import { useCartStore } from '@/lib/cart-store';

// ─── Props ──────────────────────────────────────────────────────────────

export interface StoreRendererProps {
  store: Store;
  onSelectSection?: (sectionId: string | null) => void;
  selectedSectionId?: string | null;
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

function AutoHeader({ store, theme, onNavigate, cartCount }: {
  store: Store;
  theme: Store['theme'];
  onNavigate: (pageId: string) => void;
  cartCount: number;
}) {
  const cartPageId = store.pages.find((p) => p.type === 'cart')?.id;

  return (
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
            const home = store.pages.find((p) => p.isHomepage);
            if (home) onNavigate(home.id);
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
                className="text-sm font-medium transition-colors hover:opacity-70"
                style={{ color: theme.colors.textMuted }}
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
          <button className="md:hidden" style={{ color: theme.colors.textMuted }} aria-label="Menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Auto-generated footer when none exists ────────────────────────────

function AutoFooter({ store, theme }: { store: Store; theme: Store['theme'] }) {
  return (
    <footer
      className="border-t mt-auto"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
        <div>
          <span className="text-sm font-bold" style={{ color: theme.colors.text }}>
            {store.name}
          </span>
          {store.description && (
            <p className="mt-1 text-xs" style={{ color: theme.colors.textMuted }}>
              {store.description}
            </p>
          )}
        </div>
        <p className="text-xs" style={{ color: theme.colors.textMuted }}>
          &copy; {new Date().getFullYear()} {store.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ─── Page Navigation tabs ──────────────────────────────────────────────

function PageTabs({
  store,
  currentPageId,
  onNavigate,
  cartCount,
}: {
  store: Store;
  currentPageId: string;
  onNavigate: (pageId: string) => void;
  cartCount: number;
}) {
  // Only show non-product pages in tabs (product pages are dynamic)
  const visiblePages = store.pages.filter((p) => p.type !== 'product');
  if (visiblePages.length <= 1) return null;

  return (
    <div className="border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-1">
        {visiblePages.map((page) => (
          <button
            key={page.id}
            onClick={() => onNavigate(page.id)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors ${
              page.id === currentPageId
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {page.name}
            {page.type === 'cart' && cartCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#a855f7] px-1 text-[9px] font-bold text-white">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
            {page.id === currentPageId && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#a855f7] rounded-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Template Page Router ──────────────────────────────────────────────

function TemplatePageRenderer({
  store,
  pageType,
  productId,
  onNavigate,
  onViewProduct,
}: {
  store: Store;
  pageType: PageType;
  productId?: string;
  onNavigate: (pageId: string) => void;
  onViewProduct?: (productId: string) => void;
}) {
  const props = { store, onNavigate, onViewProduct };

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

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function StoreRenderer({
  store,
  onSelectSection,
  selectedSectionId,
}: StoreRendererProps) {
  const [currentPageId, setCurrentPageId] = useState<string>(
    () => store.pages.find((p) => p.isHomepage)?.id || store.pages[0]?.id || ''
  );

  // Dynamic product pages — created on-the-fly when clicking a product
  const [dynamicPages, setDynamicPages] = useState<StorePage[]>([]);

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
  const pageType = currentPage?.type;
  const isTemplatePage = !!pageType && pageType !== 'home';

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
    [effectivePages, products]
  );

  // Navigate to a page by ID
   const handleNavigate = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
    onSelectSection?.(null);
  }, [onSelectSection]);

  if (!currentPage) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: theme.colors.background }}>
        <p style={{ color: theme.colors.textMuted }}>No pages to display.</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col font-sans antialiased"
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.body ? `"${theme.fonts.body}", system-ui, sans-serif` : undefined,
      }}
      onClick={() => onSelectSection?.(null)}
    >
      {/* Header */}
      {!isTemplatePage && header
        ? renderSection({ section: header, theme, selectedSectionId, onSelectSection, products, onViewProduct: handleViewProduct, onNavigate: handleNavigate })
        : <AutoHeader store={store} theme={theme} onNavigate={handleNavigate} cartCount={cartCount} />
      }

      {/* Page tabs */}
      <PageTabs store={{ ...store, pages: effectivePages }} currentPageId={currentPageId} onNavigate={handleNavigate} cartCount={cartCount} />

      {/* Main content */}
      <main className="flex-1">
        {isTemplatePage ? (
          <TemplatePageRenderer
            store={{ ...store, pages: effectivePages }}
            pageType={pageType}
            productId={currentPage.productId}
            onNavigate={handleNavigate}
            onViewProduct={handleViewProduct}
          />
        ) : (
          <>
            {body.map((section) => (
              <Fragment key={section.id}>
                {renderSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct: handleViewProduct, onNavigate: handleNavigate })}
              </Fragment>
            ))}
            {body.length === 0 && (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                    This page has no sections yet.
                  </p>
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
