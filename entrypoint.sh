#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# Storqly — Container Entrypoint
# ═══════════════════════════════════════════════════════════════
# 1. Log runtime env var presence (no secret values exposed)
# 2. Ensure database tables exist (prisma db push is idempotent)
# 3. Start the Next.js server
# ═══════════════════════════════════════════════════════════════

set -e

echo "[Entrypoint] ═══ Runtime Environment Diagnostics ═══"
echo "[Entrypoint]   NODE_ENV=$NODE_ENV"
echo "[Entrypoint]   DATABASE_URL present=$(test -n "$DATABASE_URL" && echo YES || echo NO) length=${#DATABASE_URL}"
echo "[Entrypoint]   GOOGLE_AI_API_KEY present=$(test -n "$GOOGLE_AI_API_KEY" && echo YES || echo NO) length=${#GOOGLE_AI_API_KEY}"
echo "[Entrypoint]   OPENROUTER_API_KEY present=$(test -n "$OPENROUTER_API_KEY" && echo YES || echo NO) length=${#OPENROUTER_API_KEY}"
echo "[Entrypoint]   GLM_API_KEY present=$(test -n "$GLM_API_KEY" && echo YES || echo NO) length=${#GLM_API_KEY}"
echo "[Entrypoint]   NEXTAUTH_SECRET present=$(test -n "$NEXTAUTH_SECRET" && echo YES || echo NO)"
echo "[Entrypoint]   NEXTAUTH_URL=$NEXTAUTH_URL"
echo "[Entrypoint] ═════════════════════════════════════════════"

echo "[Entrypoint] Running prisma db push to ensure tables exist..."
npx prisma db push --accept-data-loss 2>&1 || {
  echo "[Entrypoint] ⚠️  prisma db push failed — starting server anyway (tables may already exist)"
}

echo "[Entrypoint] Starting Next.js server..."
exec node server.js
