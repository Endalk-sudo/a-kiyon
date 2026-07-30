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

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { status: 'expired', updatedAt: new Date() });
  });
  await batch.commit();

  console.log(
    `[${new Date().toISOString()}] Expired ${snapshot.size} subscription(s) past end date.`
  );
}

expireSubscriptions().catch((error) => {
  console.error('Failed to expire subscriptions:', error);
  process.exit(1);
});
