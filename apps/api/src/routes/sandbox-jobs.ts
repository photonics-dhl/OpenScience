import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { createTwoFilesPatch } from 'diff';
import {
  createSandboxJob,
  getSandboxJob,
  getSandboxArtifact,
  listSandboxJobsByWorkspace,
  checkPythonScript,
  modifyScriptStub,
  type SandboxJob,
} from '@openscience/domain';
import { checkPythonTaskQuota, SandboxQuotaError } from '@openscience/domain';

export interface SandboxJobsRouteDeps {
  prisma: PrismaClient;
}

const createJobSchema = z.object({
  script: z.string().min(1).max(50000),
});

const jobIdParams = z.object({
  jobId: z.string().uuid(),
});

const artifactParams = z.object({
  jobId: z.string().uuid(),
  artifactId: z.string().uuid(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const modifyJobSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

/**
 * P1E-5 §21.2-17: /sandbox-jobs 路由（POST/GET/artifacts）。
 * - RBAC: 需要 workspace 成员身份
 * - 配额检查: python_tasks_per_month, python_concurrent_tasks, python_runtime_seconds_per_month
 * - 限流: POST 10 req/min（由 rate-limit.ts 配置）
 * - 幂等性: Idempotency-Key 请求头
 */
export function registerSandboxJobsRoutes(app: FastifyInstance, deps: SandboxJobsRouteDeps): void {
  // POST /sandbox-jobs - 创建沙箱作业
  app.post<{ Body: z.infer<typeof createJobSchema> }>(
    '/sandbox-jobs',
    {
      preHandler: [
        // @ts-expect-error - fastify 插件类型不匹配，实际运行时存在
        app.authenticate,
        // @ts-expect-error
        app.checkWorkspaceAccess,
      ],
    },
    async (req, reply) => {
      const { script } = createJobSchema.parse(req.body);
      const userId = (req as any).user.id;
      const workspaceId = (req as any).workspaceId;
      const userLevel = (req as any).user.level;
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // 配额检查
      const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      try {
        await checkPythonTaskQuota(deps, {
          workspaceId,
          userLevel,
          userId,
          currentMonth,
        });
      } catch (error) {
        if (error instanceof SandboxQuotaError) {
          return reply.status(429).send({
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }
        throw error;
      }

      // 创建作业
      const job = await createSandboxJob(deps, {
        workspaceId,
        userId,
        script,
        idempotencyKey,
      });

      return reply.status(201).send({
        job: {
          id: job.id,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
        },
      });
    },
  );

  // GET /sandbox-jobs/:jobId - 查询作业状态
  app.get<{ Params: z.infer<typeof jobIdParams> }>(
    '/sandbox-jobs/:jobId',
    {
      preHandler: [
        // @ts-expect-error
        app.authenticate,
        // @ts-expect-error
        app.checkWorkspaceAccess,
      ],
    },
    async (req, reply) => {
      const { jobId } = jobIdParams.parse(req.params);
      const workspaceId = (req as any).workspaceId;

      const job = await getSandboxJob(deps, jobId);
      if (!job) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '作业未找到' } });
      }

      // Resource ownership 检查
      if (job.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: '无权访问' } });
      }

      return reply.send({
        job: {
          id: job.id,
          workspaceId: job.workspaceId,
          userId: job.userId,
          script: job.script,
          status: job.status,
          result: job.result,
          createdAt: job.createdAt.toISOString(),
          completedAt: job.completedAt?.toISOString() ?? null,
          artifacts: job.artifacts,
        },
      });
    },
  );

  // POST /sandbox-jobs/:jobId/modify - 生成修改预览（P1E-7）
  app.post<{ Params: z.infer<typeof jobIdParams>; Body: z.infer<typeof modifyJobSchema> }>(
    '/sandbox-jobs/:jobId/modify',
    {
      preHandler: [
        // @ts-expect-error
        app.authenticate,
        // @ts-expect-error
        app.checkWorkspaceAccess,
      ],
    },
    async (req, reply) => {
      const { jobId } = jobIdParams.parse(req.params);
      const { prompt } = modifyJobSchema.parse(req.body);
      const workspaceId = (req as any).workspaceId;

      // 1. 获取原作业脚本
      const job = await getSandboxJob(deps, jobId);
      if (!job || job.workspaceId !== workspaceId) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '作业未找到' } });
      }

      // 2. 调用 stub AI 修改脚本 (TODO: P1D-2 替换为 Hermes Gateway)
      const newScript = modifyScriptStub(job.script, prompt);

      // 3. 计算 diff
      const diffResult = createTwoFilesPatch(
        'original.py',
        'modified.py',
        job.script,
        newScript,
        '',
        '',
      );

      // 4. 策略检查 (TODO: P1E-3 替换为完整 AST 分析)
      const policyResult = checkPythonScript(newScript);

      return reply.send({
        newScript,
        diff: diffResult,
        policyResult,
      });
    },
  );

  // GET /sandbox-jobs/:jobId/artifacts/:artifactId - 下载 artifact
  app.get<{ Params: z.infer<typeof artifactParams> }>(
    '/sandbox-jobs/:jobId/artifacts/:artifactId',
    {
      preHandler: [
        // @ts-expect-error
        app.authenticate,
        // @ts-expect-error
        app.checkWorkspaceAccess,
      ],
    },
    async (req, reply) => {
      const { jobId, artifactId } = artifactParams.parse(req.params);
      const workspaceId = (req as any).workspaceId;

      // Resource ownership 检查
      const job = await getSandboxJob(deps, jobId);
      if (!job || job.workspaceId !== workspaceId) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '作业未找到' } });
      }

      const artifact = await getSandboxArtifact(deps, artifactId);
      if (!artifact) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Artifact 未找到' } });
      }

      return reply
        .type(artifact.mimeType)
        .header('Content-Disposition', `attachment; filename="${artifact.filename}"`)
        .send(artifact.data);
    },
  );

  // GET /sandbox-jobs - 列出 workspace 的作业
  app.get<{ Querystring: z.infer<typeof listQuerySchema> }>(
    '/sandbox-jobs',
    {
      preHandler: [
        // @ts-expect-error
        app.authenticate,
        // @ts-expect-error
        app.checkWorkspaceAccess,
      ],
    },
    async (req, reply) => {
      const { limit, offset } = listQuerySchema.parse(req.query);
      const workspaceId = (req as any).workspaceId;

      const jobs = await listSandboxJobsByWorkspace(deps, {
        workspaceId,
        limit,
        offset,
      });

      return reply.send({
        jobs: jobs.map((j: SandboxJob) => ({
          id: j.id,
          status: j.status,
          createdAt: j.createdAt.toISOString(),
          completedAt: j.completedAt?.toISOString() ?? null,
        })),
      });
    },
  );
}
