import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type SandboxJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';

export interface CreateSandboxJobInput {
  workspaceId: string;
  userId: string;
  script: string;
  idempotencyKey?: string;
}

export interface SandboxJobResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  runtimeSeconds: number;
  truncated?: boolean;
}

export interface SandboxJob {
  id: string;
  workspaceId: string;
  userId: string;
  script: string;
  status: SandboxJobStatus;
  result: SandboxJobResult | null;
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * P1E-5 §21.2-17: 创建沙箱作业（支持幂等性键）。
 * - 幂等性保证：同一 workspaceId + idempotencyKey 在 24 小时内返回同一作业
 * - 初始状态: pending
 * - 异步执行由 science-worker 消费
 */
export async function createSandboxJob(
  deps: { prisma: PrismaClient },
  input: CreateSandboxJobInput,
): Promise<SandboxJob> {
  // 幂等性检查（24 小时窗口）
  if (input.idempotencyKey) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await deps.prisma.$queryRaw<SandboxJob[]>`
      SELECT * FROM sandbox_jobs
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND result->>'idempotencyKey' = ${input.idempotencyKey}
        AND created_at > ${cutoff}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return existing[0];
    }
  }

  // 创建新作业
  const job = await deps.prisma.$queryRaw<SandboxJob[]>`
    INSERT INTO sandbox_jobs (id, workspace_id, user_id, script, status, result, created_at)
    VALUES (
      ${randomUUID()}::uuid,
      ${input.workspaceId}::uuid,
      ${input.userId}::uuid,
      ${input.script},
      'pending'::sandbox_job_status,
      ${input.idempotencyKey ? JSON.stringify({ idempotencyKey: input.idempotencyKey }) : null}::jsonb,
      NOW()
    )
    RETURNING *
  `;

  return job[0];
}

/**
 * P1E-5: 获取沙箱作业（含 artifacts）。
 */
export async function getSandboxJob(
  deps: { prisma: PrismaClient },
  jobId: string,
): Promise<(SandboxJob & { artifacts: Array<{ id: string; filename: string; mimeType: string; size: number }> }) | null> {
  const job = await deps.prisma.$queryRaw<SandboxJob[]>`
    SELECT * FROM sandbox_jobs WHERE id = ${jobId}::uuid LIMIT 1
  `;
  if (job.length === 0) return null;

  const artifacts = await deps.prisma.$queryRaw<Array<{ id: string; filename: string; mime_type: string; size: number }>>`
    SELECT id, filename, mime_type, size FROM sandbox_artifacts WHERE job_id = ${jobId}::uuid
  `;

  return {
    ...job[0],
    artifacts: artifacts.map(a => ({ id: a.id, filename: a.filename, mimeType: a.mime_type, size: a.size })),
  };
}

/**
 * P1E-5: 列出 workspace 的沙箱作业（分页）。
 */
export async function listSandboxJobsByWorkspace(
  deps: { prisma: PrismaClient },
  input: { workspaceId: string; limit?: number; offset?: number },
): Promise<SandboxJob[]> {
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;

  const jobs = await deps.prisma.$queryRaw<SandboxJob[]>`
    SELECT * FROM sandbox_jobs
    WHERE workspace_id = ${input.workspaceId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return jobs;
}

/**
 * P1E-5: 更新沙箱作业状态与结果。
 */
export async function updateSandboxJobStatus(
  deps: { prisma: PrismaClient },
  input: {
    jobId: string;
    status: SandboxJobStatus;
    result?: SandboxJobResult;
  },
): Promise<void> {
  const completedAt = ['completed', 'failed', 'timeout', 'cancelled'].includes(input.status) ? new Date() : null;

  await deps.prisma.$executeRaw`
    UPDATE sandbox_jobs
    SET status = ${input.status}::sandbox_job_status,
        result = ${input.result ? JSON.stringify(input.result) : null}::jsonb,
        completed_at = ${completedAt}
    WHERE id = ${input.jobId}::uuid
  `;
}

/**
 * P1E-5: 获取 artifact 二进制数据。
 */
export async function getSandboxArtifact(
  deps: { prisma: PrismaClient },
  artifactId: string,
): Promise<{ filename: string; mimeType: string; data: Buffer } | null> {
  const artifact = await deps.prisma.$queryRaw<Array<{ filename: string; mime_type: string; data: Buffer }>>`
    SELECT filename, mime_type, data FROM sandbox_artifacts WHERE id = ${artifactId}::uuid LIMIT 1
  `;
  if (artifact.length === 0) return null;

  return {
    filename: artifact[0].filename,
    mimeType: artifact[0].mime_type,
    data: artifact[0].data,
  };
}
