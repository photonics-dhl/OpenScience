# Handoff — 2026-08-04 P1C-8 Review/Merge 完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-8 已闭环（/reviews API + 高风险确认，云上集成 82/82），下一任务 P1C-9 通知（task-master 4.9）。
- Done:
  - 五决策（design gate）：空间成员可 Review / Merge fast-forward + 新草稿 / 409 高风险确认 / 作者合并 append / 扩大可见性不适用
  - 零迁移（Review 实体 P1C-1 迁移 12 已建）
  - domain review/：createReview（verdict/items 校验 + append-only）+ listReviews + assessHighRisk（四类）+ mergePullRequest（Owner/Maintainer + 高风险确认 + source tip→target + 新草稿 + 作者合并 + 许可应用 + merged 事件）
  - /reviews API 3 端点（POST/GET reviews + POST merge）
  - 测试：domain 单测 11 新增（230 总全绿）+ 集成 3 新增（collab 27/27）；**云上集成 82/82**（新增 P1C-8 3 + 既有 79）
  - task-master 4.8 done
- Constraints: 同前。新增：merge 用 `tx.version.create({commitId: sourceTipCommit.id})`（**勿传 version id**——FK 违约 500 真 PG 暴露）；`entries.create` 空数组 Prisma 报错 → 条件省略；zod newContributors 可空。
- Open risks / parked: 通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-9 通知（task-master 4.9）：Notification 实体（迁移 12 已建）+ 事件→通知投递（pull_request.opened/merged 已落行，本期加查询/已读/列表），/notifications API（§16）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-8）→ `project_index.md` → task-master 任务 4.9 → `docs/specs|plans/2026-08-04-p1c-8-*` → 迁移 12 的 notifications + §16
