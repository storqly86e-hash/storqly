// ═══════════════════════════════════════════════════════════════════
// Multi-Currency Formatting Utility
// ═══════════════════════════════════════════════════════════════════
// Uses Intl.NumberFormat for locale-aware currency display.
// Prices are stored as raw numbers (e.g., 88.00) and formatted
// at render time based on the store's currency settings.

export interface CurrencyConfig {
  code: string;        // ISO 4217 code: 'USD', 'EUR', 'AED', 'CAD', 'PKR', etc.
  locale?: string;     // BCP-47 locale: 'en-US', 'de-DE', 'ar-AE', etc.
  symbol?: string;     // Override symbol (rarely needed, Intl handles this)
}

const DEFAULT_CONFIG: CurrencyConfig = {
  code: 'USD',
  locale: 'en-US',
};

/**
 * Format a numeric price into a localized currency string.
 *
 * @param price - Raw price number (e.g., 88.00)
 * @param config - Currency configuration (code, locale)
 * @returns Formatted string (e.g., "$88.00", "€79,50", "AED 323.00")
 *
 * @example
 * formatCurrency(88.00, { code: 'USD' })                    // "$88.00"
 * formatCurrency(88.00, { code: 'AED', locale: 'ar-AE' })   // "AED 88.00"
 * formatCurrency(8800, { code: 'PKR', locale: 'en-PK' }, true) // "PKR 8,800.00" (cents mode)
 */
export function formatCurrency(
  price: number,
  config: Partial<CurrencyConfig> = {},
  isCents: boolean = false,
): string {
  const { code, locale } = { ...DEFAULT_CONFIG, ...config };
  const value = isCents ? price / 100 : price;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback for unsupported currency codes
    const symbol = config.symbol || code;
    return `${symbol} ${value.toFixed(2)}`;
  }
}

/**
 * Detect user's likely currency from browser locale.
 * Returns a reasonable default based on the Accept-Language header
 * or navigator.language.
 */
export function detectUserCurrency(): CurrencyConfig {
  if (typeof navigator === 'undefined') return DEFAULT_CONFIG;

  const lang = navigator.language || 'en-US';
  const region = lang.split('-')[1]?.toUpperCase() || 'US';

  // Common region → currency mapping
  const regionCurrency: Record<string, { code: string; locale: string }> = {
    US: { code: 'USD', locale: 'en-US' },
    GB: { code: 'GBP', locale: 'en-GB' },
    EU: { code: 'EUR', locale: 'de-DE' },
    DE: { code: 'EUR', locale: 'de-DE' },
    FR: { code: 'EUR', locale: 'fr-FR' },
    AE: { code: 'AED', locale: 'ar-AE' },
    SA: { code: 'SAR', locale: 'ar-SA' },
    CA: { code: 'CAD', locale: 'en-CA' },
    AU: { code: 'AUD', locale: 'en-AU' },
    PK: { code: 'PKR', locale: 'en-PK' },
    IN: { code: 'INR', locale: 'en-IN' },
    JP: { code: 'JPY', locale: 'ja-JP' },
    CN: { code: 'CNY', locale: 'zh-CN' },
    KR: { code: 'KRW', locale: 'ko-KR' },
    BR: { code: 'BRL', locale: 'pt-BR' },
    MX: { code: 'MXN', locale: 'es-MX' },
  };

  const detected = regionCurrency[region];
  if (detected) return detected;

  // Default to USD for unknown regions
  return DEFAULT_CONFIG;
}
