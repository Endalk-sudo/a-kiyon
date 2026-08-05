import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { recordAndExtendPayment, voidPayment } from '@/services/payment.service';

const PREFIX = 'test_pay_int_';
const DAY = 24 * 60 * 60 * 1000;

let memberId: string;
let serviceId: string;
let subscriptionId: string;
const cleanupIds: string[] = [];

async function cleanup() {
  const batch = db.batch();
  for (const id of cleanupIds) {
    batch.delete(db.collection('payments').doc(id));
  }
  if (subscriptionId) batch.delete(db.collection('subscriptions').doc(subscriptionId));
  if (memberId) batch.delete(db.collection('members').doc(memberId));
  if (serviceId) batch.delete(db.collection('services').doc(serviceId));
  await batch.commit();
}

async function trackPayment(id: string) {
  cleanupIds.push(id);
}

function isoFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

async function createTestSubscription(overrides: Record<string, unknown> = {}) {
  const subRef = await db.collection('subscriptions').add({
    memberId,
    serviceId,
    startDate: isoFromNow(-40),
    endDate: isoFromNow(20),
    status: 'active',
    priceSnapshot: 300,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
  return subRef.id;
}

async function getSub(id: string) {
  const snap = await db.collection('subscriptions').doc(id).get();
  return snap.data() as Record<string, unknown>;
}

/** Poll until a predicate holds — the emulator's reads can lag behind writes. */
async function settle(predicate: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Mirrors the initial subscription purchase: sub + first payment in one go. */
async function createSubscriptionWithInitialPayment(overrides: Record<string, unknown> = {}) {
  const endDate = isoFromNow(20);
  const subRef = await db.collection('subscriptions').add({
    memberId,
    serviceId,
    startDate: isoFromNow(-40),
    endDate,
    status: 'active',
    priceSnapshot: 300,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const payRef = await db.collection('payments').add({
    subscriptionId: subRef.id,
    memberId,
    amount: 300,
    paymentDate: endDate,
    method: 'cash',
    receiptNumber: 'RCPT-INITIAL',
    createdBy: 'test-user',
    isVoided: false,
    extendedTo: endDate,
    previousExtendedTo: null,
    createdAt: isoFromNow(-5),
    updatedAt: isoFromNow(-5),
  });
  await trackPayment(payRef.id);

  return { subscriptionId: subRef.id, initialPaymentId: payRef.id };
}

describe('Payment Service (integration)', () => {
  beforeAll(async () => {
    const mRef = await db.collection('members').add({
      firstName: `${PREFIX}Jane`,
      lastName: 'Doe',
      phone: '+251911000002',
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memberId = mRef.id;

    const sRef = await db.collection('services').add({
      name: `${PREFIX}Yoga`,
      price: 300,
      duration: 30,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    serviceId = sRef.id;

    subscriptionId = await createTestSubscription();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('recordAndExtendPayment', () => {
    it('extends the subscription end date by the service duration and stores rollback metadata', async () => {
      const before = await getSub(subscriptionId);
      const beforeEnd = new Date(before.endDate as string).getTime();

      const result = await recordAndExtendPayment({
        subscriptionId,
        method: 'cash',
        createdBy: 'test-user',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await trackPayment(result.payment.id);

      expect(result.payment.amount).toBe(300);
      expect(result.payment.receiptNumber).toMatch(/^RCPT-/);
      expect(result.payment.isVoided).toBe(false);

      const expectedEnd = beforeEnd + 30 * DAY;
      expect(new Date(result.payment.extendedTo).getTime()).toBe(expectedEnd);
      expect(new Date(result.payment.previousExtendedTo).getTime()).toBe(beforeEnd);
      expect(new Date(result.subscription.endDate).getTime()).toBe(expectedEnd);

      const after = await getSub(subscriptionId);
      expect(new Date(after.endDate as string).getTime()).toBe(expectedEnd);
      expect(after.status).toBe('active');
    });

    it('rejects an amount that does not match the current service price', async () => {
      const result = await recordAndExtendPayment({
        subscriptionId,
        amount: 301,
        method: 'cash',
        createdBy: 'test-user',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('amount_mismatch');
    });

    it('rejects payments on cancelled subscriptions without reactivation', async () => {
      await db.collection('subscriptions').doc(subscriptionId).update({ status: 'cancelled' });
      const result = await recordAndExtendPayment({
        subscriptionId,
        method: 'cash',
        createdBy: 'test-user',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('subscription_inactive');
      await db.collection('subscriptions').doc(subscriptionId).update({ status: 'active' });
    });

    it('reactivates a cancelled subscription when allowReactivation is set', async () => {
      const before = await getSub(subscriptionId);
      await db.collection('subscriptions').doc(subscriptionId).update({ status: 'cancelled' });

      const result = await recordAndExtendPayment({
        subscriptionId,
        method: 'cash',
        createdBy: 'test-user',
        allowReactivation: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await trackPayment(result.payment.id);

      // Reactivation keeps any remaining validity: end date extends from the
      // existing end date (or from today when it already passed).
      const beforeEnd = Math.max(new Date(before.endDate as string).getTime(), Date.now());
      const after = await getSub(subscriptionId);
      expect(after.status).toBe('active');
      expect(new Date(after.endDate as string).getTime()).toBeCloseTo(beforeEnd + 30 * DAY, -3);
    });

    it('allows renewing an expired subscription only with allowReactivation', async () => {
      const expiredId = await createTestSubscription({
        startDate: isoFromNow(-60),
        endDate: isoFromNow(-10),
        status: 'expired',
      });

      const rejected = await recordAndExtendPayment({
        subscriptionId: expiredId,
        method: 'cash',
        createdBy: 'test-user',
      });
      expect(rejected.ok).toBe(false);
      if (rejected.ok) return;
      expect(rejected.reason).toBe('subscription_inactive');

      const renewed = await recordAndExtendPayment({
        subscriptionId: expiredId,
        method: 'cash',
        createdBy: 'test-user',
        allowReactivation: true,
      });
      expect(renewed.ok).toBe(true);
      if (!renewed.ok) return;
      await trackPayment(renewed.payment.id);

      const after = await getSub(expiredId);
      expect(after.status).toBe('active');
      // Expired 10 days ago — renewal restarts from today, not from the old end date.
      expect(new Date(after.endDate as string).getTime()).toBeCloseTo(Date.now() + 30 * DAY, -3);

      await db.collection('subscriptions').doc(expiredId).delete();
    });

    it('rejects payments for a deleted member', async () => {
      await db.collection('members').doc(memberId).update({ isDeleted: true });
      const result = await recordAndExtendPayment({
        subscriptionId,
        method: 'cash',
        createdBy: 'test-user',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('member_not_found');
      await db.collection('members').doc(memberId).update({ isDeleted: false });
    });
  });

  describe('voidPayment rollback', () => {
    let subId: string;
    let initialPaymentId: string;
    let firstRenewalId: string;
    let secondRenewalId: string;

    beforeAll(async () => {
      ({ subscriptionId: subId, initialPaymentId } = await createSubscriptionWithInitialPayment());

      const first = await recordAndExtendPayment({
        subscriptionId: subId,
        method: 'cash',
        createdBy: 'test-user',
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      firstRenewalId = first.payment.id;
      await trackPayment(firstRenewalId);

      const second = await recordAndExtendPayment({
        subscriptionId: subId,
        method: 'mobile_money',
        createdBy: 'test-user',
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      secondRenewalId = second.payment.id;
      await trackPayment(secondRenewalId);

      const sub = await getSub(subId);
      expect(new Date(sub.endDate as string).getTime()).toBeCloseTo(Date.now() + 80 * DAY, -3);
    });

    it('voiding the latest payment rolls the end date back to the previous payment', async () => {
      const voided = await voidPayment(secondRenewalId, 'test-user');
      expect(voided).not.toBeNull();
      expect(voided!.isVoided).toBe(true);
      expect(voided!.voidedBy).toBe('test-user');
      // The response must reflect the post-void state, not the pre-void read.
      expect(voided!.subscription.endDate).toBeDefined();
      expect(new Date(voided!.subscription.endDate).getTime()).toBeCloseTo(Date.now() + 50 * DAY, -3);
      expect(voided!.subscription.status).toBe('active');

      const sub = await getSub(subId);
      expect(sub.status).toBe('active');
      expect(new Date(sub.endDate as string).getTime()).toBeCloseTo(Date.now() + 50 * DAY, -3);
    });

    it('voiding the remaining renewal rolls back to the initial period', async () => {
      await voidPayment(firstRenewalId, 'test-user');

      const sub = await getSub(subId);
      expect(sub.status).toBe('active');
      expect(new Date(sub.endDate as string).getTime()).toBeCloseTo(Date.now() + 20 * DAY, -3);
    });

    it('voiding the initial payment cancels the subscription', async () => {
      const voided = await voidPayment(initialPaymentId, 'test-user');

      expect(voided!.subscription.status).toBe('cancelled');

      const sub = await getSub(subId);
      expect(sub.status).toBe('cancelled');
      expect(sub.hasVoidedPayment).toBe(true);
      expect(sub.voidedPaymentNote).toContain('RCPT-INITIAL');
    });

    it('rejects a second void of the same payment (no double rollback)', async () => {
      const again = await voidPayment(initialPaymentId, 'test-user');
      expect(again).toBeNull();

      const sub = await getSub(subId);
      expect(sub.status).toBe('cancelled');
      expect(sub.hasVoidedPayment).toBe(true);
    });
  });

  describe('voidPayment legacy fallback', () => {
    it('rolls back a legacy subscription whose payments lack rollback metadata', async () => {
      const legacyId = await createTestSubscription({
        startDate: isoFromNow(-60),
        endDate: isoFromNow(0),
        status: 'active',
      });

      const legacyPayRef = await db.collection('payments').add({
        subscriptionId: legacyId,
        memberId,
        amount: 300,
        paymentDate: isoFromNow(-60),
        method: 'cash',
        receiptNumber: 'RCPT-LEGACY',
        createdBy: 'test-user',
        isVoided: false,
        createdAt: isoFromNow(-60),
        updatedAt: isoFromNow(-60),
      });
      await trackPayment(legacyPayRef.id);

      // Newer payment records its own previous state, so its rollback works
      // even when the older payment is a legacy row.
      const newer = await recordAndExtendPayment({
        subscriptionId: legacyId,
        method: 'cash',
        createdBy: 'test-user',
      });
      expect(newer.ok).toBe(true);
      if (!newer.ok) return;
      await trackPayment(newer.payment.id);

      await voidPayment(newer.payment.id, 'test-user');

      const sub = await getSub(legacyId);
      expect(new Date(sub.endDate as string).getTime()).toBeCloseTo(Date.now(), -3);
      expect(sub.status).toBe('expired');

      // Voiding the legacy payment itself falls back to the remaining-payment
      // query. Wait for the newer payment's void to become visible first.
      await settle(async () => {
        const snap = await db.collection('payments').doc(newer.payment.id).get();
        return snap.data()?.isVoided === true;
      });

      await voidPayment(legacyPayRef.id, 'test-user');

      const after = await getSub(legacyId);
      expect(after.hasVoidedPayment).toBe(true);
      expect(after.status).toBe('expired');

      await db.collection('subscriptions').doc(legacyId).delete();
    });
  });
});
