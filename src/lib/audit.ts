import { db } from '@/lib/db';

export async function createAuditLog(params: {
  userId?: string;
  action: string;
  details?: Record<string, unknown>;
  entity?: string;
  entityId?: string;
}) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      details: params.details ? JSON.stringify(params.details) : null,
      entity: params.entity,
      entityId: params.entityId,
    },
  });
}
