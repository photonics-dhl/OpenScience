import type { Prisma } from '@prisma/client';
import type { AuditContext, AuditEvent } from '@openscience/observability';
import type { WorkspaceDeps } from './types';

/** 在业务事务内写审计行；ctx 由 API 层组装（requestId/ip）。audit 缺省为 no-op。 */
export async function recordAudit(
  deps: WorkspaceDeps,
  tx: Prisma.TransactionClient,
  event: Omit<AuditEvent, 'requestId' | 'ip'>,
  ctx: AuditContext,
): Promise<void> {
  await deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip }, tx);
}
