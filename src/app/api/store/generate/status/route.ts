// ========================================
// Generation Status Polling API
// ========================================
// GET /api/store/generate/status?jobId=xxx
// Returns the current status of a background generation job.
//
// Response:
//   { status: 'processing', progress?: { stage, message } }
//   { status: 'completed', store, meta }
//   { status: 'failed', error }
//   { status: 'not_found' }

import { NextRequest, NextResponse } from 'next/server';
import { getCachedGeneration, activeJobs, getJobProgress } from '@/lib/generation-cache';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required.', status: 'not_found' as const },
      { status: 400 }
    );
  }

  // Job is still being processed
  if (activeJobs.has(jobId)) {
    const progress = getJobProgress(jobId);
    return NextResponse.json({
      status: 'processing' as const,
      ...(progress ? { progress } : {}),
    });
  }

  const entry = getCachedGeneration(jobId);

  if (!entry) {
    return NextResponse.json({ status: 'not_found' as const });
  }

  if (entry.error) {
    return NextResponse.json({ status: 'failed' as const, error: entry.error });
  }

  return NextResponse.json({
    status: 'completed' as const,
    store: entry.store,
    meta: entry.meta,
  });
}
