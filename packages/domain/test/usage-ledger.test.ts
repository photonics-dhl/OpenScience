import { describe, expect, it } from 'vitest';
import { createFakePrisma } from './helpers/fakes';
import { getBalance, recordEntry, UsageError } from '../src/usage/ledger';

describe('usage_ledger 只追加记账', () => {
  it('授予 + 消费符号约定：SUM(delta) 为当前余额', async () => {
    const { prisma } = createFakePrisma();
    await prisma.$transaction(async (tx) => {
      await recordEntry(tx, { userId: 'u1', resource: 'ai_credit', delta: 500, kind: 'monthly_grant', period: '2026-08' });
      await recordEntry(tx, { userId: 'u1', resource: 'ai_credit', delta: 100, kind: 'admin_topup', reason: '奖励' });
      await recordEntry(tx, { userId: 'u1', resource: 'ai_credit', delta: -30, kind: 'consume', reason: 'SDF 提取' });
    });
    const balance = await getBalance({ prisma }, { userId: 'u1', resource: 'ai_credit' });
    expect(balance).toBe(570);
  });

  it('按 user 聚合不混入其他用户', async () => {
    const { prisma } = createFakePrisma();
    await prisma.$transaction(async (tx) => {
      await recordEntry(tx, { userId: 'u1', resource: 'ai_credit', delta: 500, kind: 'monthly_grant', period: '2026-08' });
      await recordEntry(tx, { userId: 'u2', resource: 'ai_credit', delta: 200, kind: 'monthly_grant', period: '2026-08' });
    });
    expect(await getBalance({ prisma }, { userId: 'u1', resource: 'ai_credit' })).toBe(500);
    expect(await getBalance({ prisma }, { userId: 'u2', resource: 'ai_credit' })).toBe(200);
  });

  it('按 workspace 聚合（存储用量）', async () => {
    const { prisma } = createFakePrisma();
    await prisma.$transaction(async (tx) => {
      await recordEntry(tx, { workspaceId: 'ws1', resource: 'storage_bytes', delta: 1000, kind: 'consume' });
      await recordEntry(tx, { workspaceId: 'ws1', resource: 'storage_bytes', delta: -400, kind: 'consume' });
    });
    expect(await getBalance({ prisma }, { workspaceId: 'ws1', resource: 'storage_bytes' })).toBe(600);
  });

  it('monthly_grant 必须带 period', async () => {
    const { prisma } = createFakePrisma();
    await expect(
      prisma.$transaction((tx) => recordEntry(tx, { userId: 'u1', resource: 'ai_credit', delta: 500, kind: 'monthly_grant' })),
    ).rejects.toBeInstanceOf(UsageError);
  });

  it('非 monthly_grant 不得带 period', async () => {
    const { prisma } = createFakePrisma();
    await expect(
      prisma.$transaction((tx) => recordEntry(tx, { userId: 'u1', resource: 'ai_credit', delta: 100, kind: 'admin_topup', period: '2026-08' })),
    ).rejects.toBeInstanceOf(UsageError);
  });

  it('空账本余额为 0', async () => {
    const { prisma } = createFakePrisma();
    expect(await getBalance({ prisma }, { userId: 'u-nobody', resource: 'ai_credit' })).toBe(0);
  });
});
