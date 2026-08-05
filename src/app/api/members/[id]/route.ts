import { getDocById, getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateMemberSchema } from '@/lib/schemas';
import { getMember, updateMember, softDeleteMember } from '@/services/member.service';
import { computeMemberStatus } from '@/lib/member-status';
import { NextRequest } from 'next/server';

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(undefined, request);

  const { id } = await params;
  const member = await getMember(id);

  if (!member) return apiError('Member not found', 404);

  return apiResponse(member);
});

export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const { id } = await params;
  const body = await request.json();
  const data = updateMemberSchema.parse(body);

  const existing = await getDocById<Record<string, unknown>>('members', id);
  if (!existing) return apiError('Member not found', 404);
  if (existing.isDeleted) return apiError('Cannot update a deleted member');

  const member = await updateMember(id, {
    ...(data.firstName !== undefined && { firstName: data.firstName }),
    ...(data.lastName !== undefined && { lastName: data.lastName }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.photo !== undefined && { photo: data.photo }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.weight !== undefined && { weight: data.weight }),
    ...(data.height !== undefined && { height: data.height }),
    ...(data.bloodType !== undefined && { bloodType: data.bloodType }),
    ...(data.emergencyContact !== undefined && { emergencyContact: data.emergencyContact }),
    ...(data.notes !== undefined && { notes: data.notes }),
  });

  const subs = await getDocs<{ endDate: string; status: string }>('subscriptions', [['memberId', '==', id]]);

  return apiResponse({ ...member, status: computeMemberStatus(subs) });
});

export const DELETE = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);

  const { id } = await params;

  const existing = await getDocById<Record<string, unknown>>('members', id);
  if (!existing) return apiError('Member not found', 404);
  if (existing.isDeleted) return apiError('Member is already deleted');

  const member = await softDeleteMember(id);

  return apiResponse({ message: 'Member deleted successfully' });
});
