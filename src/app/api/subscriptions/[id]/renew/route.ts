import { db, getDocById } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { renewSubscriptionSchema } from '@/lib/schemas';
import { getSubscription } from '@/services/subscription.service';
import { generateReceiptNumber } from '@/services/payment.service';
import { NextRequest } from 'next/server';

// POST /api/subscriptions/[id]/renew - Extend a subscription with a new payment
export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);
  const body = await request.json().catch(() => ({}));
  const data = renewSubscriptionSchema.parse(body);

  const { id } = await params;

  const existing = await getSubscription(id);

  if (!existing) return apiError('Subscription not found', 404);

  const memberDoc = await getDocById<{ isDeleted: boolean }>('members', existing.memberId);
  if (!memberDoc || memberDoc.isDeleted) return apiError('Cannot renew subscription for a deleted member');

  const now = new Date();
  const currentEndDate = new Date(existing.endDate);
  const startDate = currentEndDate > now ? currentEndDate : now;
  const newEndDate = new Date(startDate);
  newEndDate.setDate(newEndDate.getDate() + existing.service.duration);

  const receiptNumber = generateReceiptNumber();

  const { paymentId } = await db.runTransaction(async (tx) => {
    const subRef = db.collection('subscriptions').doc(id);
    tx.update(subRef, {
      endDate: newEndDate.toISOString(),
      status: 'active',
      updatedAt: new Date().toISOString(),
    });

    const payRef = db.collection('payments').doc();
    tx.set(payRef, {
      subscriptionId: id,
      memberId: existing.memberId,
      amount: existing.service.price,
      paymentDate: now.toISOString(),
      method: data.paymentMethod,
      receiptNumber,
      createdBy: session.userId,
      isVoided: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { paymentId: payRef.id };
  });

  const subscription = {
    ...existing,
    endDate: newEndDate.toISOString(),
    status: 'active',
  };

  const payment = {
    id: paymentId,
    subscriptionId: id,
    memberId: existing.memberId,
    amount: existing.service.price,
    paymentDate: now.toISOString(),
    method: data.paymentMethod,
    receiptNumber,
    createdBy: session.userId,
  };

  await createAuditLog({
    userId: session.userId,
    action: 'subscription.renew',
    details: {
      subscriptionId: id,
      memberId: existing.memberId,
      serviceId: existing.serviceId,
      priceSnapshot: existing.service.price,
      previousEndDate: currentEndDate.toISOString(),
      newEndDate: newEndDate.toISOString(),
      paymentId,
      receiptNumber,
    },
    entity: 'subscription',
    entityId: id,
  });

  return apiResponse({ subscription, payment }, 201);
});
