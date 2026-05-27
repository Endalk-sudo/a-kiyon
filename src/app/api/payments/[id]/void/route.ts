import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';

// POST /api/payments/[id]/void - Void a payment (owner only)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner']);

    const { id } = await params;

    // Find the payment
    const payment = await db.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      return apiError('Payment not found', 404);
    }

    if (payment.isVoided) {
      return apiError('Payment is already voided');
    }

    // Void the payment
    const updatedPayment = await db.payment.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedBy: session.userId,
      },
      include: {
        member: {
          select: {
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
        invoice: {
          select: {
            id: true,
            amount: true,
            status: true,
            dueDate: true,
          },
        },
      },
    });

    // Check if the invoice should revert to "pending"
    // If no other non-voided payments cover the invoice amount, revert to pending
    const totalPaid = await db.payment.aggregate({
      where: {
        invoiceId: payment.invoiceId,
        isVoided: false,
      },
      _sum: {
        amount: true,
      },
    });

    const totalPaidAmount = totalPaid._sum.amount || 0;
    const invoice = await db.invoice.findUnique({
      where: { id: payment.invoiceId },
    });

    if (invoice && invoice.status === 'paid' && totalPaidAmount < invoice.amount) {
      await db.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: 'pending',
          paidAt: null,
        },
      });
    }

    // Create audit log entry
    await createAuditLog({
      userId: session.userId,
      action: 'payment.void',
      details: {
        paymentId: id,
        receiptNumber: payment.receiptNumber,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        voidedBy: session.userId,
      },
      entity: 'payment',
      entityId: id,
    });

    return apiResponse(updatedPayment);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to void payment', 500);
  }
}
