'use client';

import { useState, useMemo } from 'react';
import { Minus, Plus, ShoppingCart, ArrowLeft, Check, Package } from 'lucide-react';
import type { TemplatePageProps } from './types';
import type { StoreProduct } from '@/lib/store-schema';
import { useCartStore } from '@/lib/cart-store';
import { formatPrice, contrastTextColor, stringToColor, borderRadiusClass } from '../helpers';

export function ProductDetailPage({ store, productId, onNavigate }: TemplatePageProps & { productId?: string }) {
  const theme = store.theme;
  const addItem = useCartStore((s) => s.addItem);
  const radius = borderRadiusClass(theme.borderRadius);

  const product = useMemo(
    () => store.products.find((p) => p.id === productId),
    [store.products, productId]
  );

  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [addedFeedback, setAddedFeedback] = useState(false);

  // All hooks must be called before any conditional return
  const imgColor = product ? stringToColor(product.id) : '#f0f0f0';
  const hasDiscount = !!(product?.compareAtPrice && product.compareAtPrice > product.price);

  // Determine variant display
  const variantGroups = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return [];
    const groups: { name: string; values: string[] }[] = [];
    const firstVariant = product.variants[0];
    firstVariant.options.forEach((opt) => {
      const existingValues = new Set<string>();
      product.variants!.forEach((v) => {
        const match = v.options.find((o) => o.label === opt.label);
        if (match) existingValues.add(match.value);
      });
      groups.push({ name: opt.label, values: Array.from(existingValues).sort() });
    });
    return groups;
  }, [product]);

  // Find matching variant based on selected options
  const selectedVariant = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return null;
    const keys = Object.keys(selectedOptions);
    if (keys.length === 0) return null;
    return product.variants.find((v) =>
      v.options.every((o) => selectedOptions[o.label] === o.value)
    ) || null;
  }, [product, selectedOptions]);

  const activePrice = selectedVariant?.price ?? product?.price ?? 0;
  const activeInStock = selectedVariant ? selectedVariant.inStock : (product?.inStock ?? false);

  const handleAddToCart = () => {
    if (!product || !activeInStock) return;
    const itemToAdd: StoreProduct = selectedVariant
      ? { ...product, price: selectedVariant.price || product.price, inStock: selectedVariant.inStock }
      : product;
    addItem(itemToAdd, quantity);
    setAddedFeedback(true);
    // Auto-navigate to cart page after brief feedback
    const cartPage = store.pages.find((p) => p.type === 'cart');
    if (cartPage) {
      setTimeout(() => {
        setAddedFeedback(false);
        onNavigate(cartPage.id);
      }, 600);
    } else {
      setTimeout(() => setAddedFeedback(false), 1500);
    }
  };

  // Early return for missing product
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: theme.colors.surface }}>
          <Package className="h-8 w-8" style={{ color: theme.colors.textMuted }} />
        </div>
        <p className="text-lg font-medium" style={{ color: theme.colors.text }}>Product not found</p>
        <p className="mt-1 text-sm" style={{ color: theme.colors.textMuted }}>
          The product you're looking for doesn't exist.
        </p>
        <button
          className="mt-4 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: theme.colors.primary,
            color: contrastTextColor(theme.colors.primary),
          }}
          onClick={() => onNavigate(store.pages[0]?.id || '')}
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
        onClick={() => onNavigate(store.pages[0]?.id || '')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Product image */}
        <div
          className={`${radius} relative aspect-square w-full overflow-hidden`}
          style={{ backgroundColor: imgColor }}
        >
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="h-24 w-24 rounded-full opacity-25"
              style={{ backgroundColor: theme.colors.primary }}
            />
          </div>
          {!product.inStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <span className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                Sold Out
              </span>
            </div>
          )}
          {hasDiscount && product.compareAtPrice && (
            <div className="absolute left-4 top-4 rounded-full bg-red-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% Off
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="flex flex-col justify-center">
          {product.category && (
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: theme.colors.primary }}
            >
              {product.category}
            </p>
          )}
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: theme.colors.text }}
          >
            {product.name}
          </h1>

          {/* Price */}
          <div className="mt-3 flex items-center gap-3">
            <span
              className="text-2xl font-bold"
              style={{ color: theme.colors.text }}
            >
              {formatPrice(activePrice)}
            </span>
            {hasDiscount && product.compareAtPrice && (
              <span
                className="text-lg line-through"
                style={{ color: theme.colors.textMuted }}
              >
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>

          {/* Description */}
          <p
            className="mt-4 text-sm leading-relaxed"
            style={{ color: theme.colors.textMuted }}
          >
            {product.description}
          </p>

          {/* Variant selectors */}
          {variantGroups.length > 0 && (
            <div className="mt-6 space-y-4">
              {variantGroups.map((group) => (
                <div key={group.name}>
                  <p
                    className="mb-2 text-sm font-medium"
                    style={{ color: theme.colors.text }}
                  >
                    {group.name}
                    {selectedOptions[group.name] && (
                      <span style={{ color: theme.colors.textMuted }}>
                        : {selectedOptions[group.name]}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.values.map((value) => {
                      const isSelected = selectedOptions[group.name] === value;
                      const hasInStockVariant = product.variants!.some(
                        (v) =>
                          v.options.some((o) => o.label === group.name && o.value === value) &&
                          v.inStock
                      );
                      return (
                        <button
                          key={value}
                          disabled={!hasInStockVariant}
                          className={`${radius} border px-4 py-2 text-sm font-medium transition-all ${
                            isSelected ? 'ring-2 ring-offset-1' : 'hover:opacity-80'
                          } ${!hasInStockVariant ? 'cursor-not-allowed opacity-40 line-through' : ''}`}
                          style={{
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: isSelected ? theme.colors.primary + '15' : 'transparent',
                            color: isSelected ? theme.colors.primary : theme.colors.text,
                            ringColor: theme.colors.primary,
                          }}
                          onClick={() =>
                            setSelectedOptions((prev) => ({
                              ...prev,
                              [group.name]: value,
                            }))
                          }
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quantity + Add to Cart */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Quantity selector */}
            <div
              className="flex items-center border"
              style={{ borderColor: theme.colors.border }}
            >
              <button
                className="flex h-10 w-10 items-center justify-center transition-colors hover:opacity-70 disabled:opacity-30"
                style={{ color: theme.colors.text }}
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                className="flex h-10 w-12 items-center justify-center border-y text-sm font-medium"
                style={{
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                }}
              >
                {quantity}
              </span>
              <button
                className="flex h-10 w-10 items-center justify-center transition-colors hover:opacity-70"
                style={{ color: theme.colors.text }}
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add to cart button */}
            <button
              className={`${radius} flex h-10 flex-1 items-center justify-center gap-2 px-6 text-sm font-semibold transition-all sm:max-w-xs`}
              style={{
                backgroundColor: addedFeedback ? '#16a34a' : theme.colors.primary,
                color: addedFeedback
                  ? '#ffffff'
                  : contrastTextColor(theme.colors.primary),
              }}
              disabled={!activeInStock || addedFeedback}
              onClick={handleAddToCart}
            >
              {addedFeedback ? (
                <>
                  <Check className="h-4 w-4" />
                  Added
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" />
                  {activeInStock ? 'Add to Cart' : 'Out of Stock'}
                </>
              )}
            </button>
          </div>

          {/* Stock indicator */}
          {activeInStock && (
            <p className="mt-3 text-xs" style={{ color: '#16a34a' }}>
              In stock — ready to ship
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
