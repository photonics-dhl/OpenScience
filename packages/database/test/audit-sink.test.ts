import { describe, expect, it, vi } from 'vitest';
import { createPrismaAuditSink } from '../src/audit-sink';

function stub() {
  const create = vi.fn().mockResolvedValue({});
  return { create, client: { auditLog: { create } } as never };
}

describe('createPrismaAuditSink', () => {
  it('无 tx 时走持有的 client，字段完整映射', async () => {
    const { create, client } = stub();
    const sink = createPrismaAuditSink(client);
    await sink.record({
      actorId: 'u1', action: 'workspace.create', workspaceId: 'w1',
      targetType: 'workspace', targetId: 'w1', metadata: { name: 'Lab' },
      requestId: 'req-1', ip: '127.0.0.1',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'u1', action: 'workspace.create', workspaceId: 'w1',
        targetType: 'workspace', targetId: 'w1', metadata: { name: 'Lab' },
        requestId: 'req-1', ip: '127.0.0.1',
      },
    });
  });

  it('可选字段缺省 → null / JsonNull；有 tx 优先用 tx', async () => {
    const { create, client } = stub();
    const txCreate = vi.fn().mockResolvedValue({});
    const sink = createPrismaAuditSink(client);
    await sink.record({ actorId: null, action: 'auth.login' }, { auditLog: { create: txCreate } } as never);
    expect(create).not.toHaveBeenCalled();
    expect(txCreate).toHaveBeenCalledWith({
      data: {
        actorId: null, action: 'auth.login', workspaceId: null,
        targetType: null, targetId: null, metadata: expect.anything(),
        requestId: null, ip: null,
      },
    });
  });
});
