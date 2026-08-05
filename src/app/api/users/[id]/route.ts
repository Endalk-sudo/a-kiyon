import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth';
import { getDocById, updateDoc } from '@/lib/db';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateUserSchema } from '@/lib/schemas';

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);
  const { id } = await params;

  let userRecord;
  try {
    userRecord = await adminAuth.getUser(id);
  } catch {
    return apiError('User not found', 404);
  }

  const suppData = await getDocById<{ phone?: string }>('users', id);

  return apiResponse({
    id: userRecord.uid,
    email: userRecord.email || '',
    name: userRecord.displayName || '',
    role: (userRecord.customClaims?.role as string) || 'manager',
    phone: suppData?.phone || null,
    isActive: !userRecord.disabled,
    createdAt: userRecord.metadata.creationTime,
  });
});

export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);
  const { id } = await params;

  const body = await request.json();
  const data = updateUserSchema.parse(body);

  let userRecord;
  try {
    userRecord = await adminAuth.getUser(id);
  } catch {
    return apiError('User not found', 404);
  }

  const authUpdateData: Record<string, unknown> = {};
  if (data.email !== undefined) {
    try {
      const existingByEmail = await adminAuth.getUserByEmail(data.email);
      if (existingByEmail.uid !== id) return apiError('A user with this email already exists', 409);
    } catch {
      // not found — ok
    }
    authUpdateData.email = data.email;
  }
  if (data.name !== undefined) authUpdateData.displayName = data.name;
  if (data.password !== undefined) authUpdateData.password = data.password;
  if (data.isActive !== undefined) authUpdateData.disabled = !data.isActive;

  if (Object.keys(authUpdateData).length > 0) {
    await adminAuth.updateUser(id, authUpdateData);
  }

  if (data.role !== undefined && data.role !== userRecord.customClaims?.role) {
    await adminAuth.setCustomUserClaims(id, { role: data.role });
  }

  if (data.phone !== undefined) {
    await updateDoc('users', id, { phone: data.phone || null });
  }

  const updatedUser = await adminAuth.getUser(id);
  const suppData = await getDocById<{ phone?: string }>('users', id);

  const changedFields = Object.keys(data);
  if (changedFields.length > 0) {
  }

  return apiResponse({
    id: updatedUser.uid,
    email: updatedUser.email || '',
    name: updatedUser.displayName || '',
    role: (updatedUser.customClaims?.role as string) || 'manager',
    phone: suppData?.phone || null,
    isActive: !updatedUser.disabled,
    createdAt: updatedUser.metadata.creationTime,
  });
});

export const DELETE = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);
  const { id } = await params;

  if (id === session.userId) return apiError('You cannot deactivate yourself');

  let userRecord;
  try {
    userRecord = await adminAuth.getUser(id);
  } catch {
    return apiError('User not found', 404);
  }

  if (userRecord.disabled) return apiError('User is already deactivated');

  await adminAuth.updateUser(id, { disabled: true });

  const updatedUser = await adminAuth.getUser(id);
  const suppData = await getDocById<{ phone?: string }>('users', id);

  return apiResponse({
    id: updatedUser.uid,
    email: updatedUser.email || '',
    name: updatedUser.displayName || '',
    role: (updatedUser.customClaims?.role as string) || 'manager',
    phone: suppData?.phone || null,
    isActive: !updatedUser.disabled,
    createdAt: updatedUser.metadata.creationTime,
  });
});
