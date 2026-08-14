// ═══════════════════════════════════════════════════════════════════
// NextAuth v4 type augmentations
// ═══════════════════════════════════════════════════════════════════
// These augment the default NextAuth session/user types so that
// session.user.id and token.id are available throughout the app.

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    // Prisma User fields we might need in authorize()
    id: string;
    email: string;
    name?: string | null;
    password?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
  }
}
