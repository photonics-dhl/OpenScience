import type { PrismaClient } from '@prisma/client';
import type { SandboxJob, SandboxJobResult } from './jobs';
import { recordEntry } from '../usage/ledger';
import { PYTHON_RUNTIME_SECONDS_RESOURCE } from './quota';

/**
 * P1E-5 §21.2-17: sandbox_job.completed 事件处理器。
 * - 审计日志记录（action: sandbox.execute）
 * - 用量记录（UsageLedger: python_runtime_seconds, delta=-runtimeSeconds）
 */
export async function onSandboxJobCompleted(
  deps: { prisma: PrismaClient },
  input: {
    job: SandboxJob;
    result: SandboxJobResult;
    actorId: string;
  },
): Promise<void> {
  await deps.prisma.$transaction(async (tx) => {
    // 1. 审计日志
    await tx.auditLog.create({
      data: {
        workspaceId: input.job.workspaceId,
        actorId: input.actorId,
        action: 'sandbox.execute',
        metadata: {
          jobId: input.job.id,
          status: input.job.status,
          runtimeSeconds: input.result.runtimeSeconds,
          exitCode: input.result.exitCode,
          truncated: input.result.truncated ?? false,
        },
      },
    });

    // 2. 用量记录（消费 runtime seconds）
    if (input.result.runtimeSeconds > 0) {
      await recordEntry(tx, {
        workspaceId: input.job.workspaceId,
        userId: input.job.userId,
        resource: PYTHON_RUNTIME_SECONDS_RESOURCE,
        delta: -input.result.runtimeSeconds, // 负数表示消费
        kind: 'consume',
        reason: `Sandbox job ${input.job.id} execution`,
        metadata: {
          jobId: input.job.id,
          status: input.job.status,
        },
      });
    }
  });
}
