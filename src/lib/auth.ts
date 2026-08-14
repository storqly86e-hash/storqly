// ═══════════════════════════════════════════════════════════════════
// NextAuth v4 Configuration
// ═══════════════════════════════════════════════════════════════════
// Credentials-only provider with Prisma adapter for session storage.
// JWT callback embeds user.id; session callback exposes it to clients.

import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

export const authOptions: NextAuthOptions = {
  // ── Adapter: Prisma handles Account/Session/VerificationToken ──
  // Note: Credentials provider does NOT use the adapter for user
  // creation — users are created via /api/auth/register.
  // The adapter is only used for session persistence.
  adapter: PrismaAdapter(db),

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

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.password) {
          // No user found, or user has no password (OAuth-only account)
          return null;
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
          return null;
        }

        // Return the user object — NextAuth will encode it into the JWT
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
  // Using JWT strategy (not database sessions) because the Credentials
  // provider doesn't work well with database sessions in NextAuth v4.
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // ── Callbacks ──────────────────────────────────────────────────
  callbacks: {
    // Embed user.id into the JWT on sign-in
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    // Expose user.id from the JWT to the client session
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
