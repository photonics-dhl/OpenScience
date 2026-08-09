import type { Prisma, PrismaClient } from '@prisma/client';
import type { LedgerEntryInput } from './ledger';
import { recordEntry, UsageError } from './ledger';
import { resolvePolicy } from './policies';

/** 月度 AI Credit 授予：每活跃用户按 policy(ai_credit) 每月量 +N，累积余额不清零（spec §2.4.7 用户选 B）。 */
export const MONTHLY_GRANT_RESOURCE = 'ai_credit';
export const MONTHLY_PERIOD_REGEX = /^\d{4}-\d{2}$/;

export interface MonthlyGrantDeps {
  prisma: PrismaClient;
}

export type MonthlyGrantResult = 'granted' | 'skipped' | 'unconfigured';

/** 为单个用户补齐指定账期的月度额度；供注册事务和月度批处理共用。 */
export async function ensureMonthlyGrantForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  period: string,
): Promise<MonthlyGrantResult> {
  if (!MONTHLY_PERIOD_REGEX.test(period)) {
    throw new Error(`非法 period：${period}（应 YYYY-MM）`);
  }
  const existing = await tx.usageLedger.findFirst({
    where: { userId, resource: MONTHLY_GRANT_RESOURCE, kind: 'monthly_grant', period },
  });
  if (existing) return 'skipped';

  const policy = await resolvePolicy({ prisma: tx }, { resource: MONTHLY_GRANT_RESOURCE });
  if (!policy) return 'unconfigured';

  try {
    await recordEntry(tx, {
      userId,
      resource: MONTHLY_GRANT_RESOURCE,
      delta: policy.limitValue,
      kind: 'monthly_grant',
      period,
      reason: `月度 AI Credit 授予 ${period}`,
      idempotencyKey: `monthly-ai-credit:${userId}:${period}`,
    });
    return 'granted';
  } catch (error) {
    if (error instanceof UsageError && error.code === 'DUPLICATE_IDEMPOTENCY_KEY') return 'skipped';
    throw error;
  }
}

/**
 * 生成待插入的月度授予流水（纯函数）。逐活跃用户 resolvePolicy('ai_credit')，
 * 无 policy 的用户跳过（不崩溃）。已发过 period 的用户由调用方经幂等查重过滤。
 */
export async function generateMonthlyGrants(
  deps: MonthlyGrantDeps,
  period: string,
): Promise<Array<{ userId: string; entry: LedgerEntryInput }>> {
  if (!MONTHLY_PERIOD_REGEX.test(period)) {
    throw new Error(`非法 period：${period}（应 YYYY-MM）`);
  }
  const users = await deps.prisma.user.findMany({
    where: { status: { notIn: ['suspended', 'deleted'] } },
    select: { id: true },
  });
  const grants: Array<{ userId: string; entry: LedgerEntryInput }> = [];
  for (const user of users) {
    const policy = await resolvePolicy(deps, { userLevel: undefined, workspaceId: undefined, resource: MONTHLY_GRANT_RESOURCE });
    if (!policy) continue;
    grants.push({
      userId: user.id,
      entry: {
        userId: user.id,
        resource: MONTHLY_GRANT_RESOURCE,
        delta: policy.limitValue,
        kind: 'monthly_grant',
        period,
        reason: `月度 AI Credit 授予 ${period}`,
      },
    });
  }
  return grants;
}

/**
 * 应用月度授予：同一事务内对每个用户做「本 period 是否已授予」查重，未授予则插入。
 * 幂等：已发过的 period 用户跳过；并发撞 idempotencyKey 唯一约束视为已执行。
 */
export async function applyMonthlyGrants(
  deps: MonthlyGrantDeps,
  period: string,
): Promise<{ granted: number; skipped: number }> {
  const grants = await generateMonthlyGrants(deps, period);
  let granted = 0;
  let skipped = 0;
  await deps.prisma.$transaction(async (tx) => {
    for (const { userId } of grants) {
      const result = await ensureMonthlyGrantForUser(tx, userId, period);
      if (result === 'granted') granted++;
      else skipped++;
    }
  });
  return { granted, skipped };
}
