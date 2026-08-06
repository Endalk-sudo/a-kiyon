import 'dotenv/config';
import { adminDb } from '../lib/firebase-admin';

async function expireSubscriptions() {
  const now = new Date().toISOString();

  const snapshot = await adminDb
    .collection('subscriptions')
    .where('status', '==', 'active')
    .where('endDate', '<', now)
    .get();

  if (snapshot.empty) {
    console.log(`[${new Date().toISOString()}] No expired subscriptions found.`);
    return;
  }

  // A single Firestore batch is limited to 500 writes — chunk to 400.
  const BATCH_LIMIT = 400;
  const docs = snapshot.docs;
  let expired = 0;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
      // ISO string to match every other write path in the app.
      batch.update(doc.ref, { status: 'expired', updatedAt: now });
    }
    await batch.commit();
    expired += Math.min(BATCH_LIMIT, docs.length - i);
  }

  console.log(
    `[${new Date().toISOString()}] Expired ${expired} subscription(s) past end date.`
  );
}

expireSubscriptions().catch((error) => {
  console.error('Failed to expire subscriptions:', error);
  process.exit(1);
});
