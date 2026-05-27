import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

export async function POST(
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
    if (!existing.isDeleted) {
      return apiError('Member is not deleted');
    }

    const member = await db.member.update({
      where: { id },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'member.restore',
      details: { firstName: existing.firstName, lastName: existing.lastName },
      entity: 'member',
      entityId: member.id,
    });

    return apiResponse({ ...member, status: 'no_subscription' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}
