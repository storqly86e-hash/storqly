'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useCartStore, type CartItem } from '@/lib/cart-store';
import type { StoreProduct } from '@/lib/store-schema';

// ─── Cross-Sell Recommendation Type ─────────────────────────
interface CrossSellItem {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  category?: string;
}

// ─── Props ──────────────────────────────────────────────────
interface CartDrawerProps {
  /** Controlled open state — drawer also reads from Zustand if omitted */
  isOpen?: boolean;
  /** Callback when the drawer should close */
  onClose?: () => void;
  /** Store ID for cross-sell API and cart persistence */
  storeId?: string;
  /** Optional store products (for direct cross-sell fallback) */
  storeProducts?: StoreProduct[];
}

// ─── Component ───────────────────────────────────────────────
export function CartDrawer({ isOpen: isOpenProp, onClose, storeId, storeProducts }: CartDrawerProps) {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const addItem = useCartStore((s) => s.addItem);
  const getItemCount = useCartStore((s) => s.getItemCount);
  const getSubtotal = useCartStore((s) => s.getSubtotal);

  const [crossSellItems, setCrossSellItems] = useState<CrossSellItem[]>([]);
  const [loadingCrossSell, setLoadingCrossSell] = useState(false);

  // Determine open state from prop or internal state
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;
  const handleClose = useCallback(() => {
    setInternalOpen(false);
    onClose?.();
  }, [onClose]);

  // Expose open method via a global event (allows other components to open the drawer)
  useEffect(() => {
    function handleOpenCart() {
      setInternalOpen(true);
    }
    function handleCloseCart() {
      setInternalOpen(false);
    }
    window.addEventListener('open-cart-drawer', handleOpenCart);
    window.addEventListener('close-cart-drawer', handleCloseCart);
    return () => {
      window.removeEventListener('open-cart-drawer', handleOpenCart);
      window.removeEventListener('close-cart-drawer', handleCloseCart);
    };
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Track the last fetch key to know when to refetch
  const crossSellFetchKey = useMemo(() => {
    if (!isOpen || items.length === 0) return null;
    return items.map((i) => i.productId).sort().join(',');
  }, [isOpen, items]);

  // Fetch cross-sell recommendations when drawer opens with items
  useEffect(() => {
    if (!crossSellFetchKey) return;

    let cancelled = false;
    async function fetchCrossSell() {
      setLoadingCrossSell(true);
      try {
        // Try the API first
        if (storeId) {
          const res = await fetch('/api/cross-sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cartProductIds: items.map((i) => i.productId),
              storeId,
              limit: 4,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data.recommendations?.length > 0) {
              setCrossSellItems(data.recommendations);
              setLoadingCrossSell(false);
              return;
            }
          }
        }
        // Fallback: local cross-sell from storeProducts prop
        if (storeProducts && storeProducts.length > 0) {
          const cartIds = new Set(items.map((i) => i.productId));
          const cartCategories = new Set<string>();
          for (const item of items) {
            const prod = storeProducts.find((p) => p.id === item.productId);
            if (prod?.category) cartCategories.add(prod.category);
          }
          const scored = storeProducts
            .filter((p) => !cartIds.has(p.id) && p.inStock !== false)
            .map((p) => {
              let score = 0;
              if (p.category && cartCategories.has(p.category)) score += 10;
              if (p.featured) score += 3;
              return { ...p, _score: score };
            })
            .sort((a, b) => b._score - a._score)
            .slice(0, 4)
            .map(({ id, name, price, compareAtPrice, images, category }) => ({
              id,
              name,
              price,
              compareAtPrice,
              image: images?.[0] || '',
              category,
            }));
          if (!cancelled) setCrossSellItems(scored);
        }
      } catch {
        // Silently fall back to empty cross-sell
      } finally {
        if (!cancelled) setLoadingCrossSell(false);
      }
    }
    fetchCrossSell();
    return () => {
      cancelled = true;
    };
  }, [crossSellFetchKey, storeId, storeProducts]);

  const itemCount = getItemCount();
  const subtotal = getSubtotal();

  // Format price
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  // Handle cross-sell add
  const handleCrossSellAdd = useCallback(
    (item: CrossSellItem) => {
      // Convert CrossSellItem to StoreProduct shape for addItem
      const product: StoreProduct = {
        id: item.id,
        name: item.name,
        price: item.price,
        compareAtPrice: item.compareAtPrice,
        images: item.image ? [item.image] : [],
        description: '',
        inStock: true,
      };
      addItem(product);
    },
    [addItem]
  );

  // Memoize cart items sorted for stable rendering
  const sortedItems = useMemo(() => [...items], [items]);

  return (
    <>
      {/* ─── Backdrop overlay ─── */}
      <div
        role="presentation"
        aria-hidden="true"
        className={
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ' +
          (isOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none')
        }
        onClick={handleClose}
      />

      {/* ─── Drawer panel ─── */}
      <aside
        role="dialog"
        aria-label="Shopping cart"
        aria-modal={isOpen}
        className={
          'fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-background border-l border-border shadow-2xl ' +
          'flex flex-col transition-transform duration-300 ease-in-out ' +
          (isOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-5 w-5 text-foreground" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Your Cart
            </h2>
            {itemCount > 0 && (
              <Badge variant="secondary" className="ml-1 tabular-nums">
                {itemCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close cart"
            className="h-9 w-9 rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ─── Scrollable content ─── */}
        {items.length === 0 ? (
          // ─── Empty state ───
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <ShoppingBag className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">Your cart is empty</p>
              <p className="text-sm text-muted-foreground">
                Add items to get started
              </p>
            </div>
            <Button variant="outline" onClick={handleClose} className="mt-2">
              Continue Shopping
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="flex flex-col">
              {/* ─── Cart items ─── */}
              <div className="flex flex-col divide-y divide-border">
                {sortedItems.map((item) => (
                  <CartLineItem
                    key={item.productId}
                    item={item}
                    formatPrice={formatPrice}
                    onUpdateQuantity={(qty) => updateQuantity(item.productId, qty)}
                    onRemove={() => removeItem(item.productId)}
                  />
                ))}
              </div>

              {/* ─── Cross-sell section ─── */}
              {(loadingCrossSell || crossSellItems.length > 0) && (
                <div className="mt-4 px-4 sm:px-6 pb-4">
                  <Separator className="mb-4" />
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      You might also like
                    </h3>
                  </div>

                  {loadingCrossSell ? (
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-2">
                          <Skeleton className="aspect-square w-full rounded-lg" />
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {crossSellItems.map((rec) => (
                        <CrossSellCard
                          key={rec.id}
                          item={rec}
                          formatPrice={formatPrice}
                          onAdd={() => handleCrossSellAdd(rec)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {/* ─── Footer with subtotal + checkout ─── */}
        {items.length > 0 && (
          <div className="border-t border-border px-4 py-4 sm:px-6 space-y-3 bg-background">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-base font-semibold text-foreground tabular-nums">
                {formatPrice(subtotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shipping and taxes calculated at checkout
            </p>
            <Button className="w-full gap-2" size="lg" onClick={handleClose}>
              Checkout
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

// ─── Cart Line Item ──────────────────────────────────────────
function CartLineItem({
  item,
  formatPrice,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartItem;
  formatPrice: (price: number) => string;
  onUpdateQuantity: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-3 px-4 py-4 sm:px-6 group">
      {/* Product image */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground leading-tight line-clamp-2">
            {item.name}
          </h4>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Remove ${item.name}`}
            className="h-7 w-7 flex-shrink-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-1">
          {/* Quantity controls */}
          <div className="flex items-center gap-0 rounded-lg border border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onUpdateQuantity(item.quantity - 1)}
              disabled={item.quantity <= 1}
              aria-label="Decrease quantity"
              className="h-8 w-8 rounded-r-none rounded-l-lg hover:bg-muted"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="flex h-8 w-9 items-center justify-center border-x border-border text-xs font-medium tabular-nums text-foreground">
              {item.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onUpdateQuantity(item.quantity + 1)}
              aria-label="Increase quantity"
              className="h-8 w-8 rounded-l-none rounded-r-lg hover:bg-muted"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* Price */}
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatPrice(item.price * item.quantity)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Cross-Sell Card ─────────────────────────────────────────
function CrossSellCard({
  item,
  formatPrice,
  onAdd,
}: {
  item: CrossSellItem;
  formatPrice: (price: number) => string;
  onAdd: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    setAdding(true);
    onAdd();
    setTimeout(() => setAdding(false), 1000);
  };

  const hasDiscount = item.compareAtPrice && item.compareAtPrice > item.price;

  return (
    <div className="group flex flex-col gap-2 rounded-lg border border-border p-2 transition-shadow hover:shadow-md">
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingBag className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
        {hasDiscount && (
          <Badge
            variant="destructive"
            className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0"
          >
            Sale
          </Badge>
        )}
      </div>

      {/* Name + price */}
      <div className="px-1 space-y-0.5">
        <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">
          {item.name}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatPrice(item.price)}
          </span>
          {hasDiscount && (
            <span className="text-[10px] text-muted-foreground line-through tabular-nums">
              {formatPrice(item.compareAtPrice!)}
            </span>
          )}
        </div>
      </div>

      {/* Add button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={adding}
        className="w-full h-7 text-xs gap-1.5 mt-0.5"
      >
        {adding ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Added
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            Add
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Utility: open cart drawer from anywhere ─────────────────
/** Dispatch a custom event to open the cart drawer */
export function openCartDrawer() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-cart-drawer'));
  }
}

/** Dispatch a custom event to close the cart drawer */
export function closeCartDrawer() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('close-cart-drawer'));
  }
}
