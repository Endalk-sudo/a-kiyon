import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { paginatedResponse, apiResponse, apiError, parseIntParam } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createPaymentSchema } from '@/lib/schemas';
import { listPayments, recordAndExtendPayment } from '@/services/payment.service';
import { autoExpireSubscriptions } from '@/services/subscription.service';

export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(undefined, request);

  await autoExpireSubscriptions();

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseIntParam(searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, parseIntParam(searchParams.get('limit'), 20)));
  const memberId = searchParams.get('memberId') || undefined;
  const method = searchParams.get('method') || undefined;
  const isVoidedParam = searchParams.get('isVoided');
  const isVoided = isVoidedParam !== null ? isVoidedParam === 'true' : undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const search = searchParams.get('search') || '';

  const { data, pagination } = await listPayments({ page, limit, memberId, method, isVoided, startDate, endDate, search });
  return paginatedResponse(data, pagination);
});

export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const body = await request.json();
  const data = createPaymentSchema.parse(body);

  // Money in = days added: recording a payment extends the subscription
  // end date by the service duration (same rule as renewing).
  const result = await recordAndExtendPayment({
    subscriptionId: data.subscriptionId,
    amount: data.amount,
    method: data.method,
    notes: data.notes || null,
    createdBy: session.userId,
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'subscription_not_found':
        return apiError('Subscription not found', 404);
      case 'member_not_found':
        return apiError('Member not found', 404);
      case 'subscription_inactive':
        return apiError('Cannot record a payment for an inactive subscription');
      case 'service_not_found':
        return apiError('Service not found', 404);
      case 'service_inactive':
        return apiError('Service is not active');
      case 'amount_mismatch':
        return apiError('Payment amount must equal the current service price');
    }
  }

  return apiResponse(result.payment, 201);
});
