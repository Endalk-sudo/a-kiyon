import { adminAuth } from '@/lib/auth';
import { createDoc, updateDoc } from '@/lib/db';

export async function listUsers(page?: number, limit?: number) {
  // listUsers() caps at 1000 per page — walk all pages so clubs with more
  // users aren't silently truncated.
  const users = [];
  let token: string | undefined;
  do {
    const result = await adminAuth.listUsers(1000, token);
    for (const u of result.users) {
      users.push({
        id: u.uid,
        email: u.email || '',
        name: u.displayName || '',
        role: (u.customClaims?.role as string) || 'manager',
        phone: (u.customClaims?.phone as string) || null,
        isActive: !u.disabled,
        createdAt: u.metadata.creationTime || '',
      });
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

export async function getUser(id: string) {
  const u = await adminAuth.getUser(id);
  return {
    id: u.uid,
    email: u.email || '',
    name: u.displayName || '',
    role: (u.customClaims?.role as string) || 'manager',
    phone: (u.customClaims?.phone as string) || null,
    isActive: !u.disabled,
    createdAt: u.metadata.creationTime || '',
  };
}

export async function createUser(data: {
  email: string;
  name: string;
  password: string;
  role: string;
  phone?: string | null;
}) {
  const userRecord = await adminAuth.createUser({
    email: data.email,
    password: data.password,
    displayName: data.name,
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role: data.role,
    phone: data.phone || null,
  });

  await createDoc('users', {
    id: userRecord.uid,
    phone: data.phone || null,
  });

  return {
    id: userRecord.uid,
    email: data.email,
    name: data.name,
    role: data.role,
    phone: data.phone || null,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

export async function updateUser(id: string, data: { name?: string; role?: string; phone?: string | null }) {
  const authUpdate: Record<string, unknown> = {};
  if (data.name) authUpdate.displayName = data.name;
  if (Object.keys(authUpdate).length > 0) {
    await adminAuth.updateUser(id, authUpdate);
  }

  if (data.role || data.phone !== undefined) {
    const current = await adminAuth.getUser(id);
    await adminAuth.setCustomUserClaims(id, {
      ...current.customClaims,
      ...(data.role ? { role: data.role } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
    });
  }

  if (data.phone !== undefined) {
    await updateDoc('users', id, { phone: data.phone });
  }

  const u = await adminAuth.getUser(id);
  return {
    id: u.uid,
    email: u.email || '',
    name: u.displayName || '',
    role: (u.customClaims?.role as string) || 'manager',
    phone: (u.customClaims?.phone as string) || null,
    isActive: !u.disabled,
    createdAt: u.metadata.creationTime || '',
  };
}

export async function toggleUserActive(id: string) {
  const current = await adminAuth.getUser(id);
  await adminAuth.updateUser(id, { disabled: !current.disabled });

  const u = await adminAuth.getUser(id);
  return {
    id: u.uid,
    email: u.email || '',
    name: u.displayName || '',
    role: (u.customClaims?.role as string) || 'manager',
    phone: (u.customClaims?.phone as string) || null,
    isActive: !u.disabled,
    createdAt: u.metadata.creationTime || '',
  };
}
