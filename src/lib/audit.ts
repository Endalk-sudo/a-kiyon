import { db } from './db';

interface AuditParams {
  userId?: string;
  action: string;
  details?: Record<string, unknown>;
  entity?: string;
  entityId?: string;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      userId: params.userId || null,
      action: params.action,
      details: params.details ? JSON.stringify(params.details) : null,
      entity: params.entity || null,
      entityId: params.entityId || null,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // silent — never crash the main operation
  }
}
