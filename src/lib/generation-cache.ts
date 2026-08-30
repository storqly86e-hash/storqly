// ========================================
// In-Memory Generation Result Cache
// ========================================
// Stores completed generation results for recovery when the SSE stream
// drops before the client receives the final `result` event.
//
// TTL: 5 minutes per entry (auto-evicted on access).
//
// This is a server-side-only module. Do not import on the client.

import type { Store } from '@/lib/store-schema';

interface CacheEntry {
  store: Store;
  completedAt: number;
  /** Extra metadata from the generation result */
  meta?: {
    _normalizations?: number;
    _productCapHit?: boolean;
    _requestedCount?: number;
    _generatedCount?: number;
  };
  /** If the generation failed, store the error */
  error?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

/** Clean up expired entries (called on every write) */
function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.completedAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

/** Store a successful generation result */
export function cacheGenerationResult(jobId: string, store: Store, meta?: CacheEntry['meta']): void {
  evictExpired();
  cache.set(jobId, { store, completedAt: Date.now(), meta });
  console.log(`[GEN_CACHE] Stored result for jobId=${jobId}, store="${store.name}" (${cache.size} entries)`);
}

/** Store a failed generation */
export function cacheGenerationError(jobId: string, error: string): void {
  evictExpired();
  cache.set(jobId, { store: null as unknown as Store, completedAt: Date.now(), error });
  console.log(`[GEN_CACHE] Stored error for jobId=${jobId}: ${error.slice(0, 100)}`);
}

/** Retrieve a cached generation result */
export function getCachedGeneration(jobId: string): CacheEntry | null {
  const entry = cache.get(jobId);
  if (!entry) return null;
  if (Date.now() - entry.completedAt > CACHE_TTL_MS) {
    cache.delete(jobId);
    return null;
  }
  return entry;
}

/** Get current cache size (for diagnostics) */
export function getCacheSize(): number {
  return cache.size;
}
