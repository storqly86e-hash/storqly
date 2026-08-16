// ═══════════════════════════════════════════════════════════════════
// Health Check Endpoint
// ═══════════════════════════════════════════════════════════════════
// Lightweight endpoint for client-side connectivity monitoring.
// Returns 200 with server timestamp. Used by the connection health
// monitor to detect when the dev server is unreachable.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
  })
}
