// ═══════════════════════════════════════════════════════════════════
// Health Check Endpoint
// ═══════════════════════════════════════════════════════════════════
// Lightweight endpoint for client-side connectivity monitoring.
// Also checks database and key configuration.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Check database connectivity
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
      DATABASE_URL: !!process.env.DATABASE_URL,
      GROQ_API_KEY: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'placeholder'),
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
      NODE_ENV: process.env.NODE_ENV || 'not set',
    },
  })
}
