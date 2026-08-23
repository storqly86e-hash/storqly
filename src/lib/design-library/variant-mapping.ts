// ========================================
// Design Library Variant Mapping
// ========================================
//
// Maps each of the 73 design library component IDs to how they
// should render in Storqly. Each mapping specifies a fallback
// SectionType, whether a new React component is needed, and
// any config overrides to apply.

// ── Variant mapping interface ───────────────────────────────

export interface VariantMapping {
  /** The full library component id (e.g. 'hero.editorial_product_still_life') */
  componentId: string
  /** Which Storqly SectionType to use as fallback renderer */
  sectionType: string
  /** Whether a NEW React component is needed (not handled by default section renderer) */
  isNewComponent: boolean
  /** Import path for the new component (only when isNewComponent is true) */
  newComponentPath?: string
  /** Content/style overrides to apply to the section */
  configOverrides?: Record<string, unknown>
  /** Human-readable explanation of the mapping strategy */
  description: string
}

// ── Full mapping table ─────────────────────────────────────
//
// Total: 73 component IDs mapped across 20 families.
// Sub-components (button, product-card, commerce-pattern, navigation)
// map to 'spacer' or their parent section type since they are
// not standalone sections.

const MAPPINGS: Array<VariantMapping> = [
  // ─── HEROES (12) ───────────────────────────────────────────
  {
    componentId: 'hero.editorial_product_still_life',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'split-left',
      backgroundTreatment: 'editorial',
      vignette: true,
      visualPriority: 'product',
      headlineSize: 'lg',
    },
    description: 'Premium still-life hero. Renders via default hero section with split-left layout, editorial background treatment, and vignette overlay.',
  },
  {
    componentId: 'hero.split_context_product',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'split-left',
      backgroundTreatment: 'soft',
    },
    description: 'Contextual split hero. Renders via default hero section with split-left layout and soft background.',
  },
  {
    componentId: 'hero.fullbleed_copy_safe_area',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'minimal',
      backgroundTreatment: 'none',
    },
    description: 'Full-bleed hero with a dedicated copy safe area. Uses minimal hero layout with no background treatment.',
  },
  {
    componentId: 'hero.asymmetric_offset_product',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'split-left',
      backgroundTreatment: 'none',
      headlineSize: 'lg',
    },
    description: 'Asymmetric offset product hero. Renders via default hero section with variant-config-resolver providing unique CSS vars for offset composition.',
  },
  {
    componentId: 'hero.product_stack_vertical',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'product-first',
      productTreatment: 'floating',
    },
    description: 'Vertical product stack hero. Uses product-first layout with floating product treatment.',
  },
  {
    componentId: 'hero.collection_rail',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'minimal',
      headlineSize: 'lg',
    },
    description: 'Collection rail hero. Renders via default hero section with variant-config-resolver CSS vars for rail-style layout.',
  },
  {
    componentId: 'hero.editorial_masthead',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'minimal',
      headlineSize: 'xl',
    },
    description: 'Editorial masthead hero. Uses minimal centered layout with extra-large headline.',
  },
  {
    componentId: 'hero.dark_campaign_statement',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'minimal',
      backgroundTreatment: 'dramatic',
    },
    description: 'Dark campaign statement hero. Renders via default hero section with dark contrast mode, grain overlay, and strong typography from variant-config-resolver.',
  },
  {
    componentId: 'hero.ingredient_focus',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'split-left',
      backgroundTreatment: 'soft',
    },
    description: 'Ingredient-focused hero for science-backed brands. Renders via default hero section with centered product treatment from variant-config-resolver.',
  },
  {
    componentId: 'hero.ugc_collage',
    sectionType: 'hero',
    isNewComponent: false,
    configOverrides: {
      layout: 'split-left',
      backgroundTreatment: 'soft',
    },
    description: 'UGC collage hero. Renders via default hero section with variant-config-resolver CSS vars for collage-style multi-image composition.',
  },
  {
    componentId: 'hero.category_portal',
    sectionType: 'categories',
    isNewComponent: false,
    configOverrides: {},
    description: 'Category portal hero. Reuses the categories section type with category tiles layout.',
  },
  {
    componentId: 'hero.launch_countdown',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {},
    description: 'Launch countdown hero. Reuses the CTA section with countdown-timed urgency note.',
  },

  // ─── PRODUCT-GRID (6) ─────────────────────────────────────
  {
    componentId: 'product-grid.luxury_gallery',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {
      columns: 3,
    },
    description: 'Luxury gallery product grid. 3-column spacious layout with editorial card styling.',
  },
  {
    componentId: 'product-grid.utility_dense',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {
      columns: 4,
    },
    description: 'Utility dense product grid. 4-column compact layout for large catalogs.',
  },
  {
    componentId: 'product-grid.bold_rail',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {
      columns: 3,
    },
    description: 'Bold rail product grid. 3-column layout with high-impact card styling.',
  },
  {
    componentId: 'product-grid.bestseller_focus',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {
      columns: 3,
    },
    description: 'Bestseller focus product grid. 3-column layout highlighting popular items.',
  },
  {
    componentId: 'product-grid.swatch_gallery',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {
      columns: 3,
    },
    description: 'Swatch gallery product grid. 3-column layout with color/material swatch card variants.',
  },
  {
    componentId: 'product-grid.bundle_collection',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {
      columns: 3,
    },
    description: 'Bundle collection product grid. 3-column layout with bundle/kit card presentation.',
  },

  // ─── COLLECTION (3) ───────────────────────────────────────
  {
    componentId: 'collection.lookbook_tiles',
    sectionType: 'categories',
    isNewComponent: false,
    configOverrides: {},
    description: 'Lookbook tiles collection. Reuses categories section with lookbook-style image tiles.',
  },
  {
    componentId: 'collection.filter_sidebar',
    sectionType: 'categories',
    isNewComponent: false,
    configOverrides: {},
    description: 'Filter sidebar collection. Reuses categories section with sidebar filter interaction.',
  },
  {
    componentId: 'collection.story_chapters',
    sectionType: 'categories',
    isNewComponent: false,
    configOverrides: {},
    description: 'Story chapters collection. Reuses categories section with narrative chapter tiles.',
  },

  // ─── CATEGORY (2) ─────────────────────────────────────────
  {
    componentId: 'category.icon_tiles',
    sectionType: 'categories',
    isNewComponent: false,
    configOverrides: {},
    description: 'Icon tiles category. Reuses categories section with icon-based category tiles.',
  },
  {
    componentId: 'category.material_index',
    sectionType: 'categories',
    isNewComponent: false,
    configOverrides: {},
    description: 'Material index category. Reuses categories section organized by material type.',
  },

  // ─── FEATURED-PRODUCT (2) ─────────────────────────────────
  {
    componentId: 'featured-product.proof_led',
    sectionType: 'featured-products',
    isNewComponent: false,
    configOverrides: {},
    description: 'Proof-led featured product. Reuses featured-products section with proof/rating emphasis.',
  },
  {
    componentId: 'featured-product.routine_builder',
    sectionType: 'featured-products',
    isNewComponent: false,
    configOverrides: {},
    description: 'Routine builder featured product. Reuses featured-products section with routine/sequence layout.',
  },

  // ─── TESTIMONIALS (3) ─────────────────────────────────────
  {
    componentId: 'testimonials.quote_wall',
    sectionType: 'testimonials',
    isNewComponent: false,
    configOverrides: {},
    description: 'Quote wall testimonials. Reuses testimonials section with editorial quote layout.',
  },
  {
    componentId: 'testimonials.rating_rail',
    sectionType: 'testimonials',
    isNewComponent: false,
    configOverrides: {},
    description: 'Rating rail testimonials. Reuses testimonials section with horizontal rating scroll.',
  },
  {
    componentId: 'testimonials.ugc_rail',
    sectionType: 'testimonials',
    isNewComponent: false,
    configOverrides: {},
    description: 'UGC rail testimonials. Reuses testimonials section with user-generated content rail.',
  },

  // ─── TRUST (3) ────────────────────────────────────────────
  {
    componentId: 'trust.proof_strip',
    sectionType: 'text-banner',
    isNewComponent: false,
    configOverrides: {},
    description: 'Proof strip trust section. Reuses text-banner as a lightweight trust indicators row.',
  },
  {
    componentId: 'trust.certification_row',
    sectionType: 'text-banner',
    isNewComponent: false,
    configOverrides: {},
    description: 'Certification row trust section. Reuses text-banner for certification badge display.',
  },
  {
    componentId: 'trust.social_count',
    sectionType: 'text-banner',
    isNewComponent: false,
    configOverrides: {},
    description: 'Social count trust section. Reuses text-banner for follower/review count display.',
  },

  // ─── PROMOTION (3) ────────────────────────────────────────
  {
    componentId: 'promotion.campaign_split',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {},
    description: 'Campaign split promotion. Reuses CTA section with campaign offer layout.',
  },
  {
    componentId: 'promotion.sticker_campaign',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {},
    description: 'Sticker campaign promotion. Reuses CTA section with sticker-style offer badge.',
  },
  {
    componentId: 'promotion.inline_offer',
    sectionType: 'text-banner',
    isNewComponent: false,
    configOverrides: {},
    description: 'Inline offer promotion. Reuses text-banner as a lightweight inline offer strip.',
  },

  // ─── CTA (5) ──────────────────────────────────────────────
  {
    componentId: 'cta.premium_invitation',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {
      style: 'outline',
    },
    description: 'Premium invitation CTA. Uses CTA section with outline button style.',
  },
  {
    componentId: 'cta.strong_statement',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {
      style: 'solid',
    },
    description: 'Strong statement CTA. Uses CTA section with solid button style.',
  },
  {
    componentId: 'cta.community_invite',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {},
    description: 'Community invite CTA. Uses standard CTA section layout.',
  },
  {
    componentId: 'cta.urgency_panel',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {},
    description: 'Urgency panel CTA. Uses standard CTA section with urgency messaging.',
  },
  {
    componentId: 'cta.editorial_invite',
    sectionType: 'cta',
    isNewComponent: false,
    configOverrides: {
      style: 'outline',
    },
    description: 'Editorial invite CTA. Uses CTA section with outline button style and editorial tone.',
  },

  // ─── NEWSLETTER (3) ───────────────────────────────────────
  {
    componentId: 'newsletter.split_capture',
    sectionType: 'newsletter',
    isNewComponent: false,
    configOverrides: {},
    description: 'Split capture newsletter. Uses standard newsletter section with split layout.',
  },
  {
    componentId: 'newsletter.editorial_capture',
    sectionType: 'newsletter',
    isNewComponent: false,
    configOverrides: {},
    description: 'Editorial capture newsletter. Uses standard newsletter section with editorial styling.',
  },
  {
    componentId: 'newsletter.waitlist_capture',
    sectionType: 'newsletter',
    isNewComponent: false,
    configOverrides: {},
    description: 'Waitlist capture newsletter. Uses standard newsletter section with waitlist messaging.',
  },

  // ─── BRAND-STORY (3) ──────────────────────────────────────
  {
    componentId: 'brand-story.split_art-directed',
    sectionType: 'brand-statement',
    isNewComponent: false,
    configOverrides: {},
    description: 'Split art-directed brand story. Reuses brand-statement section with asymmetric image layout.',
  },
  {
    componentId: 'brand-story.founder_note',
    sectionType: 'brand-statement',
    isNewComponent: false,
    configOverrides: {},
    description: 'Founder note brand story. Reuses brand-statement section with personal founder message.',
  },
  {
    componentId: 'brand-story.timeline',
    sectionType: 'brand-statement',
    isNewComponent: false,
    configOverrides: {},
    description: 'Timeline brand story. Reuses brand-statement section with timeline layout.',
  },

  // ─── EDITORIAL (2) ────────────────────────────────────────
  {
    componentId: 'editorial.longform_split',
    sectionType: 'rich-text',
    isNewComponent: false,
    configOverrides: {},
    description: 'Longform split editorial. Reuses rich-text section with split image-text layout.',
  },
  {
    componentId: 'editorial.quote_feature',
    sectionType: 'rich-text',
    isNewComponent: false,
    configOverrides: {},
    description: 'Quote feature editorial. Reuses rich-text section with featured quote layout.',
  },

  // ─── FEATURE-BENEFITS (3) ────────────────────────────────
  {
    componentId: 'feature-benefits.ingredient_index',
    sectionType: 'faq',
    isNewComponent: false,
    configOverrides: {},
    description: 'Ingredient index feature-benefits. Reuses FAQ section restructured as benefit/ingredient items.',
  },
  {
    componentId: 'feature-benefits.icon_row',
    sectionType: 'faq',
    isNewComponent: false,
    configOverrides: {},
    description: 'Icon row feature-benefits. Reuses FAQ section with icon-led benefit items.',
  },
  {
    componentId: 'feature-benefits.numbered_columns',
    sectionType: 'faq',
    isNewComponent: false,
    configOverrides: {},
    description: 'Numbered columns feature-benefits. Reuses FAQ section with numbered step items.',
  },

  // ─── GALLERY (2) ──────────────────────────────────────────
  {
    componentId: 'gallery.editorial_masonry',
    sectionType: 'image-gallery',
    isNewComponent: false,
    configOverrides: {},
    description: 'Editorial masonry gallery. Reuses image-gallery section with masonry layout.',
  },
  {
    componentId: 'gallery.lookbook_grid',
    sectionType: 'image-gallery',
    isNewComponent: false,
    configOverrides: {},
    description: 'Lookbook grid gallery. Reuses image-gallery section with uniform grid layout.',
  },

  // ─── FOOTER (3) ───────────────────────────────────────────
  {
    componentId: 'footer.editorial_columns',
    sectionType: 'footer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Editorial columns footer. Reuses footer section with editorial column layout.',
  },
  {
    componentId: 'footer.utility_rich',
    sectionType: 'footer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Utility rich footer. Reuses footer section with dense utility links.',
  },
  {
    componentId: 'footer.community_ribbon',
    sectionType: 'footer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Community ribbon footer. Reuses footer section with community/social emphasis.',
  },

  // ─── HEADER (2) ───────────────────────────────────────────
  {
    componentId: 'header.wordmark_center',
    sectionType: 'header',
    isNewComponent: false,
    configOverrides: {},
    description: 'Wordmark center header. Reuses header section with centered wordmark layout.',
  },
  {
    componentId: 'header.utility_split',
    sectionType: 'header',
    isNewComponent: false,
    configOverrides: {},
    description: 'Utility split header. Reuses header section with split utility navigation.',
  },

  // ─── ANNOUNCEMENT-BAR (2) ────────────────────────────────
  {
    componentId: 'announcement.utility_single',
    sectionType: 'text-banner',
    isNewComponent: false,
    configOverrides: {},
    description: 'Utility single announcement bar. Reuses text-banner as a thin single-message variant.',
  },
  {
    componentId: 'announcement.rail_rotating',
    sectionType: 'text-banner',
    isNewComponent: false,
    configOverrides: {},
    description: 'Rail rotating announcement bar. Reuses text-banner as a thin rotating message variant.',
  },

  // ─── NAVIGATION (2) ───────────────────────────────────────
  // Navigation is handled by the header; these are sub-components.
  {
    componentId: 'navigation.mega_menu_editorial',
    sectionType: 'rich-text',
    isNewComponent: false,
    configOverrides: {},
    description: 'Mega menu editorial navigation. Navigation is handled by the header component; this maps to rich-text as a sub-component reference.',
  },
  {
    componentId: 'navigation.filter_toolbar',
    sectionType: 'rich-text',
    isNewComponent: false,
    configOverrides: {},
    description: 'Filter toolbar navigation. Navigation is handled by the header component; this maps to rich-text as a sub-component reference.',
  },

  // ─── BUTTON (3) ───────────────────────────────────────────
  // Buttons are sub-components rendered by their parent sections.
  {
    componentId: 'button.solid_primary',
    sectionType: 'spacer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Solid primary button. Sub-component rendered by parent sections — maps to invisible spacer utility.',
  },
  {
    componentId: 'button.underline_secondary',
    sectionType: 'spacer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Underline secondary button. Sub-component rendered by parent sections — maps to invisible spacer utility.',
  },
  {
    componentId: 'button.outline_quiet',
    sectionType: 'spacer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Outline quiet button. Sub-component rendered by parent sections — maps to invisible spacer utility.',
  },

  // ─── PRODUCT-CARD (7) ─────────────────────────────────────
  // Product cards are sub-components within product-grid sections.
  // The card style is determined by the grid variant, not individual card section type.
  {
    componentId: 'product-card.editorial_portrait',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Editorial portrait product card. Sub-component within product-grid — card style determined by grid variant.',
  },
  {
    componentId: 'product-card.utility_dense',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Utility dense product card. Sub-component within product-grid — card style determined by grid variant.',
  },
  {
    componentId: 'product-card.bold_utility',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Bold utility product card. Sub-component within product-grid — card style determined by grid variant.',
  },
  {
    componentId: 'product-card.bundle_stack',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Bundle stack product card. Sub-component within product-grid — card style determined by grid variant.',
  },
  {
    componentId: 'product-card.review_led',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Review-led product card. Sub-component within product-grid — card style determined by grid variant.',
  },
  {
    componentId: 'product-card.quick_add',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Quick add product card. Sub-component within product-grid — card style determined by grid variant.',
  },
  {
    componentId: 'product-card.swatch_story',
    sectionType: 'product-grid',
    isNewComponent: false,
    configOverrides: {},
    description: 'Swatch story product card. Sub-component within product-grid — card style determined by grid variant.',
  },

  // ─── COMMERCE-PATTERN (2) ─────────────────────────────────
  // Commerce patterns are sub-components within product sections.
  {
    componentId: 'commerce-pattern.add_to_cart',
    sectionType: 'spacer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Add to cart commerce pattern. Sub-component rendered by product sections — maps to invisible spacer utility.',
  },
  {
    componentId: 'commerce-pattern.variant_selector',
    sectionType: 'spacer',
    isNewComponent: false,
    configOverrides: {},
    description: 'Variant selector commerce pattern. Sub-component rendered by product sections — maps to invisible spacer utility.',
  },
]

// ── Build lookup map ────────────────────────────────────────

const variantMap = new Map<string, VariantMapping>(
  MAPPINGS.map((m) => [m.componentId, m]),
)

// ── Public API ──────────────────────────────────────────────

/**
 * Get the variant mapping for a given design library component ID.
 * Returns a default no-op mapping if the ID is not found.
 * Logs a warning when falling back so missing mappings are observable.
 */
export function getVariantMapping(componentId: string): VariantMapping {
  const mapping = variantMap.get(componentId)
  if (!mapping) {
    console.warn(
      `[variant-mapping] No mapping for componentId="${componentId}". ` +
      `Section will render with generic spacer/layout. This usually means the ` +
      `AI generated an unknown component ID or the design library is missing this variant.`,
    )
    return {
      componentId,
      sectionType: 'spacer',
      isNewComponent: false,
      configOverrides: {},
      description: `No mapping defined for ${componentId}. Falls back to spacer.`,
    }
  }
  return mapping
}

/**
 * The full map of all 73 variant mappings.
 * Useful for iterating all mappings or building UI selectors.
 */
export { variantMap as variantMappingsMap }