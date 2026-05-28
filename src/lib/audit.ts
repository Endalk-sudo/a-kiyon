import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export async function createAuditLog(params: {
  userId?: string;
  action: string;
  details?: Record<string, unknown>;
  entity?: string;
  entityId?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details: params.details ? JSON.stringify(params.details) : null,
        entity: params.entity,
        entityId: params.entityId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      await db.auditLog.create({
        data: {
          userId: null,
          action: params.action,
          details: params.details ? JSON.stringify(params.details) : null,
          entity: params.entity,
          entityId: params.entityId,
        },
      });
    } else {
      throw error;
    }
  }
}
