// ========================================
// Build Diagnostic Endpoint
// ========================================
// GET /api/system/build
//
// Returns deterministic build information to verify
// which version of the code is running in any environment.

import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

// These are baked in at build time
const BUILD_COMMIT = process.env.RAILWAY_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  (() => { try { return execSync('git rev-parse HEAD', { timeout: 3000 }).toString().trim(); } catch { return 'unknown'; } })();

const BUILD_TIME = new Date().toISOString(); // For dev; production would use build-time env var

export async function GET() {
  return NextResponse.json({
    commit: BUILD_COMMIT,
    generationArchitecture: 'POST_POLL_V2',
    generationEndpoint: 'POST_POLL',
    sseGeneration: false,
    buildTime: BUILD_TIME,
    nodeEnv: process.env.NODE_ENV || 'not set',
  });
}
