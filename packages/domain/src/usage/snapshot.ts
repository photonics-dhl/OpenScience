import type { PrismaClient } from '@prisma/client';
import { checkLimit } from './limits';
import { getBalance } from './ledger';
import { resolvePolicy, type QuotaResource } from './policies';

/** 用户级资源（按 user 维度记账/授予）。 */
const USER_RESOURCES: readonly QuotaResource[] = ['ai_credit', 'python_task_count', 'python_runtime_seconds', 'concurrent_tasks'];
/** Workspace 级资源（按 workspace 维度计量）。 */
const WORKSPACE_RESOURCES: readonly QuotaResource[] = ['file_size_bytes', 'storage_bytes', 'ro_capacity_bytes', 'upload_bytes_month'];

export interface UsageSnapshotItem {
  resource: string;
  scope: string | null;
  limit: number | null;
  used: number;
  remaining: number;
  allowed: boolean;
}

export interface UsageSnapshot {
  user: UsageSnapshotItem[];
  workspaces: Array<{ workspaceId: string; items: UsageSnapshotItem[] }>;
}

/**
 * 用户侧 /usage 聚合：user 级资源按 user_level→global 回退解析 + 用户账本用量；
 * workspace 级资源按成员 workspace 逐空间解析（workspace→user_level→global）+ 空间账本用量。
 */
export async function getUsageSnapshot(
  deps: { prisma: PrismaClient },
  userId: string,
): Promise<UsageSnapshot> {
  const memberships = await deps.prisma.membership.findMany({ where: { userId } });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const userItems: UsageSnapshotItem[] = [];
  for (const resource of USER_RESOURCES) {
    const policy = await resolvePolicy(deps, { userLevel: undefined, resource });
    const used = await getBalance(deps, { userId, resource });
    const { remaining, allowed } = checkLimit({ used, limit: policy ? policy.limitValue : null });
    userItems.push({ resource, scope: policy?.scope ?? null, limit: policy?.limitValue ?? null, used, remaining, allowed });
  }

  const workspaces: UsageSnapshot['workspaces'] = [];
  for (const workspaceId of workspaceIds) {
    const items: UsageSnapshotItem[] = [];
    for (const resource of WORKSPACE_RESOURCES) {
      const policy = await resolvePolicy(deps, { workspaceId, resource });
      const used = await getBalance(deps, { workspaceId, resource });
      const { remaining, allowed } = checkLimit({ used, limit: policy ? policy.limitValue : null });
      items.push({ resource, scope: policy?.scope ?? null, limit: policy?.limitValue ?? null, used, remaining, allowed });
    }
    workspaces.push({ workspaceId, items });
  }

  return { user: userItems, workspaces };
}
