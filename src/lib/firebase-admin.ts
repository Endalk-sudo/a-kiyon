import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

function missingAdminVars(): string[] {
  return Object.entries(firebaseAdminConfig)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const useEmulator = process.env.FIREBASE_EMULATOR === 'true';
  const missing = missingAdminVars();

  if (missing.length > 0 && !useEmulator) {
    throw new Error(
      `Missing Firebase Admin credentials: ${missing.join(', ')}. ` +
      'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in the deployment ' +
      'environment (from the Firebase console service-account JSON), or set FIREBASE_EMULATOR=true ' +
      'for local development.'
    );
  }

  const options = {
    projectId: firebaseAdminConfig.projectId || 'demo-a-kiyon',
  };

  let app;
  if (missing.length === 0) {
    const privateKey = firebaseAdminConfig.privateKey;
    if (!privateKey?.includes('-----BEGIN') || !privateKey.includes('-----END')) {
      throw new Error(
        'FIREBASE_PRIVATE_KEY is set but does not look like a PEM key. ' +
        'Paste the complete "-----BEGIN PRIVATE KEY-----" ... "-----END PRIVATE KEY-----" value ' +
        'from the service-account JSON (a single line with literal \\n sequences also works).'
      );
    }
    try {
      app = initializeApp({
        credential: cert({
          projectId: firebaseAdminConfig.projectId,
          clientEmail: firebaseAdminConfig.clientEmail,
          privateKey,
        }),
        ...options,
      });
    } catch (error) {
      console.error('[firebase-admin] Failed to initialize the Firebase Admin app:', error);
      throw new Error(
        'Failed to initialize Firebase Admin with the provided credentials. ' +
        'Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and that FIREBASE_PRIVATE_KEY is the ' +
        'complete, unquoted PEM key.'
      );
    }
  } else {
    app = initializeApp(options);
  }

  if (useEmulator) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  }

  return app;
}

export { getAdminApp };

const app = getAdminApp();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
