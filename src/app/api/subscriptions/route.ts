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

// POST /api/subscriptions - Create subscription (manager + owner)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);
    const body = await request.json();
    const { memberId, serviceId, startDate, notes } = body;

    // Validate required fields
    if (!memberId || !serviceId || !startDate) {
      return apiError('memberId, serviceId, and startDate are required');
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

    // Parse startDate: if it looks like "dd/mm/yyyy" (Ethiopian format), parse using parseEthiopianDate
    // Otherwise treat as ISO date string
    let parsedStartDate: Date;
    const dateStr = String(startDate).trim();

    // Check if it matches Ethiopian date format (dd/mm/yyyy or dd-mm-yyyy)
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
        return apiError('Invalid start date format. Use ISO string or Ethiopian dd/mm/yyyy format.');
      }
    }

    // Calculate endDate = startDate + service.duration days
    const parsedEndDate = new Date(parsedStartDate);
    parsedEndDate.setDate(parsedEndDate.getDate() + service.duration);

    // Create subscription and invoice in a transaction
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

      // Create invoice for the subscription
      const invoice = await tx.invoice.create({
        data: {
          memberId,
          subscriptionId: subscription.id,
          amount: service.price,
          status: 'pending',
          dueDate: parsedStartDate,
        },
      });

      return { subscription, invoice };
    });

    // Create audit log entry
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
        invoiceId: result.invoice.id,
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
