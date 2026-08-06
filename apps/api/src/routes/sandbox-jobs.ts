import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
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
import type { AuthDeps, CurrentUser } from '@openscience/auth';
import { buildErrorBody } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

/** sandbox-jobs 路由依赖：AuthDeps（同 notifications 路由惯例，app.ts 传入 BuildAppOptions 满足）。 */
export type SandboxJobsRouteDeps = AuthDeps;

const createJobSchema = z.object({
  workspaceId: z.string().uuid(),
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
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const modifyJobSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

/**
 * sandbox 资源的 workspace 授权（内联 membership 检查，语义对齐 workspace-guard.ts）。
 * workspaceId 来自 body/query/job 行而非 req.params.id，故不复用 requireWorkspaceAction 工厂。
 * 权限矩阵（packages/domain workspace/permissions）当前无 sandbox 专属 WorkspaceAction，
 * 采用最小门槛：是 workspace 成员即可（等同 workspace.read 覆盖全部角色）；
 * 空间不存在或非成员 → 404（不泄露存在性），未登录 → 401（session-guard）。
 * 后续若矩阵增加 sandbox 类 action，在此补 can(membership.role, action) 的 403 分支。
 */
async function requireWorkspaceMembership(
  deps: SandboxJobsRouteDeps,
  user: CurrentUser,
  workspaceId: string,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const workspace = await deps.prisma.workspace.findUnique({ where: { id: workspaceId } });
  const membership = workspace
    ? await deps.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.userId } },
      })
    : null;
  if (!workspace || !membership) {
    await deps.audit?.record({
      actorId: user.userId,
      action: 'authz.deny',
      workspaceId: workspace ? workspaceId : null,
      metadata: { reason: 'not_member', requiredAction: 'sandbox.job' },
      requestId: String(req.id),
      ip: req.ip,
    });
    void reply.status(404).send(buildErrorBody('WORKSPACE_NOT_FOUND', '空间不存在', String(req.id)));
    return false;
  }
  return true;
}

/**
 * P1E-5 §21.2-17: /sandbox-jobs 路由（POST/GET/artifacts）。
 * - 认证: session-guard requireCurrentUser（401）
 * - RBAC: workspace 成员身份（404 不泄露存在性；矩阵无 sandbox 专属 action，见上）
 * - 配额检查: python_tasks_per_month, python_concurrent_tasks, python_runtime_seconds_per_month
 * - 限流: POST 10 req/min（由 rate-limit.ts 配置）
 * - 幂等性: Idempotency-Key 请求头
 */
export function registerSandboxJobsRoutes(app: FastifyInstance, deps: SandboxJobsRouteDeps): void {
  // POST /sandbox-jobs - 创建沙箱作业
  app.post<{ Body: z.infer<typeof createJobSchema> }>('/sandbox-jobs', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;

    const { workspaceId, script } = createJobSchema.parse(req.body);
    if (!(await requireWorkspaceMembership(deps, user, workspaceId, req, reply))) return;

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // 配额检查（CurrentUser 无 level 字段，userLevel 省略 → resolvePolicy 走 workspace → global 回退）
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    try {
      await checkPythonTaskQuota(deps, {
        workspaceId,
        userId: user.userId,
        currentMonth,
      });
    } catch (error) {
      if (error instanceof SandboxQuotaError) {
        return reply.status(429).send(buildErrorBody(error.code, error.message, String(req.id)));
      }
      throw error;
    }

    // 创建作业
    const job = await createSandboxJob(deps, {
      workspaceId,
      userId: user.userId,
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
  });

  // GET /sandbox-jobs/:jobId - 查询作业状态
  app.get<{ Params: z.infer<typeof jobIdParams> }>('/sandbox-jobs/:jobId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;

    const { jobId } = jobIdParams.parse(req.params);

    const job = await getSandboxJob(deps, jobId);
    if (!job) {
      return reply.status(404).send(buildErrorBody('NOT_FOUND', '作业未找到', String(req.id)));
    }

    // Resource ownership：非该作业所属 workspace 成员 → 404（不泄露存在性）
    if (!(await requireWorkspaceMembership(deps, user, job.workspaceId, req, reply))) return;

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
  });

  // POST /sandbox-jobs/:jobId/modify - 生成修改预览（P1E-7）
  app.post<{ Params: z.infer<typeof jobIdParams>; Body: z.infer<typeof modifyJobSchema> }>(
    '/sandbox-jobs/:jobId/modify',
    async (req, reply) => {
      const user = await requireCurrentUser(deps, req, reply);
      if (!user) return;

      const { jobId } = jobIdParams.parse(req.params);
      const { prompt } = modifyJobSchema.parse(req.body);

      // 1. 获取原作业脚本（不存在或非成员统一 404）
      const job = await getSandboxJob(deps, jobId);
      if (!job) {
        return reply.status(404).send(buildErrorBody('NOT_FOUND', '作业未找到', String(req.id)));
      }
      if (!(await requireWorkspaceMembership(deps, user, job.workspaceId, req, reply))) return;

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
    async (req, reply) => {
      const user = await requireCurrentUser(deps, req, reply);
      if (!user) return;

      const { jobId, artifactId } = artifactParams.parse(req.params);

      // Resource ownership：不存在或非成员统一 404
      const job = await getSandboxJob(deps, jobId);
      if (!job) {
        return reply.status(404).send(buildErrorBody('NOT_FOUND', '作业未找到', String(req.id)));
      }
      if (!(await requireWorkspaceMembership(deps, user, job.workspaceId, req, reply))) return;

      const artifact = await getSandboxArtifact(deps, artifactId);
      if (!artifact) {
        return reply.status(404).send(buildErrorBody('NOT_FOUND', 'Artifact 未找到', String(req.id)));
      }

      return reply
        .type(artifact.mimeType)
        .header('Content-Disposition', `attachment; filename="${artifact.filename}"`)
        .send(artifact.data);
    },
  );

  // GET /sandbox-jobs?workspaceId=... - 列出 workspace 的作业
  app.get<{ Querystring: z.infer<typeof listQuerySchema> }>('/sandbox-jobs', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;

    const { workspaceId, limit, offset } = listQuerySchema.parse(req.query);
    if (!(await requireWorkspaceMembership(deps, user, workspaceId, req, reply))) return;

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
  });
}
