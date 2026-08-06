import {
  auth,
  loginWithEmail,
  signOut as fbSignOut,
  onAuthChange,
} from './firebase-client';
import type { User as FirebaseUser } from 'firebase/auth';

let currentToken: string | null = null;
let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
let onTokenCallbacks: Array<(_token: string | null) => void> = [];

export function getCurrentToken(): string | null {
  return currentToken;
}

export function onTokenChange(callback: (_token: string | null) => void) {
  onTokenCallbacks.push(callback);
  if (currentToken) callback(currentToken);
  return () => {
    onTokenCallbacks = onTokenCallbacks.filter((cb) => cb !== callback);
  };
}

export function initAuth() {
  if (typeof window === 'undefined') return;

  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);

  onAuthChange((user: FirebaseUser | null) => {
    if (user) {
      user.getIdToken().then((token: string) => {
        currentToken = token;
        onTokenCallbacks.forEach((cb) => cb(token));
      });
    } else {
      currentToken = null;
      onTokenCallbacks.forEach((cb) => cb(null));
    }
  });

  tokenRefreshInterval = setInterval(async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken(true);
        currentToken = token;
        onTokenCallbacks.forEach((cb) => cb(token));
      } catch {
        // ignore
      }
    }
  }, 10 * 60 * 1000);
}

export async function login(email: string, password: string) {
  const user = await loginWithEmail(email, password);
  currentToken = await user.getIdToken();
  return user;
}

export async function logout() {
  await fbSignOut();
  currentToken = null;
  onTokenCallbacks.forEach((cb) => cb(null));
}

export { onAuthChange };

// JWT payloads are base64url-encoded (`-`/`_`, no padding) — plain `atob`
// breaks on tokens containing those characters. Also handles `claims.*`
// nesting (newer Firebase ID token format).
export function decodeTokenPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] || '';
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return JSON.parse(atob(padded));
}

function roleFromToken(token: string): string | null {
  const payload = decodeTokenPayload(token);
  const nested = payload.claims as { role?: string } | undefined;
  const role = nested?.role ?? (payload.role as string | undefined);
  return role || null;
}

export const authClient = {
  signIn: {
    email: async ({ email, password }: { email: string; password: string }) => {
      try {
        const user = await login(email, password);
        const token = currentToken;
        let role = 'reader';
        let name = user.displayName || '';
        if (token) {
          role = roleFromToken(token) || 'reader';
          name = user.displayName || '';
        }
        return {
          data: {
            user: { id: user.uid, email: user.email, name, role },
          },
          error: null,
        };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error('Login failed') };
      }
    },
  },
  signOut: async () => {
    await logout();
  },
  getSession: async () => {
    if (!auth.currentUser) return { data: null };
    try {
      const token = await auth.currentUser.getIdToken();
      currentToken = token;
      return {
        data: {
          user: {
            id: auth.currentUser.uid,
            email: auth.currentUser.email,
          },
          session: {
            id: auth.currentUser.uid,
            userId: auth.currentUser.uid,
            token,
            expiresAt: auth.currentUser.metadata.lastSignInTime,
          },
        },
      };
    } catch {
      return { data: null };
    }
  },
};
