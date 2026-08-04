# Handoff — 2026-08-04 P1C-10 协作前端完成，Phase 1C 全部闭环

- Current goal: **Phase 1C GitHub 式科研协作 10/10 全部完成**（P1C-1~10）。下一阶段 Phase 1D Hermes Agent 系统（task-master 5）。
- Done:
  - 五决策（design gate）：单页 + tab / 每域组件对 / lib/api.ts 扩展 / 权限显示 / 高风险对话框
  - lib/api.ts：协作端点全封装（issues/prs/branches/fork/authors/contributions/notifications/reviews/merge）
  - components/collab 七组件：CollabTabs + IssueList/Detail + PrList/Detail（声明表单 + diff + Review + Merge）+ ForkPanel + AuthorsPanel + NotificationsPanel + HighRiskDialog（role=dialog + reasons + confirm 事件桥接）
  - 页面：/research-objects/[id]/collab（GitHub 式 tab，移动端横向滚动不裁剪）
  - i18n：collab 命名空间中英 + 键对齐测试
  - 测试：前端 25/25（collab-state 6 + i18n 2 + 既有 17）；**next build 通过**；云上集成 84/84 不回退
  - task-master 4.10 done
- Constraints: 同前。新增：collab 页相对路径 4 级；payload.link unknown 需 typeof 守卫；markdownlint MD033 `request<T>` 反引号包。
- Open risks / parked: Phase 1D（AI Gateway/异步通道/Extractor/R0-R4 审批/发布审核/公开页）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: Phase 1D（task-master 5）: 5.1 AI Gateway 统一路由 + 5.2 Hermes 会话与异步任务通道 + 5.3 SDF Extractor + 5.4 R0-R4 分级审批 + 5.5~5.9 发布审核/申诉/公开页。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-10 / Phase 1C 完成）→ `project_index.md` → task-master 任务 5.1 → 现有 packages/ai-gateway 占位 + §9 Hermes
