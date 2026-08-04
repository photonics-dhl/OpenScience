# Handoff — 2026-08-04 P1C-1 协作域数据模型完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-1 已闭环（迁移 12 + 11 实体 + Prisma，云上集成 62/62），下一任务 P1C-2 Branch 管理（task-master 4.2）。
- Done:
  - 五决策（design gate）：PR 声明内联、Comment 三可空外键多态、CreditRole 14 项、License 标准字符串、Notification payload Json
  - 迁移 12：fork_relations（唯一 + Restrict 无删除路径）/issues/pull_requests（§8.2 全声明字段）/reviews/comments（多态）/authors/contributions（Restrict 不可抹除）/license_assignments（版本级可空）/notifications + IssueKind/ReviewVerdict/CreditRole 3 枚举 + rollback
  - Prisma 11 model + ResearchObject/User/Branch/Version 命名关系
  - 测试：domain 枚举 4 + api 集成 4 = 8 新增；本地门禁全绿；**云上集成 62/62**（新增 P1C-1 4 + 既有 58）；迁移 12 applied
  - task-master 4.1 done + details
- Constraints: 同前。新增：knip ignore archiver（createRequire 动态加载）；RO 创建无 default branch（commit 才建）。
- Open risks / parked: Branch 管理（P1C-2）；Issue/评论（P1C-3）；许可选择（P1C-4）；Fork（P1C-5）；PR（P1C-6）；作者/CRediT（P1C-7）；Review/Merge（P1C-8）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-2 Branch 管理与可见性继承（task-master 4.2）：创建/列表/切换/删除分支，可见性继承 RO（§8 概念表、§2.3 决策 3、§4.2），/branches API（§16）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-1）→ `project_index.md` → task-master 任务 4.2 → `docs/specs|plans/2026-08-04-p1c-1-*`
