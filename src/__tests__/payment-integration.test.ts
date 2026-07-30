import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';

const PREFIX = 'test_pay_int_';

let memberId: string;
let serviceId: string;
let subscriptionId: string;
let paymentIds: string[] = [];

async function cleanup() {
  const batch = db.batch();
  for (const id of paymentIds) {
    batch.delete(db.collection('payments').doc(id));
  }
  if (subscriptionId) batch.delete(db.collection('subscriptions').doc(subscriptionId));
  if (memberId) batch.delete(db.collection('members').doc(memberId));
  if (serviceId) batch.delete(db.collection('services').doc(serviceId));
  await batch.commit();
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

    const subRef = await db.collection('subscriptions').add({
      memberId,
      serviceId,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      priceSnapshot: 300,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    subscriptionId = subRef.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createPayment', () => {
    it('creates a payment and returns enriched data', async () => {
      const { createPayment } = await import('@/services/payment.service');
      const payment = await createPayment({
        subscriptionId,
        memberId,
        amount: 300,
        paymentDate: new Date(),
        method: 'cash',
        notes: 'Test payment',
        createdBy: 'test-user',
      });

      expect(payment.id).toBeTruthy();
      expect(payment.amount).toBe(300);
      expect(payment.method).toBe('cash');
      expect(payment.receiptNumber).toMatch(/^RCPT-/);
      expect(payment.isVoided).toBe(false);
      expect(payment.member).toBeDefined();
      expect(payment.subscription).toBeDefined();
      paymentIds.push(payment.id);
    });

    it('creates payment with mobile_money method', async () => {
      const { createPayment } = await import('@/services/payment.service');
      const payment = await createPayment({
        subscriptionId,
        memberId,
        amount: 150,
        paymentDate: new Date(),
        method: 'mobile_money',
        createdBy: 'test-user',
      });

      expect(payment.method).toBe('mobile_money');
      paymentIds.push(payment.id);
    });
  });

  describe('voidPayment', () => {
    let voidPaymentId: string;

    beforeAll(async () => {
      const { createPayment } = await import('@/services/payment.service');
      const payment = await createPayment({
        subscriptionId,
        memberId,
        amount: 500,
        paymentDate: new Date(),
        method: 'bank_transfer',
        createdBy: 'test-user',
      });
      voidPaymentId = payment.id;
      paymentIds.push(voidPaymentId);
    });

    it('voids a payment and returns updated data', async () => {
      const { voidPayment } = await import('@/services/payment.service');
      const voided = await voidPayment(voidPaymentId, 'test-user');
      expect(voided).not.toBeNull();
      expect(voided!.isVoided).toBe(true);
      expect(voided!.voidedAt).toBeTruthy();
      expect(voided!.voidedBy).toBe('test-user');
    });

    it('returns null for non-existent payment', async () => {
      const { voidPayment } = await import('@/services/payment.service');
      const result = await voidPayment('nonexistent_id', 'test-user');
      expect(result).toBeNull();
    });
  });

  describe('listPayments', () => {
    beforeAll(async () => {
      const { createPayment } = await import('@/services/payment.service');
      for (let i = 0; i < 3; i++) {
        const p = await createPayment({
          subscriptionId,
          memberId,
          amount: 100 * (i + 1),
          paymentDate: new Date(),
          method: 'cash',
          createdBy: 'test-user',
        });
        paymentIds.push(p.id);
      }
    });

    it('lists payments with pagination', async () => {
      const { listPayments } = await import('@/services/payment.service');
      const result = await listPayments({ page: 1, limit: 10 });
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toHaveProperty('total');
    });

    it('filters by memberId', async () => {
      const { listPayments } = await import('@/services/payment.service');
      const result = await listPayments({ memberId });
      expect(result.data.every((p: any) => p.memberId === memberId)).toBe(true);
    });

    it('filters by method', async () => {
      const { listPayments } = await import('@/services/payment.service');
      const result = await listPayments({ method: 'cash' });
      expect(result.data.every((p: any) => p.method === 'cash')).toBe(true);
    });
  });
});
