import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import type { WorkspaceDeps } from '../workspace/types';

/** 流水种类：授予 / 管理员追加 / 消费 / 调整。kind 以 String 落库（app 层校验，DB 无 CHECK 枚举）。 */
export const USAGE_KINDS = ['monthly_grant', 'admin_topup', 'consume', 'adjust'] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface LedgerEntryInput {
  userId?: string;
  workspaceId?: string;
  resource: string;
  /** 有符号：授予 +，消费/占用 -。 */
  delta: number;
  kind: UsageKind;
  period?: string;
  reason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export class UsageError extends Error {
  constructor(
    readonly code: 'DUPLICATE_IDEMPOTENCY_KEY' | 'VALIDATION_ERROR',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 写一条流水（只追加）。period 仅 monthly_grant 必填；idempotencyKey 唯一冲突抛 DUPLICATE_IDEMPOTENCY_KEY。 */
export async function recordEntry(
  tx: Prisma.TransactionClient,
  entry: LedgerEntryInput,
): Promise<void> {
  if (entry.kind === 'monthly_grant' && !entry.period) {
    throw new UsageError('VALIDATION_ERROR', 'monthly_grant 必须携带 period（YYYY-MM）');
  }
  if (entry.kind !== 'monthly_grant' && entry.period) {
    throw new UsageError('VALIDATION_ERROR', '非 monthly_grant 不得携带 period');
  }
  try {
    await tx.usageLedger.create({
      data: {
        userId: entry.userId,
        workspaceId: entry.workspaceId,
        resource: entry.resource,
        delta: BigInt(entry.delta),
        kind: entry.kind,
        period: entry.period,
        reason: entry.reason,
        idempotencyKey: entry.idempotencyKey,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new UsageError('DUPLICATE_IDEMPOTENCY_KEY', '幂等键已存在，操作已执行过', err);
    }
    throw err;
  }
}

export interface BalanceQuery {
  userId?: string;
  workspaceId?: string;
  resource: string;
}

/** 余额 = SUM(delta)：credit 为剩余余额，存储为当前占用。仅一个归属维度（user 或 workspace）参与聚合。 */
export async function getBalance(deps: { prisma: PrismaClient }, query: BalanceQuery): Promise<number> {
  const where: Prisma.UsageLedgerWhereInput = { resource: query.resource };
  if (query.userId) where.userId = query.userId;
  else if (query.workspaceId) where.workspaceId = query.workspaceId;
  const agg = await deps.prisma.usageLedger.aggregate({ where, _sum: { delta: true } });
  return Number(agg._sum.delta ?? 0);
}

export interface UsagePeriodQuery extends BalanceQuery {
  period?: string;
}

/** 按 period 过滤的聚合（如「本月 AI Credit 授予量」校验）。 */
export async function getUsageByPeriod(
  deps: { prisma: PrismaClient },
  query: UsagePeriodQuery,
): Promise<number> {
  const where: Prisma.UsageLedgerWhereInput = { resource: query.resource };
  if (query.userId) where.userId = query.userId;
  else if (query.workspaceId) where.workspaceId = query.workspaceId;
  if (query.period) where.period = query.period;
  const agg = await deps.prisma.usageLedger.aggregate({ where, _sum: { delta: true } });
  return Number(agg._sum.delta ?? 0);
}

export interface TopupInput {
  userId: string;
  amount: number;
  reason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 管理员追加 AI Credit：同事务写 admin_topup 流水 + 审计行。
 * idempotencyKey 唯一约束防重放（§16 幂等键）；幂等键冲突抛 DUPLICATE_IDEMPOTENCY_KEY。
 */
export async function topupCredit(
  deps: WorkspaceDeps,
  input: TopupInput,
  actorId: string,
  ctx: AuditContext = {},
): Promise<void> {
  await deps.prisma.$transaction(async (tx) => {
    await recordEntry(tx, {
      userId: input.userId,
      resource: 'ai_credit',
      delta: input.amount,
      kind: 'admin_topup',
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    await deps.audit?.record(
      {
        actorId,
        action: 'quota.credit.topup',
        targetType: 'user',
        targetId: input.userId,
        metadata: { amount: input.amount, reason: input.reason ?? null },
        requestId: ctx.requestId,
        ip: ctx.ip,
      },
      tx,
    );
  });
}
