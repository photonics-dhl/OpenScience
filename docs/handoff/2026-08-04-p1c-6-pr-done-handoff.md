# Handoff — 2026-08-04 P1C-6 Pull Request 完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-6 已闭环（/pull-requests API + 迁移 14，云上集成 77/77），下一任务 P1C-7 作者/CRediT（task-master 4.7）。
- Done:
  - 五决策（design gate）：domain 声明强制校验 / 分支 diff 复用 / 许可继承校验 / Notification 事件占位 / 迁移 14 幂等键
  - 迁移 14：pull_requests.idempotency_key @unique（additive）+ rollback，云上已 deploy
  - domain pr/：createPullRequest（§8.2 全声明强制校验 + 幂等重放 + 许可继承 validateLicenseInheritance + Notification pull_request.opened + 审计）+ listPullRequests/getPullRequest（含 §7.3 分支 diff compareVersions）
  - /pull-requests API 3 端点 + RATE_LIMIT 加行（20/60s）
  - 测试：domain 单测 8 新增（209 总全绿）+ 集成 3 新增（collab 22/22）；**云上集成 77/77**（新增 P1C-6 3 + 既有 74）
  - task-master 4.6 done
- Constraints: 同前。新增：事件占位走 Notification 行（P1D-2 接队列幂等重放）；zod contributor.userId 需 UUID（'u' → 400 非 404）。
- Open risks / parked: 作者/CRediT（P1C-7）；Review/Merge（P1C-8）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-7 作者与 CRediT（task-master 4.7）：§3.4 作者组决定署名 + 系统独立记录事实贡献者及 CRediT（Author/Contribution 实体迁移 12 已建），/authors API（§16），贡献不可抹除（Restrict 已测）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-6）→ `project_index.md` → task-master 任务 4.7 → `docs/specs|plans/2026-08-04-p1c-6-*` → 迁移 12 的 authors/contributions + §3.4
