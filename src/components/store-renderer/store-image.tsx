'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * StoreImage — Renders <img> with progressive blur placeholder.
 *
 * Loading flow:
 * 1. Wrapper div renders immediately with blurred color placeholder
 * 2. Real image loads in background (invisible)
 * 3. On load: smooth crossfade from blurred placeholder → crisp image
 *
 * On error (broken URL, CORS, 404), falls back to a styled
 * placeholder div with an SVG icon.
 *
 * Performance:
 * - `loading="lazy"` for below-fold images
 * - `loading="eager"` can be passed for above-fold hero images
 * - Blur placeholder prevents CLS and provides instant visual feedback
 */
export function StoreImage({
  src,
  alt,
  fallbackColor,
  className = '',
  iconSize = 'md',
  eager = false,
}: {
  src: string;
  alt: string;
  fallbackColor: string;
  className?: string;
  /** Size of the placeholder icon */
  iconSize?: 'sm' | 'md' | 'lg';
  /** If true, use loading="eager" for above-fold images */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleError = useCallback(() => setFailed(true), []);
  const handleLoad = useCallback(() => setLoaded(true), []);

  const iconPx =
    iconSize === 'sm'
      ? 'h-6 w-6'
      : iconSize === 'lg'
        ? 'h-16 w-16'
        : 'h-10 w-10';

  // ── Error / missing source: show SVG placeholder ──
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

  // ── Detect if className has absolute positioning (used by product cards) ──
  const isAbsolute = className.includes('absolute');

  // ── Absolute-positioned images (product card hover zoom): wrap minimally ──
  if (isAbsolute) {
    return (
      <>
        {/* Blur placeholder — visible only while image loads */}
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{
            backgroundColor: fallbackColor,
            filter: 'blur(20px)',
            transform: 'scale(1.2)',
            opacity: loaded ? 0 : 1,
          }}
          aria-hidden="true"
        />
        <img
          src={src}
          alt={alt}
          className={className}
          onError={handleError}
          onLoad={handleLoad}
          loading={eager ? 'eager' : 'lazy'}
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.5s ease-out' }}
        />
      </>
    );
  }

  // ── Normal flow images: use a wrapper div for blur placeholder ──
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Blur placeholder background */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 ease-out"
        style={{
          backgroundColor: fallbackColor,
          filter: 'blur(20px)',
          transform: 'scale(1.2)',
          opacity: loaded ? 0 : 1,
        }}
        aria-hidden="true"
      />
      {/* Real image */}
      <img
        src={src}
        alt={alt}
        className="relative z-10 h-full w-full object-cover"
        onError={handleError}
        onLoad={handleLoad}
        loading={eager ? 'eager' : 'lazy'}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.5s ease-out' }}
      />
    </div>
  );
}
