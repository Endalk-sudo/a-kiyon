import 'dotenv/config';
import { adminAuth, adminDb } from '../lib/firebase-admin';
import { phoneToEmail } from '../lib/phone-auth';

/**
 * Creates (or verifies) the production owner/manager/reader accounts.
 *
 * - Refuses to run in emulator mode (mirrors seed.ts in reverse — this script
 *   only touches production, and seed only touches the emulator).
 * - Idempotent: existing accounts are skipped, never overwritten, so running
 *   this twice is safe.
 * - Passwords come from OWNER_PASSWORD / MANAGER_PASSWORD / READER_PASSWORD.
 *   Use strong, unique passwords — the demo passwords from seed.ts must not
 *   be used in production.
 */

const USERS = [
  { key: 'OWNER_PASSWORD', phone: '+251911000000', name: 'Owner', role: 'owner' },
  { key: 'MANAGER_PASSWORD', phone: '+251922000000', name: 'Manager', role: 'manager' },
  { key: 'READER_PASSWORD', phone: '+251933000000', name: 'Reader', role: 'reader' },
] as const;

async function main() {
  if (process.env.FIREBASE_EMULATOR === 'true') {
    throw new Error(
      'Refusing to run in emulator mode (FIREBASE_EMULATOR=true). This script creates ' +
        'production accounts — use pnpm run seed for emulator users.',
    );
  }

  const missing = USERS.filter((u) => !process.env[u.key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing password env var(s): ${missing.map((u) => u.key).join(', ')}. ` +
        'Use strong passwords (at least 8 characters).',
    );
  }
  for (const u of USERS) {
    const password = process.env[u.key]!;
    if (password.length < 8) {
      throw new Error(`${u.key} must be at least 8 characters.`);
    }
  }

  const results: { phone: string; role: string; status: 'created' | 'exists' }[] = [];

  for (const user of USERS) {
    const email = phoneToEmail(user.phone);

    try {
      const existing = await adminAuth.getUserByEmail(email);
      const role = (existing.customClaims?.role as string) || null;
      results.push({ phone: user.phone, role: user.role, status: 'exists' });
      console.log(
        `SKIP  ${user.phone} (${user.role}) — account already exists (uid ${existing.uid}, role ${role || 'none'}). No changes made.`,
      );
      continue;
    } catch {
      // not found — create
    }

    const record = await adminAuth.createUser({
      email,
      password: process.env[user.key],
      displayName: user.name,
    });
    await adminAuth.setCustomUserClaims(record.uid, { role: user.role, phone: user.phone });
    await adminDb.collection('users').doc(record.uid).set({
      phone: user.phone,
    });

    results.push({ phone: user.phone, role: user.role, status: 'created' });
    console.log(`CREATED ${user.phone} (${user.role}) — uid ${record.uid}`);
  }

  const created = results.filter((r) => r.status === 'created').length;
  console.log(`\nDone. ${created} account(s) created, ${results.length - created} already existed.`);
  console.log('Login at the deployed app with the phone number + password above.');
}

main().catch((e) => {
  console.error('create-prod-users failed:', e);
  process.exit(1);
});
