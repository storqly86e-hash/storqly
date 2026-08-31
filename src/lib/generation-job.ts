// ========================================
// Generation Job Manager — Database-Backed [V3]
// ========================================
// All job state is persisted to SQLite via Prisma.
// Survives server restarts, page refreshes, network disconnects.
// The generated store is persisted in the database, making
// the result independent of any HTTP connection state.
//
// V3 Changes:
// - Removed in-memory activeJobIds (DB is sole source of truth)
// - Fixed orphan sweep: uses 2-minute time guard to avoid
//   killing freshly-created jobs on fast restarts
// - All logging uses [GENERATION_V3] prefix with jobId
// - getDatabaseIdentity() called for diagnostics on every operation
//
// This is a server-side-only module. Do not import on the client.

import { db } from '@/lib/db';
import { getDatabaseIdentity } from '@/lib/db';
import type { Store } from '@/lib/store-schema';

// ─── Job Status Constants ──────────────────────────────────
export const JOB_STATUS = {
  QUEUED: 'QUEUED',
  GENERATING: 'GENERATING',
  COMPOSING: 'COMPOSING',
  NORMALIZING: 'NORMALIZING',
  DESIGN_LIBRARY: 'DESIGN_LIBRARY',
  VALIDATING: 'VALIDATING',
  PERSISTING: 'PERSISTING',
  COMPLETED: 'COMPLETED',
  FAILED_AI: 'FAILED_AI',
  FAILED_COMPOSITION: 'FAILED_COMPOSITION',
  FAILED_VALIDATION: 'FAILED_VALIDATION',
  FAILED_PERSISTENCE: 'FAILED_PERSISTENCE',
  FAILED_TIMEOUT: 'FAILED_TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

const TERMINAL_STATUSES = new Set([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.CANCELLED,
  JOB_STATUS.FAILED_AI,
  JOB_STATUS.FAILED_COMPOSITION,
  JOB_STATUS.FAILED_VALIDATION,
  JOB_STATUS.FAILED_PERSISTENCE,
  JOB_STATUS.FAILED_TIMEOUT,
]);

const isTerminalStatus = (status: string) => TERMINAL_STATUSES.has(status);

export interface GenerationJobRow {
  id: string;
  requestId: string;
  status: string;
  stage: string;
  progress: string;
  storeData: string | null;
  storeMeta: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  prompt: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

// ─── V3 Structured Logger ──────────────────────────────────
const v3log = (event: string, jobId: string, details?: Record<string, unknown>) => {
  const identity = getDatabaseIdentity();
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][GENERATION_V3][${event}] jobId=${jobId} dbPath=${identity.resolvedPath} pid=${identity.processPid}${details ? ' ' + JSON.stringify(details) : ''}`);
};

// ─── Create / Resume (Idempotent) ──────────────────────────

/**
 * Create a new generation job. If a job with the same requestId
 * already exists, return it (idempotency).
 */
export async function createJob(params: {
  jobId: string;
  requestId: string;
  prompt: string;
  userId?: string;
}): Promise<GenerationJobRow> {
  // Idempotency: check for existing job with same requestId
  const existing = await db.generationJob.findUnique({
    where: { requestId: params.requestId },
  });
  if (existing) {
    v3log('JOB_CREATED_IDEMPOTENT', existing.id, { requestId: params.requestId, existingStatus: existing.status });
    return existing as GenerationJobRow;
  }

  const job = await db.generationJob.create({
    data: {
      id: params.jobId,
      requestId: params.requestId,
      prompt: params.prompt,
      userId: params.userId ?? null,
      status: JOB_STATUS.QUEUED,
      stage: 'queued',
      progress: 'Job created',
    },
  });

  v3log('JOB_CREATED', job.id, { requestId: params.requestId, userId: params.userId ?? 'anonymous' });
  return job as GenerationJobRow;
}

// ─── Update Progress ───────────────────────────────────────

export async function updateJobProgress(jobId: string, params: {
  status?: string;
  stage?: string;
  progress?: string;
}): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (params.status) data.status = params.status;
  if (params.stage) data.stage = params.stage;
  if (params.progress) data.progress = params.progress;

  try {
    await db.generationJob.update({ where: { id: jobId }, data });
    v3log('STAGE', jobId, { status: params.status, stage: params.stage, progress: params.progress });
  } catch (err) {
    const identity = getDatabaseIdentity();
    console.error(`[GENERATION_V3] DB_WRITE_ERROR jobId=${jobId} dbPath=${identity.resolvedPath}:`, err);
  }
}

// ─── Complete (Success) ─────────────────────────────────────

export async function completeJob(jobId: string, store: Store, meta?: Record<string, unknown>): Promise<void> {
  const storeData = JSON.stringify(store);
  const storeMeta = meta ? JSON.stringify(meta) : null;

  try {
    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.COMPLETED,
        stage: 'completed',
        progress: 'Store generated successfully',
        storeData,
        storeMeta,
        completedAt: new Date(),
      },
    });
    v3log('JOB_COMPLETED', jobId, { storeName: store.name, storeDataBytes: storeData.length });
  } catch (err) {
    const identity = getDatabaseIdentity();
    console.error(`[GENERATION_V3] PERSIST_ERROR jobId=${jobId} dbPath=${identity.resolvedPath}:`, err);
    // If persistence fails, update status to FAILED_PERSISTENCE
    try {
      await db.generationJob.update({
        where: { id: jobId },
        data: {
          status: JOB_STATUS.FAILED_PERSISTENCE,
          stage: 'persistence_failed',
          progress: 'Failed to save generated store',
          errorCode: JOB_STATUS.FAILED_PERSISTENCE,
          errorMessage: `Database persistence failed: ${err instanceof Error ? err.message : String(err)}`,
          completedAt: new Date(),
        },
      });
      v3log('JOB_FAILED', jobId, { errorCode: 'FAILED_PERSISTENCE' });
    } catch (err2) {
      console.error(`[GENERATION_V3] CRITICAL: Could not update job to FAILED_PERSISTENCE:`, err2);
    }
  }
}

// ─── Fail ──────────────────────────────────────────────────

export async function failJob(jobId: string, params: {
  errorCode: string;
  errorMessage: string;
  stage?: string;
}): Promise<void> {
  try {
    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: params.errorCode,
        stage: params.stage || 'failed',
        progress: `Failed: ${params.errorMessage.slice(0, 100)}`,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        completedAt: new Date(),
      },
    });
    v3log('JOB_FAILED', jobId, { errorCode: params.errorCode, errorMessage: params.errorMessage.slice(0, 100) });
  } catch (err) {
    const identity = getDatabaseIdentity();
    console.error(`[GENERATION_V3] FAIL_WRITE_ERROR jobId=${jobId} dbPath=${identity.resolvedPath}:`, err);
  }
}

// ─── Cancel ────────────────────────────────────────────────

export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    if (!job || isTerminalStatus(job.status)) return false;

    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.CANCELLED,
        stage: 'cancelled',
        progress: 'Cancelled by user',
        completedAt: new Date(),
      },
    });
    v3log('JOB_CANCELLED', jobId, { previousStatus: job.status });
    return true;
  } catch {
    return false;
  }
}

// ─── Get Status (DB-only, no in-memory) ────────────────────

export async function getJobStatus(jobId: string): Promise<GenerationJobRow | null> {
  try {
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    v3log('STATUS_READ', jobId, { found: !!job, status: job?.status ?? 'NOT_FOUND' });
    return job as GenerationJobRow | null;
  } catch (err) {
    const identity = getDatabaseIdentity();
    console.error(`[GENERATION_V3] STATUS_READ_ERROR jobId=${jobId} dbPath=${identity.resolvedPath}:`, err);
    return null;
  }
}

// ─── Cleanup old jobs (TTL) ────────────────────────────────

const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function cleanupOldJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - JOB_TTL_MS);
  try {
    const result = await db.generationJob.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[GENERATION_V3] CLEANUP: deleted ${result.count} jobs older than 30 min`);
    }
    return result.count;
  } catch {
    return 0;
  }
}

// ─── Startup Orphan Sweep ──────────────────────────────────
// On server start, any non-terminal job that has been stuck
// for > 2 minutes is an orphan (the background Promise was
// killed by the restart). Jobs < 2 min old are left alone
// because the server may have just restarted and a fresh
// POST → background generation is still warming up.
//
// V3 FIX: Added time guard (2 min). Previously, ALL non-terminal
// jobs were marked FAILED_TIMEOUT on first request after restart,
// which killed freshly-created jobs.

let orphanSweepDone = false;

const ORPHAN_MIN_AGE_MS = 2 * 60 * 1000; // 2 minutes — only sweep jobs stuck this long

export async function sweepOrphanedJobs(): Promise<number> {
  if (orphanSweepDone) return 0;
  orphanSweepDone = true;

  const identity = getDatabaseIdentity();
  console.log(`[GENERATION_V3] ORPHAN_SWEEP_START dbPath=${identity.resolvedPath} pid=${identity.processPid}`);

  try {
    const cutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);

    const orphans = await db.generationJob.findMany({
      where: {
        status: { notIn: [...TERMINAL_STATUSES] },
        updatedAt: { lt: cutoff }, // V3 FIX: only sweep old enough jobs
      },
    });

    if (orphans.length === 0) {
      console.log(`[GENERATION_V3] ORPHAN_SWEEP: no orphaned jobs found (cutoff: ${ORPHAN_MIN_AGE_MS / 1000}s ago)`);
      return 0;
    }

    console.log(`[GENERATION_V3] ORPHAN_SWEEP: found ${orphans.length} orphaned job(s) older than 2 min`);

    for (const job of orphans) {
      const stuckSeconds = Math.round((Date.now() - job.updatedAt.getTime()) / 1000);
      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: JOB_STATUS.FAILED_TIMEOUT,
          stage: 'orphaned',
          progress: 'Server restarted during generation',
          errorCode: JOB_STATUS.FAILED_TIMEOUT,
          errorMessage: 'Generation was interrupted because the server restarted. Please try again.',
          completedAt: new Date(),
        },
      });
      v3log('JOB_ORPHANED', job.id, { previousStatus: job.status, stuckSeconds });
    }

    return orphans.length;
  } catch (err) {
    console.error(`[GENERATION_V3] ORPHAN_SWEEP_ERROR:`, err);
    return 0;
  }
}

// ─── Stubs for backward compat (no-op, DB is source of truth) ──
// These are kept so existing imports don't break.
export function isJobActive(_jobId: string): boolean {
  // V3: Always return false. DB is the sole source of truth.
  // The in-memory set was unreliable across restarts and caused
  // false orphan detection.
  return false;
}

export function markJobInactive(_jobId: string): void {
  // V3: No-op. The in-memory active set has been removed.
}

export function markJobActive(_jobId: string): void {
  // V3: No-op. The in-memory active set has been removed.
}
