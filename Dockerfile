# ═══════════════════════════════════════════════════════════════
# Storqly — Lean production Dockerfile for Back4App (256 MB RAM)
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install system deps needed for sharp (native image processing)
RUN apk add --no-cache vips-dev

# Copy lockfile first for better Docker layer caching
COPY package.json bun.lock* package-lock.json* ./

# Install ALL deps (including devDeps needed for build)
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client + build Next.js standalone
RUN npx prisma generate && npm run build

# ── Stage 2: Lean runtime ───────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
# Cap V8 heap at 192 MB (leaves ~64 MB for Node overhead + OS)
ENV NODE_OPTIONS="--max-old-space-size=192"
# Back4App expects the app to listen on this port
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

# Health check so Back4App knows the container is alive
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
