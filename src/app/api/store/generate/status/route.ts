// ========================================
// Generation Status Polling API (Database-Backed)
// ========================================
// GET /api/store/generate/status?jobId=xxx
//
// Response:
//   { status: 'QUEUED'|'GENERATING'|'COMPLETED'|'FAILED_AI'|... }
//   { progress?: { stage, message } }
//   { store?, meta? }  (when status=COMPLETED)
//   { error? }         (when status=FAILED_*)

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, JOB_STATUS } from '@/lib/generation-job';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required.', status: 'not_found' as const },
      { status: 400 }
    );
  }

  try {
    const job = await getJobStatus(jobId);

    if (!job) {
      return NextResponse.json({ status: 'not_found' as const });
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
