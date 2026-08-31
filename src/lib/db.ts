import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'
import os from 'os'

/**
 * ═══════════════════════════════════════════════════════════════
 * DATABASE PATH NORMALIZATION — Root cause fix for JOB_NOT_FOUND
 * ═══════════════════════════════════════════════════════════════
 *
 * Problem: DATABASE_URL like "file:./db/custom.db" resolves differently
 * depending on process.cwd() at the time of resolution. In Railway:
 *   - prisma db push runs with CWD=/app → /app/db/custom.db
 *   - node server.js may run with different CWD → different file
 *   - After restart, the container's ephemeral FS is wiped anyway
 *
 * Fix: ALWAYS resolve to an absolute path at module load time.
 * In Railway: use a persistent volume mount at /data.
 * In local dev: resolve relative to project root.
 */

// Cache the resolved absolute database path (computed once per process)
let _resolvedDbPath: string | null = null
let _originalDbUrl: string | null = null
let _dbPathNormalized = false

/**
 * Normalize a SQLite file: URL to an absolute path.
 * "file:./db/custom.db" → "file:/absolute/path/to/db/custom.db"
 * "file:/already/absolute.db" → unchanged (validated)
 */
function normalizeDatabaseUrl(rawUrl: string): string {
  if (!rawUrl.startsWith('file:')) {
    return rawUrl // non-SQLite, pass through
  }

  let filePath = rawUrl.slice(5) // strip "file:"

  // Already absolute (starts with / on Unix)
  if (path.isAbsolute(filePath)) {
    return `file:${filePath}`
  }

  // Relative path — resolve from the project root
  // In production (Docker/Railway): CWD is /app, so resolve from there
  // In local dev: CWD is the project root
  const projectRoot = process.cwd()
  const absolutePath = path.resolve(projectRoot, filePath)

  console.log(`[GENERATION_V3][DB_IDENTITY] Normalized DATABASE_URL path:
  original: "${rawUrl}"
  resolved: "file:${absolutePath}"
  cwd:      ${projectRoot}`)

  _dbPathNormalized = true
  return `file:${absolutePath}`
}

/**
 * Ensure the parent directory of the database file exists.
 * This is critical for first-run and container startup.
 */
function ensureDbDirectory(absoluteUrl: string): void {
  const filePath = absoluteUrl.slice(5) // strip "file:"
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`[GENERATION_V3][DB_IDENTITY] Created database directory: ${dir}`)
  }
}

// ─── Database Identity Diagnostic ────────────────────────────────

export interface DatabaseIdentity {
  provider: string
  resolvedUrl: string          // the URL actually passed to Prisma (absolute)
  resolvedPath: string         // filesystem path (no file: prefix)
  originalUrl: string          // raw value from process.env
  wasNormalized: boolean       // whether path resolution was applied
  processPid: number
  hostname: string
  fileExists: boolean
  fileSizeBytes: number
  generationJobTableExists: boolean
}

/**
 * getDatabaseIdentity() — Safe diagnostic helper.
 * Returns metadata about the database without exposing secrets.
 * Call this from any API route or startup code.
 */
export function getDatabaseIdentity(): DatabaseIdentity {
  const original = _originalDbUrl || process.env.DATABASE_URL || '(not set)'
  const resolved = _resolvedDbPath || '(not initialized)'
  const resolvedPath = resolved.startsWith('file:') ? resolved.slice(5) : resolved

  let fileExists = false
  let fileSizeBytes = 0
  try {
    fileExists = fs.existsSync(resolvedPath)
    if (fileExists) {
      fileSizeBytes = fs.statSync(resolvedPath).size
    }
  } catch { /* ignore */ }

  return {
    provider: 'sqlite',
    resolvedUrl: resolved,
    resolvedPath,
    originalUrl: original.length > 60 ? original.slice(0, 57) + '...' : original,
    wasNormalized: _dbPathNormalized,
    processPid: process.pid,
    hostname: process.env.HOSTNAME || process.env.RAILWAY_STATIC_URL || os.hostname(),
    fileExists,
    fileSizeBytes,
    generationJobTableExists: false, // checked async below
  }
}

// Use globalThis to survive HMR in Next.js dev
const globalForDb = globalThis as unknown as {
  _db?: PrismaClient | null
}

export function getDb(): PrismaClient | null {
  if (globalForDb._db !== undefined) return globalForDb._db

  const rawUrl = process.env.DATABASE_URL || ''
  _originalDbUrl = rawUrl || null

  if (!rawUrl) {
    console.warn('[GENERATION_V3][DB_IDENTITY] DATABASE_URL is not set — database disabled.')
    globalForDb._db = null
    return null
  }

  // Validate the URL format for SQLite
  if (!rawUrl.startsWith('file:')) {
    console.error(`[GENERATION_V3][DB_IDENTITY] DATABASE_URL must start with "file:" for SQLite. Got: ${rawUrl.slice(0, 40)}...`)
    globalForDb._db = null
    return null
  }

  // ═══ CRITICAL FIX: Normalize to absolute path ═══
  const absoluteUrl = normalizeDatabaseUrl(rawUrl)
  _resolvedDbPath = absoluteUrl

  // Ensure the database directory exists
  ensureDbDirectory(absoluteUrl)

  try {
    globalForDb._db = new PrismaClient({
      log: ['error'] as const,
      // CRITICAL: Pass the ABSOLUTE URL so Prisma always uses
      // the same file regardless of CWD changes or restart.
      datasources: {
        db: {
          url: absoluteUrl,
        },
      },
    })

    // Log the database identity on first creation
    const identity = getDatabaseIdentity()
    console.log(`[GENERATION_V3][DB_IDENTITY] PrismaClient created.
  resolved path: ${identity.resolvedPath}
  file exists:   ${identity.fileExists} (${identity.fileSizeBytes} bytes)
  PID:           ${identity.processPid}
  hostname:      ${identity.hostname}`)

    return globalForDb._db
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[GENERATION_V3][DB_IDENTITY] Failed to create PrismaClient: ${msg}`)
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

/**
 * Async version of getDatabaseIdentity that checks table availability.
 */
export async function getFullDatabaseIdentity(): Promise<DatabaseIdentity> {
  const identity = getDatabaseIdentity()
  const client = getDb()
  if (client) {
    try {
      // Check if GenerationJob table exists by querying it
      await client.$queryRaw`SELECT 1 FROM GenerationJob LIMIT 1`
      identity.generationJobTableExists = true
    } catch {
      identity.generationJobTableExists = false
    }
  }
  return identity
}
