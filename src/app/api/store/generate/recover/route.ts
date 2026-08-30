// ========================================
// Generation Recovery API
// ========================================
// GET /api/store/generate/recover?jobId=xxx
// Returns the cached generation result if the SSE stream dropped.

import { NextRequest, NextResponse } from 'next/server';
import { getCachedGeneration } from '@/lib/generation-cache';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required.', found: false },
      { status: 400 }
    );
  }

  const entry = getCachedGeneration(jobId);

  if (!entry) {
    return NextResponse.json(
      { error: 'Generation result not found. It may have expired (5 min TTL) or the jobId is invalid.', found: false },
      { status: 404 }
    );
  }

  if (entry.error) {
    return NextResponse.json({
      found: true,
      success: false,
      error: entry.error,
    });
  }

  return NextResponse.json({
    found: true,
    success: true,
    store: entry.store,
    meta: entry.meta,
  });
}
