import { getDocById, getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateMemberSchema } from '@/lib/schemas';
import { getMember, updateMember, softDeleteMember, computeBodyFatPercent } from '@/services/member.service';
import { computeMemberStatus } from '@/lib/member-status';
import { NextRequest } from 'next/server';

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(undefined, request);

  const { id } = await params;
  const member = await getMember(id);

  if (!member) return apiError('Member not found', 404);

  return apiResponse(member);
});

export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner', 'manager'], request);

  const { id } = await params;
  const body = await request.json();
  const data = updateMemberSchema.parse(body);

  const existing = await getDocById<Record<string, unknown>>('members', id);
  if (!existing) return apiError('Member not found', 404);
  if (existing.isDeleted) return apiError('Cannot update a deleted member');

  const merged: {
    sex?: 'male' | 'female' | null;
    height?: number | null;
    neck?: number | null;
    waist?: number | null;
    hip?: number | null;
  } = {
    sex: existing.sex as 'male' | 'female' | null | undefined,
    height: existing.height as number | null | undefined,
    neck: existing.neck as number | null | undefined,
    waist: existing.waist as number | null | undefined,
    hip: existing.hip as number | null | undefined,
  };
  if (data.sex !== undefined) merged.sex = data.sex;
  if (data.height !== undefined) merged.height = data.height;
  if (data.neck !== undefined) merged.neck = data.neck;
  if (data.waist !== undefined) merged.waist = data.waist;
  if (data.hip !== undefined) merged.hip = data.hip;
  const bodyFatPercent = computeBodyFatPercent(merged);

  const member = await updateMember(id, {
    ...(data.firstName !== undefined && { firstName: data.firstName }),
    ...(data.lastName !== undefined && { lastName: data.lastName }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.photo !== undefined && { photo: data.photo }),
    ...(data.photoThumb !== undefined && { photoThumb: data.photoThumb }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.weight !== undefined && { weight: data.weight }),
    ...(data.height !== undefined && { height: data.height }),
    ...(data.bloodType !== undefined && { bloodType: data.bloodType }),
    ...(data.sex !== undefined && { sex: data.sex }),
    ...(data.neck !== undefined && { neck: data.neck }),
    ...(data.waist !== undefined && { waist: data.waist }),
    ...(data.hip !== undefined && { hip: data.hip }),
    bodyFatPercent,
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
  await getSessionOrThrow(['owner', 'manager'], request);

  const { id } = await params;

  const existing = await getDocById<Record<string, unknown>>('members', id);
  if (!existing) return apiError('Member not found', 404);
  if (existing.isDeleted) return apiError('Member is already deleted');

  await softDeleteMember(id);

  return apiResponse({ message: 'Member deleted successfully' });
});
