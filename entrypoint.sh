#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# Storqly — Container Entrypoint
# ═══════════════════════════════════════════════════════════════
# 1. Ensure database tables exist (prisma db push is idempotent)
# 2. Start the Next.js server
# ═══════════════════════════════════════════════════════════════

set -e

echo "[Entrypoint] Running prisma db push to ensure tables exist..."
npx prisma db push --accept-data-loss 2>&1 || {
  echo "[Entrypoint] ⚠️  prisma db push failed — starting server anyway (tables may already exist)"
}

echo "[Entrypoint] Starting Next.js server..."
exec node server.js
