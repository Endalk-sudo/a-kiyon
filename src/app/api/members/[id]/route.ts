import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

type MemberStatus = 'active' | 'expiring_soon' | 'expired' | 'no_subscription';

function computeStatus(subscriptions: { endDate: Date; status: string }[]): MemberStatus {
  if (subscriptions.length === 0) return 'no_subscription';

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const hasActive = subscriptions.some(
    (s) => s.endDate >= now && s.status !== 'cancelled'
  );
  const hasExpiringSoon = subscriptions.some(
    (s) => s.endDate >= now && s.endDate <= sevenDaysFromNow && s.status !== 'cancelled'
  );

  if (hasExpiringSoon) return 'expiring_soon';
  if (hasActive) return 'active';
  return 'expired';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow();
    if (!session) return unauthorizedError();

    const { id } = await params;

    const member = await db.member.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: {
            service: { select: { id: true, name: true, nameAm: true, price: true } },
            payments: {
              where: { isVoided: false },
              orderBy: { paymentDate: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          include: {
            subscription: {
              select: { service: { select: { name: true } } },
            },
          },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!member) {
      return apiError('Member not found', 404);
    }

    const status = computeStatus(member.subscriptions);

    return apiResponse({ ...member, status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const { id } = await params;
    const body = await request.json();

    const existing = await db.member.findUnique({ where: { id } });
    if (!existing) {
      return apiError('Member not found', 404);
    }
    if (existing.isDeleted) {
      return apiError('Cannot update a deleted member');
    }

    const {
      firstName, lastName, phone, photo,
      address, weight, height, bloodType,
      emergencyContact, notes,
    } = body;

    const member = await db.member.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(photo !== undefined && { photo }),
        ...(address !== undefined && { address }),
        ...(weight !== undefined && { weight: weight ? parseFloat(String(weight)) : null }),
        ...(height !== undefined && { height: height ? parseFloat(String(height)) : null }),
        ...(bloodType !== undefined && { bloodType }),
        ...(emergencyContact !== undefined && { emergencyContact }),
        ...(notes !== undefined && { notes }),
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'member.update',
      details: { firstName, lastName, phone },
      entity: 'member',
      entityId: member.id,
    });

    // Compute status for updated member
    const subscriptions = await db.subscription.findMany({
      where: { memberId: id },
      select: { endDate: true, status: true },
    });
    const status = computeStatus(subscriptions);

    return apiResponse({ ...member, status });
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

    const existing = await db.member.findUnique({ where: { id } });
    if (!existing) {
      return apiError('Member not found', 404);
    }
    if (existing.isDeleted) {
      return apiError('Member is already deleted');
    }

    const member = await db.member.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'member.delete',
      details: { firstName: existing.firstName, lastName: existing.lastName },
      entity: 'member',
      entityId: member.id,
    });

    return apiResponse({ message: 'Member deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}
