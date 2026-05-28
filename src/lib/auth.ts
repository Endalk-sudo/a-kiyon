import { db } from '@/lib/db';
import { cookies } from 'next/headers';

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'manager';
  expiresAt: number;
}

// Simple encode/decode - in production would use proper JWT or encrypted tokens
export function encodeSession(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString('base64');
}

export function decodeSession(token: string): Session | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (decoded.expiresAt > Date.now()) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('fcms_session')?.value;
  if (!token) return null;
  return decodeSession(token);
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

export async function login(email: string, password: string): Promise<Session | null> {
  // Lazy import bcryptjs to avoid native addon issues with Turbopack
  const bcrypt = await import('bcryptjs');
  
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;

  // Compare password with bcrypt hash
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;

  const session: Session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'owner' | 'manager',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  return session;
}

export async function hashPassword(password: string): Promise<string> {
  // Lazy import bcryptjs
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 10);
}
