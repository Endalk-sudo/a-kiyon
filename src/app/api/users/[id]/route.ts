import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateUserSchema } from '@/lib/schemas';
import { getUser, updateUser, deactivateUser, UserServiceError } from '@/services/user.service';

function mapUserError(err: UserServiceError): Response {
  switch (err.code) {
    case 'USER_NOT_FOUND':
      return apiError('User not found', 404);
    case 'PHONE_TAKEN':
      return apiError('A user with this phone number already exists', 409);
    case 'SELF_DEMOTE':
      return apiError('You cannot demote yourself');
    case 'SELF_DEACTIVATE':
      return apiError('You cannot deactivate yourself');
    case 'LAST_OWNER':
      return apiError(err.message);
    case 'ALREADY_DEACTIVATED':
      return apiError('User is already deactivated');
  }
}

export const GET = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner'], request);
  const { id } = await params;

  try {
    return apiResponse(await getUser(id));
  } catch (err) {
    if (err instanceof UserServiceError) return mapUserError(err);
    throw err;
  }
});

export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);
  const { id } = await params;

  const body = await request.json();
  const data = updateUserSchema.parse(body);

  try {
    return apiResponse(await updateUser(id, data, session.userId));
  } catch (err) {
    if (err instanceof UserServiceError) return mapUserError(err);
    throw err;
  }
});

export const DELETE = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getSessionOrThrow(['owner'], request);
  const { id } = await params;

  try {
    return apiResponse(await deactivateUser(id, session.userId));
  } catch (err) {
    if (err instanceof UserServiceError) return mapUserError(err);
    throw err;
  }
});
