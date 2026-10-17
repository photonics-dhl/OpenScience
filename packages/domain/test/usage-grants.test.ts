import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from './helpers/fakes';
import { applyMonthlyGrants, ensureMonthlyGrantForUser, generateMonthlyGrants } from '../src/usage/grants';
import { getBalance } from '../src/usage/ledger';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试夹具放宽类型 */
function seedGlobalCreditPolicy(db: { quotaPolicies: any[] }, amount: number): void {
  db.quotaPolicies.push({
    id: `pol-${db.quotaPolicies.length + 1}`,
    scope: 'global',
    scopeKey: null,
    resource: 'ai_credit',
    limitValue: amount,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('月度 AI Credit 授予', () => {
  it('generateMonthlyGrants 按 policy 为每个活跃用户生成 +N 流水', async () => {
    const { prisma, db } = createFakePrisma();
    seedGlobalCreditPolicy(db, 500);
    seedUser(db);
    seedUser(db);
    const grants = await generateMonthlyGrants({ prisma }, '2026-08');
    expect(grants).toHaveLength(2);
    for (const g of grants) {
      expect(g.entry.delta).toBe(500);
      expect(g.entry.kind).toBe('monthly_grant');
      expect(g.entry.period).toBe('2026-08');
    }
  });

  it('无 ai_credit policy 时跳过（不崩溃）', async () => {
    const { prisma, db } = createFakePrisma();
    seedUser(db);
    const grants = await generateMonthlyGrants({ prisma }, '2026-08');
    expect(grants).toHaveLength(0);
  });

  it('suspended/deleted 用户不授予', async () => {
    const { prisma, db } = createFakePrisma();
    seedGlobalCreditPolicy(db, 500);
    seedUser(db);
    seedUser(db, { status: 'suspended' });
    seedUser(db, { status: 'deleted' });
    const grants = await generateMonthlyGrants({ prisma }, '2026-08');
    expect(grants).toHaveLength(1);
    expect(grants[0].userId).toBe('user-1');
  });

  it('applyMonthlyGrants 落账，余额 = 授予量', async () => {
    const { prisma, db } = createFakePrisma();
    seedGlobalCreditPolicy(db, 500);
    seedUser(db);
    seedUser(db);
    const { granted, skipped } = await applyMonthlyGrants({ prisma }, '2026-08');
    expect(granted).toBe(2);
    expect(skipped).toBe(0);
    expect(await getBalance({ prisma }, { userId: 'user-1', resource: 'ai_credit' })).toBe(500);
  });

  it('重复跑同 period 幂等（查重跳过）', async () => {
    const { prisma, db } = createFakePrisma();
    seedGlobalCreditPolicy(db, 500);
    seedUser(db);
    await applyMonthlyGrants({ prisma }, '2026-08');
    const second = await applyMonthlyGrants({ prisma }, '2026-08');
    expect(second.granted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await getBalance({ prisma }, { userId: 'user-1', resource: 'ai_credit' })).toBe(500);
  });

  it('不同 period 不幂等（2026-09 继续 +N）', async () => {
    const { prisma, db } = createFakePrisma();
    seedGlobalCreditPolicy(db, 500);
    seedUser(db);
    await applyMonthlyGrants({ prisma }, '2026-08');
    await applyMonthlyGrants({ prisma }, '2026-09');
    expect(await getBalance({ prisma }, { userId: 'user-1', resource: 'ai_credit' })).toBe(1000);
  });

  it('非法 period 拒绝', async () => {
    const { prisma } = createFakePrisma();
    await expect(generateMonthlyGrants({ prisma }, '2026-8')).rejects.toThrow(/YYYY-MM/);
  });
});

describe('trusted persisted level grants', () => {
  function policies(db: { quotaPolicies: any[] }): void {
    // Fixture values only; this does not configure production tiers or amounts.
    seedGlobalCreditPolicy(db, 50);
    for (const [level, amount] of [['free', 100], ['pro', 700], ['team', 1300]] as const) {
      db.quotaPolicies.push({ id: `level-${level}`, scope: 'user_level', scopeKey: level,
        resource: 'ai_credit', limitValue: amount, createdAt: new Date(), updatedAt: new Date() });
    }
  }

  it('batch uses each persisted level, with absent and unmatched levels falling back to global', async () => {
    const { prisma, db } = createFakePrisma();
    policies(db);
    for (const level of ['free', 'pro', 'team', 'unmatched', undefined]) seedUser(db, { level });
    const grants = await generateMonthlyGrants({ prisma }, '2026-08');
    expect(grants.map(({ userId, entry }) => [userId, entry.delta])).toEqual([
      ['user-1', 100], ['user-2', 700], ['user-3', 1300], ['user-4', 50], ['user-5', 50],
    ]);
    expect(db.usageLedger).toEqual([]);
  });

  it('single grant uses the transaction user and has no configured-policy default', async () => {
    const { prisma, db } = createFakePrisma();
    policies(db);
    seedUser(db, { level: 'pro' });
    await prisma.$transaction(tx => ensureMonthlyGrantForUser(tx, 'user-1', '2026-08'));
    expect(db.usageLedger[0]).toMatchObject({ delta: 700n, idempotencyKey: 'monthly-ai-credit:user-1:2026-08' });
    db.quotaPolicies.length = 0;
    expect(await prisma.$transaction(tx => ensureMonthlyGrantForUser(tx, 'user-1', '2026-09'))).toBe('unconfigured');
    expect(db.usageLedger).toHaveLength(1);
  });

  it('apply re-reads the transaction level rather than trusting the batch preview', async () => {
    const { prisma, db } = createFakePrisma();
    policies(db);
    const user = seedUser(db, { level: 'pro' });
    const transaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => {
      user.level = 'team';
      return transaction(callback);
    });
    expect(await applyMonthlyGrants({ prisma }, '2026-08')).toEqual({ granted: 1, skipped: 0 });
    expect(db.usageLedger[0].delta).toBe(1300n);
  });

  it('a level change never grants twice in one period or rewrites accumulated credit', async () => {
    const { prisma, db } = createFakePrisma();
    policies(db);
    const user = seedUser(db, { level: 'pro' });
    await applyMonthlyGrants({ prisma }, '2026-08');
    const first = { ...db.usageLedger[0] };
    user.level = 'team';
    expect(await applyMonthlyGrants({ prisma }, '2026-08')).toEqual({ granted: 0, skipped: 1 });
    expect(db.usageLedger[0]).toEqual(first);
    await applyMonthlyGrants({ prisma }, '2026-09');
    expect(await getBalance({ prisma }, { userId: user.id, resource: 'ai_credit' })).toBe(2000);
  });

  it('a missing persisted user cannot receive a caller-created grant', async () => {
    const { prisma, db } = createFakePrisma();
    policies(db);
    await expect(prisma.$transaction(tx => ensureMonthlyGrantForUser(tx, 'missing-user', '2026-08')))
      .rejects.toThrow(/用户|user/i);
    expect(db.usageLedger).toEqual([]);
  });
});
