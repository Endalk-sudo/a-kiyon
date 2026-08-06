import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateSubscriptionSchema } from '@/lib/schemas';
import { getDocById } from '@/lib/db';
import { getSubscription, updateSubscription } from '@/services/subscription.service';
import { NextRequest } from 'next/server';

// GET /api/subscriptions/[id] - Get single subscription with member and service details
export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // View-only — aligns with the list endpoint (readers may view).
  await getSessionOrThrow(undefined, request);

  const { id } = await params;
  const subscription = await getSubscription(id);

  if (!subscription) return apiError('Subscription not found', 404);

  return apiResponse(subscription);
});

// PUT /api/subscriptions/[id] - Update subscription (manager + owner)
export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner', 'manager'], request);
  const { id } = await params;
  const body = await request.json();
  const data = updateSubscriptionSchema.parse(body);

  const existing = await getDocById<{ status: string }>('subscriptions', id);
  if (!existing) return apiError('Subscription not found', 404);

  const subscription = await updateSubscription(id, {
    ...(data.status !== undefined && { status: data.status }),
    ...(data.notes !== undefined && { notes: data.notes }),
  });

  if (!subscription) return apiError('Subscription not found', 404);

  return apiResponse(subscription);
});
