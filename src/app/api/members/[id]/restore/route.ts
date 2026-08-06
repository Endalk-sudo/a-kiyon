import { getDocById, getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { computeMemberStatus } from '@/lib/member-status';
import { restoreMember } from '@/services/member.service';
import { NextRequest } from 'next/server';

export const POST = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner', 'manager'], request);

  const { id } = await params;

  const existing = await getDocById<Record<string, unknown>>('members', id);
  if (!existing) return apiError('Member not found', 404);
  if (!existing.isDeleted) return apiError('Member is not deleted');

  const member = await restoreMember(id);

  // Status is derived from the member's subscriptions — never stored.
  const subs = await getDocs<{ endDate: string; status: string }>('subscriptions', [['memberId', '==', id]]);

  return apiResponse({ ...member, status: computeMemberStatus(subs) });
});
