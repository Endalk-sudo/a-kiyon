import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner']);

    const { id } = await params;
    const body = await request.json();

    const existing = await db.service.findUnique({ where: { id } });
    if (!existing) {
      return apiError('Service not found', 404);
    }

    const { name, nameAm, description, descriptionAm, price, duration, isActive } = body;

    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      return apiError('Price must be a non-negative number');
    }

    if (duration !== undefined && (typeof duration !== 'number' || duration < 1)) {
      return apiError('Duration must be a positive integer (days)');
    }

    const service = await db.service.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAm !== undefined && { nameAm }),
        ...(description !== undefined && { description }),
        ...(descriptionAm !== undefined && { descriptionAm }),
        ...(price !== undefined && { price }),
        ...(duration !== undefined && { duration }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'service.update',
      details: { name, price, duration, isActive },
      entity: 'service',
      entityId: service.id,
    });

    return apiResponse(service);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner']);

    const { id } = await params;

    const existing = await db.service.findUnique({ where: { id } });
    if (!existing) {
      return apiError('Service not found', 404);
    }
    if (!existing.isActive) {
      return apiError('Service is already inactive');
    }

    const service = await db.service.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'service.deactivate',
      details: { name: existing.name },
      entity: 'service',
      entityId: service.id,
    });

    return apiResponse({ message: 'Service deactivated successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}
