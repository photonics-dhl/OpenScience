import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuditEvent, AuditSink } from '@openscience/observability';

/** AuditLog 落库实现：有 tx 走 tx（与业务同事务），否则走持有的 client。 */
export function createPrismaAuditSink(client: PrismaClient): AuditSink {
  return {
    async record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
      const db = tx ?? client;
      await db.auditLog.create({
        data: {
          actorId: event.actorId,
          action: event.action,
          workspaceId: event.workspaceId ?? null,
          targetType: event.targetType ?? null,
          targetId: event.targetId ?? null,
          metadata: event.metadata === undefined ? Prisma.JsonNull : (event.metadata as Prisma.InputJsonValue),
          requestId: event.requestId ?? null,
          ip: event.ip ?? null,
        },
      });
    },
  };
}
