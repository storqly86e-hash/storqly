import { PrismaClient } from '@prisma/client'

/**
 * Lazy Prisma client singleton.
 *
 * Returns null when DATABASE_URL is not set, or when the URL format
 * doesn't match the Prisma schema provider (e.g. SQLite URL with
 * PostgreSQL schema). All API routes use `getDb()` and handle null.
 */

let _db: PrismaClient | null | undefined = undefined // undefined = not yet tried

export function getDb(): PrismaClient | null {
  if (_db !== undefined) return _db

  const url = process.env.DATABASE_URL || ''

  if (!url) {
    _db = null
    return null
  }

  // Prisma schema uses provider = "postgresql".
  // If the URL isn't a postgres:// URL, the client will fail on first query.
  // Detect this early and return null so routes can fall back gracefully.
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    console.warn(
      '[db] DATABASE_URL is set but is not a PostgreSQL URL — database disabled.',
      'URL prefix:', url.substring(0, 20),
    )
    _db = null
    return null
  }

  try {
    _db = new PrismaClient({
      log: ['error'] as const,
    })
    return _db
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[db] Failed to create PrismaClient:', msg)
    _db = null
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
