import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { normalizePhone, phoneToEmail } from './phone-auth';

const isEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';

// Direct property access only — Turbopack inlines `process.env.NEXT_PUBLIC_*`
// into the browser bundle per-literal, but cannot inline dynamic lookups like
// `process.env[name]`, which compile to a client env shim that carries no
// NEXT_PUBLIC values. A loop-based guard would therefore see every variable
// as "missing" and crash on every page load.
const FIREBASE_CLIENT_VAR_NAMES: Record<string, string> = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
};

const firebaseConfig = isEmulator
  ? {
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: 'demo-a-kiyon',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:0000000000000000000000',
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

const missingClientVars =
  isEmulator || typeof window === 'undefined'
    ? []
    : Object.entries(firebaseConfig)
        .filter(([, value]) => !value)
        .map(([key]) => FIREBASE_CLIENT_VAR_NAMES[key]);

// Fail loudly in the browser instead of silently initializing against a demo
// project. Server-side (build/SSR) stays silent — the client config is only
// consumed in the browser, and CI builds without NEXT_PUBLIC_* variables.
if (missingClientVars.length > 0) {
  throw new Error(
    `Missing Firebase client configuration: ${missingClientVars.join(', ')}. ` +
      'Set these NEXT_PUBLIC_FIREBASE_* variables in your deployment environment and redeploy.',
  );
}

function getClientApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(firebaseConfig);
}

const app = getClientApp();

export const auth = getAuth(app);
export const clientDb = getFirestore(app);

if (typeof window !== 'undefined' && isEmulator) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(clientDb, 'localhost', 8080);
}

export async function loginWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** Phone login — maps the phone to its internal synthetic email. */
export async function loginWithPhone(phone: string, password: string) {
  return loginWithEmail(phoneToEmail(normalizePhone(phone)), password);
}

export async function signOut() {
  await fbSignOut(auth);
}

export function onAuthChange(callback: (_user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}
