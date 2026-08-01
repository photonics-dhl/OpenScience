import { describe, expect, it, vi } from 'vitest';
import { listAuditLogs } from '../src/audit-logs';

function stubWith(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { findMany, prisma: { auditLog: { findMany } } as never };
}

const ROWS = Array.from({ length: 3 }, (_, i) => ({
  id: `id-${i}`, createdAt: new Date(`2026-08-01T00:00:0${i}Z`), actorId: 'u1',
  action: 'workspace.create', workspaceId: 'w1', targetType: null, targetId: null,
  metadata: null, requestId: null, ip: null,
}));

describe('listAuditLogs', () => {
  it('默认 limit 50、上限 200，倒序取 limit+1 探测下一页', async () => {
    const { findMany, prisma } = stubWith(ROWS);
    await listAuditLogs({ prisma }, {});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
    }));
    await listAuditLogs({ prisma }, { limit: 500 });
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 201 }));
  });

  it('过滤条件映射 where：workspaceId/action/actorId/时间窗', async () => {
    const { findMany, prisma } = stubWith([]);
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-02T00:00:00Z');
    await listAuditLogs({ prisma }, { workspaceId: 'w1', action: 'auth.login', actorId: 'u1', from, to });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'w1', action: 'auth.login', actorId: 'u1',
      createdAt: { gte: from, lte: to },
    });
  });

  it('游标分页：满页给 nextCursor，按 (createdAt,id) 倒序续查', async () => {
    const full = Array.from({ length: 51 }, (_, i) => ({ ...ROWS[0], id: `id-${i}` }));
    const { findMany, prisma } = stubWith(full);
    const page1 = await listAuditLogs({ prisma }, { limit: 50 });
    expect(page1.items).toHaveLength(50);
    expect(page1.nextCursor).toBe(`${full[49].createdAt.toISOString()}|id-49`);
    await listAuditLogs({ prisma }, { cursor: page1.nextCursor! });
    const where = findMany.mock.calls[1][0].where;
    expect(where.OR).toEqual([
      { createdAt: { lt: full[49].createdAt } },
      { createdAt: full[49].createdAt, id: { lt: 'id-49' } },
    ]);
  });

  it('不足一页 nextCursor=null', async () => {
    const { prisma } = stubWith(ROWS);
    const r = await listAuditLogs({ prisma }, {});
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBeNull();
  });
});
