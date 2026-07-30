import { adminAuth } from './firebase-admin';

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
  expiresAt: number;
}

type AuthenticatedRequest = { headers: { get(name: string): string | null } };

async function extractToken(request: AuthenticatedRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function getSession(request?: AuthenticatedRequest): Promise<Session | null> {
  try {
    const token = request ? await extractToken(request) : null;
    if (!token) return null;

    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded) return null;

    return {
      userId: decoded.uid,
      email: decoded.email || '',
      name: (decoded.name as string) || '',
      role: (decoded.role as string) || 'reader',
      expiresAt: (decoded.exp as number) * 1000,
    };
  } catch {
    return null;
  }
}

export async function getSessionOrThrow(
  allowedRoles?: string[],
  request?: AuthenticatedRequest
): Promise<Session> {
  if (!request) {
    throw new Error('Unauthorized');
  }
  const session = await getSession(request);
  if (!session) {
    throw new Error('Unauthorized');
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new Error('Forbidden');
  }
  return session;
}

export { adminAuth };
