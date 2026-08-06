import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth';
import { getDocById, updateDoc } from '@/lib/db';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateUserSchema } from '@/lib/schemas';

// Counts active (non-disabled) owners across all Auth pages. Used to guard
// against deactivating/demoting the final active owner.
async function countActiveOwners(): Promise<number> {
  let count = 0;
  let token: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, token);
    for (const user of page.users) {
      if (user.customClaims?.role === 'owner' && !user.disabled) count++;
    }
    token = page.pageToken || undefined;
  } while (token);
  return count;
}

async function isOwner(user: { customClaims?: Record<string, unknown> | null }): Promise<boolean> {
  return user.customClaims?.role === 'owner';
}

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner'], request);
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

  // Self-guard: an owner must not deactivate or demote themselves (matches
  // the DELETE guard — avoids locking the last active owner out).
  const selfDemoting = id === session.userId && data.role !== undefined && data.role !== 'owner';
  const selfDeactivating = id === session.userId && data.isActive === false;
  if (selfDemoting) return apiError('You cannot demote yourself');
  if (selfDeactivating) return apiError('You cannot deactivate yourself');

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

  // Last-owner guard: reject deactivating or demoting the final active owner.
  const demoting = data.role !== undefined && data.role !== 'owner' && await isOwner(userRecord);
  const deactivating = data.isActive === false && await isOwner(userRecord);
  if ((demoting || deactivating) && (await countActiveOwners()) <= 1) {
    return apiError(
      demoting
        ? 'Cannot demote the last active owner'
        : 'Cannot deactivate the last active owner',
    );
  }

  if (Object.keys(authUpdateData).length > 0) {
    await adminAuth.updateUser(id, authUpdateData);
  }

  if (data.role !== undefined && data.role !== userRecord.customClaims?.role) {
    await adminAuth.setCustomUserClaims(id, { role: data.role });
  }

  // Invalidate existing tokens when the user is deactivated or demoted, so
  // they lose access (or lose elevated access) immediately instead of at
  // token expiry. getSession() enforces this via verifyIdToken(token, true).
  const accessChanged = data.isActive === false || (data.role !== undefined && data.role !== userRecord.customClaims?.role);
  if (accessChanged) {
    await adminAuth.revokeRefreshTokens(id);
  }

  if (data.phone !== undefined) {
    await updateDoc('users', id, { phone: data.phone || null });
  }

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

  if (await isOwner(userRecord)) {
    if ((await countActiveOwners()) <= 1) {
      return apiError('Cannot deactivate the last active owner');
    }
  }

  await adminAuth.updateUser(id, { disabled: true });

  // Invalidate existing tokens so the deactivated user loses access
  // immediately instead of at token expiry.
  await adminAuth.revokeRefreshTokens(id);

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
