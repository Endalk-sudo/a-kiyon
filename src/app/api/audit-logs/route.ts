import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { paginatedResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';

// GET /api/audit-logs - List audit logs (owner only)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner']);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const entity = searchParams.get('entity');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = {
        contains: action,
      };
    }

    if (entity) {
      where.entity = entity;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const startParsed = parseEthiopianDate(startDate);
        if (startParsed.success && startParsed.date) {
          where.createdAt.gte = startParsed.date;
        } else {
          where.createdAt.gte = new Date(startDate);
        }
      }
      if (endDate) {
        const endParsed = parseEthiopianDate(endDate);
        if (endParsed.success && endParsed.date) {
          const end = endParsed.date;
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        } else {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return paginatedResponse(logs, {
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
    return apiError('Failed to fetch audit logs', 500);
  }
}
