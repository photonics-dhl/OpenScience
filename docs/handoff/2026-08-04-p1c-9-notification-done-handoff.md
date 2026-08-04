# Handoff — 2026-08-04 P1C-9 协作通知完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-9 已闭环（/notifications API，云上集成 84/84），下一任务 P1C-10 协作前端（task-master 4.10）。
- Done:
  - 五决策（design gate）：消费者幂等依赖事件源 / Issue 动态通知 / payload link / 渠道抽象 / 已读 API
  - 零迁移（Notification 实体 P1C-1 迁移 12 已建）
  - domain notification/：notify（渠道分发）+ listNotifications（未读优先 + 分页）+ markNotificationRead（仅本人 + 幂等 + 审计）+ channels.ts（InApp + Email §24 占位）
  - issue 补：createIssue 发 issue.updated 通知（payload link）
  - /notifications API 2 端点（GET + POST /:id/read）
  - 测试：domain 单测 8 新增（238 总全绿）+ 集成 2 新增（collab 29/29）；**云上集成 84/84**（新增 P1C-9 2 + 既有 82）
  - task-master 4.9 done
- Constraints: 同前。新增：渠道抽象（NotificationChannel + InApp + Email 占位 §24）；通知私有（仅本人）；`_message` 不被 eslint 忽略需 `void message`。
- Open risks / parked: 协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-10 协作前端（task-master 4.10）：Issue/PR/Review 列表页 + 分支切换 + 通知中心（§18 协作区域 GitHub 式交互），复用 P1C-2~9 全部 API。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-9）→ `project_index.md` → task-master 任务 4.10 → `docs/specs|plans/2026-08-04-p1c-9-*` → apps/web 既有结构（P1B-8/9 编辑器）
