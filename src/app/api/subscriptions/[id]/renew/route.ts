import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

// POST /api/subscriptions/[id]/renew - Renew a subscription with payment
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
    let startDate: Date;
    if (existing.endDate < now) {
      startDate = now;
    } else {
      startDate = new Date(existing.endDate);
      startDate.setDate(startDate.getDate() + 1);
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + existing.service.duration);

    if (existing.status === 'active') {
      await db.subscription.update({
        where: { id: existing.id },
        data: { status: 'expired' },
      });
    }

    const receiptNumber = `RCPT-${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await db.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          memberId: existing.memberId,
          serviceId: existing.serviceId,
          startDate,
          endDate,
          status: 'active',
          priceSnapshot: existing.service.price,
          notes: `Renewed from subscription ${existing.id}`,
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
        oldSubscriptionId: existing.id,
        newSubscriptionId: result.subscription.id,
        memberId: existing.memberId,
        serviceId: existing.serviceId,
        priceSnapshot: existing.service.price,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        paymentId: result.payment.id,
        receiptNumber,
      },
      entity: 'subscription',
      entityId: result.subscription.id,
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
