'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

/**
 * Client-side SessionProvider wrapper.
 * Required for useSession() / signIn() / signOut() from next-auth/react.
 *
 * Patches NextAuth's internal fetch to handle server disconnection gracefully
 * instead of throwing raw CLIENT_FETCH_ERROR to the console.
 */
export default function AuthSessionProvider({
  children,
}: {
  children: ReactNode
}) {
  // Patch NextAuth's internal fetch to suppress CLIENT_FETCH_ERROR
  // when the server is unreachable. This runs once on mount.
  useEffect(() => {
    // Suppress the specific NextAuth error that occurs when
    // the session endpoint is unreachable (server down/restarting)
    const originalConsoleError = console.error
    const patchedConsoleError = (...args: unknown[]) => {
      const msg = args
        .map(a => typeof a === 'string' ? a : (a instanceof Error ? a.message : String(a)))
        .join(' ')
      if (
        msg.includes('CLIENT_FETCH_ERROR') ||
        (msg.includes('fetch') && msg.includes('session'))
      ) {
        // Silently suppress — ConnectionBanner handles the UX
        return
      }
      originalConsoleError.apply(console, args)
    }
    console.error = patchedConsoleError

    return () => {
      console.error = originalConsoleError
    }
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}
