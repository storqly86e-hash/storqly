// ========================================
// In-Memory Generation Cache + Job Tracker
// ========================================
// Supports the POST → Poll architecture:
// - activeJobs tracks in-progress jobs
// - progressMap tracks current progress messages per job
// - cache stores completed results for retrieval
//
// TTL: 5 minutes per entry (auto-evicted on write).
//
// This is a server-side-only module. Do not import on the client.

import type { Store } from '@/lib/store-schema';

// ─── Types ────────────────────────────────────────────────────

export interface GenerationMeta {
  _normalizations?: number;
  _productCapHit?: boolean;
  _requestedCount?: number;
  _generatedCount?: number;
}

interface CacheEntry {
  store: Store;
  completedAt: number;
  meta?: GenerationMeta;
  error?: string;
}

// ─── Active Jobs ──────────────────────────────────────────────

export const activeJobs = new Set<string>();

export function markJobStarted(jobId: string): void {
  activeJobs.add(jobId);
}

export function markJobCompleted(jobId: string): void {
  activeJobs.delete(jobId);
  progressMap.delete(jobId);
}

// ─── Progress Tracking ───────────────────────────────────────

const progressMap = new Map<string, { stage: string | null; message: string; updatedAt: number }>();

/** Update the current progress message for a job (shown during polling) */
export function updateJobProgress(jobId: string, stage: string | null, message: string): void {
  progressMap.set(jobId, { stage, message, updatedAt: Date.now() });
}

/** Get the current progress for a job */
export function getJobProgress(jobId: string): { stage: string | null; message: string } | null {
  const p = progressMap.get(jobId);
  if (!p) return null;
  // Progress is stale if job is no longer active
  if (!activeJobs.has(jobId)) return null;
  return { stage: p.stage, message: p.message };
}

// ─── Result Cache ────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.completedAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

export function cacheGenerationResult(jobId: string, store: Store, meta?: GenerationMeta): void {
  evictExpired();
  cache.set(jobId, { store, completedAt: Date.now(), meta });
  console.log(`[GEN_CACHE] Stored result for jobId=${jobId}, store="${store.name}" (${cache.size} entries)`);
}

export function cacheGenerationError(jobId: string, error: string): void {
  evictExpired();
  cache.set(jobId, { store: null as unknown as Store, completedAt: Date.now(), error });
  console.log(`[GEN_CACHE] Stored error for jobId=${jobId}: ${error.slice(0, 100)}`);
}

export function getCachedGeneration(jobId: string): CacheEntry | null {
  const entry = cache.get(jobId);
  if (!entry) return null;
  if (Date.now() - entry.completedAt > CACHE_TTL_MS) {
    cache.delete(jobId);
    return null;
  }
  return entry;
}

export function getCacheSize(): number {
  return cache.size;
}
