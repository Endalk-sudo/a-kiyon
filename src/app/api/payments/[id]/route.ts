import { NextRequest } from 'next/server';
import { getDocById } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { getUser } from '@/services/user.service';

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(undefined, request);

  const { id } = await params;

  const payment = await getDocById<{
    subscriptionId: string;
    memberId: string;
    amount: number;
    paymentDate: string;
    method: string;
    receiptNumber: string;
    isVoided: boolean;
    voidedAt: string | null;
    voidedBy: string | null;
    notes: string | null;
    createdBy: string;
    extendedTo?: string | null;
    previousExtendedTo?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>('payments', id);

  if (!payment) return apiError('Payment not found', 404);

  const [member, user] = await Promise.all([
    getDocById<{ firstName: string; lastName: string; phone: string; photo: string }>('members', payment.memberId),
    (async () => {
      try {
        const u = await getUser(payment.createdBy);
        return { id: u.id, name: u.name, email: u.email };
      } catch {
        return null;
      }
    })(),
  ]);

  // Explicit shape only — never spread the raw doc (leaks createdBy and
  // rollback internals).
  return apiResponse({
    id,
    subscriptionId: payment.subscriptionId,
    memberId: payment.memberId,
    amount: payment.amount,
    paymentDate: payment.paymentDate,
    method: payment.method,
    receiptNumber: payment.receiptNumber,
    isVoided: payment.isVoided,
    voidedAt: payment.voidedAt,
    voidedBy: payment.voidedBy,
    notes: payment.notes,
    member: member
      ? { id: member.id, firstName: member.firstName, lastName: member.lastName, phone: member.phone || null, photo: member.photo || null }
      : null,
    user: user || null,
  });
});
