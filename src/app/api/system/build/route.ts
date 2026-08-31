// ========================================
// Build Diagnostic Endpoint [V3]
// ========================================
// GET /api/system/build
//
// Returns deterministic build information + DB identity
// to verify which version of the code is running and
// whether the database is properly configured.

import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getDatabaseIdentity, getFullDatabaseIdentity } from '@/lib/db';

export const dynamic = 'force-dynamic';

// These are baked in at build time
const BUILD_COMMIT = process.env.RAILWAY_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  (() => { try { return execSync('git rev-parse HEAD', { timeout: 3000 }).toString().trim(); } catch { return 'unknown'; } })();

const BUILD_TIME = new Date().toISOString(); // For dev; production would use build-time env var

export async function GET() {
  const dbIdentity = getDatabaseIdentity();
  const fullIdentity = await getFullDatabaseIdentity();

  return NextResponse.json({
    commit: BUILD_COMMIT,
    generationArchitecture: 'POST_POLL_V3',
    generationEndpoint: 'POST_POLL',
    sseGeneration: false,
    buildTime: BUILD_TIME,
    nodeEnv: process.env.NODE_ENV || 'not set',
    database: {
      provider: dbIdentity.provider,
      resolvedPath: dbIdentity.resolvedPath,
      wasNormalized: dbIdentity.wasNormalized,
      fileExists: fullIdentity.fileExists,
      fileSizeBytes: fullIdentity.fileSizeBytes,
      generationJobTableExists: fullIdentity.generationJobTableExists,
      processPid: dbIdentity.processPid,
      hostname: dbIdentity.hostname,
    },
  });
}
