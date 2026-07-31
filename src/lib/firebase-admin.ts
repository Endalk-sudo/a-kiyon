import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const useEmulator = process.env.FIREBASE_EMULATOR === 'true';
  const hasConfig = firebaseAdminConfig.projectId && firebaseAdminConfig.clientEmail && firebaseAdminConfig.privateKey;

  if (!hasConfig && !useEmulator) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
      'FIREBASE_PRIVATE_KEY, or set FIREBASE_EMULATOR=true for local development.'
    );
  }

  const app = hasConfig
    ? initializeApp({ credential: cert(firebaseAdminConfig as Record<string, string>) })
    : initializeApp({ projectId: firebaseAdminConfig.projectId || 'demo-a-kiyon' });

  if (useEmulator) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  }

  return app;
}

export { getAdminApp };

const app = getAdminApp();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
export const adminBucket = (() => {
  try {
    return getStorage(app).bucket();
  } catch {
    return null;
  }
})();
