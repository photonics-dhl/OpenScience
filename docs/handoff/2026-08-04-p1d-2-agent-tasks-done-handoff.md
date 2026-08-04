# Handoff — 2026-08-04 P1D-2 Hermes 异步任务通道完成

- Current goal: Phase 1D Hermes Agent 系统。P1D-2 已闭环（迁移 15 + agent-worker，云上集成 88/88），下一任务 P1D-3 SDF Extractor（task-master 5.3）。
- Done:
  - 五决策（design gate）：三表迁移 / Redis List 队列 / 轮询进度 / worker handler 注册表 / 配额校验
  - 迁移 15：agent_sessions/agent_tasks/tool_approvals + AgentTaskStatus 枚举 + rollback，云上已 deploy
  - domain agent/：createAgentSession/submitAgentTask（幂等键 + AI Credit 配额 §9.1）/getAgentTask/listAgentSessions/markTaskProgress（状态机 + 终态幂等 skip）
  - agent-worker：pollOnce（BRPOPLPUSH + handler 注册表 + markTaskProgress）+ 主循环
  - /agent API 4 端点（sessions + tasks）
  - 测试：domain 单测 5 新增（243 总全绿）+ 集成 2 新增；**云上集成 88/88**（新增 P1D-2 2 + 既有 86）
  - task-master 5.2 done
- Constraints: 同前。新增：Redis 队列跨运行持久化（测试 beforeAll/afterAll 清 agent:queue）；ai-gateway audit record 需 await（fire-and-forget 竞态）；domain 需 ioredis type dep。
- Open risks / parked: P1D-3 SDF Extractor（建议式提取 + 确认写入 §5.4）；P1D-4 R0-R4 审批；P1D-5~9 发布审核/公开页；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1D-3（task-master 5.3）：SDF Extractor 建议式提取与确认写入——agent-worker 挂 sdf.extract handler（调 ai-gateway completeStructured + sdf-schema 校验）→ 编辑器右栏逐字段 diff → 用户确认后才写 SDF（§5.4 MUST）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1D-2）→ `project_index.md` → task-master 任务 5.3 → `docs/specs|plans/2026-08-04-p1d-2-*` → §9.2 SDF Extractor 子 Agent + §5.4 编辑器确认
