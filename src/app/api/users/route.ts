import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth';
import { createDocWithId } from '@/lib/db';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createUserSchema } from '@/lib/schemas';

export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner'], request);

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '');
  const limit = parseInt(searchParams.get('limit') || '');

  const listUsersResult = await adminAuth.listUsers(1000);
  let users = listUsersResult.users.map(u => ({
    id: u.uid,
    email: u.email || '',
    name: u.displayName || '',
    role: (u.customClaims?.role as string) || 'manager',
    phone: (u.customClaims?.phone as string) || null,
    isActive: !u.disabled,
    createdAt: u.metadata.creationTime,
  }));

  if (page && limit) {
    const total = users.length;
    const start = (page - 1) * limit;
    const paged = users.slice(start, start + limit);
    return apiResponse({
      data: paged,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  }

  return apiResponse({ data: users });
});

export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner'], request);

  const body = await request.json();
  const data = createUserSchema.parse(body);

  try {
    const existing = await adminAuth.getUserByEmail(data.email);
    if (existing) return apiError('A user with this email already exists', 409);
  } catch {
    // user not found — proceed
  }

  const userRecord = await adminAuth.createUser({
    email: data.email,
    displayName: data.name,
    password: data.password,
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, { role: data.role });

  if (data.phone) {
    await createDocWithId('users', userRecord.uid, { phone: data.phone });
  }

  return apiResponse({
    id: userRecord.uid,
    email: data.email,
    name: data.name,
    role: data.role,
    phone: data.phone || null,
    isActive: true,
    createdAt: userRecord.metadata.creationTime,
  }, 201);
});
