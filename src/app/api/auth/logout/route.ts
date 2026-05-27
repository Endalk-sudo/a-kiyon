import { apiResponse } from '@/lib/api';

export async function POST() {
  const response = apiResponse({ message: 'Logged out successfully' });

  response.cookies.set('fcms_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}
