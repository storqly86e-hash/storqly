// ========================================
// Generation Cancel API
// ========================================
// POST /api/store/generate/cancel?jobId=xxx
//
// Marks a running generation job as CANCELLED in the database.
// Client disconnect does NOT trigger this — only explicit user action.

import { NextRequest, NextResponse } from 'next/server';
import { cancelJob } from '@/lib/generation-job';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required.' },
      { status: 400 }
    );
  }

  console.log(`[GENERATION_V2] CANCEL request for jobId=${jobId}`);

  const cancelled = await cancelJob(jobId);

  if (!cancelled) {
    return NextResponse.json({
      cancelled: false,
      reason: 'Job not found or already in a terminal state (completed/failed/cancelled).',
    });
  }

  return NextResponse.json({ cancelled: true });
}
