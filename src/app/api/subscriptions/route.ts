import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, paginatedResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';
import { NextRequest } from 'next/server';

// GET /api/subscriptions - List subscriptions with server-side pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    if (!['owner', 'manager'].includes(session.role)) {
      return forbiddenError();
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const memberId = searchParams.get('memberId') || undefined;
    const serviceId = searchParams.get('serviceId') || undefined;
    const status = searchParams.get('status') || undefined;

    const where: Record<string, unknown> = {};
    if (memberId) where.memberId = memberId;
    if (serviceId) where.serviceId = serviceId;
    if (status) where.status = status;

    const [total, subscriptions] = await Promise.all([
      db.subscription.count({ where }),
      db.subscription.findMany({
        where,
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, photo: true },
          },
          service: {
            select: { id: true, name: true, price: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return paginatedResponse(subscriptions, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to fetch subscriptions', 500);
  }
}

// POST /api/subscriptions - Create subscription with payment (manager + owner)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);
    const body = await request.json();
    const { memberId, serviceId, startDate: rawStartDate, paymentMethod, paymentDate: rawPaymentDate, notes } = body;
    const startDate = rawStartDate || new Date().toISOString();

    // Validate required fields
    if (!memberId || !serviceId) {
      return apiError('memberId and serviceId are required');
    }

    if (!paymentMethod) {
      return apiError('paymentMethod is required');
    }

    const validMethods = ['cash', 'bank_transfer', 'mobile_money'];
    if (!validMethods.includes(paymentMethod)) {
      return apiError(`Invalid payment method. Must be one of: ${validMethods.join(', ')}`);
    }

    // Verify member exists and is not deleted
    const member = await db.member.findFirst({
      where: { id: memberId, isDeleted: false },
    });
    if (!member) {
      return apiError('Member not found', 404);
    }

    // Look up the service to get price and duration
    const service = await db.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return apiError('Service not found', 404);
    }
    if (!service.isActive) {
      return apiError('Service is not active');
    }

    // Parse startDate
    let parsedStartDate: Date;
    const dateStr = String(startDate).trim();
    const ethiopianPattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?$/i;
    if (ethiopianPattern.test(dateStr)) {
      const result = parseEthiopianDate(dateStr);
      if (!result.success || !result.date) {
        return apiError(result.error || 'Invalid Ethiopian date format');
      }
      parsedStartDate = result.date;
    } else {
      parsedStartDate = new Date(dateStr);
      if (isNaN(parsedStartDate.getTime())) {
        return apiError('Invalid start date format');
      }
    }

    // Parse payment date
    let paymentDateValue = parsedStartDate;
    if (rawPaymentDate) {
      const paymentStr = String(rawPaymentDate).trim();
      if (ethiopianPattern.test(paymentStr)) {
        const result = parseEthiopianDate(paymentStr);
        if (result.success && result.date) {
          paymentDateValue = result.date;
        }
      } else {
        const d = new Date(paymentStr);
        if (!isNaN(d.getTime())) paymentDateValue = d;
      }
    }

    // Calculate endDate = startDate + service.duration days
    const parsedEndDate = new Date(parsedStartDate);
    parsedEndDate.setDate(parsedEndDate.getDate() + service.duration);

    // Generate receipt number
    const receiptNumber = `RCPT-${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    // Create subscription and payment in a transaction
    const result = await db.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          memberId,
          serviceId,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          status: 'active',
          priceSnapshot: service.price,
          notes: notes || null,
        },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, photo: true },
          },
          service: {
            select: { id: true, name: true, price: true },
          },
        },
      });

      const payment = await tx.payment.create({
        data: {
          subscriptionId: subscription.id,
          memberId,
          amount: service.price,
          paymentDate: paymentDateValue,
          method: paymentMethod,
          receiptNumber,
          createdBy: session.userId,
        },
      });

      return { subscription, payment };
    });

    await createAuditLog({
      userId: session.userId,
      action: 'subscription.create',
      details: {
        subscriptionId: result.subscription.id,
        memberId,
        serviceId,
        priceSnapshot: service.price,
        startDate: parsedStartDate.toISOString(),
        endDate: parsedEndDate.toISOString(),
        paymentId: result.payment.id,
        receiptNumber,
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
    return apiError('Failed to create subscription', 500);
  }
}
