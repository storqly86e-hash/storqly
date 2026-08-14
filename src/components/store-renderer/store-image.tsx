'use client';

import { useState, useCallback } from 'react';

/**
 * StoreImage — Renders <img> with automatic fallback to a colored placeholder.
 * Used everywhere images appear: ProductCard, CollectionPage, ProductDetail, Cart, Gallery, Categories.
 *
 * On error (broken URL, CORS, 404), the image seamlessly falls back to a styled
 * placeholder div with an SVG icon.
 */
export function StoreImage({
  src,
  alt,
  fallbackColor,
  className = '',
  iconSize = 'md',
}: {
  src: string;
  alt: string;
  fallbackColor: string;
  className?: string;
  /** Size of the placeholder icon */
  iconSize?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  const iconPx =
    iconSize === 'sm'
      ? 'h-6 w-6'
      : iconSize === 'lg'
        ? 'h-16 w-16'
        : 'h-10 w-10';

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ backgroundColor: fallbackColor }}
        aria-label={alt}
        role='img'
      >
        <svg
          className={`${iconPx} opacity-20`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  );
}
