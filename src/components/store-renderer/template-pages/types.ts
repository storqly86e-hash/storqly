// ========================================
// Shared types for template page components
// ========================================

import type { Store } from '@/lib/store-schema';

/** Common props passed to every template page component */
export interface TemplatePageProps {
  store: Store;
  /** Navigate to another page by pageId */
  onNavigate: (pageId: string) => void;
  /** Navigate to a specific product's detail page (if it exists) */
  onViewProduct?: (productId: string) => void;
}
