import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/auth';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError, parseIntParam } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createUserSchema } from '@/lib/schemas';
import { normalizePhone, phoneToEmail } from '@/lib/phone-auth';
import { createUser, listUsers } from '@/services/user.service';

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
  const email = phoneToEmail(normalizePhone(data.phone));

  try {
    const existing = await adminAuth.getUserByEmail(email);
    if (existing) return apiError('A user with this phone number already exists', 409);
  } catch {
    // user not found — proceed
  }

  try {
    return apiResponse(await createUser(data), 201);
  } catch (e: unknown) {
    // Close the check-then-create race: the pre-check above can pass while a
    // concurrent request creates the same phone first.
    if ((e as { code?: string })?.code === 'auth/email-already-exists') {
      return apiError('A user with this phone number already exists', 409);
    }
    throw e;
  }
});
