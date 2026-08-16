import { create } from 'zustand';
import type { Store, StorePage, Section, SectionStyle, ChatMessage, ChatEditOperation, SectionType } from './store-schema';
import { createBlankStore } from './store-schema';

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
    store,
    view: 'editor',
    editorCurrentPageId: store.pages.find((p) => p.isHomepage)?.id || store.pages[0]?.id || null,
    selectedSectionId: null,
    // Auto-detect broken/incomplete stores
    isFallbackStore: isStoreBroken(store),
    fallbackReason: isStoreBroken(store) ? 'Generation was interrupted — store is incomplete' : '',
  }),
  setStoreWithFallback: (store, isFallback, reason) => set({
    store,
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

  // Apply operations from chat AI
  applyOperations: (operations) => {
    const { store } = get();
    if (!store) return;

    let updatedStore = { ...store, updatedAt: new Date().toISOString() };

    for (const op of operations) {
      switch (op.type) {
        case 'update-theme':
          updatedStore = {
            ...updatedStore,
            theme: {
              ...updatedStore.theme,
              ...op.payload,
              colors: { ...updatedStore.theme.colors, ...op.payload.colors },
              fonts: { ...updatedStore.theme.fonts, ...op.payload.fonts },
            },
          };
          break;

        case 'update-section': {
          const { sectionId, content, style } = op.payload;
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((page) => ({
              ...page,
              sections: page.sections.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      content: content ? { ...s.content, ...content } : s.content,
                      style: style ? { ...s.style, ...style } : s.style,
                    }
                  : s
              ),
            })),
          };
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

    set({ store: updatedStore });
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
