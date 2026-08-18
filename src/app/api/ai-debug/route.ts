// ========================================
// AI Provider Diagnostics (no API calls)
// ========================================
// GET /api/ai-debug
// Returns env-var presence and provider chain info without calling any AI APIs.
// Useful for debugging why "AI unavailable" appears on a new deployment.

import { NextResponse } from 'next/server';
import { getProviders, getProviderDiagnostics } from '@/lib/ai-providers';

export async function GET() {
  const diagnostics = getProviderDiagnostics();
  const providers = getProviders();

  return NextResponse.json({
    ...diagnostics,
    providerChain: providers.map(p => p.name),
    providerCount: providers.length,
    hint:
      diagnostics.env.GROQ_API_KEY || diagnostics.env.GOOGLE_AI_API_KEY
        ? 'Keys detected — if still failing, check /api/ai-status for per-provider errors'
        : 'No AI keys detected. Set GROQ_API_KEY and/or GOOGLE_AI_API_KEY in Railway Variables, then REDEPLOY.',
  });
}
