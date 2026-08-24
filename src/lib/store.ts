import { create } from 'zustand';
import type { Store, StorePage, Section, SectionStyle, ChatMessage, ChatEditOperation, SectionType } from './store-schema';
import { createBlankStore } from './store-schema';

// Shallow value equality check (for client-side change detection)
function valuesEqualShallow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a === 'string' && typeof b === 'string') {
    if (/^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)) return a.toLowerCase() === b.toLowerCase();
    return a === b;
  }
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
  return false;
}

// All valid section types — used to sanitize AI-generated operations
const VALID_SECTION_TYPES: SectionType[] = ['hero','featured-products','product-grid','text-banner','image-gallery','testimonials','newsletter','faq','cta','categories','spacer','divider','rich-text','header','footer'];
function sanitizeSectionType(type: string): SectionType {
  return VALID_SECTION_TYPES.includes(type as SectionType) ? (type as SectionType) : 'rich-text';
}

// ─── Section content defaults ──────────────────────────────────
// Ensures every section has the minimum required content fields.
// If the AI generates a section with empty/missing content, these
// defaults prevent invisible/blank sections in the preview.

const SECTION_CONTENT_DEFAULTS: Record<string, Record<string, unknown>> = {
  'hero': { headline: 'New Section', subheadline: '', ctaText: 'Shop Now', alignment: 'center', height: 'md' },
  'text-banner': { headline: 'New Section', body: '', alignment: 'center', size: 'md' },
  'rich-text': { html: '<p>Content coming soon.</p>' },
  'featured-products': { headline: 'Featured Products', productIds: [], columns: 3, showPrice: true, showAddToCart: true },
  'product-grid': { columns: 3, showPrice: true, showAddToCart: true },
  'testimonials': { headline: 'Customer Reviews', items: [] },
  'image-gallery': { images: [], columns: 3, gap: 'md' },
  'faq': { headline: 'FAQ', items: [] },
  'cta': { headline: 'Take Action', ctaText: 'Learn More', style: 'solid' },
  'categories': { items: [], columns: 3 },
  'newsletter': { headline: 'Stay in Touch', buttonText: 'Subscribe' },
  'spacer': { height: 'md' },
  'divider': {},
  'header': { storeName: 'Store', showSearch: true, showCart: true, menuItems: [] },
  'footer': { storeName: 'Store', columns: [] },
};

// ─── Hero carousel backfill (client-side migration) ─────────────
// Ensures every store's hero section has 3 rotating images,
// even for stores generated before the heroImages feature was added.
const HERO_CAROUSEL_IMAGES: Record<string, string[]> = {
  'skincare/beauty/spa': [
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1400',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400',
    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1400',
  ],
  'fashion/clothing/apparel': [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1400',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1400',
  ],
  'jewelry/watches/accessories': [
    'https://images.unsplash.com/photo-1515562141589-67f0d569b6c3?w=1400',
    'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1400',
    'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=1400',
  ],
  'food/coffee/bakery': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1400',
    'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=1400',
    'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=1400',
  ],
  'furniture/home/decor': [
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1400',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1400',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1400',
  ],
  'electronics/tech/gadgets': [
    'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1400',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1400',
  ],
  'general/lifestyle': [
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400',
    'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=1400',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1400',
  ],
};
const DEFAULT_HERO_IMAGES = HERO_CAROUSEL_IMAGES['general/lifestyle'];

function pickHeroCategory(name: string, description: string): string[] {
  const text = `${name} ${description}`.toLowerCase();
  for (const [cat, urls] of Object.entries(HERO_CAROUSEL_IMAGES)) {
    const parts = cat.split('/');
    if (parts.some(p => text.includes(p))) return urls;
  }
  return DEFAULT_HERO_IMAGES;
}

function ensureHeroCarousel(store: Store): Store {
  let modified = false;
  const heroPool = pickHeroCategory(store.name || '', store.description || '');
  const storeName = store.name || 'Store';
  const pages = store.pages.map(page => {
    const sections = page.sections.map(section => {
      if (section.type !== 'hero' || section.visible === false) return section;
      const content = section.content as Record<string, unknown>;
      const style = section.style as Record<string, unknown>;
      // Check if heroImages needs backfill
      const existing = content.heroImages;
      if (Array.isArray(existing) && existing.length >= 2) return section;
      // Backfill with 3 images
      const images = heroPool.slice(0, 3).map((url, i) => ({
        src: url,
        alt: `${storeName} hero image ${i + 1}`,
        role: ['product-hero', 'editorial-lifestyle', 'brand-atmosphere'][i] as string,
      }));
      content.heroImages = images;
      content.carouselEnabled = true;
      content.carouselInterval = 5;
      // Set backgroundImage fallback
      if (!style.backgroundImage || typeof style.backgroundImage !== 'string') {
        style.backgroundImage = heroPool[0];
      }
      modified = true;
      return { ...section, content, style };
    });
    return { ...page, sections };
  });
  return modified ? { ...store, pages } : store;
}

function ensureSectionContent(section: Section): Section {
  const defaults = SECTION_CONTENT_DEFAULTS[section.type];
  if (!defaults) return section; // Unknown type — content stays as-is

  const merged: Record<string, unknown> = { ...defaults };
  if (section.content && typeof section.content === 'object') {
    // Only copy over non-empty values from the AI-generated content.
    // This prevents empty strings/arrays from overwriting defaults.
    for (const [key, val] of Object.entries(section.content)) {
      if (val !== undefined && val !== null && val !== '') {
        if (Array.isArray(val)) {
          if (val.length > 0) merged[key] = val;
        } else {
          merged[key] = val;
        }
      }
    }
  }
  return { ...section, content: merged };
}

// ─── Broken Store Detection ──────────────────────────────────────
// Detects stores that ended up in a broken/incomplete state after
// a server crash mid-generation. This prevents silently showing a
// broken "1-section New Section placeholder" store to the user.

function isPlaceholderSection(section: Section): boolean {
  const content = section.content as Record<string, unknown> | undefined
  if (!content) return true
  // Check for default placeholder content that indicates no real generation
  const headline = String(content.headline || '')
  const subheadline = String(content.subheadline || content.body || '')
  return (
    headline === 'New Section' &&
    (subheadline === '' || subheadline === 'Click to edit this section' || subheadline === 'Click to edit')
  )
}

/**
 * Checks if a store appears to be in a broken/incomplete generation state.
 * Returns true if the homepage has 0 sections, or only placeholder sections.
 */
export function isStoreBroken(store: Store): boolean {
  const homePage = store.pages.find(p => p.isHomepage)
  if (!homePage) return true

  const visibleSections = homePage.sections.filter(s => s.visible !== false)
  if (visibleSections.length === 0) return true

  // If ALL visible sections are placeholders, it's broken
  const allPlaceholder = visibleSections.every(isPlaceholderSection)
  if (allPlaceholder && visibleSections.length <= 2) return true

  return false
}

export type AppView = 'landing' | 'editor';

interface StoreEditorState {
  // App-level view
  view: AppView;
  setView: (view: AppView) => void;

  // The store being edited — single source of truth
  store: Store | null;
  setStore: (store: Store) => void;

  // Loading state for AI generation
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;

  // Generation progress message
  generationStatus: string;
  setGenerationStatus: (msg: string) => void;

  // Selected section for visual editing
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;

  // Current page selected in the editor (synced with preview)
  editorCurrentPageId: string | null;
  setEditorCurrentPageId: (id: string | null) => void;

  // Chat messages
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  // Apply chat edit operations to the store
  applyOperations: (operations: ChatEditOperation[]) => void;

  // Visual editor operations
  updateSectionContent: (pageId: string, sectionId: string, content: Record<string, unknown>) => void;
  updateSectionStyle: (pageId: string, sectionId: string, style: Partial<SectionStyle>) => void;
  updateTheme: (theme: Partial<Store['theme']>) => void;
  updateProduct: (productId: string, data: Partial<Store['products'][0]>) => void;
  addSection: (pageId: string, section: Section, index?: number) => void;
  removeSection: (pageId: string, sectionId: string) => void;
  moveSection: (pageId: string, fromIndex: number, toIndex: number) => void;
  updateStoreName: (name: string) => void;
  addCustomPage: (name: string) => string | null; // returns new page ID or null
  removeCustomPage: (pageId: string) => void;
  renameCustomPage: (pageId: string, name: string) => void;

  // Set store with fallback flag (used when generation fails)
  setStoreWithFallback: (store: Store, isFallback: boolean, reason: string) => void;

  // Whether the current store is a fallback (not AI-generated)
  isFallbackStore: boolean;
  fallbackReason: string;
  setIsFallbackStore: (v: boolean, reason?: string) => void;

  // Publish state
  isPublishing: boolean;
  setIsPublishing: (v: boolean) => void;
  isPublished: boolean;
  setIsPublished: (v: boolean) => void;

  // Initialize / reset
  initNewStore: (name: string) => void;
  reset: () => void;
}

export const useStoreEditor = create<StoreEditorState>((set, get) => ({
  view: 'landing',
  setView: (view) => set({ view }),

  store: null,
  setStore: (store) => set({
    store: ensureHeroCarousel(store),
    view: 'editor',
    editorCurrentPageId: store.pages.find((p) => p.isHomepage)?.id || store.pages[0]?.id || null,
    selectedSectionId: null,
  }),
  setStoreWithFallback: (store, isFallback, reason) => set({
    store: ensureHeroCarousel(store),
    view: 'editor',
    isFallbackStore: isFallback,
    fallbackReason: reason || '',
    isGenerating: false,
    generationStatus: '',
    editorCurrentPageId: store.pages.find((p) => p.isHomepage)?.id || store.pages[0]?.id || null,
  }),

  isGenerating: false,
  setIsGenerating: (v) => set({ isGenerating: v }),

  generationStatus: '',
  setGenerationStatus: (msg) => set({ generationStatus: msg }),

  selectedSectionId: null,
  setSelectedSectionId: (id) => set({ selectedSectionId: id }),

  editorCurrentPageId: null,
  setEditorCurrentPageId: (id) => set({ editorCurrentPageId: id, selectedSectionId: null }),

  chatMessages: [],
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [] }),

  // Apply operations from chat AI — with change detection
  applyOperations: (operations) => {
    const { store } = get();
    if (!store || operations.length === 0) return;

    let updatedStore = { ...store, updatedAt: new Date().toISOString() };
    let hadEffect = false;

    for (const op of operations) {
      switch (op.type) {
        case 'update-theme': {
          const p = op.payload;
          const colorsChanged = !!p.colors && Object.keys(p.colors).some(k => p.colors![k] !== updatedStore.theme.colors[k as keyof typeof p.colors]);
          const fontsChanged = !!p.fonts && Object.keys(p.fonts).some(k => p.fonts![k] !== updatedStore.theme.fonts[k as keyof typeof p.fonts]);
          const otherChanged = Object.keys(p).some(k => {
            if (k === 'colors' || k === 'fonts') return false;
            return (p as Record<string, unknown>)[k] !== (updatedStore as unknown as Record<string, unknown>)[k];
          });
          if (colorsChanged || fontsChanged || otherChanged) {
            hadEffect = true;
            updatedStore = {
              ...updatedStore,
              theme: {
                ...updatedStore.theme,
                ...p,
                colors: { ...updatedStore.theme.colors, ...p.colors },
                fonts: { ...updatedStore.theme.fonts, ...p.fonts },
              },
            };
          }
          break;
        }

        case 'update-section': {
          const { sectionId, content, style } = op.payload;
          let sectionFound = false;
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((page) => ({
              ...page,
              sections: page.sections.map((s) => {
                if (s.id !== sectionId) return s;
                sectionFound = true;
                // Check if content/style would actually change
                const contentChanged = content && Object.keys(content).some(k => !valuesEqualShallow(content[k], (s.content as Record<string, unknown>)[k]));
                const styleChanged = style && Object.keys(style).some(k => !valuesEqualShallow(style[k], (s.style as Record<string, unknown>)[k]));
                if (contentChanged || styleChanged) {
                  hadEffect = true;
                  return {
                    ...s,
                    content: content ? { ...s.content, ...content } : s.content,
                    style: style ? { ...s.style, ...style } : s.style,
                  };
                }
                return s;
              }),
            })),
          };
          if (!sectionFound) {
            console.warn('[applyOperations] sectionId not found on client:', sectionId);
          }
          break;
        }

        case 'add-section': {
          const { pageId, section, index } = op.payload;
          // Sanitize: coerce unknown section types to 'rich-text' to prevent crashes
          // Then ensure content has required defaults (prevents blank sections)
          const sanitized = ensureSectionContent({ ...section, type: sanitizeSectionType(section.type) });
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((page) => {
              if (page.id !== pageId) return page;
              const sections = [...page.sections];
              if (index !== undefined) {
                sections.splice(index, 0, sanitized);
              } else {
                sections.push(sanitized);
              }
              return { ...page, sections };
            }),
          };
          break;
        }

        case 'remove-section': {
          const { pageId, sectionId } = op.payload;
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((page) => ({
              ...page,
              sections: page.sections.filter((s) => s.id !== sectionId),
            })),
          };
          break;
        }

        case 'reorder-sections': {
          const { pageId, sectionIds } = op.payload;
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((page) => {
              if (page.id !== pageId) return page;
              const sectionMap = new Map(page.sections.map((s) => [s.id, s]));
              const reordered = sectionIds.map((id) => sectionMap.get(id)!).filter(Boolean);
              return { ...page, sections: reordered };
            }),
          };
          break;
        }

        case 'update-page': {
          const { pageId, name, slug } = op.payload;
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((p) =>
              p.id === pageId ? { ...p, ...(name && { name }), ...(slug && { slug }) } : p
            ),
          };
          break;
        }

        case 'add-product': {
          updatedStore = {
            ...updatedStore,
            products: [...updatedStore.products, op.payload],
          };
          break;
        }

        case 'update-product': {
          const { productId, data } = op.payload;
          updatedStore = {
            ...updatedStore,
            products: updatedStore.products.map((p) =>
              p.id === productId ? { ...p, ...data } : p
            ),
          };
          break;
        }

        case 'remove-product': {
          updatedStore = {
            ...updatedStore,
            products: updatedStore.products.filter((p) => p.id !== op.payload.productId),
          };
          break;
        }

        case 'bulk-update': {
          updatedStore = {
            ...updatedStore,
            ...op.payload,
            theme: op.payload.theme
              ? { ...updatedStore.theme, ...op.payload.theme, colors: { ...updatedStore.theme.colors, ...op.payload.theme.colors }, fonts: { ...updatedStore.theme.fonts, ...op.payload.theme.fonts } }
              : updatedStore.theme,
          };
          break;
        }

        case 'add-page': {
          const { name, slug, sections } = op.payload;
          // Sanitize section types AND ensure content defaults in page payload
          const sanitizedSections = (sections || []).map((s: any) =>
            ensureSectionContent({ ...s, type: sanitizeSectionType(s.type) })
          );
          const newPage: StorePage = {
            id: crypto.randomUUID(),
            name,
            slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            type: 'custom',
            isHomepage: false,
            sections: sanitizedSections,
          };
          updatedStore = {
            ...updatedStore,
            pages: [...updatedStore.pages, newPage],
          };
          break;
        }

        case 'remove-page': {
          const { pageId } = op.payload;
          // Only remove custom pages, never remove home/collection/cart/checkout
          const target = updatedStore.pages.find(p => p.id === pageId);
          if (target && target.type === 'custom') {
            updatedStore = {
              ...updatedStore,
              pages: updatedStore.pages.filter(p => p.id !== pageId),
            };
          }
          break;
        }

        case 'rename-page': {
          const { pageId, name, slug } = op.payload;
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map(p =>
              p.id === pageId
                ? { ...p, name, ...(slug ? { slug } : { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }) }
                : p
            ),
          };
          break;
        }
      }
    }

    if (hadEffect) {
      set({ store: updatedStore });
    } else {
      console.log('[applyOperations] All operations were no-ops — state not updated');
    }
  },

  // Visual editor operations
  updateSectionContent: (pageId, sectionId, content) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map((page) => ({
          ...page,
          sections: page.sections.map((s) =>
            s.id === sectionId ? { ...s, content: { ...s.content, ...content } } : s
          ),
        })),
      },
    });
  },

  updateSectionStyle: (pageId, sectionId, style) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map((page) => ({
          ...page,
          sections: page.sections.map((s) =>
            s.id === sectionId ? { ...s, style: { ...s.style, ...style } } : s
          ),
        })),
      },
    });
  },

  updateTheme: (theme) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        theme: {
          ...store.theme,
          ...theme,
          colors: theme.colors ? { ...store.theme.colors, ...theme.colors } : store.theme.colors,
          fonts: theme.fonts ? { ...store.theme.fonts, ...theme.fonts } : store.theme.fonts,
        },
      },
    });
  },

  updateProduct: (productId, data) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        products: store.products.map((p) =>
          p.id === productId ? { ...p, ...data } : p
        ),
      },
    });
  },

  addSection: (pageId, section, index) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map((page) => {
          if (page.id !== pageId) return page;
          const sections = [...page.sections];
          if (index !== undefined) {
            sections.splice(index, 0, section);
          } else {
            sections.push(section);
          }
          return { ...page, sections };
        }),
      },
    });
  },

  removeSection: (pageId, sectionId) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map((page) => ({
          ...page,
          sections: page.sections.filter((s) => s.id !== sectionId),
        })),
      },
    });
  },

  moveSection: (pageId, fromIndex, toIndex) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map((page) => {
          if (page.id !== pageId) return page;
          const sections = [...page.sections];
          const [moved] = sections.splice(fromIndex, 1);
          sections.splice(toIndex, 0, moved);
          return { ...page, sections };
        }),
      },
    });
  },

  updateStoreName: (name) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        updatedAt: new Date().toISOString(),
      },
    });
  },

  addCustomPage: (name) => {
    const { store } = get();
    if (!store) return null;
    const id = crypto.randomUUID();
    const newPage: StorePage = {
      id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      type: 'custom',
      isHomepage: false,
      sections: [],
    };
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: [...store.pages, newPage],
      },
      editorCurrentPageId: id,
      selectedSectionId: null,
    });
    return id;
  },

  removeCustomPage: (pageId) => {
    const { store, editorCurrentPageId } = get();
    if (!store) return;
    const target = store.pages.find(p => p.id === pageId);
    if (!target || target.type !== 'custom') return; // Only custom pages
    const remaining = store.pages.filter(p => p.id !== pageId);
    // If we deleted the currently active page, switch to home
    const homePage = remaining.find(p => p.isHomepage);
    const newCurrentPage = editorCurrentPageId === pageId
      ? (homePage?.id || remaining[0]?.id || null)
      : editorCurrentPageId;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: remaining,
      },
      editorCurrentPageId: newCurrentPage,
      selectedSectionId: null,
    });
  },

  renameCustomPage: (pageId, name) => {
    const { store } = get();
    if (!store) return;
    set({
      store: {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map(p =>
          p.id === pageId && p.type === 'custom'
            ? { ...p, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
            : p
        ),
      },
    });
  },

  isFallbackStore: false,
  fallbackReason: '',
  setIsFallbackStore: (v, reason) => set({ isFallbackStore: v, fallbackReason: reason || '' }),

  isPublishing: false,
  setIsPublishing: (v) => set({ isPublishing: v }),
  isPublished: false,
  setIsPublished: (v) => set({ isPublished: v }),

  initNewStore: (name) => set({ store: createBlankStore(name), view: 'editor' }),
  reset: () =>
    set({
      store: null,
      view: 'landing',
      isGenerating: false,
      generationStatus: '',
      selectedSectionId: null,
      editorCurrentPageId: null,
      chatMessages: [],
      isPublishing: false,
      isPublished: false,
      isFallbackStore: false,
      fallbackReason: '',
    }),
}));
