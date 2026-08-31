// ========================================
// Generation Recovery API (Database-Backed)
// ========================================
// GET /api/store/generate/recover?jobId=xxx
//
// Returns the generation result from the database.
// Used for page-refresh recovery: if the user refreshes during
// or after generation, the frontend can recover the job.

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, JOB_STATUS } from '@/lib/generation-job';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required.', found: false },
      { status: 400 }
    );
  }

  console.log(`[GENERATION_V2] RECOVER request for jobId=${jobId}`);

  const job = await getJobStatus(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found. It may have expired (30 min TTL) or the jobId is invalid.', found: false },
      { status: 404 }
    );
  }

  // Terminal states: return the result
  if (job.status === JOB_STATUS.COMPLETED && job.storeData) {
    let store: unknown;
    let meta: unknown;
    try {
      store = JSON.parse(job.storeData);
    } catch {
      return NextResponse.json({
        found: true,
        success: false,
        error: 'Generated store data was corrupted. Please try again.',
      });
    }
    if (job.storeMeta) {
      try { meta = JSON.parse(job.storeMeta); } catch { /* ignore */ }
    }
    return NextResponse.json({
      found: true,
      success: true,
      status: 'completed',
      store,
      ...(meta ? { meta } : {}),
    });
  }

  if (job.status === JOB_STATUS.CANCELLED) {
    return NextResponse.json({
      found: true,
      success: false,
      status: 'cancelled',
      error: 'Generation was cancelled.',
    });
  }

  if (job.status.startsWith('FAILED_')) {
    return NextResponse.json({
      found: true,
      success: false,
      status: 'failed',
      errorCode: job.errorCode || job.status,
      error: job.errorMessage || 'Generation failed.',
    });
  }

  // Job is still in progress — tell client to poll
  return NextResponse.json({
    found: true,
    success: false,
    status: 'processing',
    progress: {
      stage: job.stage || null,
      message: job.progress || 'Processing...',
    },
  });
}
