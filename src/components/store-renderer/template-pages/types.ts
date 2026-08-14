// ========================================
// Shared types for template page components
// ========================================

import type { Store, StorePage } from '@/lib/store-schema';

/** Common props passed to every template page component */
export interface TemplatePageProps {
  store: Store;
  /** The current page object (provides metadata for branded text) */
  page?: StorePage;
  /** Navigate to another page by pageId */
  onNavigate: (pageId: string) => void;
  /** Navigate to a specific product's detail page (if it exists) */
  onViewProduct?: (productId: string) => void;
}
