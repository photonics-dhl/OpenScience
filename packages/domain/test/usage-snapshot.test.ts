import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from './helpers/fakes';
import { getUsageSnapshot } from '../src/usage/snapshot';
import { recordEntry } from '../src/usage/ledger';

describe('getUsageSnapshot 用户侧聚合', () => {
  it('user 级资源按 user_level→global 回退解析 + 用户账本用量', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db);
    db.quotaPolicies.push({ id: 'p1', scope: 'global', scopeKey: null, resource: 'ai_credit', limitValue: 500, createdAt: new Date(), updatedAt: new Date() });
    await prisma.$transaction((tx) =>
      recordEntry(tx, { userId: 'user-1', resource: 'ai_credit', delta: 500, kind: 'monthly_grant', period: '2026-08' }),
    );
    await prisma.$transaction((tx) =>
      recordEntry(tx, { userId: 'user-1', resource: 'ai_credit', delta: -120, kind: 'consume', reason: 'SDF 提取' }),
    );
    const snap = await getUsageSnapshot({ prisma }, 'user-1');
    const credit = snap.user.find((i) => i.resource === 'ai_credit');
    expect(credit).toMatchObject({ limit: 500, used: 120, remaining: 380, allowed: true });
  });

  it('无 policy 时 limit=null，used 照查', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db);
    const snap = await getUsageSnapshot({ prisma }, 'user-1');
    const credit = snap.user.find((i) => i.resource === 'ai_credit');
    expect(credit).toMatchObject({ limit: null, used: 0, remaining: 0, allowed: false });
  });

  it('workspace 级资源按成员 workspace 逐空间聚合', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db);
    db.workspaces.push({ id: 'ws-1', type: 'team', name: '团队', ownerId: 'user-1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm1', workspaceId: 'ws-1', userId: 'user-1', role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    db.quotaPolicies.push({ id: 'p1', scope: 'global', scopeKey: null, resource: 'storage_bytes', limitValue: 1024, createdAt: new Date(), updatedAt: new Date() });
    await prisma.$transaction((tx) =>
      recordEntry(tx, { workspaceId: 'ws-1', resource: 'storage_bytes', delta: 300, kind: 'consume' }),
    );
    const snap = await getUsageSnapshot({ prisma }, 'user-1');
    expect(snap.workspaces).toHaveLength(1);
    const storage = snap.workspaces[0].items.find((i) => i.resource === 'storage_bytes');
    expect(storage).toMatchObject({ limit: 1024, used: 300, remaining: 724 });
  });

  it('无成员身份时 workspaces 为空数组', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db);
    const snap = await getUsageSnapshot({ prisma }, 'user-1');
    expect(snap.workspaces).toEqual([]);
  });
  it('累积余额可以超过月度发放数，耗尽才阻断；不混入其他用户流水', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db);
    db.quotaPolicies.push({ id: 'p1', scope: 'global', scopeKey: null, resource: 'ai_credit', limitValue: 500, createdAt: new Date(), updatedAt: new Date() });
    await prisma.$transaction(async tx => {
      await recordEntry(tx, { userId: 'user-1', resource: 'ai_credit', delta: 500, kind: 'monthly_grant', period: '2026-08' });
      await recordEntry(tx, { userId: 'user-1', resource: 'ai_credit', delta: 500, kind: 'monthly_grant', period: '2026-09' });
      await recordEntry(tx, { userId: 'user-1', resource: 'ai_credit', delta: -100, kind: 'consume' });
      await recordEntry(tx, { userId: 'other', resource: 'ai_credit', delta: -999, kind: 'consume' });
    });
    expect((await getUsageSnapshot({ prisma }, 'user-1')).user.find(i => i.resource === 'ai_credit')).toMatchObject({ limit: 500, used: 100, remaining: 900, allowed: true });
    await prisma.$transaction(tx => recordEntry(tx, { userId: 'user-1', resource: 'ai_credit', delta: -900, kind: 'consume' }));
    expect((await getUsageSnapshot({ prisma }, 'user-1')).user.find(i => i.resource === 'ai_credit')).toMatchObject({ used: 1000, remaining: 0, allowed: false });
  });

});
