// ========================================
// Storqly Schema Normalization Layer
// ========================================
// Deterministic, testable function that takes ANY valid JSON object
// (guaranteed by json_object mode) and reshapes it into a valid Store.
//
// This is NOT JSON repair (that fixes broken syntax).
// This IS schema normalization (coercing valid JSON to match the Store type).
//
// Design principles:
// - Never throws — always returns a valid Store
// - Preserve AI output when valid — only fill defaults for missing/wrong fields
// - Be lenient with types — coerce strings to numbers, etc.
// - Log every normalization for debugging

import type { Store, StoreTheme, StoreProduct, StorePage, Section, SectionStyle, SectionType } from './store-schema';
import { defaultTheme } from './store-schema';

// ─── Validation sets ─────────────────────────────────────────────

const VALID_SECTION_TYPES = new Set<string>([
  'hero', 'featured-products', 'product-grid', 'text-banner', 'image-gallery',
  'testimonials', 'newsletter', 'faq', 'cta', 'categories', 'header',
  'footer', 'rich-text', 'spacer', 'divider',
]);

const VALID_SPACING = new Set<string>(['compact', 'normal', 'spacious']);
const VALID_BORDER_RADIUS = new Set<string>(['none', 'sm', 'md', 'lg', 'xl']);
const VALID_PADDING_Y = new Set<string>(['sm', 'md', 'lg', 'xl']);
const VALID_PADDING_X = new Set<string>(['sm', 'md', 'lg']);
const VALID_MAX_WIDTH = new Set<string>(['sm', 'md', 'lg', 'xl', 'full']);
const VALID_ALIGNMENT = new Set<string>(['left', 'center', 'right']);
const VALID_HEIGHT = new Set<string>(['sm', 'md', 'lg', 'xl']);
const VALID_SIZE = new Set<string>(['sm', 'md', 'lg']);
const VALID_COLUMNS = new Set<number>([2, 3, 4]);
const VALID_CTA_STYLE = new Set<string>(['solid', 'outline', 'gradient']);
const VALID_GAP = new Set<string>(['sm', 'md', 'lg']);

// ─── Logging ──────────────────────────────────────────────────────

type NormLog = { field: string; action: 'missing' | 'coerced' | 'invalid' | 'defaulted'; from?: unknown; to?: unknown };

function createLogger() {
  const logs: NormLog[] = [];
  return {
    log(entry: NormLog) { logs.push(entry); },
    getLogs() { return logs; },
    summary(): string {
      const counts = { missing: 0, coerced: 0, invalid: 0, defaulted: 0 };
      for (const l of logs) counts[l.action]++;
      return `Normalization: ${logs.length} fixes (${counts.missing} missing, ${counts.coerced} coerced, ${counts.invalid} invalid, ${counts.defaulted} defaulted)`;
    },
  };
}

// ─── Primitive helpers ────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function str(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.length > 0) return v;
  if (v === null || v === undefined) return fallback;
  return String(v).slice(0, 500) || fallback;
}

function num(v: unknown, fallback: number, min?: number, max?: number): number {
  if (typeof v === 'number' && isFinite(v)) {
    let n = v;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return n;
  }
  // Coerce string numbers
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.\-]/g, ''));
    if (!isNaN(n) && isFinite(n)) {
      if (min !== undefined) return Math.max(min, n);
      if (max !== undefined) return Math.min(max, n);
      return n;
    }
  }
  return fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1';
  if (typeof v === 'number') return v !== 0;
  return fallback;
}

function arr<T>(v: unknown, fallback: T[]): T[] {
  if (Array.isArray(v)) return v;
  return fallback;
}

function obj(v: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return fallback;
}

function enumVal(v: unknown, valid: Set<string>, fallback: string): string {
  if (typeof v === 'string' && valid.has(v)) return v;
  // Case-insensitive fallback
  if (typeof v === 'string') {
    const lower = v.toLowerCase();
    for (const validVal of valid) {
      if (validVal === lower) return validVal;
    }
  }
  return fallback;
}

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60) || 'store';
}

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ─── Theme normalization ──────────────────────────────────────────

function normalizeTheme(raw: unknown, log: ReturnType<typeof createLogger>): StoreTheme {
  const t = obj(raw, {} as Record<string, unknown>);
  const theme: StoreTheme = { ...defaultTheme };

  // Colors
  const colors = obj(t.colors, {} as Record<string, unknown>);
  const colorKeys = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'textMuted', 'border'] as const;
  for (const key of colorKeys) {
    const v = colors[key];
    if (typeof v === 'string' && v.startsWith('#') && v.length >= 4) {
      theme.colors[key] = v;
    } else if (v !== undefined) {
      log.log({ field: `theme.colors.${key}`, action: 'invalid', from: v, to: defaultTheme.colors[key] });
    }
  }

  // Fonts
  const fonts = obj(t.fonts, {} as Record<string, unknown>);
  theme.fonts.heading = str(fonts.heading, 'Inter');
  theme.fonts.body = str(fonts.body, 'Inter');

  // Spacing
  theme.spacing = enumVal(t.spacing, VALID_SPACING, 'normal') as StoreTheme['spacing'];
  if (t.spacing && theme.spacing === 'normal' && !VALID_SPACING.has(t.spacing as string)) {
    log.log({ field: 'theme.spacing', action: 'invalid', from: t.spacing, to: 'normal' });
  }

  // Border radius
  theme.borderRadius = enumVal(t.borderRadius, VALID_BORDER_RADIUS, 'md') as StoreTheme['borderRadius'];

  return theme;
}

// ─── Section style normalization ──────────────────────────────────

function normalizeSectionStyle(raw: unknown, log: ReturnType<typeof createLogger>): SectionStyle {
  const s = obj(raw, {} as Record<string, unknown>);
  const style: SectionStyle = {};

  if (typeof s.backgroundColor === 'string' && s.backgroundColor) style.backgroundColor = s.backgroundColor;
  if (typeof s.textColor === 'string' && s.textColor) style.textColor = s.textColor;
  if (typeof s.backgroundImage === 'string' && s.backgroundImage) style.backgroundImage = s.backgroundImage;
  if (typeof s.overlay === 'boolean') style.overlay = s.overlay;

  style.paddingY = enumVal(s.paddingY, VALID_PADDING_Y, 'md') as SectionStyle['paddingY'];
  style.paddingX = enumVal(s.paddingX, VALID_PADDING_X, 'md') as SectionStyle['paddingX'];
  style.maxWidth = enumVal(s.maxWidth, VALID_MAX_WIDTH, 'lg') as SectionStyle['maxWidth'];
  style.borderRadius = enumVal(s.borderRadius, VALID_BORDER_RADIUS, 'none') as SectionStyle['borderRadius'];

  return style;
}

// ─── Section content normalization ────────────────────────────────

function normalizeSectionContent(type: SectionType, raw: unknown, log: ReturnType<typeof createLogger>): Record<string, unknown> {
  const c = obj(raw, {} as Record<string, unknown>);

  switch (type) {
    case 'hero': {
      return {
        headline: str(c.headline, 'Welcome'),
        subheadline: c.subheadline !== undefined ? str(c.subheadline, '') : undefined,
        ctaText: str(c.ctaText, 'Shop Now'),
        ctaLink: c.ctaLink !== undefined ? str(c.ctaLink, '#') : undefined,
        backgroundImage: c.backgroundImage !== undefined ? str(c.backgroundImage, '') : undefined,
        alignment: enumVal(c.alignment, VALID_ALIGNMENT, 'center'),
        height: enumVal(c.height, VALID_HEIGHT, 'lg'),
      };
    }
    case 'featured-products': {
      return {
        headline: str(c.headline, 'Featured Products'),
        subtitle: c.subtitle !== undefined ? str(c.subtitle, '') : undefined,
        productIds: arr<string>(c.productIds, []),
        columns: VALID_COLUMNS.has(num(c.columns, 3)) ? num(c.columns, 3) : 3,
        showPrice: bool(c.showPrice, true),
        showAddToCart: bool(c.showAddToCart, true),
      };
    }
    case 'product-grid': {
      return {
        headline: c.headline !== undefined ? str(c.headline, 'All Products') : undefined,
        columns: VALID_COLUMNS.has(num(c.columns, 3)) ? num(c.columns, 3) : 3,
        filterByCategory: c.filterByCategory !== undefined ? str(c.filterByCategory, '') : undefined,
        showPrice: bool(c.showPrice, true),
        showAddToCart: bool(c.showAddToCart, true),
      };
    }
    case 'text-banner': {
      return {
        headline: str(c.headline, 'Text Banner'),
        body: c.body !== undefined ? str(c.body, '') : undefined,
        alignment: enumVal(c.alignment, VALID_ALIGNMENT, 'center'),
        size: enumVal(c.size, VALID_SIZE, 'md'),
      };
    }
    case 'image-gallery': {
      const images = arr<Record<string, unknown>>(c.images, []);
      return {
        images: images.slice(0, 12).map((img) => ({
          src: str(img.src, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'),
          alt: str(img.alt, ''),
          caption: img.caption !== undefined ? str(img.caption, '') : undefined,
        })),
        columns: VALID_COLUMNS.has(num(c.columns, 3)) ? num(c.columns, 3) : 3,
        gap: enumVal(c.gap, VALID_GAP, 'md'),
      };
    }
    case 'testimonials': {
      const items = arr<Record<string, unknown>>(c.items, []);
      return {
        headline: c.headline !== undefined ? str(c.headline, '') : undefined,
        items: items.slice(0, 6).map((item) => ({
          id: isUUID(str(item.id, '')) ? str(item.id, '') : uuid(),
          quote: str(item.quote, 'Great product!'),
          author: str(item.author, 'Customer'),
          role: item.role !== undefined ? str(item.role, '') : undefined,
          avatar: item.avatar !== undefined ? str(item.avatar, '') : undefined,
          rating: num(item.rating, 5, 1, 5),
        })),
      };
    }
    case 'newsletter': {
      return {
        headline: str(c.headline, 'Stay Updated'),
        subtitle: c.subtitle !== undefined ? str(c.subtitle, '') : undefined,
        placeholderText: c.placeholderText !== undefined ? str(c.placeholderText, 'Enter your email') : undefined,
        buttonText: str(c.buttonText, 'Subscribe'),
      };
    }
    case 'faq': {
      const items = arr<Record<string, unknown>>(c.items, []);
      return {
        headline: c.headline !== undefined ? str(c.headline, '') : undefined,
        items: items.slice(0, 8).map((item) => ({
          id: isUUID(str(item.id, '')) ? str(item.id, '') : uuid(),
          question: str(item.question, 'Common question?'),
          answer: str(item.answer, 'Common answer.'),
        })),
      };
    }
    case 'cta': {
      return {
        headline: str(c.headline, 'Take Action'),
        body: c.body !== undefined ? str(c.body, '') : undefined,
        ctaText: str(c.ctaText, 'Learn More'),
        ctaLink: c.ctaLink !== undefined ? str(c.ctaLink, '#') : undefined,
        style: enumVal(c.style, VALID_CTA_STYLE, 'solid'),
      };
    }
    case 'categories': {
      const items = arr<Record<string, unknown>>(c.items, []);
      return {
        headline: c.headline !== undefined ? str(c.headline, '') : undefined,
        items: items.slice(0, 8).map((item) => ({
          id: isUUID(str(item.id, '')) ? str(item.id, '') : uuid(),
          name: str(item.name, 'Category'),
          image: item.image !== undefined ? str(item.image, '') : undefined,
          productCount: num(item.productCount, 5, 0),
          slug: str(item.slug, 'category'),
        })),
        columns: VALID_COLUMNS.has(num(c.columns, 3)) ? num(c.columns, 3) : 3,
      };
    }
    case 'header': {
      const menuItems = arr<Record<string, unknown>>(c.menuItems, []);
      return {
        logo: c.logo !== undefined ? str(c.logo, '') : undefined,
        storeName: str(c.storeName, 'My Store'),
        showSearch: bool(c.showSearch, true),
        showCart: bool(c.showCart, true),
        menuItems: menuItems.slice(0, 8).map((mi) => ({
          label: str(mi.label, 'Link'),
          link: str(mi.link, '#'),
        })),
      };
    }
    case 'footer': {
      const columns = arr<Record<string, unknown>>(c.columns, []);
      const socialLinks = arr<Record<string, unknown>>(c.socialLinks, []);
      return {
        storeName: str(c.storeName, 'My Store'),
        tagline: c.tagline !== undefined ? str(c.tagline, '') : undefined,
        columns: columns.slice(0, 4).map((col) => ({
          title: str(col.title, 'Links'),
          links: arr<Record<string, unknown>>(col.links, []).slice(0, 6).map((link) => ({
            label: str(link.label, 'Link'),
            link: str(link.link, '#'),
          })),
        })),
        socialLinks: socialLinks.slice(0, 6).map((sl) => ({
          platform: str(sl.platform, 'twitter'),
          url: str(sl.url, '#'),
        })),
        copyrightText: c.copyrightText !== undefined ? str(c.copyrightText, '') : undefined,
      };
    }
    case 'rich-text': {
      return {
        html: str(c.html, '<p>Content coming soon.</p>'),
      };
    }
    case 'spacer': {
      return {
        height: enumVal(c.height, VALID_HEIGHT, 'md'),
      };
    }
    case 'divider': {
      return {};
    }
    default: {
      // Unknown section type — return generic content that won't crash the renderer
      log.log({ field: `section.type`, action: 'invalid', from: type, to: 'text-banner' });
      return { headline: 'Section', alignment: 'center', size: 'md' };
    }
  }
}

// ─── Section normalization ────────────────────────────────────────

function normalizeSection(raw: unknown, log: ReturnType<typeof createLogger>): Section {
  const s = obj(raw, {} as Record<string, unknown>);

  // Validate and normalize type
  let type = str(s.type, 'text-banner').toLowerCase().trim() as SectionType;
  if (!VALID_SECTION_TYPES.has(type)) {
    log.log({ field: 'section.type', action: 'invalid', from: s.type, to: 'text-banner' });
    type = 'text-banner';
  }

  return {
    id: isUUID(str(s.id, '')) ? str(s.id, '') : uuid(),
    type,
    content: normalizeSectionContent(type, s.content, log),
    style: normalizeSectionStyle(s.style, log),
    visible: bool(s.visible, true),
  };
}

// ─── Product normalization ────────────────────────────────────────

function normalizeProduct(raw: unknown, log: ReturnType<typeof createLogger>): StoreProduct {
  const p = obj(raw, {} as Record<string, unknown>);

  const name = oneLine(str(p.name, 'Product'));
  const price = num(p.price, 29.99, 0.01, 999999);
  const images = arr<string>(p.images, ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600']);

  // Normalize variants
  const rawVariants = arr<Record<string, unknown>>(p.variants, []);
  const variants = rawVariants.slice(0, 5).map((v) => ({
    id: isUUID(str(v.id, '')) ? str(v.id, '') : uuid(),
    name: str(v.name, 'Size'),
    options: arr<Record<string, unknown>>(v.options, [{ label: 'M', value: 'm' }]).slice(0, 6).map((opt) => ({
      label: str(opt.label, 'Option'),
      value: str(opt.value, 'option'),
    })),
    price: v.price !== undefined ? num(v.price, undefined as unknown as number, 0) : undefined,
    inStock: bool(v.inStock, true),
  }));

  return {
    id: isUUID(str(p.id, '')) ? str(p.id, '') : uuid(),
    name,
    price,
    compareAtPrice: p.compareAtPrice !== undefined && p.compareAtPrice !== null ? num(p.compareAtPrice, undefined as unknown as number, 0) : undefined,
    images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'],
    description: oneLine(str(p.description, '')),
    category: p.category !== undefined ? str(p.category, '') : undefined,
    variants: variants.length > 0 ? variants : undefined,
    featured: bool(p.featured, false),
    inStock: bool(p.inStock, true),
  };
}

// ─── Page normalization ───────────────────────────────────────────

function normalizePage(raw: unknown, log: ReturnType<typeof createLogger>): StorePage {
  const p = obj(raw, {} as Record<string, unknown>);

  return {
    id: isUUID(str(p.id, '')) ? str(p.id, '') : uuid(),
    name: str(p.name, 'Home').substring(0, 100),
    slug: str(p.slug, ''),
    isHomepage: bool(p.isHomepage, false),
    sections: arr<unknown>(p.sections, []).map((s) => normalizeSection(s, log)),
  };
}

// ─── Cross-reference fixes ────────────────────────────────────────

/** Hard-cap enforcement: truncate sections and products to safe output limits.
 *  This is the safety net if the AI ignores the system prompt caps.
 *  Layers of defense:
 *    1. sanitizePrompt() in route.ts strips count requests (prevents AI from trying)
 *    2. System prompt ABSOLUTE CAPS language (strong AI guidance)
 *    3. THIS function: hard truncation (final safety net)
 */
function enforceOutputCaps(store: Store, log: ReturnType<typeof createLogger>): void {
  const MAX_PRODUCTS = 3;
  const MAX_SECTIONS = 4;

  // ── Cap products ──
  if (store.products.length > MAX_PRODUCTS) {
    const before = store.products.length;
    store.products = store.products.slice(0, MAX_PRODUCTS);
    // Ensure at least 1 featured product after truncation
    if (!store.products.some((p) => p.featured) && store.products.length > 0) {
      store.products[0].featured = true;
    }
    log.log({
      field: 'products',
      action: 'coerced',
      from: `${before} products`,
      to: `${MAX_PRODUCTS} products (capped)`,
    });
  }

  // ── Cap sections per page ──
  for (const page of store.pages) {
    if (page.sections.length > MAX_SECTIONS) {
      const before = page.sections.length;
      page.sections = page.sections.slice(0, MAX_SECTIONS);
      log.log({
        field: `pages[${page.name}].sections`,
        action: 'coerced',
        from: `${before} sections`,
        to: `${MAX_SECTIONS} sections (capped)`,
      });
    }
  }
}

/** Fix productIds in featured-products sections to reference actual products */
function fixProductReferences(store: Store, log: ReturnType<typeof createLogger>): void {
  const validProductIds = new Set(store.products.map((p) => p.id));
  const allProductIds = store.products.map((p) => p.id);

  for (const page of store.pages) {
    for (const section of page.sections) {
      if (section.type === 'featured-products' && Array.isArray(section.content.productIds)) {
        const before = section.content.productIds.length;
        // Keep only IDs that reference actual products
        const validIds = (section.content.productIds as string[]).filter((id) => validProductIds.has(id));

        // Fill missing slots with other product IDs so all products are shown
        const usedIds = new Set(validIds);
        for (const pid of allProductIds) {
          if (validIds.length >= store.products.length) break;
          if (!usedIds.has(pid)) {
            validIds.push(pid);
            usedIds.add(pid);
          }
        }

        if (validIds.length !== before) {
          const invalidCount = before - (validIds.length - (store.products.length - before > 0 ? store.products.length - before : 0));
          log.log({ field: 'featured-products.productIds', action: 'coerced', from: `${before} IDs (some invalid)`, to: `${validIds.length} valid IDs` });
        }
        section.content.productIds = validIds;
      }
    }
  }
}

/** Ensure at least one page is marked as homepage */
function ensureHomepage(store: Store, log: ReturnType<typeof createLogger>): void {
  const hasHomepage = store.pages.some((p) => p.isHomepage);
  if (!hasHomepage && store.pages.length > 0) {
    store.pages[0].isHomepage = true;
    log.log({ field: 'pages[0].isHomepage', action: 'defaulted', from: false, to: true });
  }
}

/** Ensure at least 1 product is marked as featured (for featured-products sections) */
function ensureFeaturedProducts(store: Store, log: ReturnType<typeof createLogger>): void {
  const featuredCount = store.products.filter((p) => p.featured).length;
  if (featuredCount < 1 && store.products.length >= 1) {
    store.products[0].featured = true;
    log.log({ field: 'products[0].featured', action: 'defaulted', from: false, to: true });
  }
}

/** Pad product array to MIN_PRODUCTS if AI generated too few */
const MIN_PRODUCTS = 3;
const PAD_PRODUCT_TEMPLATES = [
  { name: 'Essential Item', price: 39.99, description: 'A must-have for every collection.', category: 'Essentials', img: 'photo-1505740420928-5e560c06d30e' },
  { name: 'Popular Choice', price: 59.99, description: 'Customer favorite, highly rated.', category: 'Popular', img: 'photo-1526170375885-4d8ecf77b99f' },
];
function padProducts(store: Store, log: ReturnType<typeof createLogger>): void {
  const deficit = MIN_PRODUCTS - store.products.length;
  if (deficit <= 0) return;
  const before = store.products.length;
  for (let i = 0; i < deficit; i++) {
    const tmpl = PAD_PRODUCT_TEMPLATES[i % PAD_PRODUCT_TEMPLATES.length];
    store.products.push({
      id: uuid(),
      name: tmpl.name + (store.products.length + 1),
      price: tmpl.price + store.products.length * 5,
      compareAtPrice: null,
      images: [`https://images.unsplash.com/${tmpl.img}?w=600`],
      description: tmpl.description,
      category: tmpl.category,
      featured: false,
      inStock: true,
    });
  }
  log.log({ field: 'products', action: 'defaulted', from: `${before} products`, to: `${MIN_PRODUCTS} products (padded)` });
}

// ─── Main entry point ─────────────────────────────────────────────

export interface NormalizeResult {
  store: Store;
  log: string[];        // Human-readable log lines
  summary: string;      // One-line summary
  isFallback: boolean;  // true if the input was too broken to normalize
  normalizationCount: number; // Number of fixes applied
}

/**
 * Normalize any valid JSON object into a conformant Store.
 *
 * This function NEVER throws. If the input is too malformed to recover,
 * it returns null and the caller should use a hardcoded fallback store.
 *
 * @param raw - Parsed JSON object (JSON.parse already succeeded)
 * @param prompt - Original user prompt (for fallback name extraction)
 */
export function normalizeStore(raw: unknown, prompt?: string): NormalizeResult | null {
  const log = createLogger();

  // ── Guard: must be a non-null object ──
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn('[normalizeStore] Input is not an object:', typeof raw);
    return null;
  }

  const r = raw as Record<string, unknown>;

  // ── Extract store name (used as fallback for missing name) ──
  const storeName = oneLine(str(r.name, prompt ? extractStoreNameFromPrompt(prompt) : 'My Store'));

  if (!r.name || typeof r.name !== 'string') {
    log.log({ field: 'name', action: 'missing', to: storeName });
  }

  // ── Top-level fields ──
  const now = new Date().toISOString();
  const store: Store = {
    id: isUUID(str(r.id, '')) ? str(r.id, '') : uuid(),
    name: storeName.substring(0, 100),
    slug: slugify(storeName),
    description: r.description !== undefined ? oneLine(str(r.description, '')) : undefined,
    theme: r.theme ? normalizeTheme(r.theme, log) : defaultTheme,
    pages: Array.isArray(r.pages)
      ? r.pages.map((p: unknown) => normalizePage(p, log))
      : [createDefaultPage(storeName)],
    products: Array.isArray(r.products)
      ? (r.products as unknown[]).map((p: unknown) => normalizeProduct(p, log))
      : [],
    published: bool(r.published, false),
    publishedAt: r.publishedAt !== undefined ? str(r.publishedAt, '') : undefined,
    createdAt: str(r.createdAt, now),
    updatedAt: str(r.updatedAt, now),
  };

  // Log missing arrays
  if (!Array.isArray(r.pages)) log.log({ field: 'pages', action: 'missing' });
  if (!Array.isArray(r.products)) log.log({ field: 'products', action: 'missing' });
  if (!r.theme) log.log({ field: 'theme', action: 'missing' });

  // ── Ensure at least one page exists ──
  if (store.pages.length === 0) {
    store.pages.push(createDefaultPage(storeName));
    log.log({ field: 'pages', action: 'defaulted' });
  }

  // ── Ensure at least one product exists (renderer expects products array) ──
  if (store.products.length === 0) {
    store.products.push(createDefaultProduct());
    log.log({ field: 'products', action: 'defaulted' });
  }

  // ── Cross-reference fixes ──
  // IMPORTANT: enforceOutputCaps MUST run before fixProductReferences
  // because product references depend on the final product list
  enforceOutputCaps(store, log);
  padProducts(store, log);
  fixProductReferences(store, log);
  ensureHomepage(store, log);
  ensureFeaturedProducts(store, log);

  // ── Build result ──
  const logEntries = log.getLogs();
  const logLines = logEntries.map(
    (l) => `[${l.action}] ${l.field}${l.from !== undefined ? ` (was: ${JSON.stringify(l.from).substring(0, 60)})` : ''}${l.to !== undefined ? ` → ${JSON.stringify(l.to).substring(0, 60)}` : ''}`
  );

  return {
    store,
    log: logLines,
    summary: log.summary(),
    isFallback: false,
    normalizationCount: logEntries.length,
  };
}

// ─── Default builders (used when AI output is completely missing a section) ──

function createDefaultPage(storeName: string): StorePage {
  return {
    id: uuid(),
    name: 'Home',
    slug: '',
    isHomepage: true,
    sections: [
      {
        id: uuid(),
        type: 'hero',
        content: {
          headline: `Welcome to ${storeName}`,
          subheadline: 'Discover our curated collection.',
          ctaText: 'Shop Now',
          ctaLink: '#products',
          alignment: 'center',
          height: 'lg',
        },
        style: { paddingY: 'xl', paddingX: 'md', maxWidth: 'lg', borderRadius: 'none' },
        visible: true,
      },
    ],
  };
}

function createDefaultProduct(): StoreProduct {
  return {
    id: uuid(),
    name: 'Featured Product',
    price: 49.99,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'],
    description: 'Our signature product, crafted with care.',
    featured: true,
    inStock: true,
  };
}

/** Extract a short store name from a user prompt (lightweight version for normalization) */
function extractStoreNameFromPrompt(prompt: string): string {
  const text = prompt.trim();

  // Brand name after "called / named / known as"
  const calledMatch = text.match(/(?:called|named|known\s+as)\s+([\w&'\-]+(?:\s+[\w&'\-]+){0,2})/i);
  if (calledMatch?.[1]) {
    const name = calledMatch[1].replace(/\s+(selling|with|that|for|using|featuring)\s*$/i, '').trim();
    if (name.length >= 2 && name.length <= 40) return name;
  }

  // Quoted brand name
  const quotedMatch = text.match(/["']([^"']{2,40})["']/);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  // Strip common prefixes
  const stripped = text
    .replace(/^(build|create|make|design|set\s+up)\s+(a|an|the|my)\s+/i, '')
    .replace(/\b(online|e-commerce|ecommerce)\s+(store|shop|boutique)\b/gi, '')
    .replace(/\b(store|shop|boutique|website|site|brand)\b/gi, '')
    .replace(/\b(selling|with|that|for|using|featuring)\b.*/i, '')
    .trim();

  // Find title-case run
  const words = stripped.split(/\s+/).filter(w => w.length >= 2);
  const isTitle = (w: string) => w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase();
  let bestRun: string[] = [];
  let currentRun: string[] = [];
  for (const w of words) {
    if (isTitle(w)) {
      currentRun.push(w.replace(/[^a-zA-Z0-9&'-]/g, ''));
    } else {
      if (currentRun.length > bestRun.length) bestRun = currentRun;
      currentRun = [];
    }
  }
  if (currentRun.length > bestRun.length) bestRun = currentRun;

  if (bestRun.length >= 1) {
    const candidate = bestRun.slice(0, 3).join(' ');
    if (candidate.length >= 2 && candidate.length <= 40) return candidate;
  }

  return 'My Store';
}