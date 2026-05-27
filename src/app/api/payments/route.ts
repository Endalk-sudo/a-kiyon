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
          invoice: {
            select: {
              id: true,
              amount: true,
              status: true,
              dueDate: true,
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
    const { invoiceId, memberId, amount, paymentDate, method, notes } = body;

    // Validate required fields
    if (!invoiceId || !memberId || !amount || !paymentDate || !method) {
      return apiError('Missing required fields: invoiceId, memberId, amount, paymentDate, method');
    }

    if (amount <= 0) {
      return apiError('Amount must be greater than 0');
    }

    // Validate method
    const validMethods = ['cash', 'bank_transfer', 'mobile_money'];
    if (!validMethods.includes(method)) {
      return apiError(`Invalid payment method. Must be one of: ${validMethods.join(', ')}`);
    }

    // Verify invoice exists and belongs to member
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return apiError('Invoice not found', 404);
    }

    if (invoice.memberId !== memberId) {
      return apiError('Invoice does not belong to the specified member');
    }

    // Parse payment date
    let paymentDateValue: Date;
    if (typeof paymentDate === 'string') {
      // Try parsing as Ethiopian date first (dd/mm/yyyy format)
      const ethParsed = parseEthiopianDate(paymentDate);
      if (ethParsed.success && ethParsed.date) {
        paymentDateValue = ethParsed.date;
      } else {
        // Try as ISO date string
        const isoDate = new Date(paymentDate);
        if (isNaN(isoDate.getTime())) {
          return apiError('Invalid payment date format. Use dd/mm/yyyy (Ethiopian) or ISO format.');
        }
        paymentDateValue = isoDate;
      }
    } else {
      return apiError('Invalid payment date format');
    }

    // Generate receipt number
    const timestamp = Date.now();
    const random4 = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `RCPT-${timestamp}${random4}`;

    // Create payment
    const payment = await db.payment.create({
      data: {
        invoiceId,
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

    // Check if payment covers the invoice - update invoice status to "paid"
    const totalPaid = await db.payment.aggregate({
      where: {
        invoiceId,
        isVoided: false,
      },
      _sum: {
        amount: true,
      },
    });

    const totalPaidAmount = totalPaid._sum.amount || 0;
    if (totalPaidAmount >= invoice.amount) {
      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'paid',
          paidAt: new Date(),
        },
      });
    }

    // Create audit log entry
    await createAuditLog({
      userId: session.userId,
      action: 'payment.create',
      details: {
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        invoiceId,
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
