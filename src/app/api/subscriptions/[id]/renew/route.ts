import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { renewSubscriptionSchema } from '@/lib/schemas';
import { recordAndExtendPayment } from '@/services/payment.service';

// POST /api/subscriptions/[id]/renew - Extend a subscription with a new payment.
// Works on active, expired, and cancelled subscriptions — the member pays again
// to reactivate, so a mis-cancellation is recoverable.
export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);
  const body = await request.json().catch(() => ({}));
  const data = renewSubscriptionSchema.parse(body);

  const { id } = await params;

  const result = await recordAndExtendPayment({
    subscriptionId: id,
    method: data.paymentMethod,
    createdBy: session.userId,
    allowReactivation: true,
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'subscription_not_found':
        return apiError('Subscription not found', 404);
      case 'member_not_found':
        return apiError('Cannot renew subscription for a deleted member');
      case 'subscription_inactive':
        return apiError('Cannot renew this subscription');
      case 'service_not_found':
        return apiError('Service not found', 404);
      case 'service_inactive':
        return apiError('Service is not active');
      default:
        return apiError('Cannot renew subscription');
    }
  }

  return apiResponse({ subscription: result.subscription, payment: result.payment }, 201);
});
