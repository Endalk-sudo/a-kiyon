import { adminAuth } from '@/lib/auth';
import { createDocWithId, updateDoc, db } from '@/lib/db';
import { normalizePhone, phoneToEmail, emailToPhone } from '@/lib/phone-auth';

export class UserServiceError extends Error {
  constructor(
    public code: 'USER_NOT_FOUND' | 'PHONE_TAKEN' | 'SELF_DEMOTE' | 'SELF_DEACTIVATE' | 'LAST_OWNER' | 'ALREADY_DEACTIVATED',
    message: string,
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

async function isOwner(user: { customClaims?: Record<string, unknown> | null }): Promise<boolean> {
  return user.customClaims?.role === 'owner';
}

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

// Serializes owner-demotion/deactivation checks so two concurrent operations
// can't each see count=2 and both proceed, leaving zero active owners.
// The lock doc write makes the transactions conflict; runTransaction retries
// the loser, which then re-counts after the winner committed.
async function countActiveOwnersSerialized(): Promise<number> {
  return db.runTransaction(async (tx) => {
    const lockRef = db.collection('meta').doc('admin-ops');
    await tx.get(lockRef);
    const count = await countActiveOwners();
    tx.set(lockRef, { updatedAt: new Date().toISOString() });
    return count;
  });
}

function toUserRecord(u: { uid: string; email?: string; displayName?: string; customClaims?: Record<string, unknown> | null; disabled: boolean; metadata: { creationTime?: string } }) {
  return {
    id: u.uid,
    email: u.email || '',
    name: u.displayName || '',
    role: (u.customClaims?.role as string) || 'manager',
    phone: (u.customClaims?.phone as string) || emailToPhone(u.email || '') || null,
    isActive: !u.disabled,
    createdAt: u.metadata.creationTime || '',
  };
}

async function getUserOrThrow(id: string) {
  try {
    return await adminAuth.getUser(id);
  } catch {
    throw new UserServiceError('USER_NOT_FOUND', 'User not found');
  }
}

export async function getUser(id: string) {
  return toUserRecord(await getUserOrThrow(id));
}

export async function listUsers(page?: number, limit?: number) {
  // listUsers() caps at 1000 per page — walk all pages so clubs with more
  // users aren't silently truncated.
  const users = [];
  let token: string | undefined;
  do {
    const result = await adminAuth.listUsers(1000, token);
    for (const u of result.users) {
      users.push(toUserRecord(u));
    }
    token = result.pageToken || undefined;
  } while (token);

  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (page && limit) {
    const start = (page - 1) * limit;
    return {
      data: users.slice(start, start + limit),
      pagination: { total: users.length, page, limit, totalPages: Math.ceil(users.length / limit) },
    };
  }

  return { data: users };
}

export async function createUser(data: {
  phone: string;
  name: string;
  password: string;
  role: string;
}) {
  const phone = normalizePhone(data.phone);
  const userRecord = await adminAuth.createUser({
    email: phoneToEmail(phone),
    password: data.password,
    displayName: data.name,
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role: data.role,
    phone,
  });

  await createDocWithId('users', userRecord.uid, {
    phone,
  });

  return {
    id: userRecord.uid,
    email: phoneToEmail(phone),
    name: data.name,
    role: data.role,
    phone,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

export interface UpdateUserInput {
  name?: string;
  role?: string;
  phone?: string | null;
  password?: string;
  isActive?: boolean;
}

export async function updateUser(id: string, data: UpdateUserInput, actorId?: string) {
  const userRecord = await getUserOrThrow(id);

  // Self-guard: an owner must not deactivate or demote themselves (matches
  // the deactivate guard — avoids locking the last active owner out).
  if (actorId && actorId === id) {
    if (data.role !== undefined && data.role !== 'owner') {
      throw new UserServiceError('SELF_DEMOTE', 'You cannot demote yourself');
    }
    if (data.isActive === false) {
      throw new UserServiceError('SELF_DEACTIVATE', 'You cannot deactivate yourself');
    }
  }

  const authUpdate: Record<string, unknown> = {};
  if (data.name !== undefined) authUpdate.displayName = data.name;
  if (data.password !== undefined) authUpdate.password = data.password;
  if (data.isActive !== undefined) authUpdate.disabled = !data.isActive;
  if (data.phone !== undefined && data.phone !== null) {
    const email = phoneToEmail(normalizePhone(data.phone));
    try {
      const existing = await adminAuth.getUserByEmail(email);
      if (existing.uid !== id) {
        throw new UserServiceError('PHONE_TAKEN', 'A user with this phone number already exists');
      }
    } catch (err) {
      if (err instanceof UserServiceError) throw err;
      // not found — ok
    }
    authUpdate.email = email;
  }

  // Last-owner guard: reject deactivating or demoting the final active owner.
  const demoting = data.role !== undefined && data.role !== 'owner' && (await isOwner(userRecord));
  const deactivating = data.isActive === false && (await isOwner(userRecord));
  if ((demoting || deactivating) && (await countActiveOwnersSerialized()) <= 1) {
    throw new UserServiceError(
      'LAST_OWNER',
      demoting ? 'Cannot demote the last active owner' : 'Cannot deactivate the last active owner',
    );
  }

  if (Object.keys(authUpdate).length > 0) {
    await adminAuth.updateUser(id, authUpdate);
  }

  const claimsChanged = data.role !== undefined && data.role !== userRecord.customClaims?.role;
  const phoneChanged = data.phone !== undefined;
  if (claimsChanged || phoneChanged) {
    await adminAuth.setCustomUserClaims(id, {
      ...(userRecord.customClaims || {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(phoneChanged ? { phone: data.phone ? normalizePhone(data.phone) : null } : {}),
    });
  }

  // Invalidate existing tokens when the user is deactivated or demoted, so
  // they lose access (or lose elevated access) immediately instead of at
  // token expiry. getSession() enforces this via verifyIdToken(token, true).
  const accessChanged = data.isActive === false || (data.role !== undefined && data.role !== userRecord.customClaims?.role);
  if (accessChanged) {
    await adminAuth.revokeRefreshTokens(id);
  }

  if (data.phone !== undefined) {
    await updateDoc('users', id, { phone: data.phone ? normalizePhone(data.phone) : null });
  }

  return toUserRecord(await getUserOrThrow(id));
}

export async function deactivateUser(id: string, actorId?: string) {
  if (actorId && actorId === id) {
    throw new UserServiceError('SELF_DEACTIVATE', 'You cannot deactivate yourself');
  }

  const userRecord = await getUserOrThrow(id);
  if (userRecord.disabled) {
    throw new UserServiceError('ALREADY_DEACTIVATED', 'User is already deactivated');
  }

  if (await isOwner(userRecord)) {
    if ((await countActiveOwnersSerialized()) <= 1) {
      throw new UserServiceError('LAST_OWNER', 'Cannot deactivate the last active owner');
    }
  }

  await adminAuth.updateUser(id, { disabled: true });

  // Invalidate existing tokens so the deactivated user loses access
  // immediately instead of at token expiry.
  await adminAuth.revokeRefreshTokens(id);

  return toUserRecord(await getUserOrThrow(id));
}

export async function toggleUserActive(id: string) {
  const current = await getUserOrThrow(id);
  await adminAuth.updateUser(id, { disabled: !current.disabled });

  return toUserRecord(await getUserOrThrow(id));
}
