// ═══════════════════════════════════════════════════════════════════
// NextAuth API Route Handler
// ═══════════════════════════════════════════════════════════════════
// This is the catch-all route that NextAuth uses for all auth
// operations: signIn, signOut, callback, session, etc.

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
