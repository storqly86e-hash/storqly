// ========================================
// Cart Store — Zustand with per-store localStorage persistence
// ========================================
// Each store has its own isolated cart, keyed by store ID.
// When switching stores, the previous store's cart is saved
// and the new store's cart is loaded.

import { create } from 'zustand';
import type { StoreProduct } from './store-schema';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  _storeId: string | null;

  // Actions
  initForStore: (storeId: string) => void;
  addItem: (product: StoreProduct, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Computed (as getters — called as functions)
  getItemCount: () => number;
  getSubtotal: () => number;
}

const LEGACY_KEY = 'storqly-cart';

function storageKey(storeId: string): string {
  return `storqly-cart:${storeId}`;
}

function loadFromStorage(storeId: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(storeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is CartItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as CartItem).productId === 'string' &&
        typeof (item as CartItem).name === 'string' &&
        typeof (item as CartItem).price === 'number' &&
        typeof (item as CartItem).quantity === 'number' &&
        (item as CartItem).quantity > 0
    );
  } catch {
    return [];
  }
}

function saveToStorage(storeId: string, items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(storeId), JSON.stringify(items));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** One-time migration: remove the old global cart key */
function migrateLegacyCart(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  _storeId: null,

  initForStore: (storeId: string) => {
    const current = get()._storeId;
    if (current === storeId) return; // Already initialized for this store

    // Save current cart if switching from another store
    if (current) {
      saveToStorage(current, get().items);
    }

    // Load new store's cart
    const items = loadFromStorage(storeId);
    set({ items, _storeId: storeId });
  },

  addItem: (product: StoreProduct, quantity = 1) => {
    const storeId = get()._storeId;
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      let newItems: CartItem[];

      if (existing) {
        newItems = state.items.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      } else {
        newItems = [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.images?.[0] || '',
            quantity,
          },
        ];
      }

      if (storeId) saveToStorage(storeId, newItems);
      return { items: newItems };
    });
  },

  removeItem: (productId: string) => {
    const storeId = get()._storeId;
    set((state) => {
      const newItems = state.items.filter((i) => i.productId !== productId);
      if (storeId) saveToStorage(storeId, newItems);
      return { items: newItems };
    });
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity < 1) {
      get().removeItem(productId);
      return;
    }
    const storeId = get()._storeId;
    set((state) => {
      const newItems = state.items.map((i) =>
        i.productId === productId ? { ...i, quantity } : i
      );
      if (storeId) saveToStorage(storeId, newItems);
      return { items: newItems };
    });
  },

  clearCart: () => {
    const storeId = get()._storeId;
    if (storeId) saveToStorage(storeId, []);
    set({ items: [] });
  },

  getItemCount: () => {
    return get().items.reduce((sum, i) => sum + i.quantity, 0);
  },

  getSubtotal: () => {
    return get().items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  },
}));

// Run legacy migration once on module load (client-side only)
if (typeof window !== 'undefined') {
  migrateLegacyCart();
}
