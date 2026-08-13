'use client';

import { useMemo } from 'react';
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
  FeaturedProductsContent,
  ProductGridContent,
  TextBannerContent,
  ImageGalleryContent,
  TestimonialsContent,
  NewsletterContent,
  FAQContent,
  CTAContent,
  CategoriesContent,
  RichTextContent,
  HeaderContent,
  FooterContent,
  SpacerContent,
  StoreProduct,
} from '@/lib/store-schema';
import { useState } from 'react';


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
 {/* Image placeholder */}
      <div
        className="relative aspect-square w-full overflow-hidden"
        style={{ backgroundColor: imgColor }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="h-16 w-16 rounded-full opacity-30"
            style={{ backgroundColor: theme.colors.primary }}
          />
        </div>
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
      <div className="p-3 sm:p-4" style={{ color: theme.colors.text }}>
        {product.category && (
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: theme.colors.textMuted }}>
            {product.category}
          </p>
        )}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: theme.colors.text }}>
          {product.name}
        </h3>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: theme.colors.primary }}>
            {formatPrice(product.price)}
          </span>
          {hasDiscount && product.compareAtPrice && (
            <span className="text-xs line-through" style={{ color: theme.colors.textMuted }}>
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </div>
        {showAddToCart && product.inStock && (
          <button
            className={`mt-3 w-full rounded-md py-2 text-xs font-semibold transition-all duration-200 cursor-pointer ${
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
            />
          ) : (
            <span
              className="text-lg font-bold tracking-tight"
              style={{ color: theme.colors.text }}
            >
              {content.storeName}
            </span>
          )}
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

export function HeroSection({ section, theme, selectedSectionId, onSelectSection, products }: SectionRendererProps) {
  const content = section.content as unknown as HeroContent;
  const style = section.style;
  const isSelected = selectedSectionId === section.id;

  const heightMap = { sm: 'min-h-[300px]', md: 'min-h-[420px]', lg: 'min-h-[540px]', xl: 'min-h-[640px]' };
  const alignMap = {
    left: 'items-start text-left',
    center: 'items-center text-center',
    right: 'items-end text-right',
  };

  // Only apply theme gradient as default background when no custom color or image is set.
  // If style.backgroundColor is set, respect it — don't cover it with a gradient.
  const bgGradient = !style.backgroundImage && !style.backgroundColor
    ? `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
    : undefined;

  const outerClasses = [
    'relative flex transition-all duration-200 cursor-pointer',
    heightMap[content.height] || heightMap.md,
    alignMap[content.alignment],
    pyClass(style.paddingY),
    isSelected ? 'ring-2 ring-[#a855f7] ring-offset-2' : 'hover:ring-1 hover:ring-[#a855f7]/40',
  ].join(' ');

  return (
    <div
      className={outerClasses}
      style={{
        backgroundColor: style.backgroundColor || theme.colors.primary,
        backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : bgGradient,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: style.textColor || '#ffffff',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectSection?.(isSelected ? null : section.id);
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      {/* Overlay */}
      {style.backgroundImage && style.overlay && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}
      {/* Subtle overlay and decorative elements — only with gradient or image backgrounds */}
      {!style.backgroundImage && !style.backgroundColor && (
        <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-black/30 pointer-events-none" />
      )}
      {!style.backgroundImage && !style.backgroundColor && (
        <>
          <div className="absolute right-10 top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-10 left-10 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
        </>
      )}

      <div className={`relative z-10 mx-auto w-full ${maxWidthClass(style.maxWidth)} ${pxClass(style.paddingX)}`}>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h1>
        {content.subheadline && (
          <p className="mt-4 max-w-xl text-base opacity-80 sm:text-lg md:text-xl">
            {content.subheadline}
          </p>
        )}
        {content.ctaText && (
          <button className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105 sm:text-base"
            style={{
              backgroundColor: section.style.buttonBackgroundColor || '#ffffff',
              color: section.style.buttonTextColor || contrastTextColor(section.style.buttonBackgroundColor || '#ffffff'),
            }}>
            {content.ctaText}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 3. Featured Products ───────────────────────────────────────────────

export function FeaturedProductsSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct }: SectionRendererProps) {
  const content = section.content as unknown as FeaturedProductsContent;
  const borderRadius = borderRadiusClass(theme.borderRadius);
  const featuredProducts = useMemo(
    () => content.productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as StoreProduct[],
    [content.productIds, products],
  );

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      {content.headline && (
        <h2 className="mb-2 text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
      )}
      {content.subtitle && (
        <p className="mb-8 text-sm opacity-65">
          {content.subtitle}
        </p>
      )}
      <div className={`grid ${gridCols(content.columns)} gap-4 sm:gap-6`}>
        {featuredProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            theme={theme}
            showAddToCart={content.showAddToCart}
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

export function ProductGridSection({ section, theme, selectedSectionId, onSelectSection, products, onViewProduct }: SectionRendererProps) {
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
        <h2 className="mb-8 text-2xl font-bold sm:text-3xl" style={section.style.headlineColor ? { color: section.style.headlineColor } : undefined}>
          {content.headline}
        </h2>
      )}
      <div className={`grid ${gridCols(content.columns)} gap-4 sm:gap-6`}>
        {filteredProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            theme={theme}
            showAddToCart={content.showAddToCart}
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
              className={`aspect-[4/3] w-full ${borderRadius} bg-gray-200 transition-transform duration-300 group-hover:scale-[1.02]`}
              style={{
                backgroundColor: stringToColor(img.src || `img-${i}`, theme),
              }}
            >
              <div className="flex h-full items-center justify-center">
                <svg className="h-8 w-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              </div>
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
                <img
                  src={item.avatar}
                  alt={item.author}
                  className="h-9 w-9 rounded-full object-cover"
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
                <img
                  src={cat.image}
                  alt={cat.name}
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

export function FooterSection({ section, theme, selectedSectionId, onSelectSection }: SectionRendererProps) {
  const content = section.content as unknown as FooterContent;

  return (
    <SectionWrapper section={section} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection}>
      <div className="space-y-8">
        {/* Tagline row */}
        <div>
          <span className="text-lg font-bold">
            {content.storeName}
          </span>
          {content.tagline && (
            <p className="mt-1 text-sm opacity-65">
              {content.tagline}
            </p>
          )}
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
          {content.columns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <span className="cursor-pointer text-sm transition-colors hover:opacity-70 opacity-65">
                      {link.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row" style={{ borderColor: theme.colors.border }}>
          {content.copyrightText && (
            <p className="text-xs opacity-65">
              {content.copyrightText}
            </p>
          )}
          {/* Social icons placeholder */}
          {content.socialLinks && content.socialLinks.length > 0 && (
            <div className="flex gap-3">
              {content.socialLinks.map((social) => (
                <span
                  key={social.platform}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70"
                  style={{ backgroundColor: `${theme.colors.primary}15`, color: theme.colors.primary }}
                  title={social.platform}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 13. Rich Text ──────────────────────────────────────────────────────

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
}

// ─── Main Section Router ────────────────────────────────────────────────

export function renderSection(props: SectionRendererProps): React.ReactNode {
  const { section } = props;

  if (!section.visible) return null;

  switch (section.type) {
    case 'header':
      return <HeaderSection {...props} />;
    case 'hero':
      return <HeroSection {...props} />;
    case 'featured-products':
      return <FeaturedProductsSection {...props} />;
    case 'product-grid':
      return <ProductGridSection {...props} />;
    case 'text-banner':
      return <TextBannerSection {...props} />;
    case 'image-gallery':
      return <ImageGallerySection {...props} />;
    case 'testimonials':
      return <TestimonialsSection {...props} />;
    case 'newsletter':
      return <NewsletterSection {...props} />;
    case 'faq':
      return <FAQSection {...props} />;
    case 'cta':
      return <CTASection {...props} />;
    case 'categories':
      return <CategoriesSection {...props} />;
    case 'footer':
      return <FooterSection {...props} />;
    case 'rich-text':
      return <RichTextSection {...props} />;
    case 'spacer':
      return <SpacerSection {...props} />;
    case 'divider':
      return <DividerSection {...props} />;
    default:
      return null;
  }
}
