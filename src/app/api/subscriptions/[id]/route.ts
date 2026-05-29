import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

// GET /api/subscriptions/[id] - Get single subscription with member and service details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    if (!['owner', 'manager'].includes(session.role)) {
      return forbiddenError();
    }

    const { id } = await params;
    const subscription = await db.subscription.findUnique({
      where: { id },
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, photo: true, phone: true },
        },
        service: {
          select: { id: true, name: true, nameAm: true, price: true, duration: true },
        },
        payments: {
          where: { isVoided: false },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!subscription) {
      return apiError('Subscription not found', 404);
    }

    return apiResponse(subscription);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to fetch subscription', 500);
  }
}

// PUT /api/subscriptions/[id] - Update subscription (manager + owner)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);
    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    // Verify subscription exists
    const existing = await db.subscription.findUnique({ where: { id } });
    if (!existing) {
      return apiError('Subscription not found', 404);
    }

    // Validate status if provided
    if (status && !['active', 'expired', 'cancelled'].includes(status)) {
      return apiError('Invalid status. Must be one of: active, expired, cancelled');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // If nothing to update
    if (Object.keys(updateData).length === 0) {
      return apiError('No fields to update');
    }

    const subscription = await db.subscription.update({
      where: { id },
      data: updateData,
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, photo: true },
        },
        service: {
          select: { id: true, name: true, price: true },
        },
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'subscription.update',
      details: {
        subscriptionId: id,
        previousStatus: existing.status,
        newStatus: status,
        notesUpdated: notes !== undefined,
      },
      entity: 'subscription',
      entityId: id,
    });

    return apiResponse(subscription);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to update subscription', 500);
  }
}
