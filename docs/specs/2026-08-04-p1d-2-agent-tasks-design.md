# P1D-2 Hermes 会话与异步任务通道 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.2（AgentSession/AgentTask + 队列 + SSE 进度）
- 依据：Spec §9.1/§9.3、§14.1、§15、§16、§18.3、§2.4-7
- 现状：ai-gateway 就绪（P1D-1）；Redis ioredis 可用；usage 配额骨架（P1A-7）；agent-worker 空壳

---

## 需求基线

1. AgentSession/AgentTask 数据模型（§15）
2. 长任务异步执行（§9.3）：任务 ID + SSE/WebSocket 进度（§16/§18.3 可恢复）
3. apps/agent-worker 消费队列执行 Hermes 任务（§14.1）
4. 任务事件可重试、消费者幂等（§16）
5. 前端通过任务 ID 订阅进度，断线可恢复（§16/§18.3）
6. Hermes 不得绕过权限/发布确认/资源配额（§9.1）：任务执行前校验 Workspace 权限 + AI Credit 配额（§2.4-7）
7. 前端显示可恢复进度（§18.3）

## 架构决策（拟）

### 数据模型（Q1，迁移 15）

- `AgentSession`：id/researchObjectId?/userId/kind/title/status/createdAt
- `AgentTask`：id/sessionId/kind/status(pending/running/succeeded/failed)/progress(Int)/payload(Json)/result(Json?)/error(String?)/idempotencyKey(@unique)/createdAt/updatedAt
- `ToolApproval`：id/taskId/level(R0-R4)/scope/status(pending/approved/rejected)/prompt(Json)/approvedBy/createdAt（P1D-4 用，本期建表）
- 迁移 15：三表 + status 枚举

### 队列 + 消费者（Q2）

- **Redis List 队列**（BRPOPLPUSH）：`agent:queue` 任务 id
- agent-worker 消费：poll → 执行（调 domain 任务处理器或 ai-gateway）→ 更新任务状态 + progress → 完成写 result
- **消费者幂等**：任务状态机（pending→running→succeeded 单向前进）；重复消费同任务 → 检查状态已 succeeded → skip（§16）
- 任务重试：失败 → status=failed + error，可重新入队（retryCount）

### 进度订阅（Q3）

- **轮询为主 + SSE 增强**：`GET /agent/tasks/:id` 轮询（断线可恢复，§18.3）；`GET /agent/tasks/:id/stream` SSE（Fastify reply.raw + 定时推送 + close 断连）
- 本期 SSE 用**轮询 + 事件流**：SSE 连接时订阅 Redis pub/sub `agent:task:{id}` 频道，无发布时降级定时推送
- 简化：**轮询 API 为主**（任务进度写入 DB，前端 setInterval 拉取，断线自然恢复）；SSE 作增强接口占位——Q 决策定

### API（Q4）

- `POST /agent/tasks`：body {sessionId/kind/payload/idempotencyKey?} → 校验（session 归属 + workspace 权限 + AI Credit 配额）→ 入队 → 返回 taskId
- `GET /agent/tasks/:id`：进度（含 progress + status）
- `GET /agent/sessions`：当前用户会话列表
- `POST /agent/sessions`：建会话

### 权限 + 配额校验（Q5）

- 提交任务时：session 属于当前用户 + researchObject 所在 workspace requireMembership（§17 越权）
- AI Credit 配额：`getBalance(user, workspace, ai_credit)` → 余额不足 → 409（§2.4-7，Credit 骨架 P1A-7）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 迁移范围？ | 迁移 15：AgentSession/AgentTask/ToolApproval 三表（§15 实体 MUST） | 仅 AgentTask（Session/Approval 延后） |
| Q2 | 队列实现？ | Redis List（BRPOPLPUSH，ioredis 现成），agent-worker poll 消费 | 依赖外部队列（无现成 broker） |
| Q3 | 进度订阅？ | **轮询 API 为主**（DB 进度 + setInterval，断线恢复天然）+ SSE 接口占位 | 完整 SSE（Redis pub/sub，复杂度高） |
| Q4 | 任务处理器形态？ | agent-worker 内 handler 注册表（kind → 执行函数），5.3 Extractor 挂接 | API 内联执行（非异步） |
| Q5 | 配额校验？ | 提交时 getBalance(ai_credit) → 不足 409；消耗在 5.3 Extractor 记 ledger | 不校验（§9.1 违规） |

---

## 测试策略

- **单测**（domain/agent-worker）：
  - 消费者幂等：重复消费已完成任务 → skip（状态机前进）
  - 状态机：pending→running→succeeded 非法迁移拒绝
  - 配额校验：余额不足 → 拒绝
- **集成测试**（云上）：
  - 提交任务 → 异步完成 → 幂等重放不重复副作用（§16）
  - 进度查询 + 断线恢复（重新 GET 拿到最终状态）
- 既有 86/86 不回退

---

## 涉及模块

- 迁移 15：agent_sessions/agent_tasks/tool_approvals
- `packages/domain/src/agent/`：session/task 模型操作 + 状态机 + 幂等
- `apps/agent-worker/src/index.ts`：队列消费者（poll Redis + 执行 handler + 更新状态）
- `apps/api/src/routes/agent.ts`：提交/进度/会话
- 无新依赖（ioredis 现成）

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 迁移 + domain + worker + API + 测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.2 done + 文档同步
