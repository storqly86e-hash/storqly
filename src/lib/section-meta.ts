// ========================================
// Shared Section Type Metadata
// ========================================
// Used by both VisualEditor and StoreRenderer for consistent
// section type labels, icons, and default content.

import type { SectionType, Section } from './store-schema';
import type { LucideIcon } from 'lucide-react';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
  Layout,
  Star,
  Grid3X3,
  Type,
  Image,
  Quote,
  Mail,
  HelpCircle,
  MousePointerClick,
  FolderOpen,
  Minus,
  FileText,
  PanelTop,
  PanelBottom,
} from 'lucide-react';

// ── Section type icon mapping ───────────────────────────────────────

export const SECTION_TYPE_ICONS: Record<SectionType, LucideIcon> = {
  hero: Layout,
  'featured-products': Star,
  'product-grid': Grid3X3,
  'text-banner': Type,
  'image-gallery': Image,
  testimonials: Quote,
  newsletter: Mail,
  faq: HelpCircle,
  cta: MousePointerClick,
  categories: FolderOpen,
  'brand-statement': Type,
  spacer: Minus,
  divider: Minus,
  'rich-text': FileText,
  header: PanelTop,
  footer: PanelBottom,
};

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  'featured-products': 'Featured Products',
  'product-grid': 'Product Grid',
  'text-banner': 'Text Banner',
  'image-gallery': 'Image Gallery',
  testimonials: 'Testimonials',
  newsletter: 'Newsletter',
  faq: 'FAQ',
  cta: 'CTA',
  categories: 'Categories',
  'brand-statement': 'Brand Statement',
  spacer: 'Spacer',
  divider: 'Divider',
  'rich-text': 'Rich Text',
  header: 'Header',
  footer: 'Footer',
};

/** Section types available for user addition (exclude header/footer) */
export const ADDABLE_SECTION_TYPES: SectionType[] = [
  'hero',
  'featured-products',
  'text-banner',
  'image-gallery',
  'testimonials',
  'newsletter',
  'faq',
  'cta',
  'categories',
  'brand-statement',
  'spacer',
  'divider',
  'rich-text',
];

// ── Default content factories ───────────────────────────────────────

export function getDefaultContent(type: SectionType): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return {
        headline: 'New Hero Section',
        subheadline: 'Add your subheadline here',
        ctaText: 'Shop Now',
        alignment: 'center',
        height: 'md',
        layout: 'centered',
      };
    case 'featured-products':
      return {
        headline: 'Featured Products',
        subtitle: 'Check out our best sellers',
        productIds: [],
        columns: 4,
        showPrice: true,
        showAddToCart: true,
      };
    case 'product-grid':
      return {
        headline: 'All Products',
        columns: 4,
        showPrice: true,
        showAddToCart: true,
      };
    case 'text-banner':
      return {
        headline: 'Announcement',
        body: 'Add your announcement text here',
        alignment: 'center',
        size: 'md',
      };
    case 'image-gallery':
      return { images: [], columns: 3, gap: 'md' };
    case 'testimonials':
      return {
        headline: 'What Our Customers Say',
        items: [
          {
            id: crypto.randomUUID(),
            quote: 'Amazing products and fast delivery!',
            author: 'Jane Doe',
            role: 'Happy Customer',
            rating: 5,
          },
        ],
      };
    case 'newsletter':
      return {
        headline: 'Stay in the Loop',
        subtitle: 'Subscribe for exclusive deals and updates',
        placeholderText: 'Enter your email',
        buttonText: 'Subscribe',
      };
    case 'faq':
      return {
        headline: 'Frequently Asked Questions',
        items: [
          {
            id: crypto.randomUUID(),
            question: 'How long does shipping take?',
            answer: 'Standard shipping takes 3-5 business days.',
          },
        ],
      };
    case 'cta':
      return {
        headline: 'Ready to Get Started?',
        body: 'Join thousands of satisfied customers today.',
        ctaText: 'Get Started',
        style: 'solid',
      };
    case 'categories':
      return {
        headline: 'Shop by Category',
        items: [],
        columns: 4,
      };
    case 'brand-statement':
      return {
        headline: 'Our Promise',
        body: 'Quality craftsmanship in every detail.',
        alignment: 'center',
      };
    case 'spacer':
      return { height: 'md' };
    case 'divider':
      return {};
    case 'rich-text':
      return { html: '<p>Add your content here...</p>' };
    case 'header':
      return {
        storeName: 'My Store',
        showSearch: true,
        showCart: true,
        menuItems: [
          { label: 'Home', link: '/' },
          { label: 'Shop', link: '/shop' },
          { label: 'Contact', link: '/contact' },
        ],
      };
    case 'footer':
      return {
        storeName: 'My Store',
        tagline: 'Quality products, delivered fast.',
        columns: [
          {
            title: 'Quick Links',
            links: [
              { label: 'Home', link: '/' },
              { label: 'Shop', link: '/shop' },
              { label: 'About', link: '/about' },
              { label: 'Contact', link: '/contact' },
            ],
          },
          {
            title: 'Customer Service',
            links: [
              { label: 'FAQ', link: '/faq' },
              { label: 'Shipping', link: '/shipping' },
              { label: 'Returns', link: '/returns' },
            ],
          },
        ],
        socialLinks: [
          { platform: 'instagram', url: '#' },
          { platform: 'twitter', url: '#' },
          { platform: 'facebook', url: '#' },
        ],
        contactInfo: {
          email: 'hello@mystore.com',
        },
        copyrightText: `© ${new Date().getFullYear()} My Store. All rights reserved.`,
      };
    default:
      return {};
  }
}

export function createDefaultSection(type: SectionType): Section {
  return {
    id: crypto.randomUUID(),
    type,
    content: getDefaultContent(type),
    style: {},
    visible: true,
  };
}
