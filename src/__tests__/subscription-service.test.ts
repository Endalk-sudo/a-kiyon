import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';

const PREFIX = 'test_sub_svc_';

let memberId: string;
let serviceId: string;
const subscriptionIds: string[] = [];

async function cleanup() {
  const batch = db.batch();
  for (const id of subscriptionIds) {
    batch.delete(db.collection('subscriptions').doc(id));
  }
  if (memberId) batch.delete(db.collection('members').doc(memberId));
  if (serviceId) batch.delete(db.collection('services').doc(serviceId));
  await batch.commit();
}

describe('Subscription Service (integration)', () => {
  beforeAll(async () => {
    const memberRef = await db.collection('members').add({
      firstName: `${PREFIX}John`,
      lastName: 'Doe',
      phone: '+251911000001',
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memberId = memberRef.id;

    const svcRef = await db.collection('services').add({
      name: `${PREFIX}Gym`,
      price: 500,
      duration: 30,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    serviceId = svcRef.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createSubscription (via db helper)', () => {
    it('creates a subscription with required fields', async () => {
      const { createDoc } = await import('@/lib/db');
      const sub = await createDoc<{ memberId: string; status: string }>('subscriptions', {
        memberId,
        serviceId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        priceSnapshot: 500,
      });
      expect(sub.id).toBeTruthy();
      expect(sub.memberId).toBe(memberId);
      expect(sub.status).toBe('active');
      subscriptionIds.push(sub.id);
    });
  });

  describe('listSubscriptions', () => {
    beforeAll(async () => {
      const { createDoc } = await import('@/lib/db');
      for (let i = 0; i < 3; i++) {
        const sub = await createDoc<{ memberId: string }>('subscriptions', {
          memberId,
          serviceId,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          priceSnapshot: 500,
        });
        subscriptionIds.push(sub.id);
      }
    });

    it('lists subscriptions with pagination', async () => {
      const { listSubscriptions } = await import('@/services/subscription.service');
      const result = await listSubscriptions({ page: 1, limit: 10 });
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination.page).toBe(1);
    });

    it('filters by memberId', async () => {
      const { listSubscriptions } = await import('@/services/subscription.service');
      const result = await listSubscriptions({ memberId });
      expect(result.data.every((s: { memberId: string }) => s.memberId === memberId)).toBe(true);
    });
  });

  describe('listSubscriptions search (more than 10 matching members)', () => {
    const searchMemberIds: string[] = [];
    const searchSubIds: string[] = [];

    beforeAll(async () => {
      const batch = db.batch();
      for (let i = 0; i < 12; i++) {
        const ref = db.collection('members').doc();
        batch.set(ref, {
          firstName: `${PREFIX}SearchName${i}`,
          lastName: 'Test',
          phone: `+2519110004${String(i).padStart(2, '0')}`,
          isDeleted: false,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        searchMemberIds.push(ref.id);
      }
      await batch.commit();

      for (const memberId of searchMemberIds) {
        const { createDoc } = await import('@/lib/db');
        const sub = await createDoc('subscriptions', {
          memberId,
          serviceId,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          priceSnapshot: 500,
        });
        searchSubIds.push(sub.id);
      }
    });

    afterAll(async () => {
      const batch = db.batch();
      searchMemberIds.forEach((id) => batch.delete(db.collection('members').doc(id)));
      searchSubIds.forEach((id) => batch.delete(db.collection('subscriptions').doc(id)));
      await batch.commit();
    });

    it('returns all subscriptions for matches beyond 10, with correct totals', async () => {
      const { listSubscriptions } = await import('@/services/subscription.service');
      const result = await listSubscriptions({ search: 'SearchName', page: 1, limit: 20 });
      expect(result.pagination.total).toBe(12);
      expect(result.data.length).toBe(12);
    });
  });

  describe('getSubscription', () => {
    it('returns a subscription by id', async () => {
      const { createDoc } = await import('@/lib/db');
      const sub = await createDoc('subscriptions', {
        memberId,
        serviceId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        priceSnapshot: 500,
      });
      subscriptionIds.push(sub.id);

      const { getSubscription } = await import('@/services/subscription.service');
      const found = await getSubscription(sub.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sub.id);
      expect(found!.status).toBe('active');
    });

    it('returns null for non-existent id', async () => {
      const { getSubscription } = await import('@/services/subscription.service');
      const found = await getSubscription('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('updateSubscription', () => {
    let subId: string;

    beforeAll(async () => {
      const { createDoc } = await import('@/lib/db');
      const sub = await createDoc('subscriptions', {
        memberId,
        serviceId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        priceSnapshot: 500,
      });
      subId = sub.id;
      subscriptionIds.push(subId);
    });

    it('updates subscription status', async () => {
      const { updateSubscription } = await import('@/services/subscription.service');
      const updated = await updateSubscription(subId, { status: 'cancelled' });
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('cancelled');
    });

    it('updates subscription notes', async () => {
      const { updateSubscription } = await import('@/services/subscription.service');
      const updated = await updateSubscription(subId, { notes: 'Test notes' });
      expect(updated).not.toBeNull();
      expect(updated!.notes).toBe('Test notes');
    });
  });

  describe('autoExpireSubscriptions', () => {
    it('expires past-due active subscriptions', async () => {
      const { createDoc } = await import('@/lib/db');
      const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const sub = await createDoc('subscriptions', {
        memberId,
        serviceId,
        startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: past.toISOString(),
        status: 'active',
        priceSnapshot: 500,
      });
      subscriptionIds.push(sub.id);

      const { autoExpireSubscriptions, resetAutoExpireDebounce } = await import('@/services/subscription.service');
      resetAutoExpireDebounce();
      await autoExpireSubscriptions();

      const snap = await db.collection('subscriptions').doc(sub.id).get();
      expect(snap.data()?.status).toBe('expired');
    });
  });
});
