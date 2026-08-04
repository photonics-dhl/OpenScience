# Handoff — 2026-08-04 P1D-1 AI Gateway 完成

- Current goal: Phase 1D Hermes Agent 系统。P1D-1 已闭环（ai-gateway 包，云上集成 86/86），下一任务 P1D-2 异步任务通道（task-master 5.2）。
- Done:
  - 五决策（design gate）：fetch 直连 / 配置化回退 / audit 日志脱敏 / 手写 schema 守卫 / 流式占位
  - ai-gateway 包：provider.ts（Provider 接口 + OpenAiCompatProvider fetch 直连 OpenAI 兼容 /chat/completions + 60s 超时）+ gateway.ts（AiGateway：路由/回退/调用日志/completeStructured/stream）+ errors.ts
  - config ApiEnv.ai（enabled/baseUrl/apiKey/primaryModel/fallbackModels，§24 MiniMax 占位）
  - 测试：ai-gateway 单测 9 新增（9/9 绿）+ 集成 2 新增；**云上集成 86/86**（新增 P1D-1 2 + 既有 84）
  - task-master 5.1 done
- Constraints: 同前。新增：apps/api 依赖 @openscience/ai-gateway（集成测试 import）；`_opts`/`_message` 不被 eslint 忽略需 `void`。
- Open risks / parked: P1D-2 异步任务通道（AgentSession/AgentTask/队列/SSE）；P1D-3 SDF Extractor；P1D-4 R0-R4 审批；P1D-5~9 发布审核/公开页；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1D-2（task-master 5.2）：Hermes 会话与异步任务通道——AgentSession/AgentTask 数据模型（§15）+ 队列消费者幂等 + 任务 ID + SSE 进度（§16/§18.3）+ 任务执行前 Workspace 权限与 AI Credit 配额校验（§2.4-7）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1D-1）→ `project_index.md` → task-master 任务 5.2 → `docs/specs|plans/2026-08-04-p1d-1-*` → §15 AgentSession/AgentTask/ToolApproval + §9.3 长任务异步
