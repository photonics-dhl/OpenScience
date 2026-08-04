# P1D-2 Hermes 会话与异步任务通道 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.2
- 依据：`docs/specs/2026-08-04-p1d-2-agent-tasks-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 迁移 15：AgentSession/AgentTask/ToolApproval 三表 |
| Q2 | Redis List 队列（BRPOPLPUSH）+ agent-worker poll |
| Q3 | 轮询 API 为主 + SSE 占位 |
| Q4 | worker handler 注册表 |
| Q5 | 提交时配额校验（getBalance ai_credit） |

## TDD 步骤

1. **迁移 15**：agent_sessions/agent_tasks/tool_approvals + rollback
2. **schema.prisma**：三 model + TaskStatus/TaskKind 枚举
3. **domain `agent/agent.ts`**：
   - `createAgentSession(deps, {userId, researchObjectId?, kind, title})`：requireMembership（researchObject workspace）+ create
   - `submitAgentTask(deps, {sessionId, userId, kind, payload, idempotencyKey?})`：session 归属 + 配额校验（getBalance ai_credit 不足 409）+ 幂等键查重 + create + 入 Redis 队列
   - `getAgentTask(deps, {userId, taskId})`：归属校验 + 返回进度
   - `listAgentSessions(deps, {userId})`
   - `markTaskProgress(deps, {taskId, progress, status, result?, error?})`：状态机前进 + 幂等（succeeded 后 skip）
4. **agent-worker `src/index.ts`**：poll Redis → handler 注册表（占位 handler 演示 progress 0→100）→ markTaskProgress → 幂等 skip
5. **API `routes/agent.ts`**：POST /agent/sessions + GET /agent/sessions + POST /agent/tasks + GET /agent/tasks/:id
6. **单测**（domain）：状态机/幂等/配额/归属
7. **集成测试**（云上）：提交→worker 异步完成→幂等重放
8. **本地门禁**
9. **云上集成测试**
10. **文档同步** + task-master 5.2 done

## 验收对照

- §9.3：长任务异步 ✅
- §16：任务 ID + 幂等 + 可重试 ✅
- §18.3：进度可恢复（轮询）✅
- §9.1：权限 + 配额校验 ✅
- §15：三实体 ✅
- 既有 86/86 不回退

## 风险

- worker 需独立进程（云上 nohup/systemd 起 agent-worker）
- 配额资源名：查 usage 定义（AI_CREDIT）
- Redis 队列空时 poll 阻塞（BRPOP timeout 短轮询）
