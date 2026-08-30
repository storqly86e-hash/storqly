'use client';

import { Component, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  parseColorToRGB,
  contrastTextColor,
  stringToColor,
  formatPrice,
  getInitials,
  pxClass,
  maxWidthClass,
  borderRadiusClass,
  gridCols,
  hexToRgba,
  darkenHex,
  lightenHex,
} from './helpers';
import { useCartStore } from '@/lib/cart-store';
import {
  Search,
  ShoppingCart,
  Star,
  ChevronDown,
  ChevronUp,
  Mail,
  ArrowRight,
  Minus,
} from 'lucide-react';
import type {
  StoreTheme,
  Section,
  HeroContent,
  HeroLayout,
  HeroCtaStyle,
  HeroProductTreatment,
  FeaturedProductsContent,
  ProductGridContent,
  TextBannerContent,
  ImageGalleryContent,
  TestimonialsContent,
  NewsletterContent,
  FAQContent,
  CTAContent,
  CategoriesContent,
  BrandStatementContent,
  RichTextContent,
  HeaderContent,
  FooterContent,
  SpacerContent,
  StoreProduct,
} from '@/lib/store-schema';
import { componentRegistry } from '@/lib/component-registry';
import type { SectionRendererProps } from '@/lib/component-registry';
import { resolveVariantConfig } from '@/lib/design-library/variant-config-resolver';
import type { CardStyle } from '@/lib/design-library/variant-config-resolver';
import { StoreImage } from './store-image';


// ─── Heading font helper ─────────────────────────────────────────────
// Returns fontFamily style when the store has a distinct heading font.
// This ensures the design library's typography system is respected.

function headingFontStyle(theme: StoreTheme): React.CSSProperties {
  if (theme.fonts.heading && theme.fonts.heading !== theme.fonts.body) {
    return { fontFamily: 'var(--sq-font-heading)' };
  }
  return {};
}

// Fluid typography helper — uses CSS clamp() for responsive sizing
function fluidHeadingStyle(baseSize: string = '1.875rem', minSize: string = '1.5rem', maxSize: string = '3rem'): React.CSSProperties {
  return { fontSize: `clamp(${minSize}, ${baseSize}, ${maxSize})` };
}

// ─── Error boundary for individual sections ──────────────────────────
// Prevents a malformed section from crashing the entire page.

interface SectionErrorBoundaryState { hasError: boolean; error: Error | null }
class SectionErrorBoundary extends Component<
  { children: React.ReactNode; sectionType: string },
  SectionErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; sectionType: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center py-8 px-6 text-center">
          <div className="max-w-sm rounded-xl border border-dashed border-gray-300 bg-gray-50/50 px-6 py-8">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-sm font-medium text-gray-700">
              {this.props.sectionType}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {this.state.error?.message || 'Rendering paused'}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Section Wrapper ────────────────────────────────────────────────────

interface SectionWrapperProps {
  section: Section;
  theme: StoreTheme;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
  children: React.ReactNode;
  /** CSS custom properties applied to the section wrapper div */
  cssVars?: Record<string, string>;
  /** Tailwind utility classes to append to the outer wrapper */
  extraClasses?: string;
}

function SectionWrapper({
  section,
  theme,
  selectedSectionId,
  onSelectSection,
  children,
  cssVars,
  extraClasses,
}: SectionWrapperProps) {
  const isSelected = selectedSectionId === section.id;
  const style = section.style;

  // ── Visual rhythm consumption ──
  // Rhythm vars are merged into section.style._rhythmCssVars by renderSection
  const rhythmVars = (style as Record<string, unknown>)?._rhythmCssVars as Record<string, string> | undefined;
  const rhythmSurface = rhythmVars?.['--rhythm-surface'];
  const rhythmWidth = rhythmVars?.['--rhythm-content-width'];
  const rhythmSpacing = rhythmVars?.['--rhythm-vertical-spacing'];

  // ── Generic section-level variant CSS var consumption ──
  const secSurface = cssVars?.['--section-surface'];
  const secDensity = cssVars?.['--section-density'];
  const secBorderMode = cssVars?.['--section-border-mode'];
  const secHeadingFont = cssVars?.['--section-heading-font'];
  const secHeadingWeight = cssVars?.['--section-heading-weight'];
  const secContrast = cssVars?.['--section-contrast'];
  const secButtonVariant = cssVars?.['--section-button-variant'];
  const secDividerMode = cssVars?.['--section-divider-mode'];
  const secImageRatio = cssVars?.['--section-image-ratio'];
  const secHeadingAlignment = cssVars?.['--section-heading-alignment'];

  let sectionBg = style.backgroundColor || theme.colors.background;

  // --section-surface: warm tint or default
  if (secSurface === 'warm' && !rhythmSurface) {
    sectionBg = style.backgroundColor || lightenHex(sectionBg, 0.02) || '#fafaf8';
  }
  const sectionText = style.textColor || theme.colors.text;

  // Rhythm surface: adjust background based on surface mode
  if (rhythmSurface === 'muted') {
    sectionBg = style.backgroundColor || lightenHex(sectionBg, 0.03) || '#fafaf8';
  } else if (rhythmSurface === 'inverse') {
    sectionBg = style.backgroundColor || theme.colors.text;
  }

  const bgImage = style.backgroundImage
    ? `url(${style.backgroundImage})`
    : undefined;

  // --section-density: compact or spacious padding override
  const densityPy = secDensity === 'compact'
    ? 'pt-4 pb-4'
    : secDensity === 'spacious'
      ? 'pt-16 pb-16'
      : '';
  // --section-border-mode: full border or none
  const secBorderClass = secBorderMode === 'full'
    ? 'border border-[var(--border,theme(colors.border))]'
    : '';
  // --section-contrast: high contrast inverts text on dark bg
  const secHighContrast = secContrast === 'high';

  // Responsive padding: ensures minimum py-8 on mobile, scales up on tablet/desktop
  // Only used when rhythm spacing is NOT overriding via inline style
  const responsivePy = style.paddingY === 'xl'
    ? 'py-8 md:py-14 lg:py-20'
    : style.paddingY === 'lg'
      ? 'py-6 md:py-10 lg:py-16'
      : style.paddingY === 'md'
        ? 'py-5 md:py-8 lg:py-12'
        : style.paddingY === 'sm'
          ? 'py-4 md:py-5 lg:py-8'
          : 'py-6 md:py-8 lg:py-12';

  const outerClasses = [
    'relative transition-all duration-200 cursor-pointer',
    // Rhythm vertical spacing overrides when present
    // Otherwise use responsive Tailwind padding classes
    rhythmSpacing ? '' : (densityPy || responsivePy),
    isSelected ? 'ring-2 ring-[#a855f7] ring-offset-2' : 'hover:ring-1 hover:ring-[#a855f7]/40',
    secBorderClass,
    extraClasses || '',
  ].join(' ');

  // Build inline style with variant CSS custom properties
  const inlineStyle: Record<string, string | undefined> = {
    backgroundColor: sectionBg,
    color: sectionText,
    backgroundImage: bgImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // Rhythm vertical spacing overrides padding
    ...(rhythmSpacing ? { paddingTop: rhythmSpacing, paddingBottom: rhythmSpacing } : {}),
    // --section-contrast: high contrast darkens background
    ...(secHighContrast ? { backgroundColor: '#0f0f0f', color: '#ffffff' } : {}),
  };

  // Build context object for children to consume generic section vars
  // Children can read these via variantCssVars (passed as prop), but for
  // generic vars we also apply heading font/weight here via a wrapper class.
  // Build scoped heading style overrides from generic section vars
  const headingOverrides = [
    secHeadingFont === 'serif' ? 'font-family:var(--sq-font-heading,serif)' : '',
    secHeadingWeight ? `font-weight:${secHeadingWeight}` : '',
    secHeadingAlignment === 'center' ? 'text-align:center' : secHeadingAlignment === 'right' ? 'text-align:right' : '',
  ].filter(Boolean).join(';');
  const buttonOverride = secButtonVariant === 'outline'
    ? 'border:2px solid currentColor;background:transparent'
    : '';
  if (cssVars && Object.keys(cssVars).length > 0) {
    // CSS custom properties must be set via type assertion
    // because React.CSSProperties doesn't include arbitrary --var keys
    Object.entries(cssVars).forEach(([key, value]) => {
      (inlineStyle as Record<string, string>)[key] = value;
    });
  }

  // Rhythm content width: modify the inner container's max-width
  const rhythmMaxWidthStyle = rhythmWidth
    ? { maxWidth: rhythmWidth === 'full' ? '100%' : rhythmWidth === 'narrow' ? '48rem' : rhythmWidth === 'wide' ? '90rem' : undefined }
    : {};

  return (
    <div
      className={outerClasses}
      style={inlineStyle as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection?.(isSelected ? null : section.id);
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      {/* Overlay for background images */}
      {style.backgroundImage && style.overlay && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}
      <div
        className={`relative z-10 mx-auto ${maxWidthClass(style.maxWidth)} ${pxClass(style.paddingX)}`}
        style={Object.keys(rhythmMaxWidthStyle).length > 0 ? rhythmMaxWidthStyle : undefined}
      >
        {/* Selected section label */}
        {isSelected && (
          <div className="absolute -top-3 left-4 z-20 rounded-full bg-[#a855f7] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-lg">
            {section.type.replace(/-/g, ' ')}
          </div>
        )}
        {/* --section-divider-mode: bottom divider */}
        {secDividerMode === 'border' && (
          <div className="absolute bottom-0 left-0 right-0 border-t" style={{ borderColor: theme.colors.border }} />
        )}
        {children}
        {/* --section-image-ratio: expose as data attribute for child images */}
        {secImageRatio && (
          <style>{`.section-img-ratio [data-section-img] { aspect-ratio: ${secImageRatio}; }`}</style>
        )}
        {/* --section-heading-font / --section-heading-weight / --section-heading-alignment: scoped heading overrides */}
        {headingOverrides && (
          <style>{`[data-section-id="${section.id}"] h2{${headingOverrides}}`}</style>
        )}
        {/* --section-button-variant: scoped button override */}
        {buttonOverride && (
          <style>{`[data-section-id="${section.id}"] > div > button, [data-section-id="${section.id}"] > div form button{${buttonOverride}}`}</style>
        )}
      </div>
    </div>
  );
}

// ─── Product Card (shared) ─────────────────────────────────────────────

function ProductCard({
  product,
  theme,
  showAddToCart,
  borderRadius,
  buttonBgOverride,
  buttonTextOverride,
  onViewProduct,
  cardStyle,
  cardStyleVars,
}: {
  product: StoreProduct;
  theme: StoreTheme;
  showAddToCart: boolean;
  borderRadius: string;
  buttonBgOverride?: string;
  buttonTextOverride?: string;
  onViewProduct?: (productId: string) => void;
  /** Design library card variant style */
  cardStyle?: CardStyle;
  /** Fine-grained --card-* CSS variable overrides from variant config */
  cardStyleVars?: Record<string, string>;
}) {
  const [hovered, setHovered] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const addToCart = useCartStore((s) => s.addItem);
  const imgColor = stringToColor(product.id, theme);
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

  // ── cardStyleVars helper ──
  const cv = (key: string, defaultValue: string) => {
    const val = cardStyleVars?.[key];
    return val !== undefined && val !== defaultValue ? val : null;
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1200);
  };

  // ── Card style variant derivatives ──
  const isDense = cardStyle === 'utility_dense';
  const isEditorial = cardStyle === 'editorial_portrait';
  const isBold = cardStyle === 'bold_utility';
  const isReviewLed = cardStyle === 'review_led';
  const isQuickAdd = cardStyle === 'quick_add';
  const isSwatch = cardStyle === 'swatch_story';
  const isBundle = cardStyle === 'bundle_stack';

  // ── cardStyleVars: fine-grained overrides ──
  const cvRadius = cv('--card-radius', '0.5rem');
  const cvPadding = cv('--card-padding', '1rem');
  const cvImageRatio = cv('--card-image-ratio', '4/5');
  const cvBorderWidth = cv('--card-border-width', '1px');
  const cvBorderColor = cv('--card-border-color', '#e5e7eb');
  const cvShadow = cv('--card-shadow', 'none');
  const cvTitleWeight = cv('--card-title-weight', '500');
  const cvTitleSize = cv('--card-title-size', 'text-sm');
  const cvPriceSize = cv('--card-price-size', 'text-sm');
  const cvHoverLift = cv('--card-hover-lift', '0');
  // Boolean overrides: null = defer to cardStyle, true/false = force
  const cvShowRating = cardStyleVars?.['--card-show-rating'] !== undefined
    ? cardStyleVars['--card-show-rating'] === 'true'
    : null;
  const cvHideBadge = cardStyleVars?.['--card-show-badge'] !== undefined
    ? cardStyleVars['--card-show-badge'] !== 'true'
    : null;
  const cvShowQuickAdd = cardStyleVars?.['--card-show-quick-add'] !== undefined
    ? cardStyleVars['--card-show-quick-add'] === 'true'
    : null;

  // Aspect ratio: editorial & review use 3/4, bold uses 4/5, rest 1/1 — or CSS var override
  const aspectRatioMap: Record<string, string> = {
    '3/4': 'aspect-[3/4]',
    '1/1': 'aspect-square',
  };
  const baseAspectClass = isEditorial || isReviewLed || isSwatch
    ? 'aspect-[3/4]'
    : isBold
      ? 'aspect-[4/5]'
      : 'aspect-square';
  const aspectClass = cvImageRatio
    ? (aspectRatioMap[cvImageRatio] || `aspect-[${cvImageRatio.replace('/', '/')}]`)
    : baseAspectClass;

  // Padding: dense is compact, editorial has more — or CSS var override
  const basePaddingClass = isDense ? 'p-2 sm:p-3' : isEditorial ? 'p-4 sm:p-6' : 'p-4 sm:p-5';
  const paddingClass = cvPadding ? undefined : basePaddingClass;

  // Border: bold gets thick border — or CSS var override
  const baseBorderClass = isBold
    ? 'border-2'
    : isEditorial
      ? 'border-0'
      : 'border border-gray-100';
  const borderClass = (cvBorderWidth || cvBorderColor) ? undefined : baseBorderClass;

  // Hover zoom: dense & bold skip hover zoom
  const imageHoverClass = (isDense || isBold) ? '' : 'group-hover:scale-105';

  // Hover lift CSS var override — applied via inline style when hovered
  const shouldApplyHoverLift = (isEditorial || isBundle || isReviewLed) || !!cvHoverLift;

  // Text sizing — with CSS var overrides
  const titleSizeMap: Record<string, string> = {
    'text-xs': 'text-xs',
    'text-sm': 'text-sm',
    'text-base': 'text-base',
    'text-lg': 'text-lg',
  };
  const priceSizeMap: Record<string, string> = {
    'text-xs': 'text-xs',
    'text-sm': 'text-sm',
    'text-base': 'text-base',
    'text-lg': 'text-lg',
  };
  const baseTitleClass = isDense
    ? 'text-sm font-medium leading-snug line-clamp-1'
    : isBold
      ? 'text-base font-bold leading-snug line-clamp-2'
      : 'text-base font-semibold leading-snug line-clamp-2';
  const titleClass = cvTitleSize || cvTitleWeight ? undefined : baseTitleClass;
  const titleInlineStyle: React.CSSProperties = {};
  if (cvTitleWeight) titleInlineStyle.fontWeight = cvTitleWeight;
  if (cvTitleSize) {
    const mapped = titleSizeMap[cvTitleSize];
    if (!mapped) titleInlineStyle.fontSize = cvTitleSize;
  }

  const categoryClass = isDense
    ? 'mb-0.5 text-[10px] font-medium uppercase tracking-wider'
    : 'mb-1.5 text-[11px] font-medium uppercase tracking-wider';

  const basePriceClass = isDense
    ? 'text-sm font-bold'
    : 'text-base font-bold';
  const priceClass = cvPriceSize ? undefined : basePriceClass;
  const priceInlineStyle: React.CSSProperties = {};
  if (cvPriceSize) {
    const mapped = priceSizeMap[cvPriceSize];
    if (!mapped) priceInlineStyle.fontSize = cvPriceSize;
  }

  // Hover lift for editorial/bundle/review
  const hoverLiftClass = shouldApplyHoverLift
    ? 'transition-transform duration-200 hover:-translate-y-1'
    : 'transition-shadow duration-200';

  // Shadow — or CSS var override
  const baseShadowClass = isEditorial ? 'shadow-none' : 'shadow-sm';
  const shadowClass = cvShadow ? undefined : baseShadowClass;

  // Simulated star rating for review_led
  const reviewStars = isReviewLed ? 4.5 : 0;
  // Show rating: review_led shows by default, --card-show-rating can force on/off
  const displayRating = cvShowRating !== null ? cvShowRating : !!isReviewLed;
  // Show category badge: shown by default, --card-show-badge can hide
  const displayBadge = cvHideBadge !== null ? !cvHideBadge : true;

  // Swatch colors for swatch_story
  const swatchColors = isSwatch
    ? ['#1a1a2e', '#b8860b', '#6b7280', '#ec4899']
    : [];

  // Bundle badge
  const showBundleBadge = isBundle;

  // ── Computed card wrapper styles from CSS vars ──
  const cardWrapperStyle: React.CSSProperties = {
    ...(isBold ? { borderColor: theme.colors.text } : { borderColor: theme.colors.border }),
    ...(cvRadius ? { borderRadius: cvRadius } : {}),
    ...(cvBorderWidth || cvBorderColor ? { border: `${cvBorderWidth || '1px'} solid ${cvBorderColor || '#e5e7eb'}` } : {}),
    ...(cvShadow ? { boxShadow: cvShadow } : {}),
    ...(cvHoverLift && cvHoverLift !== '0' && hovered ? { transform: `translateY(-${cvHoverLift})` } : {}),
    transition: 'transform 0.2s, box-shadow 0.2s',
  };

  // Build class list without border/shadow classes when overridden
  const cardClassBase = `${borderRadius} ${onViewProduct ? 'cursor-pointer' : ''} overflow-hidden bg-white ${borderClass ?? ''} ${shadowClass ?? ''} ${hoverLiftClass} group`;

  return (
    <div
      className={cardClassBase}
      style={cardWrapperStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onViewProduct ? () => onViewProduct(product.id) : undefined}
      role={onViewProduct ? 'button' : undefined}
      tabIndex={onViewProduct ? 0 : undefined}
    >
      {/* Product image */}
      <div
        className={`relative ${aspectClass} w-full overflow-hidden`}
        style={{ backgroundColor: imgColor }}
      >
        <StoreImage
          src={product.images[0] || ''}
          alt={product.name}
          fallbackColor={imgColor}
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-300 ${imageHoverClass}`}
          iconSize="lg"
        />
        {/* Out of stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
              Sold Out
            </span>
          </div>
        )}
        {/* Discount badge */}
        {hasDiscount && product.compareAtPrice && (
          <div className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% Off
          </div>
        )}
        {/* Bundle badge */}
        {showBundleBadge && (
          <div className="absolute right-2 top-2 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Bundle
          </div>
        )}
        {/* Quick-add overlay (from cardStyle quick_add or --card-show-quick-add override) */}
        {(isQuickAdd || cvShowQuickAdd === true) && product.inStock && (
          <button
            className={`absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all duration-200 cursor-pointer ${
              hovered
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-1 pointer-events-none'
            }`}
            style={{
              backgroundColor: addedFeedback ? '#16a34a' : (buttonBgOverride || theme.colors.primary),
              color: addedFeedback ? '#ffffff' : (buttonTextOverride || contrastTextColor(buttonBgOverride || theme.colors.primary)),
            }}
            onClick={(e) => { e.stopPropagation(); handleAddToCart(e); }}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {addedFeedback ? 'Added!' : 'Add'}
          </button>
        )}
      </div>
      {/* Info */}
      <div className={paddingClass} style={{ color: theme.colors.text, ...(cvPadding ? { padding: cvPadding } : {}) }}>
        {product.category && displayBadge && (
          <p className={categoryClass} style={{ color: theme.colors.textMuted }}>
            {product.category}
          </p>
        )}
        <h3 className={titleClass} style={{ color: theme.colors.text, ...titleInlineStyle }}>
          {product.name}
        </h3>
        {/* Swatch dots below product name */}
        {isSwatch && swatchColors.length > 0 && (
          <div className="mt-1.5 flex gap-1">
            {swatchColors.map((color, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-full border border-gray-200"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
        {/* Star rating for review_led or if --card-show-rating is true */}
        {displayRating && (
          <div className="mt-1.5 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-3 w-3 ${star <= Math.floor(reviewStars) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
              />
            ))}
            <span className="ml-1 text-[10px]" style={{ color: theme.colors.textMuted }}>{reviewStars}</span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className={priceClass} style={{ color: theme.colors.primary, ...priceInlineStyle }}>
            {formatPrice(product.price)}
          </span>
          {hasDiscount && product.compareAtPrice && (
            <span className="text-sm line-through" style={{ color: theme.colors.textMuted }}>
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </div>
        {/* Standard add-to-cart button — always visible on hover, slide-up animation */}
        {(showAddToCart || cvShowQuickAdd === true) && product.inStock && !isQuickAdd && (
          <button
            className={`mt-3 w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-300 ease-out cursor-pointer ${
              hovered
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
            style={{
              backgroundColor: addedFeedback ? '#16a34a' : (buttonBgOverride || theme.colors.primary),
              color: addedFeedback ? '#ffffff' : (buttonTextOverride || contrastTextColor(buttonBgOverride || theme.colors.primary)),
            }}
            onClick={handleAddToCart}
          >
            {addedFeedback ? '✓ Added' : 'Add to Cart'}
          </button>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════
// SECTION RENDERERS
// ═══════════════════════════════════════════════════════════════════════

// ─── 1. Header ──────────────────────────────────────────────────────────

export function HeaderSection({
  section,
  theme,
  selectedSectionId,
  onSelectSection,
  variantCssVars,
}: SectionRendererProps) {
  const content = section.content as unknown as HeaderContent;
  const isSelected = selectedSectionId === section.id;
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sticky scroll listener for micro-shrink effect
  useEffect(() => {
    const container = document.getElementById('store-renderer-root');
    const target = container || window;
    const handleScroll = () => {
      const scrollY = container ? container.scrollTop : window.scrollY;
      setScrolled(scrollY > 40);
    };
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;

  // Header-specific variant reads (reserved for future use)
  const headerBgColor = v('--header-bg-color');
  const headerTextColor = v('--header-text-color');
  const headerPosition = v('--header-position');
  const effectiveHeaderBg = headerBgColor || theme.colors.surface;
  const effectiveHeaderText = headerTextColor || theme.colors.text;
  const isSticky = headerPosition !== 'static';

  const logoScale = scrolled ? 'scale(0.92)' : 'scale(1)';
  const headerHeight = scrolled ? 'h-12' : 'h-16';
  const headerShadow = scrolled ? 'shadow-md' : 'shadow-none';

  return (
    <header
      className={`${isSticky ? 'sticky top-0' : 'relative'} z-40 border-b transition-all duration-300 ease-in-out ${headerShadow} ${
        isSelected
          ? 'ring-2 ring-[#a855f7] ring-offset-2'
          : 'cursor-pointer hover:ring-1 hover:ring-[#a855f7]/40'
      }`}
      style={{
        backgroundColor: effectiveHeaderBg,
        borderColor: theme.colors.border,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection?.(isSelected ? null : section.id);
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      <div className={`mx-auto flex ${headerHeight} max-w-6xl items-center justify-between px-6 transition-all duration-300`}>
        {/* Logo / Store Name */}
        <div className="flex items-center gap-3" style={{ transform: logoScale, transition: 'transform 0.3s ease' }}>
          {content.logo ? (
            <img
              src={content.logo}
              alt={content.storeName}
              className="h-8 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <span
            className={`text-lg font-bold tracking-tight transition-all duration-300 ${content.logo ? 'hidden' : ''}`}
            style={{ color: effectiveHeaderText }}
          >
            {content.storeName}
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          {content.menuItems.map((item) => (
            <span
              key={item.label}
              className="text-sm font-medium transition-all duration-200 hover:opacity-70 cursor-pointer relative after:absolute after:bottom-[-2px] after:left-0 after:h-[1.5px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full"
              style={{ color: headerTextColor || theme.colors.textMuted }}
            >
              {item.label}
            </span>
          ))}
        </nav>

        {/* Right icons */}
        <div className="flex items-center gap-4">
          {content.showSearch && (
            <button style={{ color: headerTextColor || theme.colors.textMuted }} aria-label="Search" className="transition-transform duration-200 hover:scale-110">
              <Search className="h-5 w-5" />
            </button>
          )}
          {content.showCart && (
            <button className="relative transition-transform duration-200 hover:scale-110" style={{ color: headerTextColor || theme.colors.textMuted }} aria-label="Cart">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: theme.colors.primary }}>
                0
              </span>
            </button>
          )}
          {/* Mobile menu toggle */}
          <button
            className="md:hidden transition-transform duration-200 hover:scale-110"
            style={{ color: headerTextColor || theme.colors.textMuted }}
            aria-label="Menu"
            onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(v => !v); }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <nav className="border-t px-6 py-4 md:hidden" style={{ borderColor: theme.colors.border, backgroundColor: effectiveHeaderBg }}>
          <div className="flex flex-col gap-3">
            {content.menuItems.map((item) => (
              <span
                key={item.label}
                className="text-sm font-medium py-1 transition-colors hover:opacity-70"
                style={{ color: effectiveHeaderText }}
                onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); }}
              >
                {item.label}
              </span>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

// ─── 2. Hero ────────────────────────────────────────────────────────────
// Phase 4: Professional e-commerce banner system
// - 6 layout modes with responsive recomposition
// - Theme-consistent CTA colors (uses brand palette, not generic white)
// - Professional typography hierarchy with responsive type scale
// - 4 product image treatments: floating, framed, cutout, shadow
// - Directional background overlays based on layout
// - 3 badge styles: outlined, filled, gradient
// - 3 CTA styles: filled, outline, gradient
// - Mobile-first responsive recomposition (not just shrinking)

export function HeroSection({ section, theme, selectedSectionId, onSelectSection, products, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as HeroContent;
  const style = section.style;
  const isSelected = selectedSectionId === section.id;
  const layout = content.layout || 'minimal';
  const ctaStyle = content.ctaStyle || 'filled';
  const productTreatment = content.productTreatment || 'floating';
  const badgeStyle = content.badgeStyle || 'outlined';

  // ── Theme colors (used throughout — declared early to avoid TDZ) ──
  const primaryColor = theme.colors.primary;
  const accentColor = theme.colors.accent;

  // ── Variant CSS variable consumption (Design Library) ──
  // Safe reads with fallback to current hardcoded defaults.
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;
  const vNum = (key: string, fallback: number = 0) => {
    const raw = variantCssVars?.[key];
    return raw !== undefined ? parseFloat(raw) : fallback;
  };
  const vBool = (key: string, fallback: boolean = false) => {
    const raw = variantCssVars?.[key];
    if (raw === undefined) return fallback;
    return raw === 'true' || raw === '1';
  };

  // Variant-aware overrides
  const heroOverlay = v('--hero-overlay');
  const heroTextPosition = v('--hero-text-position');
  const heroTextMaxWidth = v('--hero-text-max-width');
  const heroVignetteStrength = vNum('--hero-vignette-strength');
  const heroHeadlineWeight = v('--hero-headline-weight');
  const heroHeadlineLetterSpacing = v('--hero-headline-letter-spacing');
  const heroHeadlineTransform = v('--hero-headline-text-transform');
  const heroBadgeSize = v('--hero-badge-size');
  const heroBadgePadding = v('--hero-badge-padding');
  const heroProductShadow = v('--hero-product-shadow');
  const heroProductScale = vNum('--hero-product-scale', 1);
  const heroProductOffset = v('--hero-product-offset');
  const heroProductOverlap = vBool('--hero-product-overlap');
  const heroContrastMode = v('--hero-contrast-mode');
  const heroImageFit = v('--hero-image-fit');
  const heroAccentColor = v('--hero-accent-color');
  const heroCountdownVisible = vBool('--hero-countdown-visible');
  const heroUgcCollage = vBool('--hero-ugc-collage');
  const heroRailEnabled = vBool('--hero-rail-enabled');
  const heroGrainStrength = vNum('--hero-grain-strength');
  const heroUgcTileRotation = v('--hero-ugc-tile-rotation');
  const heroUgcBorderRadius = v('--hero-ugc-border-radius');
  const heroPortalGrid = vBool('--hero-portal-grid');
  const heroUrgencyLevel = v('--hero-urgency-level');

  const isCentered = layout === 'centered' || layout === 'minimal';
  const hasProductLayout = layout === 'split-left' || layout === 'split-right' || layout === 'product-first' || layout === 'text-first';

  // ── Product image resolution (memoized) ──
  const resolvedHeroImage = useMemo(() => {
    if (content.heroImage) return content.heroImage;
    if (!hasProductLayout) return undefined;
    return products.find(p => p.featured)?.images[0] || products[0]?.images[0];
  }, [content.heroImage, content.layout, products]);

  const showProduct = !!resolvedHeroImage && hasProductLayout;

  // ── Height (responsive-aware) — vh-based for mobile, generous on desktop ──
  const heightMap: Record<string, string> = {
    sm: 'min-h-[40vh] sm:min-h-[50vh] md:min-h-[55vh] lg:min-h-[60vh]',
    md: 'min-h-[45vh] sm:min-h-[55vh] md:min-h-[65vh] lg:min-h-[70vh]',
    lg: 'min-h-[50vh] sm:min-h-[60vh] md:min-h-[70vh] lg:min-h-[80vh]',
    xl: 'min-h-[55vh] sm:min-h-[65vh] md:min-h-[75vh] lg:min-h-[85vh]',
  };
  const minHeight = layout === 'minimal'
    ? (heightMap[content.height] || heightMap.md)
    : (heightMap[content.height] || heightMap.lg);

  // ── Alignment (centered / minimal layouts) ──
  // ── Alignment: variant --hero-text-position can override ──
  // Format: "left 4% top 30%" or "center" or "center bottom 12%"
  const getAlignmentFromPosition = (): string | undefined => {
    if (!heroTextPosition) return undefined;
    const pos = heroTextPosition.toLowerCase().trim();
    if (pos.startsWith('right')) return 'items-end text-right';
    if (pos.startsWith('left')) return 'items-start text-left';
    return 'items-center text-center';
  };
  const variantAlignClass = getAlignmentFromPosition();

  const alignClass = variantAlignClass || (isCentered
    ? ({ left: 'items-start text-left', center: 'items-center text-center', right: 'items-end text-right' } as const)[content.alignment]
    : 'items-center');

  // ── Hero Image Carousel ──
  const heroImages = content.heroImages && Array.isArray(content.heroImages) && content.heroImages.length > 0
    ? content.heroImages : (!!style.backgroundImage ? [{ src: style.backgroundImage!, alt: '' }] : []);
  const hasCarousel = heroImages.length > 1;
  const carouselOn = content.carouselEnabled !== false && hasCarousel;
  const [activeSlide, setActiveSlide] = useState(content.initialSlide || 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToSlide = useCallback((idx: number) => {
    setActiveSlide(idx % heroImages.length);
  }, [heroImages.length]);

  const nextSlide = useCallback(() => goToSlide(activeSlide + 1), [activeSlide, goToSlide]);
  const prevSlide = useCallback(() => goToSlide((activeSlide - 1 + heroImages.length) % heroImages.length), [activeSlide, goToSlide, heroImages.length]);

  // Auto-rotation
  useEffect(() => {
    if (!carouselOn) { if (timerRef.current) clearInterval(timerRef.current); return; }
    const interval = (content.carouselInterval || 5) * 1000;
    timerRef.current = setInterval(nextSlide, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [carouselOn, content.carouselInterval, nextSlide]);

  // Resolve which background image to show
  const currentBgImage = heroImages[activeSlide]?.src || style.backgroundImage;
  const effectiveHasBgImage = !!currentBgImage;

  // VARIANT: --hero-image-fit controls background image sizing
  const bgSize = heroImageFit || 'cover';
  // VARIANT: --hero-accent-color overrides the accent glow
  const accentGlowColor = heroAccentColor || primaryColor;

  // ── Background ──
  const bgGradient = !effectiveHasBgImage && !style.backgroundColor
    ? `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
    : undefined;

  // ── Background treatment (CSS filter on background image) ──
  const bgTreatmentFilter = (() => {
    switch (content.backgroundTreatment) {
      case 'soft': return 'brightness(0.75)';
      case 'editorial': return 'brightness(0.7) saturate(1.15)';
      case 'dramatic': return 'brightness(0.5) contrast(1.15)';
      default: return undefined;
    }
  })();

  // Grain overlay for dark_campaign_statement variant
  const showGrain = heroGrainStrength > 0;

  // ── Directional overlay (varies by layout for depth) ──
  // Variant CSS var --hero-overlay takes priority when available.
  const overlayGradient = (() => {
    if (!effectiveHasBgImage) return undefined;
    // VARIANT OVERRIDE: Use the library-provided overlay gradient
    if (heroOverlay) return heroOverlay;
    // Dramatic: heavier, more cinematic
    if (content.backgroundTreatment === 'dramatic') {
      if (layout === 'split-right') return 'linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.15) 100%)';
      if (layout === 'split-left') return 'linear-gradient(to left, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.15) 100%)';
      return 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.65) 100%)';
    }
    // Editorial: magazine-quality, subtle direction
    if (content.backgroundTreatment === 'editorial') {
      if (layout === 'split-right') return 'linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)';
      if (layout === 'split-left') return 'linear-gradient(to left, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)';
      return 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)';
    }
    // Soft/default
    if (layout === 'split-right') return 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)';
    if (layout === 'split-left') return 'linear-gradient(to left, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)';
    if (style.overlay) return 'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.5) 100%)';
    return undefined;
  })();

  // ── Colors: theme-consistent derivation ──
  // VARIANT OVERRIDE: dark contrast mode forces specific colors
  const textColor = heroContrastMode === 'dark'
    ? (style.textColor || '#ffffff')
    : (style.textColor || '#ffffff');
  // primaryColor & accentColor are declared at the top of HeroSection (line ~724)
  // to avoid TDZ errors when referenced by variant CSS var logic above.
  const headlineColor = style.headlineColor || undefined;

  // CTA button colors (theme-consistent instead of always white)
  const getCtaColors = () => {
    if (style.buttonBackgroundColor) {
      return { bg: style.buttonBackgroundColor, fg: style.buttonTextColor || contrastTextColor(style.buttonBackgroundColor) };
    }
    switch (ctaStyle) {
      case 'gradient':
        return { bg: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`, fg: '#ffffff', isGradient: true };
      case 'outline':
        return { bg: 'transparent', fg: textColor, isOutline: true };
      case 'filled':
      default:
        return { bg: primaryColor, fg: contrastTextColor(primaryColor) };
    }
  };
  const ctaColors = getCtaColors();

  // ── Text shadow (background image only) ──
  // VARIANT: dark_campaign uses stronger shadows
  const headlineShadow = effectiveHasBgImage
    ? (heroContrastMode === 'dark' ? '0 4px 40px rgba(0,0,0,0.7)' : '0 2px 24px rgba(0,0,0,0.45)')
    : undefined;
  const subheadlineShadow = effectiveHasBgImage
    ? (heroContrastMode === 'dark' ? '0 2px 20px rgba(0,0,0,0.5)' : '0 1px 12px rgba(0,0,0,0.3)')
    : undefined;

  // ── Headline size scale (user-controllable via headlineSize content field) ──
  // VARIANT: --hero-headline-weight, --hero-headline-letter-spacing, --hero-headline-text-transform
  // Token-driven typography from design library
  const tokenFontSize = v('--sq-heading-xl-font-size') || v('--sq-display-lg-font-size');
  const tokenLetterSpacing = v('--sq-heading-xl-letter-spacing') || v('--sq-display-lg-letter-spacing');
  const tokenLineHeight = v('--sq-heading-xl-line-height') || v('--sq-display-lg-line-height');
  const tokenFontWeight = v('--sq-heading-xl-weight');

  const headlineVariantStyle: React.CSSProperties = {};
  if (heroHeadlineWeight) headlineVariantStyle.fontWeight = parseFloat(heroHeadlineWeight);
  if (heroHeadlineLetterSpacing) headlineVariantStyle.letterSpacing = heroHeadlineLetterSpacing;
  if (heroHeadlineTransform) headlineVariantStyle.textTransform = heroHeadlineTransform as React.CSSProperties['textTransform'];
  // Token-driven typography overrides
  if (tokenFontSize) headlineVariantStyle.fontSize = tokenFontSize;
  if (tokenLetterSpacing) headlineVariantStyle.letterSpacing = tokenLetterSpacing;
  if (tokenLineHeight) headlineVariantStyle.lineHeight = tokenLineHeight;
  if (tokenFontWeight) headlineVariantStyle.fontWeight = parseFloat(tokenFontWeight);

  const headlineSizeClass = (() => {
    switch (content.headlineSize) {
      case 'sm':
        return 'text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold tracking-tight leading-[1.15]';
      case 'lg':
        return 'text-3xl sm:text-5xl md:text-7xl lg:text-7xl xl:text-8xl font-extrabold tracking-tight leading-[1.05]';
      case 'xl':
        return 'text-3xl sm:text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tight leading-[1.0]';
      case 'md':
      default:
        if (layout === 'minimal') return 'text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-[1.05]';
        if (layout === 'product-first') return 'text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.1]';
        if (layout === 'text-first') return 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.08]';
        return 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.1]';
    }
  })();

  const subheadlineClass = layout === 'minimal'
    ? 'text-base sm:text-lg md:text-xl lg:text-2xl font-light leading-relaxed opacity-75 max-w-2xl'
    : 'text-sm sm:text-base md:text-lg lg:text-xl font-normal leading-relaxed opacity-80';

  // ── Responsive grid: recompose on mobile (stack, not shrink) ──
  const gridClass = showProduct
    ? layout === 'product-first' || layout === 'text-first'
      ? 'grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center'
      : 'grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center'
    : '';

  // Text column order/size (responsive recomposition)
  const textColClass = [
    layout === 'split-right' && 'lg:order-2',
    layout === 'product-first' && 'lg:col-span-2 order-2',
    layout === 'text-first' && 'lg:col-span-3',
    // Mobile: text always first (except product-first where product leads)
    layout !== 'product-first' && showProduct && 'order-2 lg:order-1',
  ].filter(Boolean).join(' ');

  const productColClass = [
    layout === 'split-right' && 'lg:order-1',
    layout === 'product-first' && 'lg:col-span-3 order-1',
    layout === 'text-first' && 'lg:col-span-2',
    // Mobile: product first (except text-first)
    layout !== 'text-first' && showProduct && 'order-1 lg:order-2',
  ].filter(Boolean).join(' ');

  // ── Product image treatment styles ──
  // VARIANT: --hero-product-shadow overrides the default filter
  const getProductImageStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      maxWidth: '100%',
      height: 'auto',
    };
    // Variant scale and offset
    if (heroProductScale !== 1) base.transform = `scale(${heroProductScale})`;
    if (heroProductOffset) {
      const pct = parseFloat(heroProductOffset) || 0;
      base.marginTop = `${pct}%`;
    }
    // Variant shadow override
    if (heroProductShadow) {
      return { ...base, filter: heroProductShadow };
    }
    switch (productTreatment) {
      case 'framed':
        return { ...base, padding: '16px', background: 'rgba(255,255,255,0.12)', borderRadius: '16px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' };
      case 'cutout':
        return { ...base, filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.35)) drop-shadow(0 8px 20px rgba(0,0,0,0.2))' };
      case 'shadow':
        return { ...base, filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.3))', borderRadius: '12px' };
      case 'floating':
      default:
        return { ...base, filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.25)) drop-shadow(0 8px 16px rgba(0,0,0,0.15))' };
    }
  };

  // Product max-height responsive — larger for professional e-commerce
  const productMaxH = layout === 'product-first'
    ? 'max-h-[280px] sm:max-h-[380px] lg:max-h-[500px] xl:max-h-[560px]'
    : 'max-h-[260px] sm:max-h-[340px] lg:max-h-[450px] xl:max-h-[520px]';

  // ── Badge style variants ──
  // VARIANT: --hero-badge-size and --hero-badge-padding override sizing
  const getBadgeStyle = (): React.CSSProperties => {
    const sizeStyle: React.CSSProperties = {};
    if (heroBadgeSize) sizeStyle.fontSize = heroBadgeSize;
    if (heroBadgePadding) sizeStyle.padding = heroBadgePadding;
    switch (badgeStyle) {
      case 'filled':
        return { ...sizeStyle, backgroundColor: hexToRgba(primaryColor, 0.2), borderColor: hexToRgba(primaryColor, 0.3), color: textColor };
      case 'gradient':
        return { ...sizeStyle, background: `linear-gradient(135deg, ${hexToRgba(primaryColor, 0.3)} 0%, ${hexToRgba(accentColor, 0.2)} 100%)`, border: 'none', color: textColor };
      case 'outlined':
      default:
        return { ...sizeStyle, backgroundColor: 'rgba(255,255,255,0.08)', borderColor: hexToRgba(textColor, 0.25), color: textColor };
    }
  };

  // ── Decorative accent glow (contextual position) ──
  const showAccent = !isCentered && layout !== 'text-first';
  const accentPos = layout === 'split-left'
    ? 'right-[10%] top-1/2 -translate-y-1/2'
    : layout === 'split-right'
      ? 'left-[10%] top-1/2 -translate-y-1/2'
      : layout === 'product-first'
        ? 'left-[15%] top-1/3 -translate-y-1/2'
        : '';

  // VARIANT: --hero-urgency-level shows urgency badge above CTA
  const showUrgencyBadge = heroUrgencyLevel === 'high';
  // VARIANT: --hero-ugc-tile-rotation applies rotation to UGC tiles
  const ugcRotations = heroUgcTileRotation === 'random'
    ? ['-3deg', '2deg', '-1deg', '3deg', '-2deg']
    : ['0deg'];
  // VARIANT: --hero-ugc-border-radius applies to UGC tile corners
  const ugcRadius = heroUgcBorderRadius || '0.5rem';

  // ── CTA click handler ──
  const handleCtaClick = (e: React.MouseEvent) => e.stopPropagation();

  // ── CTA button class ──
  const primaryCtaClass = [
    'inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-lg hover:shadow-xl w-full sm:w-auto',
    ctaColors.isOutline && 'border-2 hover:bg-white/10',
  ].filter(Boolean).join(' ');

  const secondaryCtaClass = [
    'inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold backdrop-blur-sm transition-all duration-200',
    'border border-current/25 hover:bg-white/10 hover:border-current/40',
  ].join(' ');

  return (
    <>
      {/* Inline keyframes */}
      <style>{`
        @keyframes heroFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes heroFadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @media(min-width:1024px){.hero-float{animation:heroFloat 6s ease-in-out infinite}}
        .hero-fade-in{animation:heroFadeIn 0.8s ease-out both}
        .hero-fade-in-delay-1{animation:heroFadeIn 0.8s ease-out 0.15s both}
        .hero-fade-in-delay-2{animation:heroFadeIn 0.8s ease-out 0.3s both}
      `}</style>

      <div
        className={`relative flex transition-all duration-200 cursor-pointer overflow-hidden ${minHeight} ${alignClass} ${style.paddingY === 'sm' ? 'py-4 md:py-6' : style.paddingY === 'lg' ? 'py-8 md:py-14 lg:py-20' : style.paddingY === 'xl' ? 'py-10 md:py-16 lg:py-24' : 'py-6 md:py-10 lg:py-14'} ${isSelected ? 'ring-2 ring-[#a855f7] ring-offset-2' : 'hover:ring-1 hover:ring-[#a855f7]/40'}`}
        style={{ color: textColor }}
        onClick={(e) => { e.stopPropagation(); onSelectSection?.(isSelected ? null : section.id); }}
        data-section-id={section.id}
        data-section-type={section.type}
      >
        {/* Base background: solid color or theme gradient */}
        {!effectiveHasBgImage && (
          <div className="absolute inset-0" style={{
            backgroundColor: style.backgroundColor || undefined,
            backgroundImage: bgGradient || undefined,
          }} />
        )}

        {/* Background image layer(s) — carousel with crossfade */}
        {effectiveHasBgImage && (
          <div className="absolute inset-0">
            {heroImages.map((img, i) => (
              <div
                key={i}
                className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
                style={{
                  opacity: i === activeSlide ? 1 : 0,
                  backgroundImage: img.src ? `url(${img.src})` : undefined,
                  backgroundSize: bgSize,
                  backgroundPosition: 'center',
                  filter: bgTreatmentFilter || undefined,
                  backgroundColor: !img.src ? 'rgba(0,0,0,0.15)' : undefined,
                }}
              />
            ))}
          </div>
        )}

        {/* Carousel controls — subtle, theme-aware */}
        {hasCarousel && carouselOn && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); prevSlide(); }}
              aria-label="Previous slide"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex gap-1.5">
              {heroImages.map((_, i) => (
                <button
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === activeSlide ? 'bg-white w-4' : 'bg-white/40 hover:bg-white/60'}`}
                  onClick={(e) => { e.stopPropagation(); goToSlide(i); }}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); nextSlide(); }}
              aria-label="Next slide"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {/* Gradient depth for non-image gradient backgrounds */}
        {bgGradient && (
          <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-black/30 pointer-events-none" />
        )}

        {/* Directional overlay */}
        {overlayGradient && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: overlayGradient }} />
        )}

        {/* Vignette — VARIANT: --hero-vignette-strength controls opacity */}
        {(content.vignette || heroVignetteStrength > 0) && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${heroVignetteStrength > 0 ? heroVignetteStrength : 0.45}) 100%)` }}
          />
        )}

        {/* VARIANT: Grain overlay for dark_campaign_statement */}
        {showGrain && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${heroGrainStrength}'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              mixBlendMode: 'overlay',
            }}
          />
        )}

        {/* Subtle accent glow — VARIANT: --hero-accent-color overrides color */}
        {showAccent && (
          <div
            className={`absolute h-96 w-96 rounded-full pointer-events-none ${accentPos}`}
            style={{ background: `radial-gradient(circle, ${hexToRgba(accentGlowColor, 0.08)} 0%, transparent 70%)` }}
          />
        )}

        {/* Content area */}
        {/* VARIANT: --hero-text-max-width constrains text container width */}
        <div className={`relative z-10 mx-auto w-full ${pxClass(style.paddingX)} ${heroTextMaxWidth && isCentered ? '' : (isCentered ? maxWidthClass(style.maxWidth) : 'max-w-7xl')} ${gridClass}`}
          style={heroTextMaxWidth ? { maxWidth: heroTextMaxWidth, marginLeft: heroTextPosition?.startsWith('left') ? '4%' : 'auto', marginRight: heroTextPosition?.startsWith('right') ? '4%' : 'auto' } : undefined}
        >
          {/* Text column */}
          <div className={textColClass}>
            {/* Badge */}
            {content.badge && (
              <div className={`hero-fade-in ${isCentered && content.alignment === 'center' ? 'flex justify-center' : ''} ${isCentered && content.alignment === 'right' ? 'flex justify-end' : ''}`}>
                <span
                  className="mb-5 inline-block rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
                  style={getBadgeStyle()}
                >
                  {content.badge}
                </span>
              </div>
            )}

            {/* Headline */}
            <h1
              className={`hero-fade-in-delay-1 ${headlineSizeClass} ${isCentered && content.alignment === 'center' ? 'mx-auto' : ''} ${isCentered && content.alignment === 'right' ? 'ml-auto' : ''}`}
              style={{
                textShadow: headlineShadow,
                ...(headlineColor ? { color: headlineColor } : {}),
                // Use heading font when it differs from body font
                ...(theme.fonts.heading && theme.fonts.heading !== theme.fonts.body
                  ? { fontFamily: `var(--sq-font-heading)` }
                  : {}),
                // VARIANT: headline weight, letter-spacing, text-transform
                ...headlineVariantStyle,
              }}
            >
              {content.headline}
            </h1>

            {/* Subheadline */}
            {content.subheadline && (
              <p
                className={`hero-fade-in-delay-2 mt-4 ${subheadlineClass} ${layout === 'minimal' ? 'max-w-lg' : 'max-w-xl'} ${isCentered && content.alignment === 'center' ? 'mx-auto' : ''} ${isCentered && content.alignment === 'right' ? 'ml-auto' : ''}`}
                style={{ textShadow: subheadlineShadow }}
              >
                {content.subheadline}
              </p>
            )}

            {/* VARIANT: --hero-urgency-level urgency badge */}
            {showUrgencyBadge && content.ctaText && (
              <div className="hero-fade-in-delay-2 mb-3">
                <span className="inline-block rounded-full bg-red-500/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  Limited Availability
                </span>
              </div>
            )}

            {/* VARIANT: --hero-ugc-collage shows UGC tile grid */}
            {heroUgcCollage && !showProduct && (
              <div className="hero-fade-in-delay-2 mt-6 flex flex-wrap gap-2 max-w-xs">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-16 h-20 sm:w-20 sm:h-24 overflow-hidden bg-white/10"
                    style={{ borderRadius: ugcRadius, transform: `rotate(${ugcRotations[i % ugcRotations.length]})` }}
                  />
                ))}
              </div>
            )}

            {/* VARIANT: --hero-portal-grid shows category portal grid */}
            {heroPortalGrid && !showProduct && (
              <div className="hero-fade-in-delay-2 mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-sm">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-lg bg-white/10 backdrop-blur-sm px-3 py-4 text-center">
                    <div className="mx-auto mb-1.5 h-8 w-8 rounded bg-white/20" />
                    <span className="text-[10px] font-medium opacity-70">Category</span>
                  </div>
                ))}
              </div>
            )}

            {/* VARIANT: --hero-rail-enabled shows product rail hint */}
            {heroRailEnabled && !showProduct && (
              <div className="hero-fade-in-delay-2 mt-6 flex gap-3 overflow-x-auto pb-2 max-w-md">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-24 h-32 rounded-lg bg-white/10" />
                ))}
              </div>
            )}

            {/* VARIANT: --hero-countdown-visible shows countdown timer */}
            {heroCountdownVisible && content.ctaText && (
              <div className="hero-fade-in-delay-2 mt-4 flex gap-2">
                {['02', '14', '36'].map((val, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span className="text-2xl sm:text-3xl font-bold tabular-nums">{val}</span>
                    <span className="text-[9px] uppercase tracking-wider opacity-50">{['D', 'H', 'M'][i]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CTA buttons */}
            {(content.ctaText || content.secondaryCtaText) && (
              <div className={`hero-fade-in-delay-2 mt-8 flex flex-wrap gap-3 ${!showProduct && content.alignment === 'center' ? 'justify-center' : ''} ${!showProduct && content.alignment === 'right' ? 'justify-end' : ''}`}>
                {content.ctaText && (
                  <button
                    className={primaryCtaClass}
                    style={{
                      backgroundColor: ctaColors.isGradient ? undefined : (ctaColors.isOutline ? 'transparent' : ctaColors.bg as string),
                      backgroundImage: ctaColors.isGradient ? ctaColors.bg as string : undefined,
                      color: ctaColors.fg,
                      borderColor: ctaColors.isOutline ? hexToRgba(textColor, 0.4) : undefined,
                      borderWidth: ctaColors.isOutline ? '2px' : undefined,
                    }}
                    onClick={handleCtaClick}
                  >
                    {content.ctaText}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {content.secondaryCtaText && (
                  <button
                    className={secondaryCtaClass}
                    style={{ color: textColor }}
                    onClick={handleCtaClick}
                  >
                    {content.secondaryCtaText}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Product image column — full visual impact, not a tiny card */}
          {showProduct && (
            <div className={`${productColClass} flex items-center justify-center`} style={heroProductOverlap ? { marginTop: '-4rem' } : undefined}>
              <div
                className="hero-float relative mx-auto w-full max-w-full"
                style={getProductImageStyle()}
              >
                <StoreImage
                  src={resolvedHeroImage!}
                  alt={content.headline}
                  fallbackColor={theme.colors.primary}
                  className={`${productMaxH} w-full mx-auto object-contain rounded-2xl`}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── 3. Featured Products ───────────────────────────────────────────────

export function FeaturedProductsSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct, forceHideAddToCart, cardStyle, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as FeaturedProductsContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;

  // Featured products specific variant reads
  const fpHeadingAlignment = v('--featured-heading-alignment');
  const fpGap = v('--featured-gap');

  // Extract card-level CSS vars for ProductCard overrides
  const cardStyleVars: Record<string, string> = {};
  if (variantCssVars) {
    for (const [key, value] of Object.entries(variantCssVars)) {
      if (key.startsWith('--card-')) cardStyleVars[key] = value;
    }
  }
  const featuredProducts = useMemo(
    () => content.productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as StoreProduct[],
    [content.productIds, products],
  );

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {content.headline && (() => {
        const tokenFontSize = v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size');
        const tokenLetterSpacing = v('--sq-heading-lg-letter-spacing') || v('--sq-heading-md-letter-spacing');
        const tokenLineHeight = v('--sq-heading-lg-line-height') || v('--sq-heading-md-line-height');
        const tokenFontWeight = v('--sq-heading-lg-weight');
        return (
          <h2 className="mb-2 text-2xl font-bold sm:text-3xl lg:text-4xl" style={{
            ...headingFontStyle(theme),
            ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}),
            ...(tokenFontSize ? { fontSize: tokenFontSize } : {}),
            ...(tokenLetterSpacing ? { letterSpacing: tokenLetterSpacing } : {}),
            ...(tokenLineHeight ? { lineHeight: tokenLineHeight } : {}),
            ...(tokenFontWeight ? { fontWeight: parseFloat(tokenFontWeight) } : {}),
          }}>
            {content.headline}
          </h2>
        );
      })()}
      {content.subtitle && (
        <p className="mb-8 text-base opacity-65">
          {content.subtitle}
        </p>
      )}
      <div className={`grid ${gridCols(content.columns)} ${fpGap || 'gap-5 sm:gap-6 lg:gap-8'}`}>
        {featuredProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            theme={theme}
            showAddToCart={content.showAddToCart && !forceHideAddToCart}
            borderRadius={borderRadius}
            buttonBgOverride={section.style.buttonBackgroundColor}
            buttonTextOverride={section.style.buttonTextColor}
            onViewProduct={onViewProduct}
            cardStyle={cardStyle as CardStyle | undefined}
            cardStyleVars={Object.keys(cardStyleVars).length > 0 ? cardStyleVars : undefined}
          />
        ))}
      </div>
    </SectionWrapper>
  );
}

// ─── 4. Product Grid ───────────────────────────────────────────────────

export function ProductGridSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct, forceHideAddToCart, cardStyle, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as ProductGridContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? '';
  const gridGap = v('--grid-gap');
  const gridHeadingAlignment = v('--grid-heading-alignment');
  const gridShowPrice = v('--grid-show-price');
  const gridShowRatings = v('--grid-show-ratings');
  const gridFeaturedFirst = v('--grid-featured-first');
  const gridAccentPlane = v('--grid-accent-plane');
  const gridHeadingScale = v('--grid-heading-scale');
  const gridCardHoverLift = v('--grid-card-hover-lift');
  const gridShowSwatches = v('--grid-show-swatches');
  const gridShowBundleBadge = v('--grid-show-bundle-badge');
  const gridShowSavings = v('--grid-show-savings');

  // Extract card-level CSS vars for ProductCard overrides
  const cardStyleVars: Record<string, string> = {};
  if (variantCssVars) {
    for (const [key, value] of Object.entries(variantCssVars)) {
      if (key.startsWith('--card-')) cardStyleVars[key] = value;
    }
  }

  // Compute variant-driven styles
  // Responsive grid: always 2 cols on mobile, scales up on tablet/desktop
  const responsiveGridCols: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  };
  const productGridClass = responsiveGridCols[content.columns] || responsiveGridCols[3];
  const gapClass = gridGap || 'gap-2 sm:gap-4 md:gap-6';
  const headingAlignClass = gridHeadingAlignment === 'left' ? 'text-left' : gridHeadingAlignment === 'center' ? 'text-center' : '';
  const headingScaleStyle = gridHeadingScale ? { transform: `scale(${gridHeadingScale})`, transformOrigin: 'left' } : {};
  // VARIANT: --grid-show-price hides price on cards
  const hidePrice = gridShowPrice === 'false';
  // VARIANT: --grid-show-ratings shows rating stars in heading area
  const showGridRatings = gridShowRatings === 'true';
  // VARIANT: --grid-card-hover-lift adds hover translate to card wrapper
  const hoverLiftStyle = gridCardHoverLift && gridCardHoverLift !== '0'
    ? { '--grid-hover-lift': gridCardHoverLift } as React.CSSProperties
    : {};
  // VARIANT: --grid-show-swatches bridges to card var
  if (gridShowSwatches === 'true') cardStyleVars['--card-show-swatch'] = 'true';
  // VARIANT: --grid-show-bundle-badge shows badge on each card
  // VARIANT: --grid-show-savings shows savings on each card

  const filteredProducts = useMemo(() => {
    let prods = products;
    if (content.filterByCategory) {
      prods = prods.filter((p) => p.category === content.filterByCategory);
    }
    // VARIANT: --grid-featured-first sorts featured products first
    if (gridFeaturedFirst === 'true') {
      prods = [...prods].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
    return prods;
  }, [products, content.filterByCategory, gridFeaturedFirst]);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {content.headline && (() => {
        const tokenFontSize = v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size');
        const tokenLetterSpacing = v('--sq-heading-lg-letter-spacing') || v('--sq-heading-md-letter-spacing');
        const tokenLineHeight = v('--sq-heading-lg-line-height') || v('--sq-heading-md-line-height');
        const tokenFontWeight = v('--sq-heading-lg-weight');
        return (
          <h2 className={`mb-8 text-2xl font-bold sm:text-3xl lg:text-4xl ${headingAlignClass}`} style={{
            ...headingFontStyle(theme),
            ...headingScaleStyle,
            ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}),
            ...(tokenFontSize ? { fontSize: tokenFontSize } : {}),
            ...(tokenLetterSpacing ? { letterSpacing: tokenLetterSpacing } : {}),
            ...(tokenLineHeight ? { lineHeight: tokenLineHeight } : {}),
            ...(tokenFontWeight ? { fontWeight: parseFloat(tokenFontWeight) } : {}),
          }}>
            {content.headline}
          </h2>
        );
      })()}
      {/* VARIANT: --grid-show-bundle-badge shows bundle badge above grid */}
      {gridShowBundleBadge === 'true' && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          <ShoppingCart className="h-3 w-3" /> Bundle & Save
        </div>
      )}
      {/* VARIANT: --grid-show-savings shows savings banner */}
      {gridShowSavings === 'true' && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
          Save up to 20% when you bundle
        </div>
      )}
      {/* VARIANT: --grid-gap controls grid spacing */}
      {/* VARIANT: --grid-accent-plane adds a left accent bar */}
      <div className={`${gridGap} ${gridAccentPlane === 'true' ? 'border-l-4 pl-6' : ''}`} style={{...(gridAccentPlane === 'true' ? { borderColor: theme.colors.primary } : {}), ...hoverLiftStyle}}>
        {/* VARIANT: --grid-show-ratings shows aggregate rating in heading */}
        {showGridRatings && (
          <div className="mb-3 flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-xs font-medium opacity-65">4.8 average</span>
          </div>
        )}
        {/* VARIANT: --grid-show-price hides price on cards via CSS */}
        {hidePrice && <style>{`.grid-hide-price [data-card-price] { display: none; }`}</style>}
        <div className={`grid ${productGridClass}`}>
        {filteredProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            theme={theme}
            showAddToCart={content.showAddToCart && !forceHideAddToCart}
            borderRadius={borderRadius}
            buttonBgOverride={section.style.buttonBackgroundColor}
            buttonTextOverride={section.style.buttonTextColor}
            onViewProduct={onViewProduct}
            cardStyle={cardStyle as CardStyle | undefined}
            cardStyleVars={Object.keys(cardStyleVars).length > 0 ? cardStyleVars : undefined}
          />
        ))}
        </div>
      </div>
      {filteredProducts.length === 0 && (
        <div className="py-16 text-center opacity-65">
          <p className="text-sm">No products found.</p>
        </div>
      )}
    </SectionWrapper>
  );
}

// ─── 5. Text Banner ─────────────────────────────────────────────────────

export function TextBannerSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as TextBannerContent;
  const alignMap = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };
  const sizeMap = {
    sm: { headline: 'text-xl sm:text-2xl', body: 'text-sm' },
    md: { headline: 'text-2xl sm:text-3xl md:text-4xl', body: 'text-base' },
    lg: { headline: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl', body: 'text-lg' },
  };
  const sizes = sizeMap[content.size] || sizeMap.md;

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;
  const vNum = (key: string, fallback: number = 0) => {
    const raw = variantCssVars?.[key];
    return raw !== undefined ? parseInt(raw, 10) : fallback;
  };
  const trustAlignment = v('--trust-alignment');
  const trustDensity = v('--trust-density');
  const trustLayout = v('--trust-layout');
  const trustIconStyle = v('--trust-icon-style');
  const trustSurface = v('--trust-surface');
  const trustMarkSize = v('--trust-mark-size');
  const trustLabelStyle = v('--trust-label-style');
  const trustNumberScale = v('--trust-number-scale');
  const trustDividerMode = v('--trust-divider-mode');
  const trustColumns = vNum('--trust-columns', 0);

  // Alignment: variant override or content default
  const effectiveAlign = trustAlignment || content.alignment;
  const alignClass = alignMap[effectiveAlign as keyof typeof alignMap] || alignMap.center;

  // Density: variant override for padding density
  const densityPy = trustDensity === 'compact' ? 'py-6' : trustDensity === 'spacious' ? 'py-16' : '';

  // VARIANT: --trust-surface adds background tint
  const trustSurfaceStyle: React.CSSProperties = trustSurface === 'surface'
    ? { backgroundColor: theme.colors.surface }
    : {};
  // VARIANT: --trust-layout controls arrangement
  const isTrustStrip = trustLayout === 'strip';
  const isTrustRow = trustLayout === 'row';
  const isTrustCenteredCount = trustLayout === 'centered-count';
  // VARIANT: --trust-icon-style: line vs filled
  const trustIconStroke = trustIconStyle === 'line' ? '1.5' : '0';
  const trustIconFill = trustIconStyle === 'filled' ? 'currentColor' : 'none';
  // VARIANT: --trust-mark-size controls icon size
  const markSizeStyle = trustMarkSize ? { width: trustMarkSize, height: trustMarkSize } : {};
  // VARIANT: --trust-label-style: below vs inline
  const isLabelBelow = trustLabelStyle === 'below';
  // VARIANT: --trust-number-scale: stat number sizing
  const numberSizeMap: Record<string, string> = { '2xl': 'text-2xl', '3xl': 'text-3xl', '4xl': 'text-4xl' };
  const trustNumSizeClass = numberSizeMap[trustNumberScale] || '';
  // VARIANT: --trust-columns: auto or specific
  const trustGridClass = trustColumns > 0
    ? `grid grid-cols-1 sm:grid-cols-${trustColumns}`
    : isTrustStrip || isTrustRow
      ? 'flex flex-wrap justify-center gap-8 sm:gap-12'
      : '';
  // VARIANT: --trust-divider-mode: border between items
  const trustItemBorderClass = trustDividerMode === 'border' ? 'border-r last:border-r-0' : '';

  // ── Promotion variant consumption (Design Library) ──
  // promotion.inline_offer maps to text-banner
  const promoLayout = v('--promo-layout');
  const promoHeight = v('--promo-height');
  const promoBorderMode = v('--promo-border-mode');
  const promoSurface = v('--promo-surface');
  const promoContentColor = v('--promo-content-color');
  const promoFinePrint = v('--promo-fine-print');
  // VARIANT: --promo-surface accent-light background
  const promoSurfaceStyle: React.CSSProperties = promoSurface === 'accent-light'
    ? { backgroundColor: lightenHex(theme.colors.primary, 0.9) || theme.colors.surface || '#f5f5f5' }
    : {};
  // VARIANT: --promo-border-mode full border
  const promoBorderClass = promoBorderMode === 'full' ? 'border' : '';
  // VARIANT: --promo-content-color dark forces dark text
  const promoTextColor = promoContentColor === 'dark' ? theme.colors.text : undefined;
  // VARIANT: --promo-layout inline shows horizontal layout
  const isPromoInline = promoLayout === 'inline' || !!promoLayout;
  // VARIANT: --promo-height auto removes fixed height
  const promoHeightStyle = promoHeight ? { minHeight: 'auto' } : {};

  // Trust icons placeholder data when variant requests a strip/row layout
  const trustIconData = isTrustStrip || isTrustRow
    ? [
        { icon: '🛡️', label: 'Secure Checkout' },
        { icon: '🚚', label: 'Free Shipping' },
        { icon: '↩️', label: 'Easy Returns' },
        { icon: '⭐', label: '5-Star Reviews' },
      ]
    : [];

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {/* VARIANT: --trust-layout strip/row shows icon items */}
      {(isTrustStrip || isTrustRow) ? (
        <div className={`${alignClass} ${densityPy}`} style={trustSurfaceStyle}>
          <div className={`${trustGridClass} ${trustItemBorderClass} items-center gap-4 pr-4`}>
            {trustIconData.map((item, i) => (
              <div key={i} className={`flex items-center gap-3 ${isLabelBelow ? 'flex-col text-center' : ''}`}>
                <svg style={{ ...markSizeStyle, stroke: trustIconStroke === '0' ? 'none' : 'currentColor', fill: trustIconFill, strokeWidth: trustIconStroke }} className={`shrink-0 ${trustMarkSize ? '' : 'h-6 w-6'}`} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                <span className="text-xs font-medium opacity-75">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : isTrustCenteredCount ? (
        <div className={`${alignClass} ${densityPy}`} style={trustSurfaceStyle}>
          <div className={`flex flex-col items-center gap-6`}>
            <div className={`${trustNumSizeClass || 'text-4xl'} font-extrabold tabular-nums`}>10,000+</div>
            <div className="text-sm opacity-65">Happy Customers</div>
          </div>
        </div>
      ) : (
      <div className={`${alignClass} ${densityPy} ${promoBorderClass} inline-flex items-center gap-4 flex-wrap`} style={{ ...trustSurfaceStyle, ...promoSurfaceStyle, color: promoTextColor, ...promoHeightStyle }}>
        <h2 className={`font-bold leading-tight tracking-tight ${sizes.headline}`} style={{ ...headingFontStyle(theme), ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}) }}>
          {content.headline}
        </h2>
        {content.body && (
          <p className={`max-w-2xl ${sizes.body} opacity-65`}>
            {content.body}
          </p>
        )}
        {/* VARIANT: --promo-fine-print */}
        {promoFinePrint === 'visible' && (<p className="text-[10px] opacity-40">Terms and conditions apply. Offer valid while supplies last.</p>)}
        {promoFinePrint === 'optional' && (<p className="text-[10px] opacity-30">*Conditions apply</p>)}
      </div>
      )}
    </SectionWrapper>
  );
}

// ─── 6. Image Gallery ───────────────────────────────────────────────────

export function ImageGallerySection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as ImageGalleryContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);
  const gapMap = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;
  const vNum = (key: string, fallback: number = 0) => {
    const raw = variantCssVars?.[key];
    return raw !== undefined ? parseInt(raw, 10) : fallback;
  };

  const galleryColumns = vNum('--gallery-columns', 0);
  const galleryGap = v('--gallery-gap');
  const galleryCaptions = v('--gallery-captions');
  const galleryMasonryPattern = v('--gallery-masonry-pattern');
  const galleryLayout = v('--gallery-layout');
  const galleryLightbox = v('--gallery-lightbox');
  const galleryAnchorSize = v('--gallery-anchor-size');
  const galleryOversizedFrames = v('--gallery-oversized-frames');
  const galleryHotspotStyle = v('--gallery-hotspot-style');

  // Effective columns: variant override or content default
  const effectiveColumns = galleryColumns > 0 ? galleryColumns : (content.columns || 3);
  // Responsive gallery grid: 1 col on mobile, 2 on tablet, 3 on desktop
  const responsiveGalleryGrid: Record<number, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };
  const galleryGridClass = responsiveGalleryGrid[effectiveColumns] || responsiveGalleryGrid[3];
  // Effective gap: variant override or content default, responsive when no override
  const gapBase = galleryGap ? (gapMap[galleryGap] || gapMap.md) : (gapMap[content.gap] || gapMap.md);
  const effectiveGap = galleryGap
    ? gapBase
    : `gap-2 sm:gap-3 md:gap-4 lg:${gapBase}`;

  // Caption mode: overlay, below, none
  const captionMode = galleryCaptions || 'below';
  const showCaptions = captionMode !== 'none';

  // Masonry: staggered vs uniform
  const isStaggered = galleryLayout === 'masonry' || galleryMasonryPattern === 'staggered';
  // VARIANT: --gallery-lightbox enables click-to-enlarge
  const isLightboxEnabled = galleryLightbox === 'enabled';
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  // VARIANT: --gallery-anchor-size makes first image larger
  const isAnchor2x = galleryAnchorSize === '2x';
  // VARIANT: --gallery-oversized-frames adds visible frame
  const isOversizedFrame = galleryOversizedFrames === 'true';
  // VARIANT: --gallery-hotspot-style shows hotspot dots
  const isHotspotDot = galleryHotspotStyle === 'dot';
  const frameBorderWidth = isOversizedFrame ? 'p-2 border-2 border-white/20' : '';
  const frameShadow = isOversizedFrame ? 'shadow-xl' : '';

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {/* VARIANT: --gallery-lightbox overlay */}
      {isLightboxEnabled && lightboxIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setLightboxIdx(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg">
            <StoreImage
              src={content.images[lightboxIdx]?.src}
              alt={content.images[lightboxIdx]?.alt || ''}
              fallbackColor={theme.colors.primary}
              className="h-auto max-h-[90vh] w-auto max-w-[90vw] object-contain"
            />
          </div>
        </div>
      )}
      {isStaggered ? (
        <div className={`${effectiveGap} columns-1 sm:columns-2 lg:columns-3 space-y-3 sm:space-y-4`}>
          {content.images.map((img, i) => (
            <div key={i} className={`${borderRadius} ${frameBorderWidth} ${frameShadow} overflow-hidden group break-inside-avoid`} style={isAnchor2x && i === 0 ? { aspectRatio: '4/5' } : undefined}>
              <div
                className={`${borderRadius} overflow-hidden transition-transform duration-300 group-hover:scale-[1.02] ${i % 3 === 0 ? 'aspect-[4/5]' : i % 3 === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}
                style={{
                  backgroundColor: stringToColor(img.src || `img-${i}`, theme),
                }}
              >
                <StoreImage
                  src={img.src}
                  alt={img.alt || img.caption || `Gallery image ${i + 1}`}
                  fallbackColor={stringToColor(img.src || `img-${i}`, theme)}
                  className="h-full w-full object-cover"
                />
              </div>
              {showCaptions && img.caption && captionMode === 'below' && (
                <p className="mt-2 text-xs opacity-65">
                  {img.caption}
                </p>
              )}
              {showCaptions && img.caption && captionMode === 'overlay' && (
                <div className="relative -mt-8">
                  <p className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs text-white">
                    {img.caption}
                  </p>
                </div>
              )}
              {/* VARIANT: --gallery-hotspot-style shows dot overlay */}
              {isHotspotDot && (
                <div className="absolute right-3 top-3 h-3 w-3 rounded-full bg-white/80 shadow" />
              )}
              {/* VARIANT: --gallery-lightbox click handler */}
              {isLightboxEnabled && <div className="absolute inset-0 cursor-zoom-in" onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }} />}
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid ${galleryGridClass} ${effectiveGap}`}>
          {content.images.map((img, i) => (
            <div key={i} className={`${borderRadius} ${frameBorderWidth} ${frameShadow} overflow-hidden group ${isAnchor2x && i === 0 ? 'sm:col-span-2' : ''}`} style={isAnchor2x && i === 0 ? { aspectRatio: '4/5' } : undefined}>
              <div
                className={`aspect-[4/3] w-full ${borderRadius} transition-transform duration-300 group-hover:scale-[1.02]`}
                style={{
                  backgroundColor: stringToColor(img.src || `img-${i}`, theme),
                }}
              >
                <StoreImage
                  src={img.src}
                  alt={img.alt || img.caption || `Gallery image ${i + 1}`}
                  fallbackColor={stringToColor(img.src || `img-${i}`, theme)}
                  className="h-full w-full object-cover"
                />
                {/* Overlay caption on hover */}
                {showCaptions && img.caption && captionMode === 'overlay' && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="text-xs text-white">{img.caption}</p>
                  </div>
                )}
                {/* VARIANT: --gallery-hotspot-style shows dot overlay */}
                {isHotspotDot && (
                  <div className="absolute right-3 top-3 h-3 w-3 rounded-full bg-white/80 shadow opacity-0 transition-opacity group-hover:opacity-100" />
                )}
                {/* VARIANT: --gallery-lightbox click handler */}
                {isLightboxEnabled && <div className="absolute inset-0 cursor-zoom-in opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }} />}
              </div>
              {showCaptions && img.caption && captionMode === 'below' && (
                <p className="mt-2 text-xs opacity-65">
                  {img.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionWrapper>
  );
}

// ─── 7. Testimonials ────────────────────────────────────────────────────

export function TestimonialsSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as TestimonialsContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant-aware configuration from design library ──
  // These are read from variantCssVars set by resolveVariantConfig.
  // When absent (legacy stores), every check falls to the default
  // branch, preserving the original rendering exactly.

  const layout = (section.content as Record<string, unknown>).layout as string | undefined;
  const isHorizontalScroll = layout === 'horizontal-scroll';

  // CSS variable reads (all undefined for legacy stores)
  const vCardMode = variantCssVars?.['--testimonials-card-mode'];
  const vQuoteScale = variantCssVars?.['--testimonials-quote-scale'];
  const vSurface = variantCssVars?.['--testimonials-surface'];
  const vDividerMode = variantCssVars?.['--testimonials-divider-mode'];
  const vQuoteMark = variantCssVars?.['--testimonials-quote-mark'];
  const vColumns = variantCssVars?.['--testimonials-columns'];
  const vRailGap = variantCssVars?.['--testimonials-rail-gap'];
  const vRatingSummary = variantCssVars?.['--testimonials-rating-summary'];
  const vAttributionStyle = variantCssVars?.['--testimonials-attribution-style'];
  const vRatingStyle = variantCssVars?.['--testimonials-rating-style'];
  const vTileRatio = variantCssVars?.['--testimonials-tile-ratio'];
  const vUgcMode = variantCssVars?.['--testimonials-ugc-mode'];
  const vScroll = variantCssVars?.['--testimonials-scroll'];

  // Derived booleans
  const isMinimalCard = vCardMode === 'minimal';
  const isTransparent = vSurface === 'transparent';
  const showDivider = vDividerMode === 'border';
  const showQuoteMark = vQuoteMark === 'visible';
  const showRatingSummary = vRatingSummary === 'visible';
  const colCount = vColumns ? parseInt(vColumns, 10) : 0;
  // VARIANT: --testimonials-attribution-style
  const isAttributionNameRole = vAttributionStyle === 'name-role';
  const isAttributionUsernameHandle = vAttributionStyle === 'username-handle';
  // VARIANT: --testimonials-rating-style: stars vs number
  const isRatingNumber = vRatingStyle === 'number';
  // VARIANT: --testimonials-tile-ratio
  const tileRatioStyle = vTileRatio ? { aspectRatio: vTileRatio } : undefined;
  // VARIANT: --testimonials-ugc-mode
  const isUgcMode = vUgcMode === 'true';
  // VARIANT: --testimonials-scroll
  const isScrollHorizontal = vScroll === 'horizontal' || isHorizontalScroll;

  // ── Grid layout classes ──
  // Single column on mobile, 2 on tablet, 3 on desktop
  const gridClasses = isScrollHorizontal
    ? ''
    : colCount === 2
      ? 'grid grid-cols-1 gap-6 md:grid-cols-2'
      : 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3';

  // ── Card visual treatment ──
  // Default (no variant): border + shadow + hover + surface bg
  const cardBaseClasses = isMinimalCard
    ? 'p-6'
    : `${borderRadius} p-6 shadow-sm transition-shadow hover:shadow-md`;

  const cardInlineStyle: React.CSSProperties = {
    ...(isTransparent ? {} : { backgroundColor: theme.colors.surface }),
    ...(showDivider || (!vDividerMode && !isMinimalCard)
      ? { border: `1px solid ${theme.colors.border}` }
      : {}),
  };

  // ── Quote text size ──
  const quoteInlineStyle: React.CSSProperties = {};
  if (vQuoteScale) {
    quoteInlineStyle.fontSize = `${parseFloat(vQuoteScale) * 0.875}rem`;
  }

  // ── Rating summary (aggregate) ──
  const aggregateRating = showRatingSummary && content.items.length > 0
    ? content.items.reduce((sum, item) => sum + (item.rating ?? 0), 0) / content.items.length
    : 0;

  // ── Render a single testimonial card ──
  const renderCard = (item: TestimonialsContent['items'][0], index: number) => (
    <div
      key={item.id}
      className={`${cardBaseClasses}${isScrollHorizontal ? ' min-w-[280px] max-w-[320px] flex-shrink-0 snap-start' : ''}`}
      style={{...cardInlineStyle, ...tileRatioStyle}}
    >
      {/* VARIANT: --testimonials-ugc-mode shows image-first layout */}
      {isUgcMode && item.avatar && (
        <StoreImage
          src={item.avatar}
          alt={item.author}
          fallbackColor={theme.colors.primary}
          className="mb-3 w-full aspect-video object-cover rounded-md"
          iconSize="sm"
        />
      )}

      {/* Decorative quote mark (quote_wall) */}
      {showQuoteMark && (
        <div className="mb-2 text-5xl leading-none opacity-15 select-none" style={{ ...headingFontStyle(theme), fontWeight: 400 }}>&ldquo;</div>
      )}

      {/* Stars — VARIANT: --testimonials-rating-style: stars vs number */}
      {item.rating && (
        isRatingNumber ? (
          <div className="mb-3 flex items-baseline gap-1">
            <span className="text-xl font-bold">{item.rating}</span>
            <span className="text-xs opacity-50">/5</span>
          </div>
        ) : (
        <div className="mb-3 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${i < item.rating! ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
            />
          ))}
        </div>
        )
      )}

      {/* Quote */}
      <p className="text-sm leading-relaxed" style={quoteInlineStyle}>
        &ldquo;{item.quote}&rdquo;
      </p>

      {/* Author attribution — VARIANT: --testimonials-attribution-style */}
      <div className={`mt-4 flex items-center gap-3 ${isAttributionUsernameHandle ? 'flex-row-reverse' : ''}`}>
        {item.avatar ? (
          <StoreImage
            src={item.avatar}
            alt={item.author}
            fallbackColor={theme.colors.primary}
            className="h-9 w-9 rounded-full object-cover"
            iconSize="sm"
          />
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: theme.colors.primary }}
          >
            {getInitials(item.author)}
          </div>
        )}
        <div className={isAttributionUsernameHandle ? 'text-right' : ''}>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            {item.author}
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700" title="Verified Buyer">
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              Verified
            </span>
          </p>
          {item.role && isAttributionNameRole && (
            <p className="text-xs opacity-65">
              {item.role}
            </p>
          )}
          {isAttributionUsernameHandle && (
            <p className="text-xs opacity-50">
              @{item.author.toLowerCase().replace(/\s+/g, '')}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {content.headline && (() => {
        const tokenFontSize = variantCssVars?.['--sq-heading-lg-font-size'] || variantCssVars?.['--sq-heading-md-font-size'];
        const tokenLetterSpacing = variantCssVars?.['--sq-heading-lg-letter-spacing'] || variantCssVars?.['--sq-heading-md-letter-spacing'];
        const tokenLineHeight = variantCssVars?.['--sq-heading-lg-line-height'] || variantCssVars?.['--sq-heading-md-line-height'];
        const tokenFontWeight = variantCssVars?.['--sq-heading-lg-weight'];
        return (
          <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl" style={{
            ...headingFontStyle(theme),
            ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}),
            ...(tokenFontSize ? { fontSize: tokenFontSize } : {}),
            ...(tokenLetterSpacing ? { letterSpacing: tokenLetterSpacing } : {}),
            ...(tokenLineHeight ? { lineHeight: tokenLineHeight } : {}),
            ...(tokenFontWeight ? { fontWeight: parseFloat(tokenFontWeight) } : {}),
          }}>
            {content.headline}
          </h2>
        );
      })()}

      {/* Aggregate rating summary (rating_rail) */}
      {showRatingSummary && aggregateRating > 0 && (
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={`summary-${i}`}
                className={`h-5 w-5 ${i < Math.round(aggregateRating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
              />
            ))}
          </div>
          <span className="text-sm font-semibold">{aggregateRating.toFixed(1)}</span>
          <span className="text-xs opacity-65">({content.items.length} reviews)</span>
        </div>
      )}

      {/* Horizontal scroll layout (rating_rail, ugc_rail) */}
      {isHorizontalScroll ? (
        <div className="flex overflow-x-auto pb-4 snap-x snap-mandatory" style={vRailGap ? { gap: vRailGap } : { gap: '1rem' }}>
          {content.items.map((item, i) => renderCard(item, i))}
        </div>
      ) : (
        /* Grid layout (quote_wall, or default) */
        <div className={gridClasses}>
          {content.items.map((item, i) => renderCard(item, i))}
        </div>
      )}
    </SectionWrapper>
  );
}

// ─── 8. Newsletter ──────────────────────────────────────────────────────

export function NewsletterSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as NewsletterContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;
  const nlLayout = v('--newsletter-layout');
  const nlInputStyle = v('--newsletter-input-style');
  const nlButtonVariant = v('--newsletter-button-variant');
  const nlHeadingFont = v('--newsletter-heading-font');
  const nlHeadingWeight = v('--newsletter-heading-weight');
  const nlSectionSpacing = v('--newsletter-section-spacing');
  const nlSplitRatio = v('--newsletter-split-ratio');
  const nlCopyMeasure = v('--newsletter-copy-measure');
  const nlAlignment = v('--newsletter-alignment');
  const nlUrgency = v('--newsletter-urgency');
  const nlStatusStyle = v('--newsletter-status-style');
  const nlUrgencyColor = v('--newsletter-urgency-color');

  // Compute variant-driven styles
  const isSplit = nlLayout === 'split';
  const isUnderlined = nlInputStyle === 'underlined';
  const isOutline = nlButtonVariant === 'outline';
  const headingVariantStyle: React.CSSProperties = {
    ...(nlHeadingFont === 'serif' ? { fontFamily: 'var(--sq-font-heading)' } : {}),
    ...(nlHeadingWeight ? { fontWeight: parseFloat(nlHeadingWeight) } : {}),
  };
  const spacingPy = nlSectionSpacing === 'spacious' ? '5rem' : '3rem';
  // VARIANT: --newsletter-split-ratio controls split grid
  const splitGridClass = nlSplitRatio && nlSplitRatio.includes('/')
    ? (() => {
        const [a, b] = nlSplitRatio.split('/').map(Number);
        return (!a || !b || isNaN(a) || isNaN(b))
          ? 'grid-cols-1 md:grid-cols-2'
          : `grid-cols-1 md:grid-cols-[${a}fr_${b}fr]`;
      })()
    : 'grid-cols-1 md:grid-cols-2';
  // VARIANT: --newsletter-copy-measure controls text max-width
  const copyMeasureStyle = nlCopyMeasure === 'narrow' ? { maxWidth: '20rem' } : nlCopyMeasure === 'wide' ? { maxWidth: '36rem' } : {};
  // VARIANT: --newsletter-alignment
  const nlAlignClass = nlAlignment === 'left' ? 'text-left' : nlAlignment === 'right' ? 'text-right' : 'text-center';
  // VARIANT: --newsletter-urgency shows urgency badge
  const isNlUrgent = nlUrgency === 'true';
  const urgencyBadgeColor = nlUrgencyColor || '#dc2626';
  // VARIANT: --newsletter-status-style shows subscriber count
  const isNlStatusVisible = nlStatusStyle === 'visible';

  // Button style driven by variant
  const btnBg = isOutline ? 'transparent' : (section.style.buttonBackgroundColor || theme.colors.primary);
  const btnColor = isOutline ? theme.colors.primary : (section.style.buttonTextColor || contrastTextColor(section.style.buttonBackgroundColor || theme.colors.primary));
  const btnBorder = isOutline ? `2px solid ${theme.colors.primary}` : 'none';

  const containerClass = isSplit
    ? `mx-auto max-w-4xl grid ${splitGridClass} gap-8 items-center text-left`
    : `mx-auto max-w-xl ${nlAlignClass}`;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      <div className={containerClass} style={{ padding: `${spacingPy} 1.5rem`, ...copyMeasureStyle }}>
        {/* VARIANT: --newsletter-urgency urgency indicator */}
        {isNlUrgent && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${urgencyBadgeColor}15`, color: urgencyBadgeColor }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: urgencyBadgeColor }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: urgencyBadgeColor }} />
            </span>
            Limited Spots Available
          </div>
        )}
        {/* VARIANT: --newsletter-status-style subscriber count */}
        {isNlStatusVisible && (
          <div className="mb-3 text-xs opacity-50">Join 12,000+ subscribers</div>
        )}
        {!isSplit && (
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.colors.primary}15` }}>
            <Mail className="h-5 w-5" style={{ color: theme.colors.primary }} />
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl" style={{
            ...headingFontStyle(theme),
            ...headingVariantStyle,
            ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}),
            ...(v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size') ? { fontSize: v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size') } : {}),
            ...(v('--sq-heading-lg-weight') ? { fontWeight: parseFloat(v('--sq-heading-lg-weight')) } : {}),
          }}>
            {content.headline}
          </h2>
          {content.subtitle && (
            <p className="mt-2 text-sm opacity-65">
              {content.subtitle}
            </p>
          )}
        </div>
        <div className={isSplit ? '' : 'mt-6'}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="email"
                placeholder={content.placeholderText || 'Enter your email'}
                className={`w-full ${borderRadius} ${isUnderlined ? 'border-0 border-b-2 bg-transparent' : 'border'} px-4 py-3 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-offset-0`}
                style={{
                  backgroundColor: isUnderlined ? 'transparent' : theme.colors.background,
                  borderColor: isUnderlined ? theme.colors.primary : theme.colors.border,
                  color: theme.colors.text,
                  // @ts-expect-error --ring-color is a valid CSS var
                  '--ring-color': `${theme.colors.primary}40`,
                }}
              />
            </div>
            <button
              className={`${borderRadius} px-6 py-3 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer`}
              style={{
                backgroundColor: btnBg,
                color: btnColor,
                border: btnBorder,
              }}
            >
              {content.buttonText || 'Subscribe'}
            </button>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 9. FAQ ─────────────────────────────────────────────────────────────

export function FAQSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as FAQContent;
  const [openId, setOpenId] = useState<string | null>(null);
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;
  const vNum = (key: string, fallback: number = 0) => {
    const raw = variantCssVars?.[key];
    return raw !== undefined ? parseInt(raw, 10) : fallback;
  };

  const trustColumns = vNum('--trust-columns', 0);
  const trustDividerMode = v('--trust-divider-mode');

  // Effective column count: variant override (1 or 2)
  const faqColumns = trustColumns === 1 || trustColumns === 2 ? trustColumns : 1;
  const faqMaxWidth = faqColumns === 2 ? 'max-w-4xl' : 'max-w-2xl';
  const faqGridClass = faqColumns === 2
    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
    : 'space-y-3';

  // Divider mode: 'border' (default), 'line', 'none'
  const itemBorderClass = trustDividerMode === 'none'
    ? ''
    : trustDividerMode === 'line'
      ? 'border-b'
      : 'border';
  const itemBorderRadius = trustDividerMode === 'line' ? '' : borderRadius;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      <div className={`mx-auto ${faqMaxWidth}`}>
        {content.headline && (
          <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl" style={{ ...headingFontStyle(theme), ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}) }}>
            {content.headline}
          </h2>
        )}
        <div className={faqGridClass}>
          {content.items.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div
                key={item.id}
                className={`${itemBorderRadius} ${itemBorderClass} transition-colors`}
                style={{ borderColor: theme.colors.border }}
              >
                <button
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(isOpen ? null : item.id);
                  }}
                >
                  <span className="text-sm font-semibold">
                    {item.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="ml-2 h-4 w-4 flex-shrink-0 opacity-65 transition-transform duration-300" />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 opacity-65 transition-transform duration-300" />
                  )}
                </button>
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: isOpen ? '500px' : '0px', opacity: isOpen ? 1 : 0 }}
                >
                  <div
                    className="border-t px-5 pb-4 pt-3 text-sm leading-relaxed opacity-65"
                    style={{
                      borderColor: theme.colors.border,
                    }}
                  >
                    {item.answer}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 10. CTA ─────────────────────────────────────────────────────────────

export function CTASection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as CTAContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;
  const ctaButtonVariant = v('--cta-button-variant');
  const ctaHeadlineWeight = v('--cta-headline-weight');
  const ctaHeadlineLetterSpacing = v('--cta-headline-letter-spacing');
  const ctaHeadlineTransform = v('--cta-headline-transform');
  const ctaBodyMaxWidth = v('--cta-body-max-width');
  const ctaSectionSpacing = v('--cta-section-spacing');
  const ctaUrgencyLevel = v('--cta-urgency-level');
  const ctaContrast = v('--cta-contrast');
  const ctaBorderMode = v('--cta-border-mode');
  const ctaUrgencyColor = v('--cta-urgency-color');
  const ctaProofStyle = v('--cta-proof-style');
  const ctaBodyFontStyle = v('--cta-body-font-style');

  // ── Promotion variant consumption (Design Library) ──
  // promotion.campaign_split and promotion.sticker_campaign map to CTA
  const promoLayout = v('--promo-layout');
  const promoSplitRatio = v('--promo-split-ratio');
  const promoOfferEmphasis = v('--promo-offer-emphasis');
  const promoButtonVariant = v('--promo-button-variant');
  const promoFinePrint = v('--promo-fine-print');
  const promoStickerShape = v('--promo-sticker-shape');
  const promoContrast = v('--promo-contrast');
  const promoDisplayType = v('--promo-display-type');
  const promoBadgeSize = v('--promo-badge-size');

  // Compute effective styles from variant vars
  const variantMaxWidth = ctaBodyMaxWidth || '';
  const headlineStyle: React.CSSProperties = {
    ...(ctaHeadlineWeight ? { fontWeight: parseFloat(ctaHeadlineWeight) } : {}),
    ...(ctaHeadlineLetterSpacing ? { letterSpacing: ctaHeadlineLetterSpacing } : {}),
    // VARIANT: --cta-headline-transform
    ...(ctaHeadlineTransform ? { textTransform: ctaHeadlineTransform as React.CSSProperties['textTransform'] } : {}),
    // VARIANT: --promo-offer-emphasis makes headline extra bold
    ...(promoOfferEmphasis === 'headline' ? { fontSize: '1.75rem' } : {}),
    // VARIANT: --promo-display-type makes headline extra bold
    ...(promoDisplayType === 'bold' ? { fontWeight: 900 } : {}),
  };
  // Responsive padding classes for CTA (replaces inline padding)
  const ctaPaddingClass = ctaSectionSpacing === 'spacious'
    ? 'py-10 px-6 sm:py-14 md:py-20 lg:py-24'
    : ctaSectionSpacing === 'generous'
      ? 'py-8 px-6 sm:py-12 md:py-16 lg:py-20'
      : 'py-6 px-6 sm:py-10 md:py-12 lg:py-16';
  const urgencyBorder = ctaBorderMode === 'top-accent' ? `4px solid ${ctaUrgencyColor || '#dc2626'}` : 'none';
  // VARIANT: --cta-contrast high contrast styling
  const isHighContrast = ctaContrast === 'high' || promoContrast === 'high';
  // VARIANT: --cta-urgency-level shows urgency indicator
  const isCtaUrgent = ctaUrgencyLevel === 'high';
  // VARIANT: --cta-proof-style shows social proof
  const isAvatarRow = ctaProofStyle === 'avatar-row';
  // VARIANT: --cta-body-font-style
  const bodyFontStyle: React.CSSProperties = ctaBodyFontStyle === 'italic' ? { fontStyle: 'italic' } : {};
  // VARIANT: --promo-layout controls split/sticker layout
  const isPromoSplit = promoLayout === 'split';
  const isPromoSticker = promoLayout === 'sticker';
  // VARIANT: --promo-sticker-shape rounds the sticker badge
  const promoBadgeRadius = promoStickerShape === 'circle' ? '9999px' : '0.5rem';
  // VARIANT: --promo-badge-size
  const promoBadgePadding = promoBadgeSize === 'large' ? 'px-5 py-2 text-sm' : 'px-3 py-1 text-xs';
  // VARIANT: --promo-split-ratio controls 2-col grid
  const promoGridClass = promoSplitRatio && promoSplitRatio.includes('/')
    ? (() => {
        const [a, b] = promoSplitRatio.split('/').map(Number);
        return (!a || !b || isNaN(a) || isNaN(b))
          ? 'grid-cols-1 md:grid-cols-2'
          : `grid-cols-1 md:grid-cols-[${a}fr_${b}fr]`;
      })()
    : '';

  // Build base button style from content.style variant
  const btnBgOverride = section.style.buttonBackgroundColor;
  const btnTextOverride = section.style.buttonTextColor;
  const effectiveBtnBg = btnBgOverride || theme.colors.primary;
  const effectiveBtnText = btnTextOverride || contrastTextColor(effectiveBtnBg);

  // VARIANT: --cta-button-variant overrides content.style, --promo-button-variant merges
  const effectiveBtnVariant = ctaButtonVariant || promoButtonVariant || content.style || 'solid';
  const btnStyleMap = {
    solid: { backgroundColor: effectiveBtnBg, color: effectiveBtnText, border: 'none' },
    outline: { backgroundColor: 'transparent', color: effectiveBtnText, border: `2px solid ${effectiveBtnBg}` },
    gradient: {
      background: `linear-gradient(135deg, ${effectiveBtnBg}, ${theme.colors.secondary})`,
      color: effectiveBtnText,
      border: 'none',
    },
  };
  const btnStyle = btnStyleMap[effectiveBtnVariant] || btnStyleMap.solid;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {/* VARIANT: --promo-layout split shows 2-column layout */}
      {isPromoSplit ? (
        <div className={`mx-auto grid ${promoGridClass || 'grid-cols-1 md:grid-cols-2'} gap-6 md:gap-8 items-center ${ctaPaddingClass}`}
          style={{ maxWidth: variantMaxWidth || '48rem' }}
        >
          <div className="text-center md:text-left" style={{ ...headlineStyle }}>
            <h2 className="text-2xl font-bold sm:text-3xl" style={{
              ...headingFontStyle(theme),
              ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}),
              ...(v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size') ? { fontSize: v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size') } : {}),
              ...(v('--sq-heading-lg-weight') ? { fontWeight: parseFloat(v('--sq-heading-lg-weight')) } : {}),
            }}>
              {content.headline}
            </h2>
            {content.body && (<p className="mt-3 text-sm opacity-65" style={bodyFontStyle}>{content.body}</p>)}
            <button
              className={`${borderRadius} mt-6 inline-flex items-center justify-center gap-2 px-8 py-3 text-sm font-semibold transition-transform hover:scale-[1.02] w-full sm:w-auto`}
              style={btnStyle}
            >
              {content.ctaText}
              <ArrowRight className="h-4 w-4" />
            </button>
            {/* VARIANT: --promo-fine-print */}
            {promoFinePrint === 'visible' && (<p className="mt-3 text-[10px] opacity-40">Terms and conditions apply. Offer valid while supplies last.</p>)}
          </div>
          {/* VARIANT: --promo-image-ratio placeholder image */}
          <div className={`hidden md:block w-full overflow-hidden rounded-xl bg-gradient-to-br ${isHighContrast ? 'from-white/10 to-white/5' : 'from-primary/10 to-secondary/5'}`} style={{ aspectRatio: v('--promo-image-ratio') || '4/5' }} />
        </div>
      ) : (
      <div className={`mx-auto text-center ${ctaPaddingClass} transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}
        style={{
          backgroundColor: isHighContrast ? '#0f0f0f' : (section.style.backgroundColor || theme.colors.surface),
          color: isHighContrast ? '#ffffff' : undefined,
          borderRadius: theme.borderRadius === 'none' ? '0' : '1rem',
          maxWidth: variantMaxWidth || undefined,
          borderTop: urgencyBorder,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 10px 15px -3px rgb(0 0 0 / 0.05)',
        }}
      >
        {/* VARIANT: --cta-proof-style avatar row */}
        {isAvatarRow && (
          <div className="mb-4 flex justify-center gap-1">
            {['A', 'B', 'C', 'D'].map((initials, i) => (
              <div
                key={i}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white border-2 border-background"
                style={{ backgroundColor: ['#6366f1', '#8b5cf6', '#a855f7', '#c084fc'][i], zIndex: 4 - i }}
              >{initials}</div>
            ))}
            <span className="ml-2 text-xs opacity-65 self-center">Loved by thousands</span>
          </div>
        )}
        {/* VARIANT: --promo-sticker-shape and --promo-badge-size sticker badge */}
        {isPromoSticker && content.headline && (
          <div className={`mb-4 inline-flex items-center gap-2 rounded-full ${promoBadgePadding} font-bold`} style={{ backgroundColor: theme.colors.primary, color: contrastTextColor(theme.colors.primary), borderRadius: promoBadgeRadius }}>
            {content.headline.slice(0, 20)}{content.headline.length > 20 ? '…' : ''}
          </div>
        )}
        {/* VARIANT: --cta-urgency-level urgency badge */}
        {isCtaUrgent && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${ctaUrgencyColor || '#dc2626'}15`, color: ctaUrgencyColor || '#dc2626' }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: ctaUrgencyColor || '#dc2626' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: ctaUrgencyColor || '#dc2626' }} />
            </span>
            Don't Miss Out
          </div>
        )}
        <h2 className="text-2xl font-bold sm:text-3xl" style={{
          ...headingFontStyle(theme),
          ...headlineStyle,
          ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}),
          ...(v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size') ? { fontSize: v('--sq-heading-lg-font-size') || v('--sq-heading-md-font-size') } : {}),
          ...(v('--sq-heading-lg-weight') ? { fontWeight: parseFloat(v('--sq-heading-lg-weight')) } : {}),
        }}>
          {content.headline}
        </h2>
        {content.body && (
          <p className="mt-3 text-sm opacity-65" style={bodyFontStyle}>
            {content.body}
          </p>
        )}
        <button
          className={`${borderRadius} mt-6 inline-flex items-center justify-center gap-2 px-8 py-3 text-sm font-semibold transition-transform hover:scale-[1.02] w-full sm:w-auto`}
          style={btnStyle}
        >
          {content.ctaText}
          <ArrowRight className="h-4 w-4" />
        </button>
        {/* VARIANT: --promo-fine-print */}
        {promoFinePrint === 'visible' && (<p className="mt-3 text-[10px] opacity-40">Terms and conditions apply. Offer valid while supplies last.</p>)}
        {/* VARIANT: --promo-fine-print optional */}
        {promoFinePrint === 'optional' && (<p className="mt-3 text-[10px] opacity-30">*Conditions apply</p>)}
      </div>
      )}
    </SectionWrapper>
  );
}

// ─── 11. Categories ─────────────────────────────────────────────────────

export function CategoriesSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as CategoriesContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;

  // Category-specific variant reads (reserved for future use)
  const catColumns = v('--categories-columns');
  const catCardStyle = v('--categories-card-style');
  const effectiveColumns = catColumns ? gridCols(parseInt(catColumns, 10)) : gridCols(content.columns);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      {content.headline && (
        <h2 className="mb-8 text-2xl font-bold sm:text-3xl" style={{ ...headingFontStyle(theme), ...(section.style.headlineColor ? { color: section.style.headlineColor } : {}) }}>
          {content.headline}
        </h2>
      )}
      <div className={`grid ${effectiveColumns} gap-4 sm:gap-6`}>
        {content.items.map((cat) => (
          <div
            key={cat.id}
            className={`${borderRadius} overflow-hidden border transition-shadow hover:shadow-md group cursor-pointer`}
            style={{ borderColor: theme.colors.border }}
          >
            {cat.image ? (
              <div className="aspect-[3/2] w-full overflow-hidden">
                <StoreImage
                  src={cat.image}
                  alt={cat.name}
                  fallbackColor={stringToColor(cat.slug, theme)}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : (
              <div
                className="flex aspect-[3/2] w-full items-center justify-center"
                style={{ backgroundColor: stringToColor(cat.slug, theme) }}
              >
                <svg className="h-10 w-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
                </svg>
              </div>
            )}
            <div className="p-3 sm:p-4">
              <h3 className="text-sm font-semibold">
                {cat.name}
              </h3>
              {cat.productCount !== undefined && (
                <p className="mt-0.5 text-xs opacity-65">
                  {cat.productCount} {cat.productCount === 1 ? 'product' : 'products'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}

// ─── 12. Footer ─────────────────────────────────────────────────────────
// Phase 3A: platform-specific social icons, clickable links, logo, contact info, visual polish

/** Platform-specific SVG social icons. Returns null for unknown platforms. */
export function SocialIcon({ platform, className }: { platform: string; className?: string }) {
  const cls = className || 'h-4 w-4';
  const p = platform.toLowerCase().trim();
  switch (p) {
    case 'instagram':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case 'twitter':
    case 'x':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    case 'pinterest':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    default:
      // Generic circle placeholder for unknown platforms
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8M12 8v8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function FooterSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as FooterContent;
  const textMuted = theme.colors.textMuted;

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;

  // Footer-specific variant reads (reserved for future use)
  const footerBgColor = v('--footer-bg-color');
  const footerTextColor = v('--footer-text-color');
  const footerColumns = v('--footer-columns');
  const textPrimary = theme.colors.text;
  const primary = theme.colors.primary;
  const border = theme.colors.border;
  const hasContact = content.contactInfo?.email || content.contactInfo?.phone || content.contactInfo?.address;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      <div className="space-y-10">
        {/* Top row: Logo/Name + Tagline + Social + Contact */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            {content.logo ? (
              <StoreImage
                src={content.logo}
                alt={content.storeName}
                fallbackColor={theme.colors.surface}
                className="mb-3 h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-lg font-bold" style={{ color: textPrimary }}>
                {content.storeName}
              </span>
            )}
            {content.tagline && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: textMuted }}>
                {content.tagline}
              </p>
            )}
            {/* Social icons */}
            {content.socialLinks && content.socialLinks.length > 0 && (
              <div className="mt-5 flex gap-2.5">
                {content.socialLinks.map((social) => (
                  <a
                    key={social.platform}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110"
                    style={{ backgroundColor: primary + '12', color: primary }}
                    title={social.platform.charAt(0).toUpperCase() + social.platform.slice(1)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SocialIcon platform={social.platform} className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Contact column (if available) */}
          {hasContact && (
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
                Contact
              </h4>
              <ul className="space-y-2.5">
                {content.contactInfo!.email && (
                  <li>
                    <a
                      href={`mailto:${content.contactInfo!.email}`}
                      className="flex items-center gap-2 text-sm transition-colors hover:opacity-70"
                      style={{ color: textMuted }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {content.contactInfo!.email}
                    </a>
                  </li>
                )}
                {content.contactInfo!.phone && (
                  <li>
                    <span className="flex items-center gap-2 text-sm" style={{ color: textMuted }}>
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {content.contactInfo!.phone}
                    </span>
                  </li>
                )}
                {content.contactInfo!.address && (
                  <li>
                    <span className="flex items-start gap-2 text-sm" style={{ color: textMuted }}>
                      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {content.contactInfo!.address}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Link columns */}
          {content.columns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.link}
                      className="text-sm transition-colors hover:opacity-70"
                      style={{ color: textMuted }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row"
          style={{ borderColor: border }}
        >
          {content.copyrightText && (
            <p className="text-xs" style={{ color: textMuted }}>
              {content.copyrightText}
            </p>
          )}
          {!content.copyrightText && (
            <p className="text-xs" style={{ color: textMuted }}>
              &copy; {new Date().getFullYear()} {content.storeName}. All rights reserved.
            </p>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 13. Brand Statement ───────────────────────────────────────────────

export function BrandStatementSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as BrandStatementContent;
  const style = section.style;

  // ── Variant CSS variable consumption (Design Library) ──
  const v = (key: string, fallback: string = '') => variantCssVars?.[key] ?? fallback;

  const brandLayout = v('--brand-layout');
  const brandSplitRatio = v('--brand-split-ratio');
  const brandTypePairing = v('--brand-type-pairing');
  const brandCaptionStyle = v('--brand-caption-style');
  const brandImageBleed = v('--brand-image-bleed');
  const brandCopyMeasure = v('--brand-copy-measure');
  const brandPortraitVisible = v('--brand-portrait-visible');
  const brandPortraitRatio = v('--brand-portrait-ratio');
  const brandSignatureStyle = v('--brand-signature-style');
  const brandSurface = v('--brand-surface');
  const brandTimelineLineStyle = v('--brand-timeline-line-style');
  const brandTimelineStepMarker = v('--brand-timeline-step-marker');
  const brandTimelineAlternation = v('--brand-timeline-alternation');
  const brandSurfaceAlternation = v('--brand-surface-alternation');
  const brandTypeSystem = v('--brand-type-system');
  const brandHeadingWeight = v('--brand-heading-weight');

  const hasBgImage = !!style.backgroundImage;
  const textColor = style.textColor || (hasBgImage ? '#ffffff' : theme.colors.text);

  // VARIANT: --brand-image-bleed allows image to overflow
  const isImageBleed = brandImageBleed === 'true';
  // VARIANT: --brand-copy-measure controls text width
  const copyMeasureStyle = brandCopyMeasure === 'narrow' ? { maxWidth: '20rem' } : {};
  // VARIANT: --brand-portrait-visible shows portrait placeholder
  const isPortraitVisible = brandPortraitVisible === 'true';
  const portraitRatioStyle = brandPortraitRatio ? { aspectRatio: brandPortraitRatio } : {};
  // VARIANT: --brand-signature-style shows signature text
  const isSignatureScript = brandSignatureStyle === 'script';
  // VARIANT: --brand-surface warm background
  const surfaceStyle = brandSurface === 'warm' ? { backgroundColor: lightenHex(theme.colors.background, 0.02) || '#fafaf8' } : {};
  // VARIANT: --brand-timeline-* controls timeline layout
  const isTimeline = brandLayout === 'timeline';
  const isTimelineSolid = brandTimelineLineStyle === 'solid';
  const isTimelineDot = brandTimelineStepMarker === 'dot';
  const isTimelineAlternate = brandTimelineAlternation === 'true';
  const isSurfaceAlternate = brandSurfaceAlternation === 'true';
  // VARIANT: --brand-type-system numbered
  const isNumbered = brandTypeSystem === 'numbered';
  // VARIANT: --brand-heading-weight
  const brandWeightStyle = brandHeadingWeight ? { fontWeight: parseFloat(brandHeadingWeight) } : {};

  // Parse split ratio e.g. '5/7' → 'grid-cols-[5fr_7fr]'
  const parseSplitRatio = (ratio: string): string => {
    if (!ratio || !ratio.includes('/')) return 'grid-cols-1 lg:grid-cols-2';
    const [a, b] = ratio.split('/').map(Number);
    if (!a || !b || isNaN(a) || isNaN(b)) return 'grid-cols-1 lg:grid-cols-2';
    return `grid-cols-1 lg:grid-cols-[${a}fr_${b}fr]`;
  };
  const splitGridClass = parseSplitRatio(brandSplitRatio);

  // Typography style from variant
  const brandHeadlineStyle: React.CSSProperties =
    brandTypePairing === 'serif_sans'
      ? { fontFamily: 'var(--sq-font-heading)' }
      : brandTypePairing === 'sans_sans'
        ? {}
        : headingFontStyle(theme);
  // Merge heading weight override
  Object.assign(brandHeadlineStyle, brandWeightStyle);

  // Token-driven typography from design library
  const tokenFontSize = v('--sq-heading-lg-font-size') || v('--sq-heading-xl-font-size');
  const tokenLetterSpacing = v('--sq-heading-lg-letter-spacing') || v('--sq-heading-xl-letter-spacing');
  const tokenLineHeight = v('--sq-heading-lg-line-height') || v('--sq-heading-xl-line-height');
  const tokenFontWeight = v('--sq-heading-lg-weight');

  const isSplit = brandLayout === 'split';
  const isFull = brandLayout === 'full';
  const isCaptionSmallItalic = brandCaptionStyle === 'small_italic';
  const isCaptionNone = brandCaptionStyle === 'none';

  // Inner content shared across layouts
  const brandContent = (
    <>
      <h2
        className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl"
        style={{
          ...brandHeadlineStyle,
          textShadow: hasBgImage ? '0 2px 12px rgba(0,0,0,0.3)' : undefined,
          ...(style.headlineColor ? { color: style.headlineColor } : {}),
          ...(tokenFontSize ? { fontSize: tokenFontSize } : {}),
          ...(tokenLetterSpacing ? { letterSpacing: tokenLetterSpacing } : {}),
          ...(tokenLineHeight ? { lineHeight: tokenLineHeight } : {}),
          ...(tokenFontWeight ? { fontWeight: parseFloat(tokenFontWeight) } : {}),
        }}
      >
        {content.headline}
      </h2>
      {content.body && (
        <p
          className={`mt-4 max-w-2xl text-lg leading-relaxed opacity-80 sm:text-xl ${isCaptionSmallItalic ? '!text-sm !font-normal !italic' : ''} ${isCaptionNone ? '!opacity-0 h-0 m-0 overflow-hidden' : ''}`}
          style={{
            textShadow: hasBgImage ? '0 1px 8px rgba(0,0,0,0.2)' : undefined,
            ...(content.alignment === 'center' && !isSplit && !isFull ? { marginLeft: 'auto', marginRight: 'auto' } : {}),
            ...copyMeasureStyle,
          }}
        >
          {content.body}
        </p>
      )}
      {/* VARIANT: --brand-portrait-visible shows portrait */}
      {isPortraitVisible && (
        <div className="mt-6 inline-block" style={portraitRatioStyle}>
          <div className="mx-auto h-24 w-24 rounded-full bg-gray-200/50" style={{ aspectRatio: brandPortraitRatio || '1/1' }} />
        </div>
      )}
      {/* VARIANT: --brand-signature-style shows signature */}
      {isSignatureScript && (
        <p className="mt-4 text-lg italic opacity-40" style={{ fontFamily: 'cursive' }}>The Founder</p>
      )}
      {/* VARIANT: --brand-type-system numbered label */}
      {isNumbered && (
        <div className="mt-4 text-6xl font-extrabold opacity-10 tabular-nums">01</div>
      )}
    </>
  );

  // Full-width layout: image with overlay text
  if (isFull) {
    return (
      <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
        <div className="relative min-h-[280px] overflow-hidden">
          {hasBgImage && (
            <>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${style.backgroundImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              {style.overlay && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />
              )}
            </>
          )}
          <div className="relative z-10 flex min-h-[280px] items-center py-16">
            {brandContent}
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // Timeline layout: vertical timeline with steps
  if (isTimeline) {
    const timelineSteps = content.body
      ? content.body.split(/\n|\./).filter(s => s.trim().length > 10).slice(0, 4)
      : ['Our founding mission', 'The craft behind every product', 'Sustainably sourced materials', 'A community of believers'];
    return (
      <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
        <div className="mx-auto max-w-2xl" style={surfaceStyle}>
          <h2 className="mb-8 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl" style={{
            ...brandHeadlineStyle,
            ...(style.headlineColor ? { color: style.headlineColor } : {}),
            ...(tokenFontSize ? { fontSize: tokenFontSize } : {}),
            ...(tokenLetterSpacing ? { letterSpacing: tokenLetterSpacing } : {}),
            ...(tokenLineHeight ? { lineHeight: tokenLineHeight } : {}),
            ...(tokenFontWeight ? { fontWeight: parseFloat(tokenFontWeight) } : {}),
          }}>
            {content.headline}
          </h2>
          <div className="relative">
            {/* VARIANT: --brand-timeline-line-style */}
            <div className="absolute left-4 top-0 bottom-0 w-px md:left-6" style={{ backgroundColor: isTimelineSolid ? theme.colors.border : 'transparent', backgroundImage: isTimelineSolid ? undefined : `repeating-linear-gradient(to bottom, ${theme.colors.border} 0px, ${theme.colors.border} 4px, transparent 4px, transparent 8px)` }} />
            {timelineSteps.map((step, i) => (
              <div key={i} className={`relative flex gap-4 md:gap-6 pb-8 ${isTimelineAlternate && i % 2 === 1 ? 'md:flex-row-reverse md:text-right' : ''}`} style={isSurfaceAlternate && i % 2 === 1 ? { backgroundColor: lightenHex(theme.colors.background, 0.01) || '#fafafa' } : undefined}>
                {/* VARIANT: --brand-timeline-step-marker */}
                <div className="relative z-10 mt-1 flex-shrink-0">
                  {isTimelineDot ? (
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.colors.primary }} />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: theme.colors.primary }}>
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="flex-1 pt-px">
                  <p className="text-sm leading-relaxed opacity-75">{step.trim()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // Split layout: 2-column grid (image left, text right)
  if (isSplit) {
    return (
      <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
        <div className={`grid ${splitGridClass} gap-8 lg:gap-12 items-center`}>
          {/* Image column */}
          {hasBgImage && (
            <div className={`aspect-[4/3] w-full overflow-hidden ${isImageBleed ? '-ml-4 -mr-4 lg:-ml-8 lg:-mr-8' : ''}`}>
              <StoreImage
                src={style.backgroundImage}
                alt={content.headline}
                fallbackColor={theme.colors.primary}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          {/* Text column */}
          <div className={!hasBgImage ? 'col-span-full' : ''}>
            {brandContent}
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // Default: centered layout
  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      <div className={`flex min-h-[280px] flex-col items-center justify-center text-center`} style={surfaceStyle}>
        {!hasBgImage && (
          <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-black/30 pointer-events-none" />
        )}
        <div className="relative z-10 w-full">
          {brandContent}
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 14. Rich Text ──────────────────────────────────────────────────────

export function RichTextSection({ section, theme, selectedSectionId, onSelectSection, variantCssVars }: SectionRendererProps) {
  const content = section.content as unknown as RichTextContent;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} cssVars={variantCssVars}>
      <div
        className="prose prose-sm max-w-none sm:prose-base"
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
    </SectionWrapper>
  );
}

// ─── 14. Spacer ─────────────────────────────────────────────────────────

export function SpacerSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as SpacerContent;
  const heightMap = { sm: 'h-6', md: 'h-12', lg: 'h-20', xl: 'h-32' };
  const isSelected = selectedSectionId === section.id;

  return (
    <div
      className={`relative transition-all duration-200 ${heightMap[content.height] || heightMap.md} ${
        isSelected
          ? 'ring-2 ring-[#a855f7] ring-offset-2'
          : 'cursor-pointer hover:ring-1 hover:ring-[#a855f7]/40'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection?.(isSelected ? null : section.id);
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      {/* Dashed guide when selected */}
      {isSelected && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-[#a855f7]/50" />
      )}
    </div>
  );
}

// ─── 15. Divider ────────────────────────────────────────────────────────

export function DividerSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const isSelected = selectedSectionId === section.id;

  return (
    <div
      className={`relative transition-all duration-200 py-2 ${
        isSelected
          ? 'ring-2 ring-[#a855f7] ring-offset-2'
          : 'cursor-pointer hover:ring-1 hover:ring-[#a855f7]/40'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection?.(isSelected ? null : section.id);
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      <div className="mx-auto max-w-6xl px-6">
        <Minus className="mx-auto h-px w-full" style={{ color: theme.colors.border }} />
      </div>
    </div>
  );
}

// ─── Section Renderer Props — use the canonical type from component-registry ──
// Extended locally with variant-specific props for the rendering pipeline.

// ─── Main Section Router ────────────────────────────────────────────────

export function renderSection(props: SectionRendererProps): React.ReactNode {
  const { section, theme } = props;

  if (!section.visible) return null;

  // ── GAP 3: Resolve variant configuration ──────────────────────
  let effectiveSection = section;
  let variantCssVars: Record<string, string> = {};
  let variantExtraClasses = '';
  let variantCardStyle: string | undefined;

  if (section.componentMeta?.componentId) {
    const entry = componentRegistry.getByComponentId(section.componentMeta.componentId);
    if (entry?.Component) {
      return (
        <SectionErrorBoundary sectionType={`${section.type} (${entry.componentId})`}>
          <entry.Component {...props} />
        </SectionErrorBoundary>
      );
    }
    // No custom component registered — resolve variant config to
    // produce visual differences between variants using default renderers.
    const config = resolveVariantConfig(section, theme);
    if (config) {
      // Debug: log variant resolution details
      const varCount = Object.keys(config.cssVars ?? {}).length;
      const extraCls = config.extraClasses ?? '';
      if (varCount > 0 || extraCls) {
        console.log(
          `[DL] ${section.type} | ${section.componentMeta?.componentId} | ${varCount} vars | ${extraCls}`,
        );
      }
      // Merge content overrides into section.content
      if (Object.keys(config.contentOverrides).length > 0) {
        effectiveSection = {
          ...effectiveSection,
          content: { ...effectiveSection.content, ...config.contentOverrides },
        };
      }
      // Merge style overrides into section.style
      if (Object.keys(config.styleOverrides).length > 0) {
        effectiveSection = {
          ...effectiveSection,
          style: { ...effectiveSection.style, ...config.styleOverrides },
        };
      }
      variantCssVars = config.cssVars ?? {};
      variantExtraClasses = config.extraClasses ?? '';
      variantCardStyle = config.cardStyle;
    }
  }

  // Merge rhythm CSS vars from visual rhythm engine (set via section.style._rhythmCssVars)
  const rhythmVars = (effectiveSection.style as Record<string, unknown>)?._rhythmCssVars as Record<string, string> | undefined;
  if (rhythmVars) {
    variantCssVars = { ...variantCssVars, ...rhythmVars };
  }

  // Merge global design token CSS vars (typography scale, spacing, radii, etc.)
  // These come from the composition engine via StoreRenderer's variantCssVars prop.
  // They provide the base layer that variant-specific vars can override.
  if (props.variantCssVars) {
    variantCssVars = { ...props.variantCssVars, ...variantCssVars };
  }

  // Build effective props with the merged section + variant metadata
  const effectiveProps: SectionRendererProps = {
    ...props,
    section: effectiveSection,
    variantCssVars: Object.keys(variantCssVars).length > 0 ? variantCssVars : undefined,
    variantExtraClasses: variantExtraClasses || undefined,
    cardStyle: variantCardStyle,
  };

  let element: React.ReactNode = null;

  switch (effectiveSection.type) {
    case 'header':
      element = <HeaderSection {...effectiveProps} />; break;
    case 'hero':
      element = <HeroSection {...effectiveProps} />; break;
    case 'featured-products':
      element = <FeaturedProductsSection {...effectiveProps} />; break;
    case 'product-grid':
      element = <ProductGridSection {...effectiveProps} />; break;
    case 'text-banner':
      element = <TextBannerSection {...effectiveProps} />; break;
    case 'image-gallery':
      element = <ImageGallerySection {...effectiveProps} />; break;
    case 'testimonials':
      element = <TestimonialsSection {...effectiveProps} />; break;
    case 'newsletter':
      element = <NewsletterSection {...effectiveProps} />; break;
    case 'faq':
      element = <FAQSection {...effectiveProps} />; break;
    case 'cta':
      element = <CTASection {...effectiveProps} />; break;
    case 'categories':
      element = <CategoriesSection {...effectiveProps} />; break;
    case 'brand-statement':
      element = <BrandStatementSection {...effectiveProps} />; break;
    case 'footer':
      element = <FooterSection {...effectiveProps} />; break;
    case 'rich-text':
      element = <RichTextSection {...effectiveProps} />; break;
    case 'spacer':
      element = <SpacerSection {...effectiveProps} />; break;
    case 'divider':
      element = <DividerSection {...effectiveProps} />; break;
    default:
      return (
        <SectionErrorBoundary sectionType={section.type}>
          <div className="py-8 text-center text-sm text-gray-400">
            <p className="font-medium">Unsupported section type: {section.type}</p>
            <p className="mt-1 text-xs text-gray-300">This section can be edited or removed.</p>
          </div>
        </SectionErrorBoundary>
      );
  }

  // Wrap in error boundary, then optionally wrap in a variant div
  // that applies CSS custom properties and extra utility classes.
  const withBoundary = (
    <SectionErrorBoundary sectionType={section.type}>
      {element}
    </SectionErrorBoundary>
  );

  // If variant has CSS vars or extra classes, wrap in a div so they
  // cascade to all children (including SectionWrapper's inner content).
  if (variantCssVars && Object.keys(variantCssVars).length > 0 || variantExtraClasses) {
    const wrapperStyle: React.CSSProperties = {};
    if (variantCssVars) {
      Object.entries(variantCssVars).forEach(([key, value]) => {
        (wrapperStyle as Record<string, string>)[key] = value;
      });
    }
    const debugLabel = section.componentMeta?.componentId
      ? `${section.componentMeta.componentId} | ${Object.keys(variantCssVars ?? {}).length} vars`
      : null;
    return (
      <div className={(variantExtraClasses || '') + ' relative'} style={wrapperStyle}>
        {debugLabel && (
          <span
            className="absolute top-1 right-1 z-50 rounded px-1.5 py-0.5 text-[9px] font-mono leading-none text-white/80"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {debugLabel}
          </span>
        )}
        {withBoundary}
      </div>
    );
  }

  return withBoundary;
}
