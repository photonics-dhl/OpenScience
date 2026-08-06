import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type SandboxJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';

/** P1E-5 §2.1：作业上下文（随创建请求透传，可选）。 */
export interface SandboxJobContext {
  visualizationType?: 'plot' | 'simulation' | 'diagram';
  description?: string;
}

export interface CreateSandboxJobInput {
  workspaceId: string;
  userId: string;
  script: string;
  context?: SandboxJobContext;
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
  context: SandboxJobContext | null;
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * $queryRaw 不做列名转换：snake_case 列必须显式别名成 camelCase，
 * 否则 job.workspaceId/createdAt 等运行时为 undefined（2026-08-06 实证修复）。
 */
const JOB_COLUMNS = Prisma.raw(`
  id,
  workspace_id AS "workspaceId",
  user_id AS "userId",
  script,
  status,
  result,
  context,
  created_at AS "createdAt",
  completed_at AS "completedAt"
`);

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
      SELECT ${JOB_COLUMNS} FROM sandbox_jobs
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
    INSERT INTO sandbox_jobs (id, workspace_id, user_id, script, status, result, context, created_at)
    VALUES (
      ${randomUUID()}::uuid,
      ${input.workspaceId}::uuid,
      ${input.userId}::uuid,
      ${input.script},
      'pending'::sandbox_job_status,
      ${input.idempotencyKey ? JSON.stringify({ idempotencyKey: input.idempotencyKey }) : null}::jsonb,
      ${input.context ? JSON.stringify(input.context) : null}::jsonb,
      NOW()
    )
    RETURNING ${JOB_COLUMNS}
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
    SELECT ${JOB_COLUMNS} FROM sandbox_jobs WHERE id = ${jobId}::uuid LIMIT 1
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
    SELECT ${JOB_COLUMNS} FROM sandbox_jobs
    WHERE workspace_id = ${input.workspaceId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return jobs;
}

/**
 * P1E-5: 原子认领下一个 pending 作业（science-worker 轮询入口）。
 * UPDATE ... FOR UPDATE SKIP LOCKED：多 worker 并发安全，认领即置 running。
 */
export async function claimNextPendingSandboxJob(
  deps: { prisma: PrismaClient },
): Promise<SandboxJob | null> {
  const claimed = await deps.prisma.$queryRaw<SandboxJob[]>`
    UPDATE sandbox_jobs
    SET status = 'running'::sandbox_job_status
    WHERE id = (
      SELECT id FROM sandbox_jobs
      WHERE status = 'pending'::sandbox_job_status
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING ${JOB_COLUMNS}
  `;
  return claimed[0] ?? null;
}

/**
 * P1E-5: 更新沙箱作业状态与结果。
 * - result 为合并写（COALESCE + ||）：保留创建时存入的 idempotencyKey 等既有键，
 *   不再整体覆盖（2026-08-06 修复）。
 * - result 缺省（纯状态推进）时不动 result 列。
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

  if (input.result) {
    await deps.prisma.$executeRaw`
      UPDATE sandbox_jobs
      SET status = ${input.status}::sandbox_job_status,
          result = COALESCE(result, '{}'::jsonb) || ${JSON.stringify(input.result)}::jsonb,
          completed_at = ${completedAt}
      WHERE id = ${input.jobId}::uuid
    `;
  } else {
    await deps.prisma.$executeRaw`
      UPDATE sandbox_jobs
      SET status = ${input.status}::sandbox_job_status,
          completed_at = ${completedAt}
      WHERE id = ${input.jobId}::uuid
    `;
  }
}

/**
 * P1E-6: 批量写入作业产物（science-worker 执行收集后落库）。
 */
export interface NewSandboxArtifact {
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

export async function createSandboxArtifacts(
  deps: { prisma: PrismaClient },
  jobId: string,
  artifacts: NewSandboxArtifact[],
): Promise<void> {
  for (const artifact of artifacts) {
    await deps.prisma.$executeRaw`
      INSERT INTO sandbox_artifacts (id, job_id, filename, mime_type, size, data, created_at)
      VALUES (
        ${randomUUID()}::uuid,
        ${jobId}::uuid,
        ${artifact.filename},
        ${artifact.mimeType},
        ${artifact.size},
        ${artifact.data},
        NOW()
      )
    `;
  }
}

/**
 * P1E-5: 获取 artifact 二进制数据。
 * 2026-08-06：加 jobId 过滤——artifact 必须属于指定 job，防同 workspace 成员跨 job 猜测下载。
 */
export async function getSandboxArtifact(
  deps: { prisma: PrismaClient },
  jobId: string,
  artifactId: string,
): Promise<{ filename: string; mimeType: string; data: Buffer } | null> {
  const artifact = await deps.prisma.$queryRaw<Array<{ filename: string; mime_type: string; data: Buffer }>>`
    SELECT filename, mime_type, data FROM sandbox_artifacts
    WHERE id = ${artifactId}::uuid AND job_id = ${jobId}::uuid
    LIMIT 1
  `;
  if (artifact.length === 0) return null;

  return {
    filename: artifact[0].filename,
    mimeType: artifact[0].mime_type,
    data: artifact[0].data,
  };
}
