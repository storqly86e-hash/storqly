// ========================================
// Cart Store — Zustand with localStorage persistence
// ========================================
// Independent of the editor store. Persists across page navigation
// and browser refreshes within a session.

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

  // Actions
  addItem: (product: StoreProduct, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Computed (as getters — called as functions)
  getItemCount: () => number;
  getSubtotal: () => number;
}

const STORAGE_KEY = 'storqly-cart';

function loadFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each item has required fields
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

function saveToStorage(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: loadFromStorage(),

  addItem: (product: StoreProduct, quantity = 1) => {
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      let newItems: CartItem[];

      if (existing) {
        // Increment quantity if already in cart
        newItems = state.items.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      } else {
        // Add new item
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

      saveToStorage(newItems);
      return { items: newItems };
    });
  },

  removeItem: (productId: string) => {
    set((state) => {
      const newItems = state.items.filter((i) => i.productId !== productId);
      saveToStorage(newItems);
      return { items: newItems };
    });
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity < 1) {
      // Remove item if quantity drops to 0
      get().removeItem(productId);
      return;
    }
    set((state) => {
      const newItems = state.items.map((i) =>
        i.productId === productId ? { ...i, quantity } : i
      );
      saveToStorage(newItems);
      return { items: newItems };
    });
  },

  clearCart: () => {
    saveToStorage([]);
    set({ items: [] });
  },

  getItemCount: () => {
    return get().items.reduce((sum, i) => sum + i.quantity, 0);
  },

  getSubtotal: () => {
    return get().items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  },
}));
