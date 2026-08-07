import 'dotenv/config';
import { adminAuth, adminDb } from '../lib/firebase-admin';
import { normalizePhone, phoneToEmail } from '../lib/phone-auth';

/**
 * One-time migration to phone-number login.
 *
 * Every Firebase Auth user whose phone number is known (custom claim or the
 * Firestore `users` doc) gets their auth email renamed to the synthetic
 * phone-derived address. Their password is untouched, so they can
 * immediately log in with their phone number + existing password.
 *
 * Users without a phone number are left alone and keep email login.
 *
 * After the auth migration, the `users` collection is scanned for orphaned
 * docs — docs whose ID is not a Firebase Auth UID (created by the pre-phone
 * code, which used a random doc ID and never linked it to the user). They
 * are deleted. Only Firestore docs are removed, never auth users.
 *
 * Run against the emulator for a dry check, or against production with the
 * real service-account env vars:
 *   pnpm exec tsx src/scripts/migrate-phone-login.ts
 */
async function main() {
  console.log('Migrating auth users to phone-number login...');

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let token: string | undefined;

  do {
    const result = await adminAuth.listUsers(1000, token);
    for (const u of result.users) {
      const claimPhone =
        typeof u.customClaims?.phone === 'string' && u.customClaims.phone
          ? normalizePhone(u.customClaims.phone)
          : null;
      const doc = claimPhone ? null : await adminDb.collection('users').doc(u.uid).get();
      const phone = claimPhone || (doc?.exists ? (doc.get('phone') as string | undefined) : undefined);
      const normalized = phone ? normalizePhone(phone) : null;

      if (!normalized) {
        console.log(`  SKIP ${u.uid} (${u.email}) — no phone on record, keeps email login`);
        skipped += 1;
        continue;
      }

      const targetEmail = phoneToEmail(normalized);
      if (u.email === targetEmail) {
        skipped += 1;
        continue;
      }

      try {
        await adminAuth.updateUser(u.uid, {
          email: targetEmail,
          displayName: u.displayName || undefined,
        });
        await adminAuth.setCustomUserClaims(u.uid, {
          ...(u.customClaims || {}),
          phone: normalized,
        });
        console.log(`  MIGRATED ${u.uid} ${u.email} -> ${targetEmail}`);
        migrated += 1;
      } catch (e) {
        console.error(`  FAILED ${u.uid} (${u.email}):`, (e as Error).message);
        failed += 1;
      }
    }
    token = result.pageToken || undefined;
  } while (token);

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${failed} failed.`);

  // Orphaned users-doc cleanup: the pre-phone code created `users` docs with
  // random IDs that were never linked to an auth user. Delete any doc whose
  // ID does not belong to an existing auth user (auth users are never touched).
  console.log('\nScanning users collection for orphaned docs...');
  let orphans = 0;
  const authUids = new Set<string>();
  token = undefined;
  do {
    const page = await adminAuth.listUsers(1000, token);
    for (const u of page.users) authUids.add(u.uid);
    token = page.pageToken || undefined;
  } while (token);

  const docs = await adminDb.collection('users').listDocuments();
  for (const ref of docs) {
    if (authUids.has(ref.id)) continue;
    await ref.delete();
    console.log(`  ORPHAN DELETED users/${ref.id}`);
    orphans += 1;
  }
  console.log(`Orphaned docs: ${orphans} deleted.`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
