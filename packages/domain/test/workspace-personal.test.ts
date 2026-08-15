import { describe, expect, it } from 'vitest';
import { createPersonalWorkspace } from '../src/workspace/personal';
import { createFakePrisma } from './helpers/fakes';

describe('createPersonalWorkspace', () => {
  it('首次建个人空间时按当期 policy 幂等发放一笔月度 AI Credit', async () => {
    const { prisma, db } = createFakePrisma();
    db.quotaPolicies.push({
      id: 'policy-ai-credit',
      scope: 'global',
      scopeKey: null,
      resource: 'ai_credit',
      limitValue: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createPersonalWorkspace(
      prisma,
      { id: 'u1', email: 'a@example.com', displayName: 'Alice' },
      new Date('2026-08-09T00:00:00.000Z'),
    );
    await createPersonalWorkspace(
      prisma,
      { id: 'u1', email: 'a@example.com', displayName: 'Alice' },
      new Date('2026-08-09T12:00:00.000Z'),
    );

    expect(db.usageLedger).toHaveLength(1);
    expect(db.usageLedger[0]).toMatchObject({
      userId: 'u1',
      resource: 'ai_credit',
      delta: 500n,
      kind: 'monthly_grant',
      period: '2026-08',
      idempotencyKey: 'monthly-ai-credit:u1:2026-08',
    });
  });

  it('创建 personal workspace + owner membership', async () => {
    const { prisma, db } = createFakePrisma();
    await createPersonalWorkspace(prisma, { id: 'u1', email: 'a@example.com', displayName: 'Alice' });
    expect(db.workspaces).toHaveLength(1);
    expect(db.workspaces[0]).toMatchObject({ type: 'personal', ownerId: 'u1', name: 'Alice 的个人空间' });
    expect(db.memberships).toHaveLength(1);
    expect(db.memberships[0]).toMatchObject({ userId: 'u1', role: 'owner', workspaceId: db.workspaces[0].id });
  });

  it('重复调用幂等：返回既有空间，不重复建行', async () => {
    const { prisma, db } = createFakePrisma();
    const user = { id: 'u1', email: 'a@example.com', displayName: 'Alice' };
    await createPersonalWorkspace(prisma, user);
    await createPersonalWorkspace(prisma, user);
    expect(db.workspaces).toHaveLength(1);
    expect(db.memberships).toHaveLength(1);
  });

  it('并发撞部分唯一索引（P2002）时静默成功', async () => {
    const { prisma, db } = createFakePrisma();
    const user = { id: 'u1', email: 'a@example.com', displayName: 'Alice' };
    await Promise.all([
      createPersonalWorkspace(prisma, user),
      createPersonalWorkspace(prisma, user),
    ]);
    expect(db.workspaces).toHaveLength(1);
  });

  it('displayName 空白时回退邮箱前缀命名', async () => {
    const { prisma, db } = createFakePrisma();
    await createPersonalWorkspace(prisma, { id: 'u1', email: 'bob@example.com', displayName: '  ' });
    expect(db.workspaces[0].name).toBe('bob 的个人空间');
  });
});
