import { PrismaClient } from '@prisma/client'

/**
 * Lazy Prisma client singleton (SQLite).
 *
 * Returns null only when DATABASE_URL is not set.
 * With SQLite the file is local, so connection failures are rare.
 */

// Use globalThis to survive HMR in Next.js dev
const globalForDb = globalThis as unknown as {
  _db?: PrismaClient | null
}

export function getDb(): PrismaClient | null {
  if (globalForDb._db !== undefined) return globalForDb._db

  const url = process.env.DATABASE_URL || ''

  if (!url) {
    console.warn('[db] DATABASE_URL is not set — database disabled.')
    globalForDb._db = null
    return null
  }

  // Validate the URL format for SQLite
  if (!url.startsWith('file:')) {
    console.error(`[db] DATABASE_URL must start with "file:" for SQLite. Got: ${url.slice(0, 30)}...`)
    globalForDb._db = null
    return null
  }

  try {
    globalForDb._db = new PrismaClient({
      log: ['error'] as const,
      // Explicitly pass the datasource URL so Prisma never has to
      // re-resolve process.env.DATABASE_URL at query time (fixes the
      // "URL must start with file:" error in Next.js Turbopack).
      datasources: {
        db: {
          url,
        },
      },
    })
    return globalForDb._db
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[db] Failed to create PrismaClient:', msg)
    globalForDb._db = null
    return null
  }
}

/**
 * Proxy-based backward-compat export.
 * Throws if DB is unavailable. Used by NextAuth adapter which
 * requires a PrismaClient instance at module level.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getDb()
    if (!client) {
      throw new Error(
        'Database is not available. DATABASE_URL is either not set or invalid.',
      )
    }
    const value = Reflect.get(client, prop, receiver)
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

/** Check whether the database is configured and reachable. */
export async function isDbAvailable(): Promise<boolean> {
  const client = getDb()
  if (!client) return false
  try {
    await client.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
