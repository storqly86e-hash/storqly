'use client';

import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, ArrowRight } from 'lucide-react';
import type { TemplatePageProps } from './types';
import { useCartStore } from '@/lib/cart-store';
import { formatPrice, contrastTextColor, stringToColor, borderRadiusClass } from '../helpers';

export function CartPage({ store, page, onNavigate }: TemplatePageProps) {
  const theme = store.theme;
  const radius = borderRadiusClass(theme.borderRadius);
  const meta = page?.metadata;
  const headline = meta?.headline || 'Shopping Cart';
  const emptyMessage = meta?.emptyMessage || 'Looks like you have not added anything to your cart yet. Start shopping to fill it up!';

  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const getSubtotal = useCartStore((s) => s.getSubtotal);

  const subtotal = getSubtotal();

  // Find the checkout page (if it exists in the store)
  const checkoutPage = store.pages.find((p) => p.type === 'checkout');
  const homePage = store.pages.find((p) => p.isHomepage);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6">
        <div
          className="mb-4 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.colors.surface }}
        >
          <ShoppingBag className="h-10 w-10" style={{ color: theme.colors.textMuted }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: theme.colors.text }}>
          {headline}
        </h2>
        <p className="mt-2 text-sm text-center max-w-sm" style={{ color: theme.colors.textMuted }}>
          {emptyMessage}
        </p>
        <button
          className={`mt-6 ${radius} px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80`}
          style={{
            backgroundColor: theme.colors.primary,
            color: contrastTextColor(theme.colors.primary),
          }}
          onClick={() => onNavigate(homePage?.id || store.pages[0]?.id || '')}
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: theme.colors.text }}>
            {headline}
          </h1>
          <p className="mt-1 text-sm" style={{ color: theme.colors.textMuted }}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <button
          className="text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: theme.colors.textMuted }}
          onClick={clearCart}
        >
          Clear all
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className={`${radius} flex gap-4 border p-4 sm:gap-6 sm:p-5`}
              style={{
                borderColor: theme.colors.border,
                backgroundColor: '#ffffff',
              }}
            >
              {/* Thumbnail */}
              <div
                className={`h-20 w-20 flex-shrink-0 overflow-hidden sm:h-24 sm:w-24 ${radius}`}
                style={{ backgroundColor: item.image || stringToColor(item.productId) }}
              >
                {!item.image && (
                  <div className="flex h-full w-full items-center justify-center">
                    <div
                      className="h-10 w-10 rounded-full opacity-30"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3
                      className="text-sm font-semibold leading-snug"
                      style={{ color: theme.colors.text }}
                    >
                      {item.name}
                    </h3>
                    <p
                      className="mt-0.5 text-sm font-bold"
                      style={{ color: theme.colors.primary }}
                    >
                      {formatPrice(item.price)}
                    </p>
                  </div>
                  <button
                    className="flex-shrink-0 rounded-md p-1.5 transition-colors hover:bg-red-50 hover:text-red-500"
                    style={{ color: theme.colors.textMuted }}
                    onClick={() => removeItem(item.productId)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {/* Quantity controls */}
                  <div
                    className="flex items-center border"
                    style={{ borderColor: theme.colors.border }}
                  >
                    <button
                      className="flex h-8 w-8 items-center justify-center transition-colors hover:opacity-70 disabled:opacity-30"
                      style={{ color: theme.colors.text }}
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span
                      className="flex h-8 w-10 items-center justify-center border-y text-xs font-medium"
                      style={{ color: theme.colors.text, borderColor: theme.colors.border }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      className="flex h-8 w-8 items-center justify-center transition-colors hover:opacity-70"
                      style={{ color: theme.colors.text }}
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Line total */}
                  <span
                    className="text-sm font-bold"
                    style={{ color: theme.colors.text }}
                  >
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:col-span-1">
          <div
            className={`${radius} border p-6 sticky top-24`}
            style={{
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <h2
              className="text-base font-bold"
              style={{ color: theme.colors.text }}
            >
              Order Summary
            </h2>

            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.colors.textMuted }}>Subtotal</span>
                <span className="font-medium" style={{ color: theme.colors.text }}>
                  {formatPrice(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.colors.textMuted }}>Shipping</span>
                <span className="font-medium" style={{ color: theme.colors.text }}>
                  Calculated at checkout
                </span>
              </div>
            </div>

            <div
              className="my-4 border-t"
              style={{ borderColor: theme.colors.border }}
            />

            <div className="flex justify-between">
              <span className="text-base font-bold" style={{ color: theme.colors.text }}>
                Total
              </span>
              <span className="text-base font-bold" style={{ color: theme.colors.text }}>
                {formatPrice(subtotal)}
              </span>
            </div>

            <button
              className={`${radius} mt-6 flex w-full items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90`}
              style={{
                backgroundColor: theme.colors.primary,
                color: contrastTextColor(theme.colors.primary),
              }}
              onClick={() => {
                if (checkoutPage) {
                  onNavigate(checkoutPage.id);
                }
              }}
            >
              Checkout
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              className="mt-3 flex w-full items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: theme.colors.textMuted }}
              onClick={() => onNavigate(homePage?.id || store.pages[0]?.id || '')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
