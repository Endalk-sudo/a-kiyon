import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth';
import { createDocWithId } from '@/lib/db';
import { apiResponse, apiError, parseIntParam } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createUserSchema } from '@/lib/schemas';
import { listUsers } from '@/services/user.service';

export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);

  const { searchParams } = request.nextUrl;
  const page = parseIntParam(searchParams.get('page'), 0);
  const limit = parseIntParam(searchParams.get('limit'), 0);

  // Service walks every Auth page (>1000 users) and sorts by creation date.
  return apiResponse(await listUsers(page || undefined, limit || undefined));
});

export const POST = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);

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
  }).catch((e: unknown) => {
    // Close the check-then-create race: the pre-check above can pass while a
    // concurrent request creates the same email first.
    if ((e as { code?: string })?.code === 'auth/email-already-exists') {
      return null;
    }
    throw e;
  });

  if (!userRecord) return apiError('A user with this email already exists', 409);

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
