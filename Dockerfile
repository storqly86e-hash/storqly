# ═══════════════════════════════════════════════════════════════
# Storqly — Production Dockerfile for Railway
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy lockfile first for better Docker layer caching
COPY package.json bun.lock* package-lock.json* ./
COPY prisma ./prisma

# Install ALL deps (including devDeps needed for build)
# (postinstall runs prisma generate, so prisma/ must be present)
RUN npm ci
RUN ls node_modules/tw-animate-css || echo "TW-ANIMATE-CSS NOT INSTALLED"

# Copy source code
COPY . .

# Generate Prisma client + build Next.js standalone
RUN npx prisma generate && npm run build

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

# Copy standalone output from builder
COPY --from=builder /app/.next/standalone ./
# Copy static assets (public folder + _next/static)
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy Prisma schema for potential runtime queries
COPY --from=builder /app/prisma ./prisma

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Health check so Railway knows the container is alive
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
