// ═══════════════════════════════════════════════════════
// Env Key Listing — Diagnostic endpoint
// Lists ALL process.env keys (no values) to debug env injection
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const keys = Object.keys(process.env).sort()
  const safeEntries = keys.map(key => ({
    key,
    length: (process.env[key] || '').length,
    preview: key.startsWith('NEXT_PUBLIC') || key === 'NODE_ENV' || key === 'PORT' || key === 'HOSTNAME'
      ? process.env[key]
      : undefined,
  }))

  return NextResponse.json({
    totalKeys: keys.length,
    keys: safeEntries,
    // Specific checks for the 3 expected vars
    expected: {
      DATABASE_URL: keys.includes('DATABASE_URL'),
      GOOGLE_AI_API_KEY: keys.includes('GOOGLE_AI_API_KEY'),
      OPENROUTER_API_KEY: keys.includes('OPENROUTER_API_KEY'),
      GLM_API_KEY: keys.includes('GLM_API_KEY'),
      NEXTAUTH_SECRET: keys.includes('NEXTAUTH_SECRET'),
      NEXTAUTH_URL: keys.includes('NEXTAUTH_URL'),
    },
  })
}