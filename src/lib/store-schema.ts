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
  | 'header'
  | 'footer'
  | 'rich-text'
  | 'spacer'
  | 'divider';

export interface SectionStyle {
  backgroundColor?: string;
  textColor?: string;
  paddingY?: 'sm' | 'md' | 'lg' | 'xl';
  paddingX?: 'sm' | 'md' | 'lg';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  backgroundImage?: string;
  overlay?: boolean;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg';
}

export interface Section {
  id: string;
  type: SectionType;
  content: Record<string, unknown>;
  style: SectionStyle;
  visible: boolean;
}

// Section content schemas by type
export interface HeroContent {
  headline: string;
  subheadline?: string;
  ctaText: string;
  ctaLink?: string;
  backgroundImage?: string;
  alignment: 'left' | 'center' | 'right';
  height: 'sm' | 'md' | 'lg' | 'xl';
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
}

export interface StorePage {
  id: string;
  name: string;
  slug: string;
  isHomepage: boolean;
  sections: Section[];
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  theme: StoreTheme;
  pages: StorePage[];
  products: StoreProduct[];
  published: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  | { type: 'bulk-update'; payload: Partial<Store> };

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  operations?: ChatEditOperation[];
}
