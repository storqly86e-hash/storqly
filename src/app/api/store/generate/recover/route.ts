// ========================================
// Generation Recovery API [V3] (Database-Backed)
// ========================================
// GET /api/store/generate/recover?jobId=xxx
//
// Returns the generation result from the database.
// Used for page-refresh recovery: if the user refreshes during
// or after generation, the frontend can recover the job.

import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, JOB_STATUS } from '@/lib/generation-job';
import { getDatabaseIdentity } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { status: 'NOT_FOUND', errorCode: 'MISSING_JOB_ID', error: 'jobId is required.', found: false },
      { status: 400 }
    );
  }

  const identity = getDatabaseIdentity();
  console.log(`[GENERATION_V3][RECOVER_REQUEST] jobId=${jobId} dbPath=${identity.resolvedPath} dbExists=${identity.fileExists} pid=${identity.processPid}`);

  const job = await getJobStatus(jobId);

  if (!job) {
    return NextResponse.json(
      { status: 'NOT_FOUND', errorCode: 'JOB_NOT_FOUND', error: 'Job not found.', found: false },
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
        status: 'FAILED',
        errorCode: 'CORRUPTED_DATA',
        error: 'Generated store data was corrupted. Please try again.',
      });
    }
    if (job.storeMeta) {
      try { meta = JSON.parse(job.storeMeta); } catch { /* ignore */ }
    }
    return NextResponse.json({
      found: true,
      status: 'COMPLETED',
      store,
      ...(meta ? { meta } : {}),
    });
  }

  if (job.status === JOB_STATUS.CANCELLED) {
    return NextResponse.json({
      found: true,
      status: 'CANCELLED',
      error: 'Generation was cancelled.',
    });
  }

  if (job.status.startsWith('FAILED_')) {
    return NextResponse.json({
      found: true,
      status: 'FAILED',
      errorCode: job.errorCode || job.status,
      error: job.errorMessage || 'Generation failed.',
    });
  }

  // Job is still in progress — tell client to poll
  return NextResponse.json({
    found: true,
    status: 'PROCESSING',
    progress: {
      stage: job.stage || null,
      message: job.progress || 'Processing...',
    },
  });
}
