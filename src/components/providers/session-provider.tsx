'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

/**
 * Client-side SessionProvider wrapper.
 * Required for useSession() / signIn() / signOut() from next-auth/react.
 */
export default function AuthSessionProvider({
  children,
}: {
  children: ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}
