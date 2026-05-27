import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    if (!session) return unauthorizedError();

    const { searchParams } = request.nextUrl;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const where = includeInactive ? {} : { isActive: true };

    const services = await db.service.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return apiResponse({ data: services });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner']);

    const body = await request.json();
    const { name, nameAm, description, descriptionAm, price, duration, isActive } = body;

    if (!name || price === undefined || duration === undefined) {
      return apiError('Name, price, and duration are required');
    }

    if (typeof price !== 'number' || price < 0) {
      return apiError('Price must be a non-negative number');
    }

    if (typeof duration !== 'number' || duration < 1) {
      return apiError('Duration must be a positive integer (days)');
    }

    const service = await db.service.create({
      data: {
        name,
        nameAm: nameAm || null,
        description: description || null,
        descriptionAm: descriptionAm || null,
        price,
        duration,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'service.create',
      details: { name, price, duration },
      entity: 'service',
      entityId: service.id,
    });

    return apiResponse(service, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}
