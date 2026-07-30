import { getDocById } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { restoreMember } from '@/services/member.service';
import { NextRequest } from 'next/server';

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);

  const { id } = await params;

  const existing = await getDocById<Record<string, unknown>>('members', id);
  if (!existing) return apiError('Member not found', 404);
  if (!existing.isDeleted) return apiError('Member is not deleted');

  const member = await restoreMember(id);

  await createAuditLog({
    userId: session.userId,
    action: 'member.restore',
    details: { firstName: existing.firstName as string, lastName: existing.lastName as string },
    entity: 'member',
    entityId: member!.id,
  });

  return apiResponse({ ...member, status: 'no_subscription' });
});
