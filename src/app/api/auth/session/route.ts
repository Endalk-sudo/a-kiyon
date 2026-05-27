import { getSession } from '@/lib/auth';
import { apiResponse, unauthorizedError } from '@/lib/api';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return unauthorizedError();
    }

    return apiResponse({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('Session error:', error);
    return unauthorizedError();
  }
}
