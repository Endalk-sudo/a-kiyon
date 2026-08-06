import { adminAuth } from './firebase-admin';

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
  expiresAt: number;
}

type AuthenticatedRequest = { headers: { get(_name: string): string | null } };

async function extractToken(request: AuthenticatedRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function getSession(request?: AuthenticatedRequest): Promise<Session | null> {
  try {
    const token = request ? await extractToken(request) : null;
    if (!token) return null;

    // checkRevoked rejects tokens minted before the user's tokens were
    // revoked (deactivation / role change calls revokeRefreshTokens).
    const decoded = await adminAuth.verifyIdToken(token, true);
    if (!decoded) return null;

    // The Auth emulator ignores token revocation, so enforce deactivation
    // explicitly there. In production, verifyIdToken(token, true) already
    // rejects revoked tokens — revoked tokens are equivalent to disabled.
    if (process.env.FIREBASE_EMULATOR === 'true') {
      const user = await adminAuth.getUser(decoded.uid);
      if (user.disabled) return null;
    }

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
