# P1E-5 Sandbox Jobs API、配额限流与完成事件设计文档

**任务**: 实现 /sandbox-jobs API、配额限流与完成事件  
**设计者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**依赖**: P1E-4 (Sandbox Controller)、P1A-7 (配额策略)、P1A-8 (限流)  
**参考规格**: Spec §16、§13.3、§17、§21.1

---

## 1. 目标

对外提供 `/sandbox-jobs` 模块化 REST API，落实沙箱接口限流、Python 任务配额和 `sandbox_job.completed` 事件。

### 1.1 核心功能

- **任务提交**: POST /sandbox-jobs（幂等键、脚本提交）
- **进度查询**: GET /sandbox-jobs/:id（任务状态、结果）
- **产物获取**: GET /sandbox-jobs/:id/artifacts/:artifactId
- **配额检查**: Python 任务次数、运行时间、并发任务数
- **限流**: 沙箱接口限流（P1A-8 基础上扩展）
- **事件**: sandbox_job.completed 事件（可重试、消费者幂等）

### 1.2 验收标准 (Spec §21.1)

- 任务提交幂等（重复幂等键不重复执行）
- 越权访问他人任务被拒
- 限流生效
- 超配额返回明确错误

---

## 2. API 设计 (Spec §16)

### 2.1 POST /sandbox-jobs (提交任务)

**请求**:
```typescript
POST /sandbox-jobs
Headers:
  Idempotency-Key: <uuid>
  Authorization: Bearer <token>

Body:
{
  "workspaceId": "uuid",
  "script": "import numpy as np\n...",
  "context": {
    "visualizationType": "plot",  // plot | simulation | diagram
    "description": "用户描述"
  }
}
```

**响应**:
```typescript
{
  "id": "uuid",
  "status": "pending",
  "createdAt": "2026-08-06T05:00:00Z"
}
```

**错误**:
- `409 CONFLICT`: 幂等键冲突（已存在不同任务）
- `429 TOO_MANY_REQUESTS`: 超过限流
- `403 FORBIDDEN`: 超过配额或无权限

### 2.2 GET /sandbox-jobs/:id (查询任务)

**响应**:
```typescript
{
  "id": "uuid",
  "workspaceId": "uuid",
  "userId": "uuid",
  "status": "completed",  // pending | running | completed | failed | timeout | cancelled
  "result": {
    "success": true,
    "output": "...",
    "artifacts": [
      {
        "id": "uuid",
        "filename": "plot.png",
        "mimeType": "image/png",
        "size": 12345
      }
    ]
  },
  "createdAt": "2026-08-06T05:00:00Z",
  "completedAt": "2026-08-06T05:00:05Z"
}
```

**安全**: RBAC + 资源归属检查（§3.3、§17 防跨 Workspace 越权）

### 2.3 GET /sandbox-jobs/:id/artifacts/:artifactId (下载产物)

**响应**:
```
Content-Type: image/png
Content-Disposition: attachment; filename="plot.png"
Content-Length: 12345

<binary data>
```

---

## 3. 配额设计 (Spec §13.3)

### 3.1 配额类型

| 配额项 | 默认值 | 说明 |
|--------|--------|------|
| python_tasks_per_month | 100 | 每月 Python 任务次数 |
| python_concurrent_tasks | 3 | 并发任务数 |
| python_runtime_seconds_per_month | 3000 | 每月总运行时间（秒） |

**配置位置**: P1A-7 `QuotaPolicy` 表（scope=global|user_level|workspace）

### 3.2 配额检查流程

```typescript
async function checkPythonTaskQuota(userId: string, workspaceId: string) {
  // 1. 查询配额策略（workspace → user_level → global 三层回退）
  const policy = await getQuotaPolicy('python_tasks_per_month', workspaceId, userId);
  
  // 2. 查询当月使用量
  const usage = await getUsageLedger(userId, workspaceId, 'python_task', currentMonth);
  
  // 3. 检查是否超额
  if (usage.count >= policy.limit) {
    throw new QuotaExceededError('python_tasks_per_month');
  }
  
  // 4. 检查并发数
  const runningCount = await countRunningJobs(userId, workspaceId);
  if (runningCount >= policy.concurrentLimit) {
    throw new QuotaExceededError('python_concurrent_tasks');
  }
}
```

### 3.3 使用量记账

```typescript
// 任务完成后记账
await recordUsage({
  userId,
  workspaceId,
  kind: 'python_task',
  delta: 1,  // 任务次数 +1
  metadata: {
    jobId,
    runtimeSeconds: 5,
    status: 'completed'
  }
});

await recordUsage({
  userId,
  workspaceId,
  kind: 'python_runtime_seconds',
  delta: 5,  // 运行时间 +5s
  metadata: { jobId }
});
```

---

## 4. 限流设计 (Spec §17)

### 4.1 限流规则（复用 P1A-8 基础设施）

```typescript
const RATE_LIMIT_ROUTES = [
  {
    route: '/sandbox-jobs',
    method: 'POST',
    windowMs: 60_000,    // 1 分钟
    maxRequests: 10,     // 最多 10 次提交
    keyGen: (req) => `sandbox:${req.user.id}:${req.ip}`
  }
];
```

**错误响应**:
```
429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1720234567
```

---

## 5. 事件设计 (Spec §16)

### 5.1 sandbox_job.completed 事件

**事件结构**:
```typescript
{
  "event": "sandbox_job.completed",
  "jobId": "uuid",
  "workspaceId": "uuid",
  "userId": "uuid",
  "status": "completed",  // completed | failed | timeout
  "result": {
    "success": true,
    "artifacts": ["artifact-uuid-1"]
  },
  "timestamp": "2026-08-06T05:00:05Z"
}
```

### 5.2 事件投递机制

**简化方案（MVP）**: 任务完成后同步调用回调
```typescript
async function onJobCompleted(job: SandboxJob) {
  // 1. 更新任务状态
  await updateJobStatus(job.id, 'completed', result);
  
  // 2. 记账
  await recordUsage(...);
  
  // 3. 写审计日志（§17 MUST）
  await auditLog.write({
    action: 'sandbox_job.completed',
    resourceId: job.id,
    userId: job.userId,
    workspaceId: job.workspaceId
  });
  
  // 4. 发送通知（P1C-9 通知系统接入点）
  await notificationService.send({
    userId: job.userId,
    type: 'sandbox_job_completed',
    payload: { jobId: job.id, status: result.status }
  });
}
```

**未来扩展**: 消息队列（RabbitMQ/Redis Streams）+ 重试机制

---

## 6. 安全设计 (Spec §17)

### 6.1 RBAC + 资源归属检查

```typescript
// 提交任务：需要 workspace 成员权限
await requireMembership(userId, workspaceId);

// 查询任务：只能查询自己所在 workspace 的任务
const job = await getSandboxJob(jobId);
if (!await isMemberOf(userId, job.workspaceId)) {
  throw new ForbiddenError();
}
```

### 6.2 审计日志 (§17 MUST)

```typescript
// 全部写操作记审计日志
await auditLog.write({
  action: 'sandbox_job.create',
  resourceType: 'sandbox_job',
  resourceId: job.id,
  userId,
  workspaceId,
  metadata: {
    idempotencyKey,
    scriptLength: script.length  // 不记录完整脚本（§17 生产日志不记录敏感内容）
  }
});
```

### 6.3 敏感内容过滤

- **脚本内容**: 不在日志中记录完整脚本
- **输出**: 截断到 1MB（P1E-4 已落实）
- **错误**: 不泄漏内部路径/配置

---

## 7. 数据流

```
┌────────┐  POST /sandbox-jobs   ┌─────────────┐
│ Client │ ───────────────────▶ │ API         │
└────────┘  (Idempotency-Key)    │ /sandbox-   │
                                 │  jobs       │
                                 └──────┬──────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                  ┌─────▼──────┐              ┌────────▼────────┐
                  │ 配额检查    │              │ 限流检查         │
                  │ (P1A-7)    │              │ (P1A-8)         │
                  └─────┬──────┘              └────────┬────────┘
                        │                               │
                        └───────────────┬───────────────┘
                                        │
                                 ┌──────▼──────┐
                                 │ 创建任务     │
                                 │ (幂等键)    │
                                 └──────┬──────┘
                                        │
                                 ┌──────▼───────────┐
                                 │ SandboxController │
                                 │ (P1E-4)          │
                                 └──────┬───────────┘
                                        │
                        ┌───────────────┴────────────────┐
                        │                                │
                 ┌──────▼──────┐              ┌─────────▼────────┐
                 │ 更新状态     │              │ 记账             │
                 │ completed   │              │ (UsageLedger)   │
                 └──────┬──────┘              └─────────┬────────┘
                        │                                │
                        └────────────┬───────────────────┘
                                     │
                              ┌──────▼──────┐
                              │ 审计日志     │
                              │ (P1A-6)     │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │ 通知事件     │
                              │ (P1C-9)     │
                              └─────────────┘
```

---

## 8. 实现检查清单

- [ ] apps/api/src/routes/sandbox-jobs.ts（POST/GET/GET artifacts）
- [ ] apps/api/src/routes/sandbox-jobs.test.ts（集成测试 6 项）
- [ ] packages/domain/src/sandbox/（jobs.ts + quota.ts + events.ts）
- [ ] 限流配置扩展（RATE_LIMIT_ROUTES 添加 /sandbox-jobs）
- [ ] 配额策略 seed（python_tasks_per_month 等 3 项）
- [ ] 审计日志挂接（create/update/completed）
- [ ] 错误映射（SandboxError → HTTP 状态码）
- [ ] 文档：apps/api/docs/sandbox-jobs-api.md

---

## 9. 配额初始值 (§24 待确认)

| 用户等级 | 月任务次数 | 并发数 | 月运行时间 |
|---------|-----------|--------|----------|
| free    | 50        | 2      | 1500s    |
| pro     | 200       | 5      | 6000s    |
| team    | 1000      | 10     | 30000s   |

**配置位置**: packages/domain/src/usage/seed-data.ts

---

**设计确认**: 本设计对齐 Spec §16 API 设计、§13.3 配额、§17 安全 MUST。事件机制采用简化同步方案（MVP），未来可扩展为消息队列。
