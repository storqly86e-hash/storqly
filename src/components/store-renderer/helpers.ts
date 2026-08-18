// ========================================
// Shared helpers for store rendering
// ========================================
// Used by both section renderers (sections.tsx) and template pages.

import type { StoreTheme } from '@/lib/store-schema';

// ─── Color Utilities ──────────────────────────────────────────────────

/** Parse any CSS color string to { r, g, b } (0–255). Handles #hex, #rgb, rgb(), hsl(). */
export function parseColorToRGB(raw: string): { r: number; g: number; b: number } | null {
  try {
    let s = raw.trim();
    // --- 6-digit hex: #RRGGBB ---
    const hex6 = s.match(/^#([0-9a-f]{6})$/i);
    if (hex6) {
      const h = hex6[1];
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    // --- 3-digit hex: #RGB ---
    const hex3 = s.match(/^#([0-9a-f]{3})$/i);
    if (hex3) {
      const h = hex3[1];
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    }
    // --- rgb(r, g, b) ---
    const rgbMatch = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
    }
    // --- hsl(h, s%, l%) — approximate conversion ---
    const hslMatch = s.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]) / 360;
      const sat = parseInt(hslMatch[2]) / 100;
      const l = parseInt(hslMatch[3]) / 100;
      let r: number, g: number, b: number;
      if (sat === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1; if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Get a contrasting text color for a given background color.
 *  Handles #hex (3 & 6 digit), rgb(), hsl().
 *  Falls back to white (safer for dark/unknown backgrounds). */
export function contrastTextColor(bgColor: unknown): string {
  if (!bgColor || typeof bgColor !== 'string') return '#ffffff';
  const parsed = parseColorToRGB(bgColor);
  if (!parsed) return '#ffffff';
  const { r, g, b } = parsed;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111827' : '#ffffff';
}

/** Generate a consistent color from a string for image placeholders */
export function stringToColor(str: string, _theme?: StoreTheme): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 88%)`;
}

// ─── Formatting ──────────────────────────────────────────────────────

/** Format price as USD currency */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
}

/** Get initials from a name */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Style Helpers ──────────────────────────────────────────────────

/** Get padding-y class from style config */
export function pyClass(paddingY?: 'sm' | 'md' | 'lg' | 'xl') {
  switch (paddingY) {
    case 'sm': return 'py-6';
    case 'md': return 'py-10';
    case 'lg': return 'py-16';
    case 'xl': return 'py-24';
    default: return 'py-12';
  }
}

/** Get padding-x class from style config */
export function pxClass(paddingX?: 'sm' | 'md' | 'lg') {
  switch (paddingX) {
    case 'sm': return 'px-4';
    case 'md': return 'px-6';
    case 'lg': return 'px-10';
    default: return 'px-6';
  }
}

/** Get max-width class from style config */
export function maxWidthClass(maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full') {
  switch (maxWidth) {
    case 'sm': return 'max-w-2xl';
    case 'md': return 'max-w-4xl';
    case 'lg': return 'max-w-6xl';
    case 'xl': return 'max-w-7xl';
    case 'full': return 'max-w-full';
    default: return 'max-w-6xl';
  }
}

/** Get border-radius class from theme */
export function borderRadiusClass(radius?: StoreTheme['borderRadius']) {
  switch (radius) {
    case 'none': return 'rounded-none';
    case 'sm': return 'rounded-sm';
    case 'md': return 'rounded-md';
    case 'lg': return 'rounded-lg';
    case 'xl': return 'rounded-xl';
    default: return 'rounded-md';
  }
}

/** Get grid column classes */
export function gridCols(columns: 2 | 3 | 4) {
  switch (columns) {
    case 2: return 'grid-cols-1 sm:grid-cols-2';
    case 3: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    case 4: return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    default: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
}

// ─── Theme Color Utilities ─────────────────────────────────────────

/** Create rgba string from hex color */
export function hexToRgba(hex: string, alpha: number): string {
  const parsed = parseColorToRGB(hex);
  if (!parsed) return `rgba(0,0,0,${alpha})`;
  const { r, g, b } = parsed;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Darken a hex color by amount (0–1) */
export function darkenHex(hex: string, amount: number): string {
  const parsed = parseColorToRGB(hex);
  if (!parsed) return hex;
  const { r, g, b } = parsed;
  const d = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `#${d(r).toString(16).padStart(2, '0')}${d(g).toString(16).padStart(2, '0')}${d(b).toString(16).padStart(2, '0')}`;
}

/** Lighten a hex color by amount (0–1) */
export function lightenHex(hex: string, amount: number): string {
  const parsed = parseColorToRGB(hex);
  if (!parsed) return hex;
  const { r, g, b } = parsed;
  const l = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${l(r).toString(16).padStart(2, '0')}${l(g).toString(16).padStart(2, '0')}${l(b).toString(16).padStart(2, '0')}`;
}
