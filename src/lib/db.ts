import { PrismaClient } from '@prisma/client'

/**
 * Lazy Prisma client singleton (SQLite).
 *
 * Returns null only when DATABASE_URL is not set.
 * With SQLite the file is local, so connection failures are rare.
 */

let _db: PrismaClient | null | undefined = undefined // undefined = not yet tried

export function getDb(): PrismaClient | null {
  if (_db !== undefined) return _db

  const url = process.env.DATABASE_URL || ''

  if (!url) {
    console.warn('[db] DATABASE_URL is not set — database disabled.')
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
