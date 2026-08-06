# P1E-5 Sandbox Jobs API 实现计划

**任务**: P1E-5 /sandbox-jobs API、配额限流与完成事件  
**制定者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**前置**: P1E-4 (Sandbox Controller)、P1A-7 (配额)、P1A-8 (限流)  
**参考**: [2026-08-06-p1e-5-sandbox-jobs-api-design.md](../specs/2026-08-06-p1e-5-sandbox-jobs-api-design.md)

---

## 1. 实施步骤

### 1.1 Domain 层实现

**落点**: `packages/domain/src/sandbox/`

```typescript
// jobs.ts
export async function createSandboxJob(
  deps: SandboxJobDeps,
  input: {
    userId: string;
    workspaceId: string;
    script: string;
    idempotencyKey: string;
  }
): Promise<SandboxJob> {
  // 1. 幂等性检查
  const existing = await deps.db.sandboxJob.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existing) {
    if (existing.userId !== input.userId ||
        existing.workspaceId !== input.workspaceId) {
      throw new IdempotencyConflictError();
    }
    return existing;
  }

  // 2. 配额检查（复用 P1A-7 基础设施）
  await checkPythonTaskQuota(deps, input.userId, input.workspaceId);

  // 3. 创建任务
  const job = await deps.db.sandboxJob.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      script: input.script,
      status: 'pending',
      idempotencyKey: input.idempotencyKey
    }
  });

  // 4. 审计日志
  await deps.audit?.write({
    action: 'sandbox_job.create',
    resourceType: 'sandbox_job',
    resourceId: job.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    metadata: { scriptLength: input.script.length }
  });

  return job;
}

// quota.ts
async function checkPythonTaskQuota(
  deps: SandboxJobDeps,
  userId: string,
  workspaceId: string
) {
  // 1. 查询配额策略（workspace → user_level → global 三层回退）
  const policy = await getQuotaPolicy(deps, 'python_tasks_per_month', workspaceId, userId);
  
  // 2. 查询当月使用量
  const currentMonth = new Date().toISOString().slice(0, 7);  // YYYY-MM
  const usage = await deps.db.usageLedger.aggregate({
    where: {
      userId,
      workspaceId,
      kind: 'python_task',
      createdAt: { gte: new Date(currentMonth + '-01') }
    },
    _count: { id: true }
  });
  
  // 3. 检查是否超额
  if (usage._count.id >= policy.limit) {
    throw new QuotaExceededError('python_tasks_per_month', policy.limit);
  }
  
  // 4. 检查并发数
  const runningCount = await deps.db.sandboxJob.count({
    where: {
      userId,
      workspaceId,
      status: { in: ['pending', 'running'] }
    }
  });
  
  const concurrentPolicy = await getQuotaPolicy(deps, 'python_concurrent_tasks', workspaceId, userId);
  if (runningCount >= concurrentPolicy.limit) {
    throw new QuotaExceededError('python_concurrent_tasks', concurrentPolicy.limit);
  }
}

// events.ts
export async function onSandboxJobCompleted(
  deps: SandboxJobDeps,
  job: SandboxJob,
  result: SandboxResult
) {
  // 1. 更新状态
  await deps.db.sandboxJob.update({
    where: { id: job.id },
    data: {
      status: result.timeout ? 'timeout' : result.success ? 'completed' : 'failed',
      result: result,
      completedAt: new Date()
    }
  });

  // 2. 记账
  const runtimeSeconds = Math.ceil(
    (new Date().getTime() - job.createdAt.getTime()) / 1000
  );
  
  await deps.db.usageLedger.createMany({
    data: [
      {
        userId: job.userId,
        workspaceId: job.workspaceId,
        kind: 'python_task',
        delta: 1,
        metadata: { jobId: job.id, status: result.success ? 'completed' : 'failed' }
      },
      {
        userId: job.userId,
        workspaceId: job.workspaceId,
        kind: 'python_runtime_seconds',
        delta: runtimeSeconds,
        metadata: { jobId: job.id }
      }
    ]
  });

  // 3. 审计日志
  await deps.audit?.write({
    action: 'sandbox_job.completed',
    resourceType: 'sandbox_job',
    resourceId: job.id,
    userId: job.userId,
    workspaceId: job.workspaceId,
    metadata: {
      status: result.success ? 'completed' : 'failed',
      runtimeSeconds
    }
  });
}
```

### 1.2 API 路由实现

**落点**: `apps/api/src/routes/sandbox-jobs.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SandboxController } from '@openscience/science-worker/sandbox-controller';

const CreateJobSchema = z.object({
  workspaceId: z.string().uuid(),
  script: z.string().min(1).max(100_000),  // 100KB limit
  context: z.object({
    visualizationType: z.enum(['plot', 'simulation', 'diagram']).optional(),
    description: z.string().optional()
  }).optional()
});

export default async function (fastify: FastifyInstance) {
  const sandboxController = new SandboxController();

  // POST /sandbox-jobs
  fastify.post('/sandbox-jobs', {
    preHandler: [fastify.requireAuth, fastify.checkRateLimit]
  }, async (request, reply) => {
    const userId = request.user.id;
    const idempotencyKey = request.headers['idempotency-key'];
    
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return reply.status(400).send({ error: 'Idempotency-Key header required' });
    }

    const body = CreateJobSchema.parse(request.body);

    // 权限检查：需要 workspace 成员权限
    await requireMembership(request.deps, userId, body.workspaceId);

    // 创建任务（含配额检查）
    const job = await createSandboxJob(request.deps, {
      userId,
      workspaceId: body.workspaceId,
      script: body.script,
      idempotencyKey
    });

    // 异步执行
    executeJobAsync(sandboxController, job, request.deps).catch((error) => {
      fastify.log.error({ error, jobId: job.id }, 'Job execution failed');
    });

    return reply.status(201).send({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt
    });
  });

  // GET /sandbox-jobs/:id
  fastify.get('/sandbox-jobs/:id', {
    preHandler: [fastify.requireAuth]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;

    const job = await request.deps.db.sandboxJob.findUnique({
      where: { id },
      include: {
        artifacts: {
          select: { id: true, filename: true, mimeType: true, size: true }
        }
      }
    });

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    // 资源归属检查
    if (!await isMemberOf(request.deps, userId, job.workspaceId)) {
      return reply.status(404).send({ error: 'Job not found' });  // 404 防止信息泄漏
    }

    return job;
  });

  // GET /sandbox-jobs/:id/artifacts/:artifactId
  fastify.get('/sandbox-jobs/:jobId/artifacts/:artifactId', {
    preHandler: [fastify.requireAuth]
  }, async (request, reply) => {
    const { jobId, artifactId } = request.params as { jobId: string; artifactId: string };
    const userId = request.user.id;

    const job = await request.deps.db.sandboxJob.findUnique({
      where: { id: jobId }
    });

    if (!job || !await isMemberOf(request.deps, userId, job.workspaceId)) {
      return reply.status(404).send({ error: 'Artifact not found' });
    }

    const artifact = await request.deps.db.sandboxArtifact.findUnique({
      where: { id: artifactId, jobId }
    });

    if (!artifact) {
      return reply.status(404).send({ error: 'Artifact not found' });
    }

    reply.header('Content-Type', artifact.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    reply.header('Content-Length', artifact.size);
    return reply.send(artifact.data);
  });
}

async function executeJobAsync(
  controller: SandboxController,
  job: SandboxJob,
  deps: any
) {
  // 更新状态为 running
  await deps.db.sandboxJob.update({
    where: { id: job.id },
    data: { status: 'running' }
  });

  // 执行
  const result = await controller.execute(job.script);

  // 完成回调
  await onSandboxJobCompleted(deps, job, result);
}
```

### 1.3 限流配置扩展

**落点**: `apps/api/src/security/rate-limit.ts`

```typescript
export const RATE_LIMIT_ROUTES = [
  // ... 既有路由
  {
    route: '/sandbox-jobs',
    method: 'POST',
    windowMs: 60_000,    // 1 分钟
    maxRequests: 10,     // 最多 10 次提交
    keyGen: (req: any) => `sandbox:${req.user?.id || req.ip}`
  }
];
```

### 1.4 配额策略 Seed

**落点**: `packages/domain/src/usage/seed-data.ts`

```typescript
export const DEFAULT_QUOTA_POLICIES = [
  // ... 既有策略
  
  // Python 任务配额
  { scope: 'global', resourceType: 'python_tasks_per_month', limit: 50 },
  { scope: 'user_level', scopeKey: 'pro', resourceType: 'python_tasks_per_month', limit: 200 },
  { scope: 'user_level', scopeKey: 'team', resourceType: 'python_tasks_per_month', limit: 1000 },
  
  { scope: 'global', resourceType: 'python_concurrent_tasks', limit: 2 },
  { scope: 'user_level', scopeKey: 'pro', resourceType: 'python_concurrent_tasks', limit: 5 },
  { scope: 'user_level', scopeKey: 'team', resourceType: 'python_concurrent_tasks', limit: 10 },
  
  { scope: 'global', resourceType: 'python_runtime_seconds_per_month', limit: 1500 },
  { scope: 'user_level', scopeKey: 'pro', resourceType: 'python_runtime_seconds_per_month', limit: 6000 },
  { scope: 'user_level', scopeKey: 'team', resourceType: 'python_runtime_seconds_per_month', limit: 30000 }
];
```

### 1.5 错误映射

**落点**: `apps/api/src/routes/error-map.ts`

```typescript
export const ERROR_MAP = {
  // ... 既有映射
  
  IdempotencyConflictError: 409,
  QuotaExceededError: 403,
  SandboxExecutionError: 500
};
```

---

## 2. 集成测试

**落点**: `apps/api/test/sandbox-jobs.integration.test.ts`

测试场景：
1. **幂等性**: 重复 Idempotency-Key 返回相同任务
2. **配额**: 超过月度任务次数返回 403
3. **并发限制**: 超过并发数返回 403
4. **限流**: 1 分钟内超过 10 次提交返回 429
5. **越权**: 访问他人任务返回 404
6. **产物下载**: 下载 PNG 文件成功

---

## 3. 本地开发与测试

```bash
# 1. 构建 API
cd apps/api
pnpm build

# 2. 运行单元测试
pnpm test

# 3. 云端集成测试（需 Docker + P1E-3 镜像）
pnpm test:integration
```

---

## 4. 云端部署

```bash
# 1. 运行配额 seed
ssh root@115.29.208.1 \
  "cd /opt/openscience && node packages/domain/dist/usage/seed-quota.js"

# 2. 重启 API 服务
ssh root@115.29.208.1 \
  "cd /opt/openscience && docker-compose restart api"

# 3. 运行集成测试
pnpm test:integration
```

---

## 5. 验收标准 (Spec §21.1)

- [ ] 任务提交幂等（重复 Idempotency-Key 不重复执行）
- [ ] 配额检查（月度任务次数/并发数/运行时间）
- [ ] 限流生效（1 分钟 10 次）
- [ ] 越权访问他人任务被拒
- [ ] 审计日志记录全部写操作
- [ ] 集成测试 6/6 通过

---

## 6. 后续任务

- **P1E-6**: 可视化结果展示与 IndexedDB 临时保存
- **P1E-7**: 自然语言修改脚本与 diff 展示
- **P1E-8**: 威胁模型与沙箱逃逸基线测试

---

**计划确认**: 本计划对齐 Spec §16 API 设计、§13.3 配额、§17 安全 MUST、§21.1 集成/安全测试层。实施完成后提交 GitHub 并更新 task-master。
