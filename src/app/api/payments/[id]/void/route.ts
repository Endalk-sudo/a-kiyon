import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { getDocById } from '@/lib/db';
import { voidPayment } from '@/services/payment.service';

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);

  const { id } = await params;

  const payment = await getDocById<{ isVoided: boolean; receiptNumber: string; subscriptionId: string; amount: number }>('payments', id);
  if (!payment) return apiError('Payment not found', 404);
  if (payment.isVoided) return apiError('Payment is already voided');

  const updatedPayment = await voidPayment(id, session.userId);
  if (!updatedPayment) return apiError('Payment not found', 404);

  return apiResponse(updatedPayment);
});
