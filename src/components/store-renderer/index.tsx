'use client';

import { useMemo, useState, Fragment } from 'react';
import type { Store, Section, StorePage } from '@/lib/store-schema';
import { renderSection } from './sections';

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

function AutoHeader({ store, theme, selectedSectionId, onSelectSection }: {
  store: Store;
  theme: Store['theme'];
  selectedSectionId?: string | null;
  onSelectSection?: (id: string | null) => void;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span className="text-lg font-bold tracking-tight" style={{ color: theme.colors.text }}>
          {store.name}
        </span>
        <nav className="hidden items-center gap-6 md:flex">
          {store.pages.map((page) => (
            <span
              key={page.id}
              className="cursor-pointer text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: theme.colors.textMuted }}
            >
              {page.name}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <svg className="h-5 w-5" style={{ color: theme.colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="relative">
            <svg className="h-5 w-5" style={{ color: theme.colors.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </span>
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

// ─── Page Navigation (for non-homepage pages) ──────────────────────────

function PageTabs({
  store,
  currentPageId,
  onNavigate,
}: {
  store: Store;
  currentPageId: string;
  onNavigate: (pageId: string) => void;
}) {
  if (store.pages.length <= 1) return null;

  return (
    <div className="border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-1">
        {store.pages.map((page) => (
          <button
            key={page.id}
            onClick={() => onNavigate(page.id)}
            className={`relative whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors ${
              page.id === currentPageId
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {page.name}
            {page.id === currentPageId && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#a855f7] rounded-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
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

  const theme = store.theme;
  const products = store.products;

  const currentPage = useMemo(
    () => store.pages.find((p) => p.id === currentPageId) || store.pages[0],
    [store.pages, currentPageId]
  );

  const { header, footer, body } = useMemo(
    () => separateHeaderFooter(currentPage?.sections || []),
    [currentPage]
  );

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
      {header
        ? renderSection({ section: header, theme, selectedSectionId, onSelectSection, products })
        : <AutoHeader store={store} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} />
      }

      {/* Page tabs (only if multiple pages) */}
      <PageTabs store={store} currentPageId={currentPageId} onNavigate={setCurrentPageId} />

      {/* Main content */}
      <main className="flex-1">
        {body.map((section) => (
          <Fragment key={section.id}>
            {renderSection({ section, theme, selectedSectionId, onSelectSection, products })}
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
      </main>

      {/* Footer */}
      {footer
        ? renderSection({ section: footer, theme, selectedSectionId, onSelectSection, products })
        : <AutoFooter store={store} theme={theme} />
      }
    </div>
  );
}

export default StoreRenderer;
