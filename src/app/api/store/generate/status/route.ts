// ========================================
// Generation Status Polling API [V3] (Database-Backed)
// ========================================
// GET /api/store/generate/status?jobId=xxx
//
// V3 Changes:
// - Explicit JOB_NOT_FOUND error code (not generic 'not_found')
// - DB identity logged on every request for diagnostics
// - Orphan detection uses DB timestamps only (no in-memory set)
// - Orphan threshold raised to 5 min (only long-stuck jobs)

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, failJob, JOB_STATUS, sweepOrphanedJobs } from '@/lib/generation-job';
import { getDatabaseIdentity } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ─── Orphan detection threshold ─────────────────────────────
// If a job is non-terminal and stuck for > 5 minutes, it's orphaned.
// The 2-minute guard in sweepOrphanedJobs() handles startup sweeps.
// This handles the case where the server stays up but the
// background Promise silently dies.
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const isTerminalStatus = (status: string) =>
  status === JOB_STATUS.COMPLETED ||
  status.startsWith('FAILED_') ||
  status === JOB_STATUS.CANCELLED;

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { status: 'NOT_FOUND', errorCode: 'MISSING_JOB_ID', error: 'jobId is required.' },
      { status: 400 }
    );
  }

  // Run orphan sweep on first request after server start
  // (has 2-minute age guard — won't kill fresh jobs)
  await sweepOrphanedJobs().catch(() => {});

  // Log DB identity for diagnostics (safe — no secrets)
  const identity = getDatabaseIdentity();
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][GENERATION_V3][STATUS_READ] jobId=${jobId} dbPath=${identity.resolvedPath} dbExists=${identity.fileExists} dbSize=${identity.fileSizeBytes} pid=${identity.processPid}`);

  try {
    const job = await getJobStatus(jobId);

    if (!job) {
      console.log(`[${ts}][GENERATION_V3][JOB_NOT_FOUND] jobId=${jobId} dbPath=${identity.resolvedPath} dbExists=${identity.fileExists}`);
      return NextResponse.json({
        status: 'NOT_FOUND',
        errorCode: 'JOB_NOT_FOUND',
        error: 'Generation job not found.',
      });
    }

    // ── Orphan detection (DB timestamps only) ────────────────
    // If the job is non-terminal and has been stuck for > 5 min,
    // the background process is dead. Mark it failed.
    if (!isTerminalStatus(job.status)) {
      const stuckDuration = Date.now() - job.updatedAt.getTime();
      if (stuckDuration > ORPHAN_THRESHOLD_MS) {
        console.log(
          `[GENERATION_V3] ORPHAN_DETECTED: ${jobId} stuck in '${job.status}' for ${Math.round(stuckDuration / 1000)}s. Marking FAILED_TIMEOUT.`
        );
        await failJob(jobId, {
          errorCode: 'FAILED_TIMEOUT',
          errorMessage: 'Generation was interrupted (server may have restarted). Please try again.',
        });
        return NextResponse.json({
          status: 'FAILED',
          errorCode: 'FAILED_TIMEOUT',
          error: 'Generation was interrupted (server may have restarted). Please try again.',
        });
      }
    }

    // Build response based on status
    if (job.status === JOB_STATUS.COMPLETED && job.storeData) {
      let store: unknown;
      let meta: unknown;
      try {
        store = JSON.parse(job.storeData);
      } catch {
        return NextResponse.json({
          status: 'FAILED',
          errorCode: 'CORRUPTED_DATA',
          error: 'Generated store data was corrupted. Please try again.',
        });
      }
      if (job.storeMeta) {
        try { meta = JSON.parse(job.storeMeta); } catch { /* ignore */ }
      }
      console.log(`[${ts}][GENERATION_V3][JOB_COMPLETED_RETURNED] jobId=${jobId} storeName=${typeof store === 'object' && store ? (store as Record<string, unknown>).name : 'unknown'}`);
      return NextResponse.json({
        status: 'COMPLETED',
        store,
        ...(meta ? { meta } : {}),
      });
    }

    if (job.status === JOB_STATUS.CANCELLED) {
      return NextResponse.json({
        status: 'CANCELLED',
        error: 'Generation was cancelled.',
      });
    }

    if (job.status.startsWith('FAILED_')) {
      return NextResponse.json({
        status: 'FAILED',
        errorCode: job.errorCode || job.status,
        error: job.errorMessage || 'Generation failed.',
      });
    }

    // Job is still in progress (QUEUED, GENERATING, COMPOSING, etc.)
    return NextResponse.json({
      status: 'PROCESSING',
      progress: {
        stage: job.stage || null,
        message: job.progress || 'Processing...',
        status: job.status,
      },
    });
  } catch (err) {
    console.error(`[GENERATION_V3] STATUS_ENDPOINT_ERROR jobId=${jobId}:`, err);
    return NextResponse.json({
      status: 'NOT_FOUND',
      errorCode: 'INTERNAL_ERROR',
      error: 'Failed to check job status. The server may be restarting.',
    });
  }
}
