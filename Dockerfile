# ═══════════════════════════════════════════════════════════════
# Storqly — Production Dockerfile for Railway [v5]
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Force cache bust when package.json changes
ARG CACHEBUST=1

# Copy lockfile + prisma first for Docker layer caching
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Install ALL deps (including devDeps needed for build)
# (postinstall runs prisma generate, so prisma/ must be present)
RUN npm ci

# Copy source code (excludes .git, node_modules, .next via .dockerignore)
COPY . .

# ── Pre-build diagnostics ────────────────────────────────────
RUN echo "=== PRE-BUILD CHECKS ===" && \
    echo "Node: $(node -v)" && \
    echo "Next.js: $(npx next --version 2>/dev/null || node -e 'console.log(require("next/package.json").version)')" && \
    echo "src/app/layout.tsx exists: $(ls -la src/app/layout.tsx 2>/dev/null && echo YES || echo NO)" && \
    echo "src/app/page.tsx exists: $(ls -la src/app/page.tsx 2>/dev/null && echo YES || echo NO)" && \
    echo "postcss.config.mjs exists: $(ls -la postcss.config.mjs 2>/dev/null && echo YES || echo NO)" && \
    echo "tw-animate-css installed: $(ls node_modules/tw-animate-css/dist/tw-animate.css 2>/dev/null && echo YES || echo NO)" && \
    echo "globals.css @source line: $(head -5 src/app/globals.css)" && \
    echo "=== CHECKS COMPLETE ==="

# Generate Prisma client + build Next.js standalone
RUN npx prisma generate && npm run build

# ── Build verification ──────────────────────────────────────
RUN echo "=== BUILD VERIFICATION ===" && \
    echo "CSS files:" && \
    find .next/static/chunks -name '*.css' -exec ls -lh {} \; && \
    echo "Static assets count:" && \
    find .next/static -type f | wc -l && \
    echo "Standalone exists:" && \
    ls -la .next/standalone/server.js && \
    echo "=== VERIFICATION COMPLETE ==="

# ── Stage 2: Lean runtime ───────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
# Cap V8 heap at 384 MB (Railway free tier = 512 MB)
ENV NODE_OPTIONS="--max-old-space-size=384"
# Railway assigns PORT automatically via env var
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public folder first (before standalone overwrites)
COPY --from=builder /app/public ./public
# Copy standalone output (must come before static)
COPY --from=builder /app/.next/standalone ./
# Copy static assets AFTER standalone (standalone has no static/ folder)
COPY --from=builder /app/.next/static ./.next/static
# Copy Prisma schema + generated client for runtime db push
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
# Install prisma CLI (needed for db push at startup) — lightweight install
RUN npm install prisma@^6.11 --no-save 2>&1 | tail -3

# Verify static files were copied correctly
RUN echo "Runtime verification:" && \
    echo "  server.js: $(ls -lh server.js | awk '{print $5}')" && \
    echo "  static files: $(find .next/static -type f | wc -l)" && \
    echo "  CSS files:" && \
    find .next/static -name '*.css' -exec ls -lh {} \;

# Switch to non-root user
# NOTE: Don't switch to nextjs user yet — prisma db push needs write
# access to node_modules/.prisma which may be owned by root.
# The entrypoint.sh script runs prisma db push then execs node server.js.

EXPOSE 3000

# Health check so Railway knows the container is alive
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["./entrypoint.sh"]
