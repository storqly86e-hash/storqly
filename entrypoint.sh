#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# Storqly — Container Entrypoint [v2]
# ═══════════════════════════════════════════════════════════════
# 1. Log runtime env var presence (no secret values exposed)
# 2. Ensure DATABASE_URL points to the persistent volume (/data)
# 3. Ensure database directory exists
# 4. Run prisma db push (idempotent schema sync)
# 5. Start the Next.js server
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
echo "[Entrypoint]   PID=$$"
echo "[Entrypoint] ═════════════════════════════════════════════"

# ═══ CRITICAL: Default DATABASE_URL to persistent volume ═══
# If DATABASE_URL is not set, default to /data/storqly.db
# (Railway Volume must be mounted at /data)
if [ -z "$DATABASE_URL" ]; then
  echo "[Entrypoint] DATABASE_URL not set — defaulting to file:/data/storqly.db (Railway Volume)"
  export DATABASE_URL="file:/data/storqly.db"
fi

echo "[Entrypoint] DATABASE_URL (first 50 chars): $(echo "$DATABASE_URL" | cut -c1-50)"

# ═══ Extract filesystem path from DATABASE_URL ═══
# Strip "file:" prefix to get the filesystem path
db_file="${DATABASE_URL#file:}"
db_dir=$(dirname "$db_file")

echo "[Entrypoint] Resolved DB path: $db_file"
echo "[Entrypoint] DB directory: $db_dir"

# ═══ Ensure database directory exists ═══
if [ ! -d "$db_dir" ]; then
  echo "[Entrypoint] Creating database directory: $db_dir"
  mkdir -p "$db_dir"
fi

# ═══ Verify existing DB file ═══
if [ -f "$db_file" ]; then
  db_size=$(ls -lh "$db_file" | awk '{print $5}')
  echo "[Entrypoint] Existing database: $db_file ($db_size)"
else
  echo "[Entrypoint] No existing database at $db_file — prisma db push will create it"
fi

echo "[Entrypoint] Running prisma db push to ensure tables exist..."
npx prisma db push --accept-data-loss 2>&1 || {
  echo "[Entrypoint] prisma db push failed — starting server anyway (tables may already exist)"
}

# ═══ Verify the database was created ═══
if [ -f "$db_file" ]; then
  db_size=$(ls -lh "$db_file" | awk '{print $5}')
  echo "[Entrypoint] Database ready: $db_file ($db_size)"
else
  echo "[Entrypoint] WARNING: $db_file still does not exist after prisma db push"
fi

echo "[Entrypoint] Starting Next.js server..."
exec node server.js
