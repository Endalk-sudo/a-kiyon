import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, paginatedResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';

// GET /api/payments - List payments with server-side pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    if (!['owner', 'manager'].includes(session.role)) {
      return forbiddenError();
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const memberId = searchParams.get('memberId');
    const method = searchParams.get('method');
    const isVoided = searchParams.get('isVoided');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (memberId) {
      where.memberId = memberId;
    }

    if (method) {
      where.method = method;
    }

    if (isVoided !== null && isVoided !== undefined) {
      where.isVoided = isVoided === 'true';
    }

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) {
        const startParsed = parseEthiopianDate(startDate);
        if (startParsed.success && startParsed.date) {
          where.paymentDate.gte = startParsed.date;
        } else {
          // Try as ISO date
          where.paymentDate.gte = new Date(startDate);
        }
      }
      if (endDate) {
        const endParsed = parseEthiopianDate(endDate);
        if (endParsed.success && endParsed.date) {
          // End of day
          const end = endParsed.date;
          end.setHours(23, 59, 59, 999);
          where.paymentDate.lte = end;
        } else {
          // Try as ISO date
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.paymentDate.lte = end;
        }
      }
    }

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          member: {
            select: {
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
          subscription: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
              priceSnapshot: true,
              service: { select: { name: true } },
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      db.payment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return paginatedResponse(payments, {
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to fetch payments', 500);
  }
}

// POST /api/payments - Record a new payment (manager + owner)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const body = await request.json();
    const { subscriptionId, memberId, amount, paymentDate, method, notes } = body;

    if (!subscriptionId || !memberId || !amount || !paymentDate || !method) {
      return apiError('Missing required fields: subscriptionId, memberId, amount, paymentDate, method');
    }

    if (amount <= 0) {
      return apiError('Amount must be greater than 0');
    }

    const validMethods = ['cash', 'bank_transfer', 'mobile_money'];
    if (!validMethods.includes(method)) {
      return apiError(`Invalid payment method. Must be one of: ${validMethods.join(', ')}`);
    }

    const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) {
      return apiError('Subscription not found', 404);
    }

    let paymentDateValue: Date;
    if (typeof paymentDate === 'string') {
      const ethParsed = parseEthiopianDate(paymentDate);
      if (ethParsed.success && ethParsed.date) {
        paymentDateValue = ethParsed.date;
      } else {
        const isoDate = new Date(paymentDate);
        if (isNaN(isoDate.getTime())) {
          return apiError('Invalid payment date format');
        }
        paymentDateValue = isoDate;
      }
    } else {
      return apiError('Invalid payment date format');
    }

    const receiptNumber = `RCPT-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const payment = await db.payment.create({
      data: {
        subscriptionId,
        memberId,
        amount: parseFloat(String(amount)),
        paymentDate: paymentDateValue,
        method,
        receiptNumber,
        notes: notes || null,
        createdBy: session.userId,
      },
      include: {
        member: {
          select: { firstName: true, lastName: true, photo: true },
        },
        subscription: {
          select: {
            id: true,
            priceSnapshot: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'payment.create',
      details: {
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        subscriptionId,
        memberId,
        amount: payment.amount,
        method: payment.method,
      },
      entity: 'payment',
      entityId: payment.id,
    });

    return apiResponse(payment, 201);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to record payment', 500);
  }
}
