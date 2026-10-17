import { describe, expect, it } from 'vitest';
import { createPersonalWorkspace } from '../src/workspace/personal';
import { createFakePrisma, seedUser } from './helpers/fakes';
import { applyMonthlyGrants } from '../src/usage/grants';
import { getUsageSnapshot } from '../src/usage/snapshot';

describe('createPersonalWorkspace', () => {
  it('首次建个人空间时按当期 policy 幂等发放一笔月度 AI Credit', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db, { id: 'u1' });
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
    seedUser(db, { id: 'u1' });
    await createPersonalWorkspace(prisma, { id: 'u1', email: 'a@example.com', displayName: 'Alice' });
    expect(db.workspaces).toHaveLength(1);
    expect(db.workspaces[0]).toMatchObject({ type: 'personal', ownerId: 'u1', name: 'Alice 的个人空间' });
    expect(db.memberships).toHaveLength(1);
    expect(db.memberships[0]).toMatchObject({ userId: 'u1', role: 'owner', workspaceId: db.workspaces[0].id });
  });

  it('重复调用幂等：返回既有空间，不重复建行', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db, { id: 'u1' });
    const user = { id: 'u1', email: 'a@example.com', displayName: 'Alice' };
    await createPersonalWorkspace(prisma, user);
    await createPersonalWorkspace(prisma, user);
    expect(db.workspaces).toHaveLength(1);
    expect(db.memberships).toHaveLength(1);
  });

  it('并发撞部分唯一索引（P2002）时静默成功', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db, { id: 'u1' });
    const user = { id: 'u1', email: 'a@example.com', displayName: 'Alice' };
    await Promise.all([
      createPersonalWorkspace(prisma, user),
      createPersonalWorkspace(prisma, user),
    ]);
    expect(db.workspaces).toHaveLength(1);
  });

  it('displayName 空白时回退邮箱前缀命名', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db, { id: 'u1' });
    await createPersonalWorkspace(prisma, { id: 'u1', email: 'bob@example.com', displayName: '  ' });
    expect(db.workspaces[0].name).toBe('bob 的个人空间');
  });

  it('trusted persisted level registration ignores caller level and agrees with UTC batch and snapshot', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db, { id: 'u1', level: 'pro' });
    const at = new Date();
    for (const [id, scope, scopeKey, limitValue] of [
      ['global', 'global', null, 50], ['pro', 'user_level', 'pro', 700], ['team', 'user_level', 'team', 1300],
    ] as const) db.quotaPolicies.push({ id, scope, scopeKey, resource: 'ai_credit', limitValue, createdAt: at, updatedAt: at });
    const caller = { id: 'u1', email: 'a@example.com', displayName: 'Alice', level: 'team' };
    await prisma.$transaction(tx => createPersonalWorkspace(tx, caller, new Date('2026-08-31T23:30:00-02:00')));
    expect(db.usageLedger[0]).toMatchObject({ delta: 700n, period: '2026-09', idempotencyKey: 'monthly-ai-credit:u1:2026-09' });
    expect(await applyMonthlyGrants({ prisma }, '2026-09')).toEqual({ granted: 0, skipped: 1 });
    expect((await getUsageSnapshot({ prisma }, 'u1')).user.find(item => item.resource === 'ai_credit'))
      .toMatchObject({ scope: 'user_level', limit: 700, remaining: 700 });
    expect(db.usageLedger).toHaveLength(1);
  });
});
