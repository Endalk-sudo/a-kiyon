import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { db } from '@/lib/db';
import { headers } from 'next/headers';

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => {
        const bcrypt = await import('bcryptjs');
        return bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }) => {
        const bcrypt = await import('bcryptjs');
        return bcrypt.compare(password, hash);
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'manager',
      },
      phone: {
        type: 'string',
      },
      isActive: {
        type: 'boolean',
        defaultValue: true,
      },
      photo: {
        type: 'string',
      },
    },
  },
  trustedOrigins: ['*'],
  advanced: {
    cookies: {
      sessionToken: {
        name: 'fcms_session',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
});

interface BetterSession {
  user: Record<string, unknown>;
  session: Record<string, unknown>;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
  expiresAt: number;
}

export async function getSession(): Promise<Session | null> {
  try {
    const headersList = await headers();
    const result = await auth.api.getSession({ headers: headersList }) as BetterSession | null;
    if (!result) return null;
    const user = result.user as { id: string; email: string; name: string | null; role?: string; isActive?: boolean };
    const sess = result.session as { expiresAt: Date };

    if (user.isActive === false) return null;

    return {
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: (user.role as string) || 'manager',
      expiresAt: sess.expiresAt.getTime(),
    };
  } catch {
    return null;
  }
}

export async function getSessionOrThrow(allowedRoles?: string[]): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new Error('Forbidden');
  }
  return session;
}