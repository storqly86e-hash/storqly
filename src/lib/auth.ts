// ═══════════════════════════════════════════════════════════════════
// NextAuth v4 Configuration
// ═══════════════════════════════════════════════════════════════════
// Credentials-only provider with JWT strategy for session storage.
// JWT callback embeds user.id; session callback exposes it to clients.
//
// NOTE: PrismaAdapter is intentionally NOT used here. We use JWT strategy,
// so sessions live in the token, not the database. This prevents the
// module from crashing at import time when DATABASE_URL is unavailable
// (e.g., Railway cold start before env vars are injected).

import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

export const authOptions: NextAuthOptions = {
  // ── NO adapter — using JWT strategy ──
  // Sessions are stored in the JWT token, not the database.
  // This eliminates the PrismaAdapter crash when DB is unavailable.

  // ── Providers ──────────────────────────────────────────────────
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const dbClient = getDb();
        if (!dbClient) return null;

        const user = await dbClient.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  // ── Session strategy: JWT ──────────────────────────────────────
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // ── Callbacks ──────────────────────────────────────────────────
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  // ── Pages: custom sign-in page (built in Step 4) ────────────────
  pages: {
    signIn: '/',
  },

  // ── Security ───────────────────────────────────────────────────
  secret: process.env.NEXTAUTH_SECRET,
};
