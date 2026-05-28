import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await getSessionOrThrow(['owner']);

    if (session.role !== 'owner') {
      return forbiddenError();
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiResponse(users);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    console.error('List users error:', error);
    return apiError('An error occurred while fetching users', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner']);

    if (session.role !== 'owner') {
      return forbiddenError();
    }

    const body = await request.json();
    const { email, name, password, role, phone } = body;

    if (!email || !name || !password || !role) {
      return apiError('Email, name, password, and role are required', 400);
    }

    if (!['owner', 'manager'].includes(role)) {
      return apiError('Role must be "owner" or "manager"', 400);
    }

    // Check if email already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return apiError('A user with this email already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await db.user.create({
      data: {
        email,
        name,
        role,
        phone: phone || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    await db.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: hashedPassword,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'user.create',
      details: { email, name, role },
      entity: 'user',
      entityId: user.id,
    });

    return apiResponse(user, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    console.error('Create user error:', error);
    return apiError('An error occurred while creating user', 500);
  }
}
