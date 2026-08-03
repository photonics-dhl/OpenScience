# Handoff — 2026-08-03 P1A-7 配额/AI Credit 账务骨架完成，Phase 1A 剩 2.8–2.9

- Current goal: Phase 1A 平台底座。P1A-7 已全链路闭环（本地门禁 + 云上集成 17/17 + seed 8/8），下一任务 P1A-8 安全基线（task-master 2.8）。
- Done:
  - 四决策定案（design gate 逐节确认）：AI Credit 累积余额 B（不清零、无 cap）、QuotaPolicy 行级三层回退、admin topup 走统一 ledger、占位值 seed 脚本（不进 migration）
  - migration 6 `20260803000000_quota_usage`：quota_policies + usage_ledger（idempotency_key UNIQUE）+ rollback，云上 applied
  - domain `src/usage/`：policies（resolvePolicy 三层回退）/ ledger（只追加 SUM(delta)、recordEntry、topupCredit 同事务+审计）/ grants（月度授予纯函数+applyMonthlyGrants 幂等）/ limits（checkLimit）/ snapshot（getUsageSnapshot）/ seed-data（占位值集中）
  - API：`/admin/quota-policies`（GET/PUT，Prisma upsert 坑改 findFirst+create/update）、`/admin/credits`（POST，Idempotency-Key 防重→409）、`/admin/usage`（GET）、`/usage`（用户侧）；admin.ts 抽 requirePlatformAdmin 复用
  - 工具：`scripts/seed-quota.mjs`（--dry-run/--confirm）、`scripts/cloud-sync.mjs`（tar-over-ssh 固化）；root package.json 加 `@openscience/domain` devDep
  - 测试：本机单测 domain 83 + api 39；云上 `test:integration` 17/17（database 2 + storage 1 + api 14：workspaces 5 + admin 4 + auth 3 + usage 5）
  - 云上收口：同步→install→全量 build→migration 6 applied→seed 8/8（幂等重跑不增行）→集成 17/17；残留 `.npmrc` 手工 rm（用户确认）
  - task-master 2.7 done（details 记四决策 + 架构落点 + upsert 坑）
- Constraints: 同前（不读 .env；pnpm `npx pnpm@9.15.0`；本机不做 Docker；云上写操作/git mutation 逐次用户确认；云上集成测试前必须全量 build）。新增：**云上同步走 `scripts/cloud-sync.mjs`**（ssh-run.sh 是远程命令执行器，不是同步工具）；**Prisma upsert 复合唯一键不接受 nullable 字段**（quota scope_key=null 场景用 findFirst+create/update）；集成测试共享库，policy 精确值断言不可靠（跨用例互扰）。
- Open risks / parked:
  - tar-over-ssh 不带删除语义：本次云上残留 `.npmrc` 手工 rm；cloud-sync.mjs 同局限，自动化部署归 2.9 CI/CD
  - 既有 parked：P1A-3 终审项（邀请码 99bit 熵、`PORT=''`→0 等）、P1A-5 deferred ①（WorkspaceRole 穷尽性校验）
  - 月度 Credit 授予调度未接（`applyMonthlyGrants` 纯函数+骨架就位，Cron 归 2.9）
- Next action: P1A-8 安全基线（task-master 2.8）：Redis 限流中间件（登录先行）、Session/Cookie/CSRF/CORS/CSP、/admin 强认证 → design gate → spec → plan
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1A-7）→ `project_index.md` → task-master 任务 2.8 → `docs/specs|plans/2026-08-03-p1a-7-*`
