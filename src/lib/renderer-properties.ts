// ========================================
// Renderer-Consumed Property Registry
// ========================================
// Maps each section type to the set of content/style
// properties that the renderer ACTUALLY reads and renders.
//
// Used by the chat edit system to:
// 1. Verify mutations target real properties
// 2. Reject mutations for properties the renderer ignores
// 3. Build semantic mutation maps

export const RENDERER_CONSUMED: Record<
  string,
  { content: string[]; style: string[] }
> = {
  hero: {
    content: [
      'headline', 'subheadline', 'ctaText', 'ctaLink', 'backgroundImage',
      'alignment', 'height', 'badge', 'layout', 'heroImage',
      'secondaryCtaText', 'secondaryCtaLink', 'visualPriority',
      'backgroundTreatment', 'vignette', 'ctaStyle', 'productTreatment',
      'badgeStyle', 'headlineSize',
      // Phase 5: carousel
      'heroImages', 'carouselEnabled', 'carouselInterval', 'initialSlide',
    ],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'backgroundImage', 'overlay', 'borderRadius',
      'buttonBackgroundColor', 'buttonTextColor', 'headlineColor',
    ],
  },
  'featured-products': {
    content: ['headline', 'subtitle', 'productIds', 'columns', 'showPrice', 'showAddToCart'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'buttonBackgroundColor', 'buttonTextColor', 'headlineColor',
    ],
  },
  'product-grid': {
    content: ['headline', 'columns', 'filterByCategory', 'showPrice', 'showAddToCart'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'buttonBackgroundColor', 'buttonTextColor', 'headlineColor',
    ],
  },
  'text-banner': {
    content: ['headline', 'body', 'alignment', 'size'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'headlineColor',
    ],
  },
  'image-gallery': {
    content: ['images', 'columns', 'gap'],
    style: ['backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth', 'borderRadius'],
  },
  testimonials: {
    content: ['headline', 'items'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'headlineColor',
    ],
  },
  newsletter: {
    content: ['headline', 'subtitle', 'placeholderText', 'buttonText'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'buttonBackgroundColor', 'buttonTextColor', 'headlineColor',
    ],
  },
  faq: {
    content: ['headline', 'items'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'headlineColor',
    ],
  },
  cta: {
    content: ['headline', 'body', 'ctaText', 'ctaLink', 'style'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'buttonBackgroundColor', 'buttonTextColor', 'headlineColor',
    ],
  },
  categories: {
    content: ['headline', 'items', 'columns'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'headlineColor',
    ],
  },
  'brand-statement': {
    content: ['headline', 'body', 'backgroundImage', 'alignment'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'headlineColor',
    ],
  },
  header: {
    content: ['logo', 'storeName', 'showSearch', 'showCart', 'menuItems'],
    style: ['backgroundColor', 'textColor', 'paddingY', 'paddingX'],
  },
  footer: {
    content: ['storeName', 'tagline', 'logo', 'columns', 'socialLinks', 'contactInfo', 'copyrightText'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius', 'backgroundImage', 'overlay',
    ],
  },
  'rich-text': {
    content: ['html'],
    style: [
      'backgroundColor', 'textColor', 'paddingY', 'paddingX', 'maxWidth',
      'borderRadius',
    ],
  },
  spacer: {
    content: ['height'],
    style: ['paddingY', 'paddingX'],
  },
  divider: {
    content: [],
    style: ['paddingY', 'paddingX'],
  },
};

/**
 * Verify that a set of mutated properties are actually consumed by the renderer.
 * Returns { valid, rejected } — valid properties pass, rejected were ignored by renderer.
 */
export function verifyMutation(
  sectionType: string,
  contentFields: string[],
  styleFields: string[],
): { valid: string[]; rejected: string[] } {
  const spec = RENDERER_CONSUMED[sectionType];
  if (!spec) {
    // Unknown section type — accept all (don't block)
    return { valid: [...contentFields, ...styleFields], rejected: [] };
  }

  const valid: string[] = [];
  const rejected: string[] = [];

  for (const f of contentFields) {
    if (spec.content.includes(f)) {
      valid.push('content.' + f);
    } else {
      rejected.push('content.' + f);
    }
  }

  for (const f of styleFields) {
    if (spec.style.includes(f)) {
      valid.push('style.' + f);
    } else {
      rejected.push('style.' + f);
    }
  }

  return { valid, rejected };
}
