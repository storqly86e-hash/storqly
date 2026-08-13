'use client';

import { useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import type { TemplatePageProps } from './types';
import { useCartStore } from '@/lib/cart-store';
import {
  formatPrice,
  contrastTextColor,
  stringToColor,
  borderRadiusClass,
} from '../helpers';

export function CollectionPage({ store, onViewProduct }: TemplatePageProps) {
  const theme = store.theme;
  const products = store.products;
  const addItem = useCartStore((s) => s.addItem);
  const radius = borderRadiusClass(theme.borderRadius);

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        p.description.toLowerCase().includes(q)
    );
  }, [products, search]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6">
        <div
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Package className="h-8 w-8" style={{ color: theme.colors.textMuted }} />
        </div>
        <p className="text-lg font-medium" style={{ color: theme.colors.text }}>
          No products yet
        </p>
        <p className="mt-1 text-sm" style={{ color: theme.colors.textMuted }}>
          Products will appear here once they're added to your store.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Page title */}
      <div className="mb-8">
        <h1
          className="text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: theme.colors.text }}
        >
          All Products
        </h1>
        <p className="mt-1 text-sm" style={{ color: theme.colors.textMuted }}>
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </p>
      </div>

      {/* Search bar */}
      {products.length > 3 && (
        <div className="relative mb-6">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: theme.colors.textMuted }}
          />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:ring-2"
            style={{
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
            }}
          />
        </div>
      )}

      {/* Category pills */}
      {categories.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <span
            className="inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: theme.colors.primary,
              color: contrastTextColor(theme.colors.primary),
            }}
            onClick={() => setSearch('')}
          >
            All
          </span>
          {categories.map((cat) => (
            <span
              key={cat}
              className="inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textMuted,
                backgroundColor: 'transparent',
              }}
              onClick={() => setSearch(cat)}
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm" style={{ color: theme.colors.textMuted }}>
            No products match your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => {
            const imgColor = stringToColor(product.id);
            const hasDiscount =
              product.compareAtPrice && product.compareAtPrice > product.price;

            return (
              <div
                key={product.id}
                className={`${radius} group cursor-pointer overflow-hidden border transition-shadow duration-200 hover:shadow-md`}
                style={{
                  borderColor: theme.colors.border,
                  backgroundColor: '#ffffff',
                }}
                onClick={() => onViewProduct?.(product.id)}
              >
                {/* Image area */}
                <div
                  className="relative aspect-square w-full overflow-hidden"
                  style={{ backgroundColor: imgColor }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="h-16 w-16 rounded-full opacity-30"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                  </div>
                  {!product.inStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                      <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
                        Sold Out
                      </span>
                    </div>
                  )}
                  {hasDiscount && product.compareAtPrice && (
                    <div className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      {Math.round(
                        ((product.compareAtPrice - product.price) /
                          product.compareAtPrice) *
                          100
                      )}
                      % Off
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 sm:p-4" style={{ color: theme.colors.text }}>
                  {product.category && (
                    <p
                      className="mb-1 text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: theme.colors.textMuted }}
                    >
                      {product.category}
                    </p>
                  )}
                  <h3
                    className="text-sm font-semibold leading-snug line-clamp-2"
                    style={{ color: theme.colors.text }}
                  >
                    {product.name}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className="text-sm font-bold"
                      style={{ color: theme.colors.primary }}
                    >
                      {formatPrice(product.price)}
                    </span>
                    {hasDiscount && product.compareAtPrice && (
                      <span
                        className="text-xs line-through"
                        style={{ color: theme.colors.textMuted }}
                      >
                        {formatPrice(product.compareAtPrice)}
                      </span>
                    )}
                  </div>
                  {product.inStock && (
                    <button
                      className="mt-3 w-full rounded-md py-2 text-xs font-semibold transition-all duration-200 cursor-pointer opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto"
                      style={{
                        backgroundColor: theme.colors.primary,
                        color: contrastTextColor(theme.colors.primary),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        addItem(product);
                      }}
                    >
                      Add to Cart
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
