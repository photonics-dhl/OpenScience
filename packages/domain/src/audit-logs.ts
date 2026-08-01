import type { AuditLog, Prisma, PrismaClient } from '@prisma/client';

export interface AuditLogQuery {
  workspaceId?: string;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  /** `<createdAtISO>|<id>`，上一页响应的 nextCursor 原样回传。 */
  cursor?: string;
  limit?: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** 平台级审计查询（/admin 用）：过滤 + (createdAt,id) 倒序游标分页。 */
export async function listAuditLogs(
  deps: { prisma: PrismaClient },
  query: AuditLogQuery,
): Promise<AuditLogPage> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const where: Prisma.AuditLogWhereInput = {};
  if (query.workspaceId) where.workspaceId = query.workspaceId;
  if (query.action) where.action = query.action;
  if (query.actorId) where.actorId = query.actorId;
  if (query.from || query.to) {
    where.createdAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
  }
  if (query.cursor) {
    const sep = query.cursor.indexOf('|');
    const at = new Date(query.cursor.slice(0, sep));
    const id = query.cursor.slice(sep + 1);
    where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
  }
  const rows = await deps.prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null;
  return { items, nextCursor };
}
