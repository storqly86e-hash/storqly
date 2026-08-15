import { create } from 'zustand';
import type { Store, StorePage, Section, SectionStyle, ChatMessage, ChatEditOperation } from './store-schema';
import { createBlankStore } from './store-schema';

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
          updatedStore = {
            ...updatedStore,
            pages: updatedStore.pages.map((page) => {
              if (page.id !== pageId) return page;
              const sections = [...page.sections];
              if (index !== undefined) {
                sections.splice(index, 0, section);
              } else {
                sections.push(section);
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
          const newPage: StorePage = {
            id: crypto.randomUUID(),
            name,
            slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            type: 'custom',
            isHomepage: false,
            sections: sections || [],
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
