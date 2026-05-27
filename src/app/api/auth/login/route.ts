import { NextRequest } from 'next/server';
import { login, encodeSession } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return apiError('Email and password are required', 400);
    }

    const session = await login(email, password);

    if (!session) {
      return apiError('Invalid email or password', 401);
    }

    const token = encodeSession(session);

    const response = apiResponse({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      expiresAt: session.expiresAt,
    });

    response.cookies.set('fcms_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return apiError('An error occurred during login', 500);
  }
}
