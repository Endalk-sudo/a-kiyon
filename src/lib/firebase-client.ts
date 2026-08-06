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
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  getFirestore,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { normalizePhone, phoneToEmail } from './phone-auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'localhost',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-a-kiyon',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-a-kiyon.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID || '000000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000',
};

function getClientApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(firebaseConfig);
}

const app = getClientApp();

export const auth = getAuth(app);
export const clientStorage = getStorage(app);
export const clientDb = getFirestore(app);

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectStorageEmulator(clientStorage, 'localhost', 9199);
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

// Storage helpers
export async function uploadFile(path: string, buffer: Uint8Array, contentType: string) {
  const storageRef = ref(clientStorage, path);
  await uploadBytes(storageRef, buffer, { contentType });
  return getDownloadURL(storageRef);
}

export async function deleteFile(path: string) {
  const storageRef = ref(clientStorage, path);
  await deleteObject(storageRef);
}

export { ref as storageRef, getDownloadURL, uploadBytes, deleteObject };
