// ═══════════════════════════════════════════════════════════════════
// Health Check Endpoint
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  let dbOk = false
  let dbError = ''
  try {
    await db.$queryRaw`SELECT 1`
    dbOk = true
  } catch (e) {
    dbError = e instanceof Error ? e.message.substring(0, 100) : String(e).substring(0, 100)
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    database: { ok: dbOk, error: dbError || undefined },
    env: {
      GLM_API_KEY: !!(process.env.GLM_API_KEY && process.env.GLM_API_KEY.includes('.')),
      OPENROUTER_API_KEY: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-')),
      GOOGLE_AI_API_KEY: !!(process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY.startsWith('AIzaSy')),
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
      NODE_ENV: process.env.NODE_ENV || 'not set',
    },
  })
}
