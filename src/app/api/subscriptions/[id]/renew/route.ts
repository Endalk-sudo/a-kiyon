import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

// POST /api/subscriptions/[id]/renew - Extend a subscription with a new payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);
    const body = await request.json();
    const { paymentMethod } = body;

    const { id } = await params;

    const existing = await db.subscription.findUnique({
      where: { id },
      include: {
        service: true,
        member: { select: { id: true, isDeleted: true } },
      },
    });

    if (!existing) {
      return apiError('Subscription not found', 404);
    }

    if (existing.member.isDeleted) {
      return apiError('Cannot renew subscription for a deleted member');
    }

    if (!paymentMethod) {
      return apiError('paymentMethod is required');
    }

    const validMethods = ['cash', 'bank_transfer', 'mobile_money'];
    if (!validMethods.includes(paymentMethod)) {
      return apiError(`Invalid payment method. Must be one of: ${validMethods.join(', ')}`);
    }

    const now = new Date();
    const currentEndDate = existing.endDate;
    const startDate = currentEndDate > now ? currentEndDate : now;
    const newEndDate = new Date(startDate);
    newEndDate.setDate(newEndDate.getDate() + existing.service.duration);

    const receiptNumber = `RCPT-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const result = await db.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: existing.id },
        data: {
          endDate: newEndDate,
          status: 'active',
        },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, photo: true },
          },
          service: {
            select: { id: true, name: true, nameAm: true, price: true, duration: true },
          },
        },
      });

      const payment = await tx.payment.create({
        data: {
          subscriptionId: subscription.id,
          memberId: existing.memberId,
          amount: existing.service.price,
          paymentDate: now,
          method: paymentMethod,
          receiptNumber,
          createdBy: session.userId,
        },
      });

      return { subscription, payment };
    });

    await createAuditLog({
      userId: session.userId,
      action: 'subscription.renew',
      details: {
        subscriptionId: existing.id,
        memberId: existing.memberId,
        serviceId: existing.serviceId,
        priceSnapshot: existing.service.price,
        previousEndDate: currentEndDate.toISOString(),
        newEndDate: newEndDate.toISOString(),
        paymentId: result.payment.id,
        receiptNumber,
      },
      entity: 'subscription',
      entityId: existing.id,
    });

    return apiResponse(result, 201);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to renew subscription', 500);
  }
}
