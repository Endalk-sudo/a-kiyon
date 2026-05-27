import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { paginatedResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

// GET /api/invoices - List invoices with server-side pagination
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
    const status = searchParams.get('status') || undefined;

    const where: Record<string, unknown> = {};
    if (memberId) where.memberId = memberId;
    if (status) where.status = status;

    // Mark overdue: any "pending" invoice with dueDate < today should be "overdue"
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.invoice.updateMany({
      where: {
        status: 'pending',
        dueDate: { lt: today },
      },
      data: {
        status: 'overdue',
      },
    });

    const [total, invoices] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, photo: true },
          },
          subscription: {
            select: { id: true, serviceId: true, startDate: true, endDate: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return paginatedResponse(invoices, {
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
    return apiError('Failed to fetch invoices', 500);
  }
}
