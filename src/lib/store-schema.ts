// ========================================
// Storqly Store Schema — Single Source of Truth
// ========================================
// Both the chat AI and visual editor operate on this schema.
// The renderer reads this schema to produce the visual store.

export interface StoreTheme {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  spacing: 'compact' | 'normal' | 'spacious';
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export interface StoreProduct {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  images: string[];
  description: string;
  category?: string;
  variants?: ProductVariant[];
  featured?: boolean;
  inStock: boolean;
}

export interface ProductVariant {
  id: string;
  name: string;
  options: { label: string; value: string }[];
  price?: number;
  inStock: boolean;
}

export type SectionType =
  | 'hero'
  | 'featured-products'
  | 'product-grid'
  | 'text-banner'
  | 'image-gallery'
  | 'testimonials'
  | 'newsletter'
  | 'faq'
  | 'cta'
  | 'categories'
  | 'brand-statement'
  | 'header'
  | 'footer'
  | 'rich-text'
  | 'spacer'
  | 'divider';

export interface SectionStyle {
  // Section-level
  backgroundColor?: string;
  textColor?: string;
  paddingY?: 'sm' | 'md' | 'lg' | 'xl';
  paddingX?: 'sm' | 'md' | 'lg';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  backgroundImage?: string;
  overlay?: boolean;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg';
  // Element-level overrides (sub-element targeting)
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  headlineColor?: string;
}

// ── Design Library Integration Types ─────────────────────────
// These types prepare Storqly for the external ecommerce design library.
// All fields are optional to maintain full backward compatibility.
// When absent, the system falls back to legacy behavior.

/** Page-level role from the design library composition system (orient, merchandise, educate, etc.) */
export type DesignRole =
  | 'orient' | 'merchandise' | 'educate' | 'differentiate'
  | 'reassure' | 'engage' | 'convert' | 'retain';

/** Component metadata linking a section to a design library variant. */
export interface ComponentMeta {
  /** Design library family (e.g. 'hero', 'product-card', 'cta', 'testimonials') */
  family?: string;
  /** Design library variant (e.g. 'editorial_product_still_life', 'premium_invitation') */
  variant?: string;
  /** Library component id (e.g. 'hero.editorial_product_still_life') */
  componentId?: string;
  /** Role this section plays in the page composition */
  role?: DesignRole;
  /** Tags from the library for filtering/selection */
  tags?: string[];
}

/** Per-breakpoint responsive overrides for a section */
export interface ResponsiveOverrides {
  compact?: Partial<Record<string, unknown>>;
  medium?: Partial<Record<string, unknown>>;
  wide?: Partial<Record<string, unknown>>;
}

/** Image art direction for contextual image generation/enrichment */
export interface ImageArtDirection {
  /** Brief description of what the image should show */
  brief?: string;
  /** Aspect ratio preference (e.g. '3:2', '16:9', '1:1') */
  aspectRatio?: string;
  /** Mood/feeling keywords */
  mood?: string[];
  /** What to avoid in the image */
  avoid?: string[];
  /** Whether this is a contextual background, product shot, campaign image, or UGC */
  slotType?: 'context_background' | 'product_image' | 'campaign_image' | 'ugc';
}

export interface Section {
  id: string;
  type: SectionType;
  content: Record<string, unknown>;
  style: SectionStyle;
  visible: boolean;
  /** Design library component reference — when present, the renderer can resolve
   *  this to a library-aware component instead of the default section renderer. */
  componentMeta?: ComponentMeta;
  /** Responsive overrides per breakpoint — library can specify mobile/tablet/desktop
   *  content/layout adjustments without changing the base content. */
  responsiveOverrides?: ResponsiveOverrides;
  /** Image art direction — guides image search/generation for this section's media. */
  imageArtDirection?: ImageArtDirection;
}

// ── Hero layout modes ─────────────────────────────────────
// centered: text only, centered (minimal/legacy)
// split-left: text left 50% + product right 50%
// split-right: product left 50% + text right 50%
// product-first: product 60% dominant + text 40%
// text-first: text 60% dominant + product 40%
// minimal: premium centered, no product, generous whitespace
export type HeroLayout =
  | 'centered'
  | 'split-left'
  | 'split-right'
  | 'product-first'
  | 'text-first'
  | 'minimal';

// ── Hero CTA style variants ─────────────────────────────────
export type HeroCtaStyle = 'filled' | 'outline' | 'gradient';

// ── Hero product image treatment ────────────────────────────
export type HeroProductTreatment = 'floating' | 'framed' | 'cutout' | 'shadow';

// Section content schemas by type
export interface HeroContent {
  headline: string;
  subheadline?: string;
  ctaText: string;
  ctaLink?: string;
  backgroundImage?: string;
  alignment: 'left' | 'center' | 'right';
  height: 'sm' | 'md' | 'lg' | 'xl';
  // Phase 3A: Design richness
  badge?: string;                       // Eyebrow text above headline (e.g. "NEW COLLECTION")
  layout?: HeroLayout;                 // Layout mode — controls composition
  heroImage?: string;                  // Foreground image for split/product layouts
  secondaryCtaText?: string;           // Optional secondary button label (outline style)
  secondaryCtaLink?: string;           // Optional secondary button link
  // Banner composition engine
  visualPriority?: 'product' | 'headline' | 'balanced';
  backgroundTreatment?: 'none' | 'soft' | 'editorial' | 'dramatic';
  vignette?: boolean;
  // Phase 4: Professional banner upgrade
  ctaStyle?: HeroCtaStyle;             // CTA button visual style
  productTreatment?: HeroProductTreatment; // Product image presentation style
  badgeStyle?: 'outlined' | 'filled' | 'gradient'; // Badge visual variant
  headlineSize?: 'sm' | 'md' | 'lg' | 'xl'; // Headline font size scale
  // Phase 5: Multi-image hero carousel
  heroImages?: Array<{ src: string; alt?: string; role?: string }>;
  carouselEnabled?: boolean;           // Auto-rotation on/off
  carouselInterval?: number;            // Seconds between slides (default 5)
  initialSlide?: number;                // Which image shows first
}

export interface FeaturedProductsContent {
  headline: string;
  subtitle?: string;
  productIds: string[];
  columns: 2 | 3 | 4;
  showPrice: boolean;
  showAddToCart: boolean;
}

export interface ProductGridContent {
  headline?: string;
  columns: 2 | 3 | 4;
  filterByCategory?: string;
  showPrice: boolean;
  showAddToCart: boolean;
}

export interface TextBannerContent {
  headline: string;
  body?: string;
  alignment: 'left' | 'center' | 'right';
  size: 'sm' | 'md' | 'lg';
}

export interface ImageGalleryContent {
  images: { src: string; alt: string; caption?: string }[];
  columns: 2 | 3 | 4;
  gap: 'sm' | 'md' | 'lg';
}

export interface TestimonialsContent {
  headline?: string;
  items: {
    id: string;
    quote: string;
    author: string;
    role?: string;
    avatar?: string;
    rating?: number;
  }[];
}

export interface NewsletterContent {
  headline: string;
  subtitle?: string;
  placeholderText?: string;
  buttonText: string;
}

export interface FAQContent {
  headline?: string;
  items: {
    id: string;
    question: string;
    answer: string;
  }[];
}

export interface CTAContent {
  headline: string;
  body?: string;
  ctaText: string;
  ctaLink?: string;
  style: 'solid' | 'outline' | 'gradient';
}

export interface CategoriesContent {
  headline?: string;
  items: {
    id: string;
    name: string;
  image?: string;
    productCount?: number;
  slug: string;
  }[];
  columns: 2 | 3 | 4;
}

export interface BrandStatementContent {
  headline: string;
  body?: string;
  backgroundImage?: string;
  alignment: 'left' | 'center' | 'right';
}

export interface RichTextContent {
  html: string;
}

export interface SpacerContent {
  height: 'sm' | 'md' | 'lg' | 'xl';
}

export interface HeaderContent {
  logo?: string;
  storeName: string;
  showSearch: boolean;
  showCart: boolean;
  menuItems: { label: string; link: string }[];
}

export interface FooterContent {
  storeName: string;
  tagline?: string;
  columns: {
    title: string;
    links: { label: string; link: string }[];
  }[];
  socialLinks?: { platform: string; url: string }[];
  copyrightText?: string;
  // Phase 3A: Design richness
  logo?: string;                       // Store logo URL
  contactInfo?: {
    email?: string;
    phone?: string;
    address?: string;
  };
}

// Page types — determines how a page is rendered
// 'home' = section-based (AI-generated content)
// 'collection' = template (all products grid)
// 'product' = template (single product detail)
// 'cart' = template (shopping cart)
// 'checkout' = template (checkout form + order summary)
// 'custom' = section-based (like home, but user-created)
export type PageType = 'home' | 'collection' | 'product' | 'cart' | 'checkout' | 'custom';

export interface StorePage {
  id: string;
  name: string;
  slug: string;
  type?: PageType; // defaults to 'home' for backward compatibility
  isHomepage: boolean;
  productId?: string; // for 'product' type — references a product in store.products
  sections: Section[];
  /** Brand-specific metadata for template pages (Shop, Cart, Checkout). Theme-aware text overrides. */
  metadata?: Record<string, string>;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  announcementText?: string;
  theme: StoreTheme;
  pages: StorePage[];
  products: StoreProduct[];
  published: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Design library integration metadata. When present, indicates the store was
   *  generated with design library awareness. Absent = legacy generation. */
  designLibrary?: {
    /** Library version (e.g. '1.0.0') */
    version?: string;
    /** Composition recipe used (e.g. 'luxury_editorial_launch') */
    recipe?: string;
    /** Typography system selected (e.g. 'editorial_serif_sans') */
    typographySystem?: string;
    /** Density preset selected (e.g. 'airy', 'balanced', 'compact') */
    densityPreset?: string;
    /** Full composition result including token CSS vars and visual rhythm.
     *  Saved during generation so the renderer can consume design tokens
     *  and per-section rhythm without recomputation. */
    compositionResult?: {
      /** Resolved design token CSS vars (--sq-font-heading, --sq-heading-lg-*, etc.) */
      tokenCssVars?: Record<string, string>;
      /** Per-section visual rhythm configs */
      sectionRhythm?: Array<{
        nodeIndex: number;
        rhythmConfig: {
          density: string;
          surfaceStyle: string;
          contentWidth: string;
          verticalSpacing: string;
          visualWeight: string;
        };
        rhythmCssVars: Record<string, string>;
      }>;
    };
  };
}

// Default theme for new stores
export const defaultTheme: StoreTheme = {
  colors: {
    primary: '#6366f1',
    secondary: '#ec4899',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
  },
  spacing: 'normal',
  borderRadius: 'md',
};

// Helper to create a blank store
export function createBlankStore(name: string): Store {
  return {
    id: crypto.randomUUID(),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    theme: { ...defaultTheme },
    pages: [
      {
        id: crypto.randomUUID(),
        name: 'Home',
        slug: '',
        isHomepage: true,
        sections: [],
      },
    ],
    products: [],
    published: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Demo Store ──────────────────────────────────────────────────
// A fully-populated sample store for preview/testing without AI.
// This lets users see the editor + preview panel even when AI is
// unavailable (rate-limited, offline, etc.).

export function createDemoStore(): Store {
  const pid = (i: number) => `demo-prod-${i}`
  const sid = (i: number) => `demo-sec-${i}`
  const now = new Date().toISOString()

  return {
    id: 'demo-store',
    name: 'Lumière Jewelry',
    slug: 'lumiere-jewelry-demo',
    description: 'Handcrafted luxury jewelry for the modern woman',
    theme: {
      colors: {
        primary: '#b8860b',
        secondary: '#c9a96e',
        accent: '#e8d5b7',
        background: '#fefcf8',
        surface: '#faf6ef',
        text: '#1a1a2e',
        textMuted: '#6b7280',
        border: '#e5e0d5',
      },
      fonts: { heading: 'Playfair Display', body: 'Inter' },
      spacing: 'spacious',
      borderRadius: 'lg',
    },
    pages: [
      {
        id: 'demo-home',
        name: 'Home',
        slug: '',
        isHomepage: true,
        sections: [
          {
            id: sid(1), type: 'hero', visible: true, style: { height: 'lg', overlay: true },
            content: { headline: 'Timeless Elegance, Handcrafted With Love', subheadline: 'Discover our curated collection of artisan jewelry — each piece tells a story.', ctaText: 'Explore Collection', ctaLink: '#products', alignment: 'left', height: 'lg', layout: 'split-left', backgroundTreatment: 'editorial', vignette: true, visualPriority: 'balanced', badge: 'HANDCRAFTED' },
          },
          {
            id: sid(2), type: 'featured-products', visible: true, style: { paddingY: 'xl' },
            content: { headline: 'Best Sellers', subtitle: 'Our most loved pieces, chosen by you', productIds: [pid(1), pid(2), pid(3), pid(4), pid(5), pid(6)], columns: 3, showPrice: true, showAddToCart: true },
          },
          {
            id: sid(3), type: 'testimonials', visible: true, style: { backgroundColor: '#faf6ef' },
            content: { headline: 'What Our Customers Say', items: [
              { id: 't1', quote: 'The quality is absolutely stunning. My ring gets compliments every day.', author: 'Sarah M.', role: 'Verified Buyer', rating: 5 },
              { id: 't2', quote: 'Fast shipping and the packaging was beautiful. Perfect gift for my wife.', author: 'James K.', role: 'Verified Buyer', rating: 5 },
              { id: 't3', quote: 'I love how each piece feels unique. You can tell it\'s made with care.', author: 'Priya R.', role: 'Verified Buyer', rating: 5 },
            ] },
          },
          {
            id: sid(4), type: 'newsletter', visible: true, style: { backgroundColor: '#1a1a2e', textColor: '#ffffff' },
            content: { headline: 'Join the Lumière Circle', subtitle: 'Get early access to new collections and exclusive offers', placeholderText: 'Enter your email', buttonText: 'Subscribe' },
          },
        ],
      },
      { id: 'demo-shop', name: 'Shop', slug: 'shop', type: 'collection', isHomepage: false, sections: [] },
      { id: 'demo-cart', name: 'Cart', slug: 'cart', type: 'cart', isHomepage: false, sections: [] },
      { id: 'demo-checkout', name: 'Checkout', slug: 'checkout', type: 'checkout', isHomepage: false, sections: [] },
    ],
    products: [
      { id: pid(1), name: 'Golden Sunburst Ring', price: 129, compareAtPrice: 159, images: ['https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&h=600&fit=crop'], description: 'A radiant sunburst design in 18k gold plating.', category: 'Rings', inStock: true, featured: true },
      { id: pid(2), name: 'Moonstone Pendant Necklace', price: 89, images: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&h=600&fit=crop'], description: 'Ethereal moonstone on a delicate silver chain.', category: 'Necklaces', inStock: true, featured: true },
      { id: pid(3), name: 'Pearl Drop Earrings', price: 75, compareAtPrice: 95, images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&h=600&fit=crop'], description: 'Classic freshwater pearl drops with sterling silver hooks.', category: 'Earrings', inStock: true, featured: true },
      { id: pid(4), name: 'Rose Gold Bangle', price: 149, images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&h=600&fit=crop'], description: 'Minimalist rose gold bangle for everyday elegance.', category: 'Bracelets', inStock: true, featured: true },
      { id: pid(5), name: 'Sapphire Halo Ring', price: 199, compareAtPrice: 249, images: ['https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=600&h=600&fit=crop'], description: 'Stunning sapphire surrounded by a diamond halo.', category: 'Rings', inStock: true, featured: false },
      { id: pid(6), name: 'Vintage Pearl Choker', price: 115, images: ['https://images.unsplash.com/photo-1515562141589-67f0d569b6c3?w=600&h=600&fit=crop'], description: 'Art deco inspired pearl choker for special occasions.', category: 'Necklaces', inStock: true, featured: false },
    ],
    published: false,
    createdAt: now,
    updatedAt: now,
  }
}

// Chat edit operation types
export type ChatEditOperation =
  | { type: 'update-theme'; payload: Partial<StoreTheme> }
  | { type: 'update-section'; payload: { sectionId: string; content: Record<string, unknown>; style?: SectionStyle } }
  | { type: 'add-section'; payload: { pageId: string; section: Section; index?: number } }
  | { type: 'remove-section'; payload: { pageId: string; sectionId: string } }
  | { type: 'reorder-sections'; payload: { pageId: string; sectionIds: string[] } }
  | { type: 'update-page'; payload: { pageId: string; name?: string; slug?: string } }
  | { type: 'add-product'; payload: StoreProduct }
  | { type: 'update-product'; payload: { productId: string; data: Partial<StoreProduct> } }
  | { type: 'remove-product'; payload: { productId: string } }
  | { type: 'bulk-update'; payload: Partial<Store> }
  | { type: 'add-page'; payload: { name: string; slug: string; sections?: Section[] } }
  | { type: 'remove-page'; payload: { pageId: string } }
  | { type: 'rename-page'; payload: { pageId: string; name: string; slug?: string } };

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  operations?: ChatEditOperation[];
}
