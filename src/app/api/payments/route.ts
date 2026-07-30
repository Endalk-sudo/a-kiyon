import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { paginatedResponse, apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createPaymentSchema } from '@/lib/schemas';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';
import { listPayments, createPayment } from '@/services/payment.service';
import { autoExpireSubscriptions } from '@/services/subscription.service';
import { getDocById } from '@/lib/db';

export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(undefined, request);
  if (!['owner', 'manager'].includes(session.role)) throw new Error('Forbidden');

  await autoExpireSubscriptions();

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const memberId = searchParams.get('memberId') || undefined;
  const method = searchParams.get('method') || undefined;
  const isVoidedParam = searchParams.get('isVoided');
  const isVoided = isVoidedParam !== null ? isVoidedParam === 'true' : undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const { data, pagination } = await listPayments({ page, limit, memberId, method, isVoided, startDate, endDate });
  return paginatedResponse(data, pagination);
});

export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const body = await request.json();
  const data = createPaymentSchema.parse(body);

  const subscription = await getDocById<{ memberId: string; serviceId: string; status: string }>('subscriptions', data.subscriptionId);
  if (!subscription) return apiError('Subscription not found', 404);

  let paymentDate: Date;
  if (typeof data.paymentDate === 'string') {
    const ethParsed = parseEthiopianDate(data.paymentDate);
    if (ethParsed.success && ethParsed.date) {
      paymentDate = ethParsed.date;
    } else {
      const isoDate = new Date(data.paymentDate);
      if (isNaN(isoDate.getTime())) return apiError('Invalid payment date format');
      paymentDate = isoDate;
    }
  } else {
    return apiError('Invalid payment date format');
  }

  const payment = await createPayment({
    subscriptionId: data.subscriptionId,
    memberId: data.memberId,
    amount: data.amount,
    paymentDate,
    method: data.method,
    notes: data.notes || null,
    createdBy: session.userId,
  });

  await createAuditLog({
    userId: session.userId,
    action: 'payment.create',
    details: {
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      subscriptionId: data.subscriptionId,
      memberId: data.memberId,
      amount: payment.amount,
      method: data.method,
    },
    entity: 'payment',
    entityId: payment.id,
  });

  return apiResponse(payment, 201);
});
