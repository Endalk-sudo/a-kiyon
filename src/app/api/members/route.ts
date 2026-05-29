import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { paginatedResponse, apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

type MemberStatus = 'active' | 'expiring_soon' | 'expired' | 'no_subscription';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    if (!session) return unauthorizedError();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const showDeleted = searchParams.get('showDeleted') === 'true';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (!showDeleted) {
      where.isDeleted = false;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [members, total] = await Promise.all([
      db.member.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: {
            select: { id: true, endDate: true, status: true, serviceId: true },
          },
        },
      }),
      db.member.count({ where }),
    ]);

    // Compute status for each member
    const membersWithStatus = members.map((member) => {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const subs = member.subscriptions;
      let status: MemberStatus = 'no_subscription';

      if (subs.length > 0) {
        const hasActive = subs.some(
          (s) => s.endDate >= now && s.status !== 'cancelled'
        );
        const hasExpiringSoon = subs.some(
          (s) => s.endDate >= now && s.endDate <= sevenDaysFromNow && s.status !== 'cancelled'
        );
        const allExpired = subs.every(
          (s) => s.endDate < now || s.status === 'cancelled'
        );

        if (hasExpiringSoon) status = 'expiring_soon';
        else if (hasActive) status = 'active';
        else if (allExpired) status = 'expired';
        else status = 'expired';
      }

      const { subscriptions: _subscriptions, ...memberData } = member;
      return { ...memberData, status };
    });

    // Filter by status if requested
    let filtered = membersWithStatus;
    if (statusFilter) {
      filtered = membersWithStatus.filter((m) => m.status === statusFilter);
    }

    const totalPages = Math.ceil(total / limit);

    return paginatedResponse(filtered, { total, page, limit, totalPages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const body = await request.json();
    const {
      firstName, lastName, phone, photo,
      address, weight, height, bloodType,
      emergencyContact, notes,
    } = body;

    if (!firstName || !lastName) {
      return apiError('First name and last name are required');
    }

    const member = await db.member.create({
      data: {
        firstName,
        lastName,
        phone: phone || null,
        photo: photo || null,
        address: address || null,
        weight: weight ? parseFloat(String(weight)) : null,
        height: height ? parseFloat(String(height)) : null,
        bloodType: bloodType || null,
        emergencyContact: emergencyContact || null,
        notes: notes || null,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'member.create',
      details: { firstName, lastName, phone },
      entity: 'member',
      entityId: member.id,
    });

    return apiResponse({ ...member, status: 'no_subscription' }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}
