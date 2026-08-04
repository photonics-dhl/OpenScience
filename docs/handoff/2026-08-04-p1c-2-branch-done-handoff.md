# Handoff — 2026-08-04 P1C-2 Branch 管理完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-2 已闭环（迁移 13 + /branches API，云上集成 63/63），下一任务 P1C-3 Issue/评论（task-master 4.3）。
- Done:
  - 五决策（design gate）：三规则禁删 / 零存储可见性继承 / headCommitId 锚点 / 嵌套 API / 无状态切换
  - 迁移 13：branches.head_commit_id（additive，Fork 后建分支锚点 §21.2 步骤 11 前置）+ rollback，云上已 deploy
  - domain branch/（create/list/delete/switch + 幂等唯一约束 + 三规则删除保护 + canAccessRo 读门禁 + requireMembership 写门禁）+ errors.ts
  - createCommit 支持 branchId（多分支落点）+ 空分支 parent 回退 head_commit_id 锚点
  - /branches API 4 端点（GET/POST /research-objects/:id/branches + DELETE + switch）
  - 测试：domain 单测 16 新增（170 总全绿）+ 集成 4 新增（collab 8/8）；**云上集成 63/63**（新增 P1C-2 4 + 既有 59）；迁移 13 applied
  - task-master 4.2 done
- Constraints: 同前。新增：**迁移 13 锚点 FK 使既有 6 个集成 afterAll 的 commit.deleteMany 被 Restrict 挡**——已统一补 `branch.updateMany({headCommitId:null})` 断开（collab/commits/diff/export/research/visibility）；Prisma 注释必须 `//` 非 `/** */`。
- Open risks / parked: Issue/评论（P1C-3）；许可选择（P1C-4）；Fork（P1C-5）；PR（P1C-6）；作者/CRediT（P1C-7）；Review/Merge（P1C-8）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-3 Issue 与评论（task-master 4.3）：Issue 创建/列表/状态流转（§8 概念表、§15 Issue/Comment 实体、迁移 12 已建），/issues + /comments API（§16），评论归属 + 越权防护（§17）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-2）→ `project_index.md` → task-master 任务 4.3 → `docs/specs|plans/2026-08-04-p1c-2-*` → 迁移 12 的 Issue/Comment/IssueKind 定义
