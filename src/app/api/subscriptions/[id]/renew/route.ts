import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

// POST /api/subscriptions/[id]/renew - Renew a subscription
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const { id } = await params;

    // Find the existing subscription
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

    // Determine start date for new subscription
    const now = new Date();
    let startDate: Date;
    if (existing.endDate < now) {
      // Old subscription expired - start today
      startDate = now;
    } else {
      // Old subscription still active - start the day after it ends
      startDate = new Date(existing.endDate);
      startDate.setDate(startDate.getDate() + 1);
    }

    // Calculate end date
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + existing.service.duration);

    // If the old subscription is still active, mark it as expired
    if (existing.status === 'active') {
      await db.subscription.update({
        where: { id: existing.id },
        data: { status: 'expired' },
      });
    }

    // Create new subscription and invoice in a transaction
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

      // Create invoice for the renewed subscription
      const invoice = await tx.invoice.create({
        data: {
          memberId: existing.memberId,
          subscriptionId: subscription.id,
          amount: existing.service.price,
          status: 'pending',
          dueDate: startDate,
        },
      });

      return { subscription, invoice };
    });

    // Create audit log
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
        invoiceId: result.invoice.id,
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
