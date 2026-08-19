'use client';

import { Component, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  parseColorToRGB,
  contrastTextColor,
  stringToColor,
  formatPrice,
  getInitials,
  pyClass,
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
import { StoreImage } from './store-image';


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
          <div className="max-w-sm">
            <p className="text-sm font-medium" style={{ color: '#888' }}>
              Section render error ({this.props.sectionType})
            </p>
            <p className="mt-1 text-xs" style={{ color: '#aaa' }}>
              {this.state.error?.message || 'Unknown error'}
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
}

function SectionWrapper({
  section,
  theme,
  selectedSectionId,
  onSelectSection,
  children,
}: SectionWrapperProps) {
  const isSelected = selectedSectionId === section.id;
  const style = section.style;

  const sectionBg = style.backgroundColor || theme.colors.background;
  const sectionText = style.textColor || theme.colors.text;

  const bgImage = style.backgroundImage
    ? `url(${style.backgroundImage})`
    : undefined;

  const outerClasses = [
    'relative transition-all duration-200 cursor-pointer',
    pyClass(style.paddingY),
    isSelected ? 'ring-2 ring-[#a855f7] ring-offset-2' : 'hover:ring-1 hover:ring-[#a855f7]/40',
  ].join(' ');

  return (
    <div
      className={outerClasses}
      style={{
        backgroundColor: sectionBg,
        color: sectionText,
        backgroundImage: bgImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
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
      >
        {/* Selected section label */}
        {isSelected && (
          <div className="absolute -top-3 left-4 z-20 rounded-full bg-[#a855f7] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-lg">
            {section.type.replace(/-/g, ' ')}
          </div>
        )}
        {children}
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
}: {
  product: StoreProduct;
  theme: StoreTheme;
  showAddToCart: boolean;
  borderRadius: string;
  buttonBgOverride?: string;
  buttonTextOverride?: string;
  onViewProduct?: (productId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const addToCart = useCartStore((s) => s.addItem);
  const imgColor = stringToColor(product.id, theme);
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1200);
  };

  return (
    <div
      className={`${borderRadius} ${onViewProduct ? 'cursor-pointer' : ''} overflow-hidden bg-white border border-gray-100 shadow-sm transition-shadow duration-200 group`}
      style={{
        borderColor: theme.colors.border,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onViewProduct ? () => onViewProduct(product.id) : undefined}
      role={onViewProduct ? 'button' : undefined}
      tabIndex={onViewProduct ? 0 : undefined}
    >
      {/* Product image with real image + fallback */}
      <div
        className="relative aspect-square w-full overflow-hidden"
        style={{ backgroundColor: imgColor }}
      >
        <StoreImage
          src={product.images[0] || ''}
          alt={product.name}
          fallbackColor={imgColor}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
      </div>
      {/* Info — explicitly reset color to prevent section textColor bleeding into white card */}
      <div className="p-4 sm:p-5" style={{ color: theme.colors.text }}>
        {product.category && (
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: theme.colors.textMuted }}>
            {product.category}
          </p>
        )}
        <h3 className="text-base font-semibold leading-snug line-clamp-2" style={{ color: theme.colors.text }}>
          {product.name}
        </h3>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-base font-bold" style={{ color: theme.colors.primary }}>
            {formatPrice(product.price)}
          </span>
          {hasDiscount && product.compareAtPrice && (
            <span className="text-sm line-through" style={{ color: theme.colors.textMuted }}>
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </div>
        {showAddToCart && product.inStock && (
          <button
            className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer ${
              hovered
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-1 pointer-events-none'
            }`}
            style={{
              backgroundColor: addedFeedback ? '#16a34a' : (buttonBgOverride || theme.colors.primary),
              color: addedFeedback ? '#ffffff' : (buttonTextOverride || contrastTextColor(buttonBgOverride || theme.colors.primary)),
            }}
            onClick={handleAddToCart}
          >
            {addedFeedback ? 'Added!' : 'Add to Cart'}
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
}: SectionRendererProps) {
  const content = section.content as unknown as HeaderContent;
  const isSelected = selectedSectionId === section.id;

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-all duration-200 ${
        isSelected
          ? 'ring-2 ring-[#a855f7] ring-offset-2'
          : 'cursor-pointer hover:ring-1 hover:ring-[#a855f7]/40'
      }`}
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection?.(isSelected ? null : section.id);
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo / Store Name */}
        <div className="flex items-center gap-3">
          {content.logo ? (
            <img
              src={content.logo}
              alt={content.storeName}
              className="h-8 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <span
            className={`text-lg font-bold tracking-tight ${content.logo ? 'hidden' : ''}`}
            style={{ color: theme.colors.text }}
          >
            {content.storeName}
          </span>
        </div>

        {/* Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          {content.menuItems.map((item) => (
            <span
              key={item.label}
              className="text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: theme.colors.textMuted }}
            >
              {item.label}
            </span>
          ))}
        </nav>

        {/* Right icons */}
        <div className="flex items-center gap-4">
          {content.showSearch && (
            <button style={{ color: theme.colors.textMuted }} aria-label="Search">
              <Search className="h-5 w-5" />
            </button>
          )}
          {content.showCart && (
            <button className="relative" style={{ color: theme.colors.textMuted }} aria-label="Cart">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: theme.colors.primary }}>
                0
              </span>
            </button>
          )}
          {/* Mobile menu toggle placeholder */}
          <button className="md:hidden" style={{ color: theme.colors.textMuted }} aria-label="Menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
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

export function HeroSection({ section, theme, selectedSectionId, onSelectSection, products }: SectionRendererProps) {
  const content = section.content as unknown as HeroContent;
  const style = section.style;
  const isSelected = selectedSectionId === section.id;
  const layout = content.layout || 'minimal';
  const ctaStyle = content.ctaStyle || 'filled';
  const productTreatment = content.productTreatment || 'floating';
  const badgeStyle = content.badgeStyle || 'outlined';

  const isCentered = layout === 'centered' || layout === 'minimal';
  const hasProductLayout = layout === 'split-left' || layout === 'split-right' || layout === 'product-first' || layout === 'text-first';

  // ── Product image resolution (memoized) ──
  const resolvedHeroImage = useMemo(() => {
    if (content.heroImage) return content.heroImage;
    if (!hasProductLayout) return undefined;
    return products.find(p => p.featured)?.images[0] || products[0]?.images[0];
  }, [content.heroImage, content.layout, products]);

  const showProduct = !!resolvedHeroImage && hasProductLayout;

  // ── Height (responsive-aware) — generous for professional e-commerce ──
  const heightMap: Record<string, string> = { sm: 'min-h-[360px]', md: 'min-h-[480px]', lg: 'min-h-[600px]', xl: 'min-h-[750px]' };
  const minHeight = layout === 'minimal'
    ? (heightMap[content.height] || 'min-h-[600px]')
    : (heightMap[content.height] || heightMap.lg);

  // ── Alignment (centered / minimal layouts) ──
  const alignClass = isCentered
    ? ({ left: 'items-start text-left', center: 'items-center text-center', right: 'items-end text-right' } as const)[content.alignment]
    : 'items-center';

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

  // ── Directional overlay (varies by layout for depth) ──
  const overlayGradient = (() => {
    if (!effectiveHasBgImage) return undefined;
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
  const textColor = style.textColor || '#ffffff';
  const primaryColor = theme.colors.primary;
  const accentColor = theme.colors.accent;
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
  const headlineShadow = effectiveHasBgImage ? '0 2px 24px rgba(0,0,0,0.45)' : undefined;
  const subheadlineShadow = effectiveHasBgImage ? '0 1px 12px rgba(0,0,0,0.3)' : undefined;

  // ── Headline size scale (user-controllable via headlineSize content field) ──
  const headlineSizeClass = (() => {
    switch (content.headlineSize) {
      case 'sm':
        return 'text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-bold tracking-tight leading-[1.15]';
      case 'lg':
        return 'text-5xl sm:text-6xl md:text-7xl lg:text-7xl xl:text-8xl font-extrabold tracking-tight leading-[1.05]';
      case 'xl':
        return 'text-6xl sm:text-7xl md:text-8xl lg:text-8xl xl:text-9xl font-black tracking-tight leading-[1.0]';
      case 'md':
      default:
        if (layout === 'minimal') return 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-[1.05]';
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
  const getProductImageStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      maxWidth: '100%',
      height: 'auto',
    };
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
  const getBadgeStyle = (): React.CSSProperties => {
    switch (badgeStyle) {
      case 'filled':
        return { backgroundColor: hexToRgba(primaryColor, 0.2), borderColor: hexToRgba(primaryColor, 0.3), color: textColor };
      case 'gradient':
        return { background: `linear-gradient(135deg, ${hexToRgba(primaryColor, 0.3)} 0%, ${hexToRgba(accentColor, 0.2)} 100%)`, border: 'none', color: textColor };
      case 'outlined':
      default:
        return { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: hexToRgba(textColor, 0.25), color: textColor };
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

  // ── CTA click handler ──
  const handleCtaClick = (e: React.MouseEvent) => e.stopPropagation();

  // ── CTA button class ──
  const primaryCtaClass = [
    'inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 shadow-lg hover:shadow-xl',
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
        className={`relative flex transition-all duration-200 cursor-pointer overflow-hidden ${minHeight} ${alignClass} ${pyClass(style.paddingY)} ${isSelected ? 'ring-2 ring-[#a855f7] ring-offset-2' : 'hover:ring-1 hover:ring-[#a855f7]/40'}`}
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
                  backgroundImage: `url(${img.src})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: bgTreatmentFilter || undefined,
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

        {/* Vignette */}
        {content.vignette && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.45) 100%)' }}
          />
        )}

        {/* Subtle accent glow */}
        {showAccent && (
          <div
            className={`absolute h-96 w-96 rounded-full pointer-events-none ${accentPos}`}
            style={{ background: `radial-gradient(circle, ${hexToRgba(primaryColor, 0.08)} 0%, transparent 70%)` }}
          />
        )}

        {/* Content area */}
        <div className={`relative z-10 mx-auto w-full ${pxClass(style.paddingX)} ${isCentered ? maxWidthClass(style.maxWidth) : 'max-w-7xl'} ${gridClass}`}>
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
              style={{ textShadow: headlineShadow, ...(headlineColor ? { color: headlineColor } : {}) }}
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
            <div className={`${productColClass} flex items-center justify-center`}>
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

export function FeaturedProductsSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct, forceHideAddToCart }: SectionRendererProps) {
  const content = section.content as unknown as FeaturedProductsContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);
  const featuredProducts = useMemo(
    () => content.productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as StoreProduct[],
    [content.productIds, products],
  );

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      {content.headline && (
        <h2 className="mb-2 text-2xl font-bold sm:text-3xl lg:text-4xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
      )}
      {content.subtitle && (
        <p className="mb-8 text-base opacity-65">
          {content.subtitle}
        </p>
      )}
      <div className={`grid ${gridCols(content.columns)} gap-5 sm:gap-6 lg:gap-8`}>
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
          />
        ))}
      </div>
    </SectionWrapper>
  );
}

// ─── 4. Product Grid ───────────────────────────────────────────────────

export function ProductGridSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct, forceHideAddToCart }: SectionRendererProps) {
  const content = section.content as unknown as ProductGridContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  const filteredProducts = useMemo(() => {
    let prods = products;
    if (content.filterByCategory) {
      prods = prods.filter((p) => p.category === content.filterByCategory);
    }
    return prods;
  }, [products, content.filterByCategory]);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      {content.headline && (
        <h2 className="mb-8 text-2xl font-bold sm:text-3xl lg:text-4xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
      )}
      <div className={`grid ${gridCols(content.columns)} gap-5 sm:gap-6 lg:gap-8`}>
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
          />
        ))}
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

export function TextBannerSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
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

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className={`${alignMap[content.alignment]}`}>
        <h2 className={`font-bold leading-tight tracking-tight ${sizes.headline}`} style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
        {content.body && (
          <p className={`mt-3 max-w-2xl ${sizes.body} opacity-65`}>
            {content.body}
          </p>
        )}
      </div>
    </SectionWrapper>
  );
}

// ─── 6. Image Gallery ───────────────────────────────────────────────────

export function ImageGallerySection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as ImageGalleryContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);
  const gapMap = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className={`grid ${gridCols(content.columns)} ${gapMap[content.gap] || gapMap.md}`}>
        {content.images.map((img, i) => (
          <div key={i} className={`${borderRadius} overflow-hidden group`}>
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
            </div>
            {img.caption && (
              <p className="mt-2 text-xs opacity-65">
                {img.caption}
              </p>
            )}
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}

// ─── 7. Testimonials ────────────────────────────────────────────────────

export function TestimonialsSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as TestimonialsContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      {content.headline && (
        <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((item) => (
          <div
            key={item.id}
            className={`${borderRadius} p-6 shadow-sm transition-shadow hover:shadow-md`}
            style={{
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {/* Stars */}
            {item.rating && (
              <div className="mb-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${i < item.rating! ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
                  />
                ))}
              </div>
            )}
            {/* Quote */}
            <p className="text-sm leading-relaxed">
              &ldquo;{item.quote}&rdquo;
            </p>
            {/* Author */}
            <div className="mt-4 flex items-center gap-3">
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
              <div>
                <p className="text-sm font-semibold">
                  {item.author}
                </p>
                {item.role && (
                  <p className="text-xs opacity-65">
                    {item.role}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}

// ─── 8. Newsletter ──────────────────────────────────────────────────────

export function NewsletterSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as NewsletterContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className="mx-auto max-w-xl text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.colors.primary}15` }}>
          <Mail className="h-5 w-5" style={{ color: theme.colors.primary }} />
        </div>
        <h2 className="text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
        {content.subtitle && (
          <p className="mt-2 text-sm opacity-65">
            {content.subtitle}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            placeholder={content.placeholderText || 'Enter your email'}
            className={`flex-1 ${borderRadius} border px-4 py-3 text-sm outline-none transition-colors`}
            style={{
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
              color: theme.colors.text,
            }}
            readOnly
          />
          <button
            className={`${borderRadius} px-6 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]`}
            style={{
              backgroundColor: section.style.buttonBackgroundColor || theme.colors.primary,
              color: section.style.buttonTextColor || contrastTextColor(section.style.buttonBackgroundColor || theme.colors.primary),
            }}
          >
            {content.buttonText}
          </button>
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 9. FAQ ─────────────────────────────────────────────────────────────

export function FAQSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as FAQContent;
  const [openId, setOpenId] = useState<string | null>(null);
  const borderRadius = borderRadiusClass(theme.borderRadius);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className="mx-auto max-w-2xl">
        {content.headline && (
          <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
            {content.headline}
          </h2>
        )}
        <div className="space-y-3">
          {content.items.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div
                key={item.id}
                className={`${borderRadius} border transition-colors`}
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
                    <ChevronUp className="ml-2 h-4 w-4 flex-shrink-0 opacity-65" />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 opacity-65" />
                  )}
                </button>
                {isOpen && (
                  <div
                    className="border-t px-5 pb-4 pt-3 text-sm leading-relaxed opacity-65"
                    style={{
                      borderColor: theme.colors.border,
                    }}
                  >
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 10. CTA ─────────────────────────────────────────────────────────────

export function CTASection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as CTAContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  // Build base button style from content.style variant
  const btnBgOverride = section.style.buttonBackgroundColor;
  const btnTextOverride = section.style.buttonTextColor;
  const effectiveBtnBg = btnBgOverride || theme.colors.primary;
  const effectiveBtnText = btnTextOverride || contrastTextColor(effectiveBtnBg);

  const btnStyleMap = {
    solid: { backgroundColor: effectiveBtnBg, color: effectiveBtnText, border: 'none' },
    outline: { backgroundColor: 'transparent', color: effectiveBtnText, border: `2px solid ${effectiveBtnBg}` },
    gradient: {
      background: `linear-gradient(135deg, ${effectiveBtnBg}, ${theme.colors.secondary})`,
      color: effectiveBtnText,
      border: 'none',
    },
  };
  const btnStyle = btnStyleMap[content.style] || btnStyleMap.solid;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className={`mx-auto max-w-2xl text-center`}
        style={{ backgroundColor: theme.colors.surface, padding: '3rem 2rem', borderRadius: theme.borderRadius === 'none' ? '0' : '1rem' }}
      >
        <h2 className="text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
        {content.body && (
          <p className="mt-3 text-sm opacity-65">
            {content.body}
          </p>
        )}
        <button
          className={`${borderRadius} mt-6 inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]`}
          style={btnStyle}
        >
          {content.ctaText}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </SectionWrapper>
  );
}

// ─── 11. Categories ─────────────────────────────────────────────────────

export function CategoriesSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as CategoriesContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      {content.headline && (
        <h2 className="mb-8 text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
      )}
      <div className={`grid ${gridCols(content.columns)} gap-4 sm:gap-6`}>
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

export function FooterSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as FooterContent;
  const textMuted = theme.colors.textMuted;
  const textPrimary = theme.colors.text;
  const primary = theme.colors.primary;
  const border = theme.colors.border;
  const hasContact = content.contactInfo?.email || content.contactInfo?.phone || content.contactInfo?.address;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className="space-y-10">
        {/* Top row: Logo/Name + Tagline + Social + Contact */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            {content.logo ? (
              <StoreImage
                src={content.logo}
                alt={content.storeName}
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

export function BrandStatementSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as BrandStatementContent;
  const style = section.style;
  const isSelected = selectedSectionId === section.id;

  const alignMap = {
    left: 'items-start text-left',
    center: 'items-center text-center',
    right: 'items-end text-right',
  };

  const hasBgImage = !!style.backgroundImage;
  const textColor = style.textColor || (hasBgImage ? '#ffffff' : theme.colors.text);

  return (
    <div
      className={`relative flex min-h-[280px] items-center overflow-hidden transition-all duration-200 cursor-pointer py-16 ${alignMap[content.alignment || 'center']}`}
      style={{
        backgroundColor: style.backgroundColor || (hasBgImage ? theme.colors.primary : undefined),
        backgroundImage: hasBgImage ? `url(${style.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: textColor,
      }}
      onClick={(e) => { e.stopPropagation(); onSelectSection?.(isSelected ? null : section.id); }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      {/* Gradient overlay for background images */}
      {hasBgImage && style.overlay && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)' }} />
      )}
      {!hasBgImage && (
        <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-black/30 pointer-events-none" />
      )}

      <div className={`relative z-10 mx-auto w-full ${maxWidthClass(style.maxWidth)} ${pxClass(style.paddingX)}`}>
        <h2
          className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl"
          style={{ textShadow: hasBgImage ? '0 2px 12px rgba(0,0,0,0.3)' : undefined, ...(style.headlineColor ? { color: style.headlineColor } : {}) }}
        >
          {content.headline}
        </h2>
        {content.body && (
          <p
            className="mt-4 max-w-2xl text-lg leading-relaxed opacity-80 sm:text-xl"
            style={{ textShadow: hasBgImage ? '0 1px 8px rgba(0,0,0,0.2)' : undefined, ...(content.alignment === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : {}) }}
          >
            {content.body}
          </p>
        )}
      </div>

      {/* Selection ring */}
      {isSelected && (
        <div className="absolute inset-0 ring-2 ring-[#a855f7] ring-offset-2 pointer-events-none" />
      )}
    </div>
  );
}

// ─── 14. Rich Text ──────────────────────────────────────────────────────

export function RichTextSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as RichTextContent;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
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

// ─── Section Renderer Props (shared) ────────────────────────────────────

interface SectionRendererProps {
  section: Section;
  theme: StoreTheme;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
  products: StoreProduct[];
  onViewProduct?: (productId: string) => void;
  onNavigate?: (pageId: string) => void;
  /** When true, force-hide the Add to Cart button on product cards (e.g. home page) */
  forceHideAddToCart?: boolean;
}

// ─── Main Section Router ────────────────────────────────────────────────

export function renderSection(props: SectionRendererProps): React.ReactNode {
  const { section } = props;

  if (!section.visible) return null;

  let element: React.ReactNode = null;

  switch (section.type) {
    case 'header':
      element = <HeaderSection {...props} />; break;
    case 'hero':
      element = <HeroSection {...props} />; break;
    case 'featured-products':
      element = <FeaturedProductsSection {...props} />; break;
    case 'product-grid':
      element = <ProductGridSection {...props} />; break;
    case 'text-banner':
      element = <TextBannerSection {...props} />; break;
    case 'image-gallery':
      element = <ImageGallerySection {...props} />; break;
    case 'testimonials':
      element = <TestimonialsSection {...props} />; break;
    case 'newsletter':
      element = <NewsletterSection {...props} />; break;
    case 'faq':
      element = <FAQSection {...props} />; break;
    case 'cta':
      element = <CTASection {...props} />; break;
    case 'categories':
      element = <CategoriesSection {...props} />; break;
    case 'brand-statement':
      element = <BrandStatementSection {...props} />; break;
    case 'footer':
      element = <FooterSection {...props} />; break;
    case 'rich-text':
      element = <RichTextSection {...props} />; break;
    case 'spacer':
      element = <SpacerSection {...props} />; break;
    case 'divider':
      element = <DividerSection {...props} />; break;
    default:
      // Unknown section type — render a visible placeholder instead of invisible null
      return (
        <SectionErrorBoundary sectionType={section.type}>
          <div className="py-8 text-center text-sm text-gray-400">
            <p className="font-medium">Unsupported section type: {section.type}</p>
            <p className="mt-1 text-xs text-gray-300">This section can be edited or removed.</p>
          </div>
        </SectionErrorBoundary>
      );
  }

  // Wrap each section in its own error boundary so a malformed
  // section (e.g. AI-generated content with wrong shape) can never
  // crash the entire page.
  return (
    <SectionErrorBoundary sectionType={section.type}>
      {element}
    </SectionErrorBoundary>
  );
}
