# Handoff — 2026-08-04 P1C-7 作者组与 CRediT 完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-7 已闭环（/authors API，云上集成 79/79），下一任务 P1C-8 Review/Merge（task-master 4.8）。
- Done:
  - 五决策（design gate）：作者组 = Author∪创建者 / 全量替换 / Contribution 幂等 / 空间成员可加贡献 / change-info 查询
  - 零迁移（Author/Contribution 实体 P1C-1 迁移 12 已建，Restrict 不可抹除）
  - domain authorship/：setAuthors（全量替换 + 通讯至多一人 + 作者组权限）+ listAuthors + addContribution（append-only 幂等）+ listContributions + getAuthorChangeInfo
  - /authors API 5 端点（GET/PUT authors + POST/GET contributions + GET author-change-info）
  - 测试：domain 单测 10 新增（219 总全绿）+ 集成 2 新增（collab 24/24）；**云上集成 79/79**（新增 P1C-7 2 + 既有 77）
  - task-master 4.7 done
- Constraints: 同前。新增：作者组 = Author 表用户 ∪ RO 创建者（空名单创建者独属）；无自动署名逻辑（§3.4 禁止自动排序）；贡献 append-only 不可删。
- Open risks / parked: Review/Merge（P1C-8，§8.3 Owner/Maintainer 审批 + 高风险作者变更 getAuthorChangeInfo 对比）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-8 Review/Merge（task-master 4.8）：Review 实体（迁移 12 已建，prId/verdict/items）+ Merge 审批（§8.3 仅 Owner/Maintainer）+ 高风险作者变更触发审批 + PR 状态流转（open→merged/rejected）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-7）→ `project_index.md` → task-master 任务 4.8 → `docs/specs|plans/2026-08-04-p1c-7-*` → 迁移 12 的 reviews + §8.3
