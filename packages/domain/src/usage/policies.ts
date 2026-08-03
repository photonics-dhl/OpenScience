import type { PrismaClient, QuotaPolicy } from '@prisma/client';

/** P1A-7 配额 scope（三层回退维度）。scope_key 语义：global=null，user_level=等级标识，workspace=workspaceId。 */
export const QUOTA_SCOPES = ['global', 'user_level', 'workspace'] as const;
export type QuotaScope = (typeof QUOTA_SCOPES)[number];

/** §13.3 配额资源清单（1B/1D/1E 消费点按其计量接入）。 */
export const QUOTA_RESOURCES = [
  'file_size_bytes',
  'storage_bytes',
  'ro_capacity_bytes',
  'upload_bytes_month',
  'ai_credit',
  'python_task_count',
  'python_runtime_seconds',
  'concurrent_tasks',
] as const;
export type QuotaResource = (typeof QUOTA_RESOURCES)[number];

export interface ResolvePolicyInput {
  workspaceId?: string;
  userLevel?: string;
  resource: string;
}

/** 命中行：policy 具体数值（limitValue 以 number 返回，Prisma BigInt 转 number）。 */
export interface ResolvedPolicy {
  scope: QuotaScope;
  scopeKey: string | null;
  resource: string;
  limitValue: number;
}

/**
 * 三层回退解析：workspace(workspaceId) → user_level(userLevel) → global。
 * 未命中返回 null（无限制，不做 0 误判）。无 userLevel 时跳过 user_level 层，仅 workspace → global。
 */
export async function resolvePolicy(
  deps: { prisma: PrismaClient },
  input: ResolvePolicyInput,
): Promise<ResolvedPolicy | null> {
  const candidates = await deps.prisma.quotaPolicy.findMany({ where: { resource: input.resource } });

  const pick = (scope: QuotaScope, scopeKey: string | null | undefined): QuotaPolicy | undefined =>
    candidates.find((p) => p.scope === scope && (p.scopeKey ?? null) === (scopeKey ?? null));

  const hit =
    (input.workspaceId ? pick('workspace', input.workspaceId) : undefined) ??
    (input.userLevel ? pick('user_level', input.userLevel) : undefined) ??
    pick('global', null);

  if (!hit) return null;
  return {
    scope: hit.scope as QuotaScope,
    scopeKey: hit.scopeKey,
    resource: hit.resource,
    limitValue: Number(hit.limitValue),
  };
}
