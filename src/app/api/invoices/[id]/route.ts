import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

// GET /api/invoices/[id] - Get single invoice with member, subscription, and payments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    if (!['owner', 'manager'].includes(session.role)) {
      return forbiddenError();
    }

    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, photo: true, phone: true, email: true },
        },
        subscription: {
          select: {
            id: true,
            serviceId: true,
            startDate: true,
            endDate: true,
            status: true,
            priceSnapshot: true,
            service: {
              select: { id: true, name: true, nameAm: true, price: true, duration: true },
            },
          },
        },
        payments: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      return apiError('Invoice not found', 404);
    }

    return apiResponse(invoice);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to fetch invoice', 500);
  }
}

// PUT /api/invoices/[id] - Update invoice status (manager + owner)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    // Validate required field
    if (!status) {
      return apiError('status is required');
    }

    // Validate status value
    if (!['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return apiError('Invalid status. Must be one of: pending, paid, overdue, cancelled');
    }

    // Verify invoice exists
    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing) {
      return apiError('Invoice not found', 404);
    }

    // Build update data
    const updateData: Record<string, unknown> = { status };

    // If status changed to "paid", set paidAt = now
    if (status === 'paid') {
      updateData.paidAt = new Date();
    }

    const invoice = await db.invoice.update({
      where: { id },
      data: updateData,
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, photo: true },
        },
        subscription: {
          select: { id: true, serviceId: true, startDate: true, endDate: true, status: true },
        },
        payments: true,
      },
    });

    // Create audit log entry
    await createAuditLog({
      userId: session.userId,
      action: 'invoice.update',
      details: {
        invoiceId: id,
        previousStatus: existing.status,
        newStatus: status,
        paidAt: status === 'paid' ? new Date().toISOString() : undefined,
      },
      entity: 'invoice',
      entityId: id,
    });

    return apiResponse(invoice);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to update invoice', 500);
  }
}
