import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma client singleton.
 *
 * - Dev (SQLite): standard client, cached on globalThis for HMR.
 * - Prod (Neon/Postgres): uses the pooled connection string from DATABASE_URL.
 *   Neon free tier needs connection pooling — the connection string should
 *   include ?pgbouncer=true or go through Neon's pooler endpoint.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // In production, Prisma uses DATABASE_URL (pooled) by default.
    // For migrations or direct queries needing a dedicated connection,
    // use the DIRECT_URL env var (set in Neon dashboard).
    ...(process.env.NODE_ENV === 'production'
      ? { log: ['error'] as const }
      : { log: ['query'] as const }),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
