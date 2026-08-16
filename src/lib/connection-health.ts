// ═══════════════════════════════════════════════════════════════════
// Connection Health Monitor
// ═══════════════════════════════════════════════════════════════════
// Monitors server connectivity via periodic fetch to /api/health.
// Provides a React hook for components to show "Reconnecting..." state.
// Also patches the global fetch to suppress CLIENT_FETCH_ERROR noise
// from NextAuth's internal session polling when the server is down.

import { useState, useEffect, useCallback, useRef } from 'react'

export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected'

// ─── Global connection state (shared outside React) ────────────────
let globalConnectionStatus: ConnectionStatus = 'connected'
let globalListeners: Set<(status: ConnectionStatus) => void> = new Set()

export function getConnectionStatus(): ConnectionStatus {
  return globalConnectionStatus
}

export function onConnectionChange(listener: (status: ConnectionStatus) => void): () => void {
  globalListeners.add(listener)
  return () => globalListeners.delete(listener)
}

function setConnectionStatus(status: ConnectionStatus) {
  if (globalConnectionStatus === status) return
   globalConnectionStatus = status
  console.log(`[Storqly] Connection status: ${status}`)
  for (const listener of globalListeners) {
    try { listener(status) } catch { /* ignore */ }
  }
}

// ─── Suppress NextAuth CLIENT_FETCH_ERROR console noise ────────────
// NextAuth's internal getSession() fetch throws unhandled errors
// when the server is unreachable. This patches console.error to
// suppress those specific errors while keeping everything else.

let errorPatched = false

function patchConsoleError() {
  if (errorPatched) return
  errorPatched = true

  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : '').join(' ')
    // Suppress NextAuth's CLIENT_FETCH_ERROR noise
    if (
      msg.includes('CLIENT_FETCH_ERROR') ||
      (msg.includes('fetch') && msg.includes('session') && msg.includes('error'))
    ) {
      // Silently swallow — our connection banner handles the UX
      return
    }
    originalError.apply(console, args)
  }
}

// ─── React Hook ────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 15_000  // Check every 15 seconds
const TIMEOUT_MS = 5_000          // Health check timeout: 5 seconds
const DEGRADED_THRESHOLD = 1      // 1 failure → degraded
const DISCONNECTED_THRESHOLD = 3  // 3 consecutive failures → disconnected

export function useConnectionHealth() {
  const [status, setStatus] = useState<ConnectionStatus>('connected')
  const failureCountRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    patchConsoleError()

    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

        const res = await fetch('/api/health', {
          signal: controller.signal,
          cache: 'no-store',
        })
        clearTimeout(timeoutId)

        if (res.ok && mountedRef.current) {
          failureCountRef.current = 0
          const newStatus: ConnectionStatus = 'connected'
          setStatus(newStatus)
          setConnectionStatus(newStatus)
        }
      } catch {
        failureCountRef.current++
        if (!mountedRef.current) return

        const failures = failureCountRef.current
        let newStatus: ConnectionStatus

        if (failures >= DISCONNECTED_THRESHOLD) {
          newStatus = 'disconnected'
        } else if (failures >= DEGRADED_THRESHOLD) {
          newStatus = 'degraded'
        } else {
          newStatus = 'connected' // First failure, don't flip yet
        }

        setStatus(newStatus)
        setConnectionStatus(newStatus)
      }
    }

    // Initial check
    checkHealth()

    // Periodic check
    const intervalId = setInterval(checkHealth, CHECK_INTERVAL_MS)

    // Listen for manual connection recovery attempts
    const unsubscribe = onConnectionChange((s) => {
      if (mountedRef.current) setStatus(s)
    })

    return () => {
      mountedRef.current = false
      clearInterval(intervalId)
      unsubscribe()
    }
  }, [])

  const retryNow = useCallback(async () => {
    failureCountRef.current = 0
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      if (res.ok) {
        setStatus('connected')
        setConnectionStatus('connected')
      }
    } catch {
      // Keep current status
    }
  }, [])

  return { status, retryNow }
}
