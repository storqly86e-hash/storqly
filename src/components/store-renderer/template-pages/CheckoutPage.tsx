'use client';

import { useState } from 'react';
import { ArrowLeft, Lock, CreditCard, Package } from 'lucide-react';
import type { TemplatePageProps } from './types';
import { useCartStore } from '@/lib/cart-store';
import { formatPrice, contrastTextColor, stringToColor, borderRadiusClass } from '../helpers';

interface FormData {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
}

export function CheckoutPage({ store, page, onNavigate }: TemplatePageProps) {
  const theme = store.theme;
  const radius = borderRadiusClass(theme.borderRadius);
  const meta = page?.metadata;
  const successHeadline = meta?.successHeadline || 'Order Confirmed!';
  const successMessage = meta?.successMessage || 'Thank you for your order. This is a demo checkout - no payment was processed. In a production store, your order would be on its way!';

  const items = useCartStore((s) => s.items);
  const getSubtotal = useCartStore((s) => s.getSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);

  const subtotal = getSubtotal();
  const shipping = subtotal > 50 ? 0 : 5.99;
  const total = subtotal + shipping;

  const homePage = store.pages.find((p) => p.isHomepage);

  const [form, setForm] = useState<FormData>({
    email: '',
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const inputStyle: React.CSSProperties = {
    borderColor: theme.colors.border,
    backgroundColor: '#ffffff',
    color: theme.colors.text,
  };

  const labelStyle: React.CSSProperties = {
    color: theme.colors.text,
  };

  const mutedStyle: React.CSSProperties = {
    color: theme.colors.textMuted,
  };

  const isFormValid =
    form.email && form.firstName && form.lastName &&
    form.address && form.city && form.state && form.zip &&
    form.cardNumber && form.cardExpiry && form.cardCvc;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    // In a real app, this would process payment
    setSubmitted(true);
    clearCart();
  };

  if (items.length === 0 && !submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: theme.colors.surface }}>
          <Package className="h-10 w-10" style={{ color: theme.colors.textMuted }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: theme.colors.text }}>
          Nothing to checkout
        </h2>
        <p className="mt-2 text-sm text-center max-w-sm" style={{ color: theme.colors.textMuted }}>
          Your cart is empty. Add some products before checking out.
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

  // Success state
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: '#dcfce7' }}>
          <svg className="h-10 w-10" style={{ color: '#16a34a' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
          {successHeadline}
        </h2>
        <p className="mt-2 text-sm text-center max-w-md" style={{ color: theme.colors.textMuted }}>
          {successMessage}
        </p>
        <button
          className={`mt-6 ${radius} px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80`}
          style={{
            backgroundColor: theme.colors.primary,
            color: contrastTextColor(theme.colors.primary),
          }}
          onClick={() => onNavigate(homePage?.id || store.pages[0]?.id || '')}
        >
          Back to Store
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Back button */}
      <button
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
        style={{ color: theme.colors.textMuted }}
        onClick={() => onNavigate(store.pages.find(p => p.type === 'cart')?.id || store.pages[0]?.id || '')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cart
      </button>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: theme.colors.text }}>
        Checkout
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Form fields */}
          <div className="lg:col-span-2 space-y-8">
            {/* Contact */}
            <div>
              <h2 className="text-base font-bold" style={{ color: theme.colors.text }}>Contact Information</h2>
              <div className="mt-3">
                <label className="block text-sm font-medium" style={labelStyle}>
                  Email address
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                  style={{ ...inputStyle, '--tw-ring-color': theme.colors.primary } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Shipping address */}
            <div>
              <h2 className="text-base font-bold" style={{ color: theme.colors.text }}>Shipping Address</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium" style={labelStyle}>First name</label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium" style={labelStyle}>Last name</label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium" style={labelStyle}>Address</label>
                  <input
                    type="text"
                    required
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium" style={labelStyle}>City</label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium" style={labelStyle}>State</label>
                    <input
                      type="text"
                      required
                      value={form.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={labelStyle}>ZIP Code</label>
                    <input
                      type="text"
                      required
                      value={form.zip}
                      onChange={(e) => updateField('zip', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold" style={{ color: theme.colors.text }}>Payment</h2>
                <Lock className="h-3.5 w-3.5" style={{ color: theme.colors.textMuted }} />
              </div>
              <p className="mt-1 text-xs" style={mutedStyle}>
                This is a demo checkout. No real payment will be processed.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium" style={labelStyle}>
                    <CreditCard className="mr-1 inline h-3.5 w-3.5" style={mutedStyle} />
                    Card number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="4242 4242 4242 4242"
                    maxLength={19}
                    value={form.cardNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                      const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ');
                      updateField('cardNumber', formatted);
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium" style={labelStyle}>Expiry date</label>
                  <input
                    type="text"
                    required
                    placeholder="MM / YY"
                    maxLength={7}
                    value={form.cardExpiry}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      if (val.length >= 3) val = val.slice(0, 2) + ' / ' + val.slice(2);
                      updateField('cardExpiry', val);
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium" style={labelStyle}>CVC</label>
                  <input
                    type="text"
                    required
                    placeholder="123"
                    maxLength={4}
                    value={form.cardCvc}
                    onChange={(e) => {
                      updateField('cardCvc', e.target.value.replace(/\D/g, '').slice(0, 4));
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div
              className={`${radius} border p-6 sticky top-24`}
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <h2 className="text-base font-bold" style={{ color: theme.colors.text }}>
                Order Summary
              </h2>

              {/* Cart items preview */}
              <div className="mt-4 space-y-3 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.productId} className="flex gap-3">
                    <div
                      className={`h-12 w-12 flex-shrink-0 ${radius} overflow-hidden`}
                      style={{ backgroundColor: item.image || stringToColor(item.productId) }}
                    >
                      {!item.image && (
                        <div className="flex h-full w-full items-center justify-center">
                          <div
                            className="h-6 w-6 rounded-full opacity-30"
                            style={{ backgroundColor: theme.colors.primary }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 items-center justify-between">
                      <div className="min-w-0">
                        <p
                          className="text-xs font-medium truncate"
                          style={{ color: theme.colors.text }}
                        >
                          {item.name}
                        </p>
                        <p className="text-xs" style={{ color: theme.colors.textMuted }}>
                          Qty {item.quantity}
                        </p>
                      </div>
                      <span
                        className="text-xs font-semibold flex-shrink-0"
                        style={{ color: theme.colors.text }}
                      >
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="my-4 border-t"
                style={{ borderColor: theme.colors.border }}
              />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={mutedStyle}>Subtotal</span>
                  <span className="font-medium" style={{ color: theme.colors.text }}>
                    {formatPrice(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={mutedStyle}>Shipping</span>
                  <span className="font-medium" style={{ color: shipping === 0 ? '#16a34a' : theme.colors.text }}>
                    {shipping === 0 ? 'Free' : formatPrice(shipping)}
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
                  {formatPrice(total)}
                </span>
              </div>

              {shipping === 0 && subtotal > 0 && (
                <p className="mt-2 text-center text-xs" style={{ color: '#16a34a' }}>
                  You qualify for free shipping!
                </p>
              )}

              <button
                type="submit"
                disabled={!isFormValid}
                className={`${radius} mt-6 flex w-full items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{
                  backgroundColor: theme.colors.primary,
                  color: contrastTextColor(theme.colors.primary),
                }}
              >
                <Lock className="h-3.5 w-3.5" />
                Place Order — {formatPrice(total)}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
