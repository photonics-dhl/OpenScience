import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from './helpers/fakes';
import { applyMonthlyGrants, generateMonthlyGrants } from '../src/usage/grants';
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
