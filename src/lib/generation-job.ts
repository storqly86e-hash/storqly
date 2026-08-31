// ========================================
// Generation Job Manager — Database-Backed
// ========================================
// All job state is persisted to SQLite via Prisma.
// Survives server restarts, page refreshes, network disconnects.
// The generated store is persisted in the database, making
// the result independent of any HTTP connection state.
//
// This is a server-side-only module. Do not import on the client.

import { db } from '@/lib/db';
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

const isTerminalStatus = (status: string) =>
  status === JOB_STATUS.COMPLETED ||
  status.startsWith('FAILED_') ||
  status === JOB_STATUS.CANCELLED;

// ─── In-memory active set (fast lookup for polling) ───────
// The DB is the source of truth. This is just an optimization
// so the status endpoint doesn't hit the DB on every poll.
const activeJobIds = new Set<string>();

// ─── Create / Resume ───────────────────────────────────────

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
    console.log(`[GEN_JOB] Idempotent: returning existing job ${existing.id} for requestId=${params.requestId}`);
    if (!isTerminalStatus(existing.status)) {
      activeJobIds.add(existing.id);
    }
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

  activeJobIds.add(job.id);
  console.log(`[GEN_JOB] Created job ${job.id} (requestId=${params.requestId})`);
  return job as GenerationJobRow;
}

// ─── Update Progress ───────────────────────────────────────

export async function updateJobProgress(jobId: string, params: {
  stage?: string;
  progress?: string;
}): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (params.stage) data.stage = params.stage;
  if (params.progress) data.progress = params.progress;

  try {
    await db.generationJob.update({ where: { id: jobId }, data });
  } catch (err) {
    console.error(`[GEN_JOB] Failed to update progress for ${jobId}:`, err);
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
    activeJobIds.delete(jobId);
    console.log(`[GEN_JOB] Job ${jobId} COMPLETED. Store: "${store.name}" (${storeData.length} chars persisted)`);
  } catch (err) {
    console.error(`[GEN_JOB] FAILED TO PERSIST job ${jobId}:`, err);
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
    } catch (err2) {
      console.error(`[GEN_JOB] CRITICAL: Could not update job to FAILED_PERSISTENCE:`, err2);
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
    activeJobIds.delete(jobId);
    console.log(`[GEN_JOB] Job ${jobId} FAILED: ${params.errorCode} — ${params.errorMessage.slice(0, 100)}`);
  } catch (err) {
    console.error(`[GEN_JOB] Failed to update job ${jobId} to failed state:`, err);
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
    activeJobIds.delete(jobId);
    console.log(`[GEN_JOB] Job ${jobId} CANCELLED`);
    return true;
  } catch {
    return false;
  }
}

// ─── Get Status ────────────────────────────────────────────

export async function getJobStatus(jobId: string): Promise<GenerationJobRow | null> {
  try {
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    return job as GenerationJobRow | null;
  } catch (err) {
    console.error(`[GEN_JOB] Failed to get status for ${jobId}:`, err);
    return null;
  }
}

// ─── Check if Active (fast in-memory check) ───────────────

export function isJobActive(jobId: string): boolean {
  return activeJobIds.has(jobId);
}

/** Mark job as no longer active (called when generation function exits) */
export function markJobInactive(jobId: string): void {
  activeJobIds.delete(jobId);
}

/** Mark job as active */
export function markJobActive(jobId: string): void {
  activeJobIds.add(jobId);
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
      console.log(`[GEN_JOB] Cleaned up ${result.count} old jobs (older than 30 min)`);
    }
    return result.count;
  } catch {
    return 0;
  }
}
