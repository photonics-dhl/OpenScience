# Handoff — 2026-08-04 P1C-5 Fork 完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-5 已闭环（/forks API + Blob 共享，云上集成 74/74），下一任务 P1C-6 Pull Request（task-master 4.6）。
- Done:
  - 五决策（design gate）：源版本无需 published / 单事务 Blob 引用复刻 / 许可默认复制显式覆盖须校验 / 来源只读 / 新 RO private 起步
  - 零迁移（ForkRelation 实体 P1C-1 迁移 12 已建，唯一 + Restrict 来源不可移除）
  - domain fork/：forkResearchObject（单事务：新 RO + sdf 快照 + artifact 复制同 blobSha256 + initial commit + manifest + ForkRelation §6.2 哈希 + 许可继承 + unique ID 内联）+ getForkSource（只读）
  - API：POST /research-objects/:id/forks + GET /research-objects/:id/fork-source
  - 测试：domain 单测 5 新增（201 总全绿）+ 集成 3 新增（collab 19/19）；**云上集成 74/74**（新增 P1C-5 3 + 既有 71）
  - task-master 4.5 done
- Constraints: 同前。新增：**Prisma 嵌套事务坑**——fork 外层 $transaction + assignPublicId 内层 $transaction → 真 PG 报错 500（本地 fake $transaction 无嵌套检测故单测过、云上崩）；修复为 fork 内联分配 publicId（generatePublicId + updateMany where publicId=null + identifier.create）。
- Open risks / parked: Pull Request（P1C-6，§8.2 全声明 + 分支 diff + 许可继承）；作者/CRediT（P1C-7）；Review/Merge（P1C-8）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-6 Pull Request（task-master 4.6）：PR 创建/列表/详情（§8.2 全声明字段迁移 12 已建）、source→target 分支 diff、许可继承校验（validateLicenseInheritance）、/pull-requests API（§16）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-5）→ `project_index.md` → task-master 任务 4.6 → `docs/specs|plans/2026-08-04-p1c-5-*` → 迁移 12 的 pull_requests + §8.2
