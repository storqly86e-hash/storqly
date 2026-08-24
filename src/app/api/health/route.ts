// ═══════════════════════════════════════════════════════════════════
// Health Check Endpoint
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function safeDbUrlDiagnostics(url: string | undefined): Record<string, unknown> {
  if (!url) return { present: false }
  const safe: Record<string, unknown> = { present: true, length: url.length }
  // Check protocol without exposing the full URL
  if (url.startsWith('postgres://')) safe.protocol = 'postgres'
  else if (url.startsWith('postgresql://')) safe.protocol = 'postgresql'
  else if (url.startsWith('file:')) safe.protocol = 'file'
  else safe.protocol = 'unknown'
  // Check if it contains host info (has @)
  safe.hasHostInfo = url.includes('@')
  // Check if it has a query string (connection pooling params)
  safe.hasQueryParams = url.includes('?')
  return safe
}

export async function GET() {
  let dbOk = false
  let dbError = ''
  const dbClient = getDb()
  if (!dbClient) {
    dbError = 'Database not configured (DATABASE_URL not set or invalid)'
  } else {
    try {
      await dbClient.$queryRaw`SELECT 1`
      dbOk = true
    } catch (e) {
      dbError = e instanceof Error ? e.message.substring(0, 120) : String(e).substring(0, 120)
    }
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    database: { ok: dbOk, error: dbError || undefined },
    env: {
      GROQ_API_KEY: {
        present: !!process.env.GROQ_API_KEY,
        validFormat: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length >= 20),
        length: process.env.GROQ_API_KEY?.length || 0,
      },
      GLM_API_KEY: {
        present: !!process.env.GLM_API_KEY,
        validFormat: !!(process.env.GLM_API_KEY && process.env.GLM_API_KEY.includes('.')),
        length: process.env.GLM_API_KEY?.length || 0,
      },
      OPENROUTER_API_KEY: {
        present: !!process.env.OPENROUTER_API_KEY,
        validFormat: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-')),
        length: process.env.OPENROUTER_API_KEY?.length || 0,
      },
      GOOGLE_AI_API_KEY: {
        present: !!process.env.GOOGLE_AI_API_KEY,
        validFormat: !!(process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY.length >= 20),
        length: process.env.GOOGLE_AI_API_KEY?.length || 0,
      },
      DATABASE_URL: safeDbUrlDiagnostics(process.env.DATABASE_URL),
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
      NODE_ENV: process.env.NODE_ENV || 'not set',
    },
  })
}
