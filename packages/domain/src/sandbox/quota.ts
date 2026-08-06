import type { PrismaClient } from '@prisma/client';
import { resolvePolicy } from '../usage/policies';

/** P1E-5 Python 沙箱配额资源（3 类）。 */
export const PYTHON_TASK_COUNT_RESOURCE = 'python_task_count';
export const PYTHON_RUNTIME_SECONDS_RESOURCE = 'python_runtime_seconds';
export const CONCURRENT_TASKS_RESOURCE = 'concurrent_tasks';

export class SandboxQuotaError extends Error {
  constructor(
    public readonly code: 'MONTHLY_TASK_LIMIT' | 'CONCURRENT_LIMIT' | 'MONTHLY_RUNTIME_LIMIT',
    message: string,
  ) {
    super(message);
    this.name = 'SandboxQuotaError';
  }
}

/**
 * P1E-5 §21.2-17: Python 沙箱三维配额检查（月度任务数、并发任务数、月度运行时）。
 * - 三层回退：workspace → user_level → global
 * - 检查当前使用量是否超限
 * - 超限抛出 SandboxQuotaError
 */
export async function checkPythonTaskQuota(
  deps: { prisma: PrismaClient },
  input: {
    workspaceId: string;
    userLevel?: string;
    userId: string;
    currentMonth: string; // 'YYYY-MM' format
  },
): Promise<void> {
  // 1. 月度任务数检查
  const monthlyTaskPolicy = await resolvePolicy(deps, {
    workspaceId: input.workspaceId,
    userLevel: input.userLevel,
    resource: PYTHON_TASK_COUNT_RESOURCE,
  });
  if (monthlyTaskPolicy) {
    const monthStart = `${input.currentMonth}-01T00:00:00.000Z`;
    const nextMonth = new Date(new Date(`${input.currentMonth}-01`).getTime() + 32 * 24 * 60 * 60 * 1000);
    const monthEnd = `${nextMonth.toISOString().slice(0, 8)}01T00:00:00.000Z`;

    const result = await deps.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM sandbox_jobs
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND created_at >= ${monthStart}::timestamptz
        AND created_at < ${monthEnd}::timestamptz
    `;
    const monthlyCount = Number(result[0]?.count ?? 0);

    if (monthlyCount >= monthlyTaskPolicy.limitValue) {
      throw new SandboxQuotaError(
        'MONTHLY_TASK_LIMIT',
        `月度任务数 ${monthlyCount} 已达配额 ${monthlyTaskPolicy.limitValue}`,
      );
    }
  }

  // 2. 并发任务数检查
  const concurrentPolicy = await resolvePolicy(deps, {
    workspaceId: input.workspaceId,
    userLevel: input.userLevel,
    resource: CONCURRENT_TASKS_RESOURCE,
  });
  if (concurrentPolicy) {
    const result = await deps.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM sandbox_jobs
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND status IN ('pending', 'running')
    `;
    const runningCount = Number(result[0]?.count ?? 0);

    if (runningCount >= concurrentPolicy.limitValue) {
      throw new SandboxQuotaError(
        'CONCURRENT_LIMIT',
        `并发任务数 ${runningCount} 已达配额 ${concurrentPolicy.limitValue}`,
      );
    }
  }

  // 3. 月度运行时检查
  const runtimePolicy = await resolvePolicy(deps, {
    workspaceId: input.workspaceId,
    userLevel: input.userLevel,
    resource: PYTHON_RUNTIME_SECONDS_RESOURCE,
  });
  if (runtimePolicy) {
    const monthStart = `${input.currentMonth}-01T00:00:00.000Z`;
    const nextMonth = new Date(new Date(`${input.currentMonth}-01`).getTime() + 32 * 24 * 60 * 60 * 1000);
    const monthEnd = `${nextMonth.toISOString().slice(0, 8)}01T00:00:00.000Z`;

    const result = await deps.prisma.$queryRaw<Array<{ sum: number | null }>>`
      SELECT SUM(runtime_seconds) as sum FROM sandbox_jobs
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND status IN ('completed', 'timeout')
        AND created_at >= ${monthStart}::timestamptz
        AND created_at < ${monthEnd}::timestamptz
    `;
    const totalSeconds = result[0]?.sum ?? 0;

    if (totalSeconds >= runtimePolicy.limitValue) {
      throw new SandboxQuotaError(
        'MONTHLY_RUNTIME_LIMIT',
        `月度运行时 ${totalSeconds}s 已达配额 ${runtimePolicy.limitValue}s`,
      );
    }
  }
}
