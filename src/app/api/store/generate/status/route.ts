// ========================================
// Generation Status Polling API (Database-Backed)
// ========================================
// GET /api/store/generate/status?jobId=xxx
//
// Detects orphaned jobs: if a job has been in a non-terminal state
// for > 5 minutes with no active generation, marks it as FAILED_TIMEOUT.
// This handles server restarts mid-generation.

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, failJob, isJobActive, JOB_STATUS, sweepOrphanedJobs } from '@/lib/generation-job';

export const dynamic = 'force-dynamic';

// ─── Orphan detection threshold ─────────────────────────────
// If a job is in a non-terminal state for longer than this
// and no active generation is running, it's considered orphaned.
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const isTerminalStatus = (status: string) =>
  status === JOB_STATUS.COMPLETED ||
  status.startsWith('FAILED_') ||
  status === JOB_STATUS.CANCELLED;

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required.', status: 'not_found' as const },
      { status: 400 }
    );
  }

  // Run orphan sweep on first request after server start
  await sweepOrphanedJobs().catch(() => {});

  try {
    const job = await getJobStatus(jobId);

    if (!job) {
      return NextResponse.json({ status: 'not_found' as const });
    }

    // ── Orphan detection ──────────────────────────────────────
    // If the job is non-terminal, not actively being generated,
    // and has been stuck for > ORPHAN_THRESHOLD_MS, mark it failed.
    // This handles the server-restart-mid-generation scenario.
    if (!isTerminalStatus(job.status) && !isJobActive(jobId)) {
      const stuckDuration = Date.now() - job.updatedAt.getTime();
      if (stuckDuration > ORPHAN_THRESHOLD_MS) {
        console.log(
          `[GEN_STATUS] Orphaned job detected: ${jobId} stuck in '${job.status}' for ${Math.round(stuckDuration / 1000)}s. Marking FAILED_TIMEOUT.`
        );
        await failJob(jobId, {
          errorCode: 'FAILED_TIMEOUT',
          errorMessage: 'Generation was interrupted (server may have restarted). Please try again.',
        });
        return NextResponse.json({
          status: 'failed' as const,
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
          status: 'failed' as const,
          error: 'Generated store data was corrupted. Please try again.',
        });
      }
      if (job.storeMeta) {
        try { meta = JSON.parse(job.storeMeta); } catch { /* ignore */ }
      }
      return NextResponse.json({
        status: 'completed' as const,
        store,
        ...(meta ? { meta } : {}),
      });
    }

    if (job.status === JOB_STATUS.CANCELLED) {
      return NextResponse.json({
        status: 'cancelled' as const,
        error: 'Generation was cancelled.',
      });
    }

    if (job.status.startsWith('FAILED_')) {
      return NextResponse.json({
        status: 'failed' as const,
        error: job.errorMessage || 'Generation failed.',
        errorCode: job.errorCode || job.status,
      });
    }

    // Job is still in progress (QUEUED, GENERATING, COMPOSING, etc.)
    return NextResponse.json({
      status: 'processing' as const,
      progress: {
        stage: job.stage || null,
        message: job.progress || 'Processing...',
        status: job.status,
      },
    });
  } catch (err) {
    console.error(`[GEN_STATUS] Error fetching job ${jobId}:`, err);
    return NextResponse.json({
      status: 'not_found' as const,
      error: 'Failed to check job status. The server may be restarting.',
    });
  }
}
