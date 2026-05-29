import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import bcrypt from 'bcryptjs';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  isActive: true,
  createdAt: true,
} as const;

// GET /api/users/[id] - Get a single user (owner only)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner']);
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      return apiError('User not found', 404);
    }

    return apiResponse(user);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return unauthorizedError();
    if (error instanceof Error && error.message === 'Forbidden') return forbiddenError();
    return apiError('Failed to fetch user', 500);
  }
}

// PUT /api/users/[id] - Update a user (owner only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner']);
    const { id } = await params;

    const body = await request.json();
    const { name, email, role, phone, password, isActive } = body;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return apiError('User not found', 404);
    }

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (email !== undefined) {
      if (!email.trim()) return apiError('Email cannot be empty');
      const duplicate = await db.user.findUnique({ where: { email } });
      if (duplicate && duplicate.id !== id) {
        return apiError('A user with this email already exists', 409);
      }
      updateData.email = email.trim();
    }

    if (role !== undefined) {
      if (!['owner', 'manager'].includes(role)) {
        return apiError('Role must be "owner" or "manager"');
      }
      updateData.role = role;
    }

    if (password) {
      if (password.length < 6) {
        return apiError('Password must be at least 6 characters');
      }
      const hashed = await bcrypt.hash(password, 10);
      await db.account.update({
        where: { providerId_accountId: { providerId: 'credential', accountId: id } },
        data: { password: hashed },
      });
    }

    if (Object.keys(updateData).length === 0) {
      return apiResponse(existing);
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });

    const changedFields = Object.keys(updateData);
    if (changedFields.length > 0) {
      await createAuditLog({
        userId: session.userId,
        action: 'user.update',
        details: { userId: id, changedFields },
        entity: 'user',
        entityId: id,
      });
    }

    return apiResponse(user);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return unauthorizedError();
    if (error instanceof Error && error.message === 'Forbidden') return forbiddenError();
    return apiError('Failed to update user', 500);
  }
}

// DELETE /api/users/[id] - Deactivate a user (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrThrow(['owner']);
    const { id } = await params;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return apiError('User not found', 404);
    }

    if (id === session.userId) {
      return apiError('You cannot deactivate yourself');
    }

    const user = await db.user.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: userSelect,
    });

    await createAuditLog({
      userId: session.userId,
      action: user.isActive ? 'user.activate' : 'user.deactivate',
      details: { userId: id, previousState: existing.isActive, newState: user.isActive },
      entity: 'user',
      entityId: id,
    });

    return apiResponse(user);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return unauthorizedError();
    if (error instanceof Error && error.message === 'Forbidden') return forbiddenError();
    return apiError('Failed to deactivate user', 500);
  }
}
