# P1A-7 配额策略与 AI Credit 账务骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建 `quota_policies`（行级限额配置）与 `usage_ledger`（只追加流水）两表，提供 admin 读写 policy + admin 追加 AI Credit + 用户侧 `/usage` 查询，落地月度 AI Credit 授予纯函数 + 超额判定纯函数。不接消费点（1B/1D/1E）。

**Architecture:** 新增 domain 模块 `packages/domain/src/usage/`（policies / ledger / grants / limits），API 扩 `apps/api` 的 `/usage` 与 `/admin`。不新增包。policy 三层回退（workspace → user_level → global），ledger `SUM(delta)` 推导余额，Credit 累积余额每月 +N 幂等授予。admin 复用 platform_admin 守卫 + P1A-6 AuditSink 同事务审计。

**Tech Stack:** Fastify 5.10 / Prisma 5.22 / vitest 2 / pnpm workspace（一律 `npx pnpm@9.15.0`）。

**Spec:** `docs/specs/2026-08-03-p1a-7-quota-credits-design.md`（design gate 逐节已确认 2026-08-03）
**状态：** 已执行完毕（2026-08-03）：本地门禁全绿 + 云上迁移 6 applied + seed 8/8 + 集成 17/17，task-master 2.7 done

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；不全局安装。
- 本机不做 Docker；集成测试（`*.integration.test.ts`）只在云上跑，且跑前必须云上全量 `build`（AGENTS.md 坑）。
- 所有 git mutation（add/commit/push）逐次用户批准；云上写操作逐次用户确认。
- 不读/打印 `.env`；`.env.example` 只比对 key 名。
- 迁移归 `infra/migrations/<ts>_<name>/`，每个迁移附 `rollback.sql`（格式仿 `20260801143000_audit_log`）。
- metadata 只记标识与结果；绝不记密码、验证码、session token（Spec §17）。
- 审计写与业务写同一 `$transaction`；sink throw 则业务回滚。
- policy 占位值不写死在前端，seed 走幂等脚本，不进 migration；数值集中一处，§24 定案后改一处即可。
- 每个 Task 完成后跑对应包 `test` + 根 `typecheck`；Task 9 跑全量门禁。

---

### Task 1: migration 6 + Prisma model（quota_policies + usage_ledger）

**Files:**
- Create: `infra/migrations/20260803000000_quota_usage/migration.sql`
- Create: `infra/migrations/20260803000000_quota_usage/rollback.sql`
- Modify: `infra/schema.prisma`（加 QuotaPolicy / UsageLedger model）

**Interfaces:**
- Produces: DB 表 + Prisma model（`quota_policies` / `usage_ledger`）
- Consumes: 无（首个任务）

- [ ] **Step 1: 写 migration.sql**
  照 design spec §2 SQL 建两表 + 索引 + UNIQUE 约束。resource/scope 用 String（app 层校验），无 DB CHECK 枚举。

- [ ] **Step 2: 写 rollback.sql**
  `DROP TABLE IF EXISTS usage_ledger; DROP TABLE IF EXISTS quota_policies;`（顺序：先 usage 再 quota，无 FK 耦合）

- [ ] **Step 3: schema.prisma 加两 model**
  对齐现有 camelCase + `@@map` snake_case 惯例；`resource`/`scope` String，`limitValue` BigInt，`delta` BigInt，`idempotencyKey` String? `@unique`。

**Verify:** `npx pnpm@9.15.0 --filter @openscience/database build` 通过（prisma generate）；迁移在云上 deploy 后 status 正确（云上操作需用户确认）。

---

### Task 2: domain/usage/policies.ts — resolvePolicy 三层回退

**Files:**
- Create: `packages/domain/src/usage/policies.ts`
- Create: `packages/domain/src/usage/types.ts`（复用 WorkspaceDeps 模式）
- Create: `packages/domain/test/usage/policies.test.ts`
- Modify: `packages/domain/src/index.ts`（导出）

**Interfaces:**
- Produces: `resolvePolicy(deps, { workspaceId?, userLevel?, resource }) → { scope, scopeKey, limitValue } | null`
- Consumes: `WorkspaceDeps`（`{ prisma, now? }`）

- [ ] **Step 1: 失败测试**
  三层回退矩阵：workspace 命中 > user_level 命中 > global 命中；全未命中 → null；资源名不匹配。写测试期望值，先跑 FAIL。

- [ ] **Step 2: 实装**
  `prisma.quotaPolicy.findMany` 按资源取候选行，app 层按优先级挑首个命中；未命中返回 null（无限制，不做 0 误判）。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 3: domain/usage/ledger.ts — 只追加记账

**Files:**
- Create: `packages/domain/src/usage/ledger.ts`
- Create: `packages/domain/test/usage/ledger.test.ts`
- Modify: `packages/domain/src/index.ts`（导出）

**Interfaces:**
- Produces: `getBalance(deps, { userId?, workspaceId?, resource }) → number`（`SUM(delta)`）；`getUsageByPeriod(deps, ...)`；`recordEntry(deps, tx, entry)`（写流水，`idempotencyKey` 冲突抛错）
- Consumes: `WorkspaceDeps` + Prisma transaction

- [ ] **Step 1: 失败测试**
  符号约定：`+`授予 / `-`消费；`SUM(delta)` 聚合正确；`idempotencyKey` 唯一冲突 → 错误；只追加（无 update/delete 路径）。

- [ ] **Step 2: 实装**
  `getBalance` = `aggregate({ _sum: { delta } })`；`recordEntry` 校验 kind/period 合法性（monthly_grant 必填 period），`metadata` 已脱敏。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 4: domain/usage/grants.ts — 月度 AI Credit 授予纯函数

**Files:**
- Create: `packages/domain/src/usage/grants.ts`
- Create: `packages/domain/test/usage/grants.test.ts`
- Modify: `packages/domain/src/index.ts`（导出）

**Interfaces:**
- Produces: `generateMonthlyGrants(deps, { period }) → UsageLedgerEntry[]`（纯函数，返回待插入流水行）；`applyMonthlyGrants(deps, { period })`（同事务插入 + 幂等查重）
- Consumes: `resolvePolicy` + `recordEntry`

- [ ] **Step 1: 失败测试**
  period 边界（`2026-08`）；已发过的 period 跳过（幂等）；每人按 policy `ai_credit` 授予量 +N；无 policy 时跳过（不崩溃）。

- [ ] **Step 2: 实装**
  查活跃用户 → 逐人 resolvePolicy('ai_credit') → 生成 `monthly_grant` 行（`period` 必填）。`applyMonthlyGrants` 在同一 `$transaction` 内查重 + 插入。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 5: domain/usage/limits.ts — 超额判定纯函数

**Files:**
- Create: `packages/domain/src/usage/limits.ts`
- Create: `packages/domain/test/usage/limits.test.ts`
- Modify: `packages/domain/src/index.ts`（导出）

**Interfaces:**
- Produces: `checkLimit({ used, limit }) → { allowed, remaining }`
- Consumes: 无（纯函数）

- [ ] **Step 1: 失败测试**
  恰好 = limit（allowed true, remaining 0）；超 1（false）；负 used（不崩）；limit 0（false，除非 used 也 0）；null limit（无限制，always allowed）。

- [ ] **Step 2: 实装**
  一行三元逻辑。null → `{ allowed: true, remaining: Infinity }`。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 6: seed 脚本（quota 占位值）

**Files:**
- Create: `scripts/seed-quota.mjs`（幂等 upsert，仿 `scripts/invite.mjs` 结构）
- Create: `packages/domain/test/usage/seed.test.ts`（可选，若 seed 逻辑抽成纯函数则单测）

**Interfaces:**
- Produces: CLI `node scripts/seed-quota.mjs` 幂等写入 global 层占位值（§4 表）
- Consumes: `prisma` + `quota_policies` 表

- [ ] **Step 1: seed 数据集中一处**
  `packages/domain/src/usage/seed-data.ts` 导出 `GLOBAL_DEFAULT_POLICIES` 常量（占位数值集中，§24 改一处）。

- [ ] **Step 2: 幂等 upsert 脚本**
  `scripts/seed-quota.mjs` 读常量 → `upsert`（UNIQUE scope+scope_key+resource）；重复跑不重复行。

**Verify:** 本机 `node scripts/seed-quota.mjs` dry-run（不真写，先 `--dry-run` 打印计划）；脚本幂等（跑两次结果一致）。云上跑需用户确认。

---

### Task 7: admin API（policy 读写 + credit 追加 + usage 查询）

**Files:**
- Create: `apps/api/src/routes/admin-usage.ts`（或扩 `apps/api/src/routes/admin.ts`）
- Create: `apps/api/test/admin-usage.integration.test.ts`
- Modify: `apps/api/src/index.ts`（注册路由）
- Modify: `apps/api/src/routes/admin.ts`（复用 platform_admin 守卫，或抽 `requirePlatformAdmin` helper）

**Interfaces:**
- Produces: `GET /admin/quota-policies`、`PUT /admin/quota-policies/:resource`、`POST /admin/credits`、`GET /admin/usage`
- Consumes: `resolvePolicy` + `recordEntry` + `getBalance` + AuditSink

- [ ] **Step 1: 守卫复用**
  把 admin.ts 现 platform_admin 判断抽成 `requirePlatformAdmin`（避免重复），原 `/audit-logs` 改用它。加测试确保非 admin 403。

- [ ] **Step 2: policy 端点**
  GET 列表；PUT upsert（body: scope/scopeKey/limit；resource 从 path 取）。写操作同事务记审计 `quota.policy.upsert`。

- [ ] **Step 3: credit 端点**
  POST `/admin/credits`（body: userId/amount/reason；`Idempotency-Key` 头防重 → `idempotencyKey`）。落 `admin_topup` 流水，记审计 `quota.credit.topup`。

- [ ] **Step 4: usage 查询端点**
  GET `/admin/usage` 按 user/workspace/resource 过滤查 ledger。

**Verify:** 集成测试（云上）：topup → 余额聚合；Idempotency-Key 重放不重复追加；非 admin 403；审计行产生。

---

### Task 8: 用户侧 /usage 端点

**Files:**
- Create: `apps/api/src/routes/usage.ts`
- Create: `apps/api/test/usage.integration.test.ts`
- Modify: `apps/api/src/index.ts`（注册路由）

**Interfaces:**
- Produces: `GET /usage` → 当前用户各资源「生效限额 + 当前用量 + 剩余」，含个人 + 所属 workspace
- Consumes: `resolvePolicy` + `getBalance` + `checkLimit` + `requireCurrentUser`（P1A-5）

- [ ] **Step 1: 组装查询**
  对每个 resource：`resolvePolicy`（workspace 层取当前 workspace，无则 user_level/global）→ `getBalance` → `checkLimit`。返回 `{ resource, limit, used, remaining, allowed }`。

- [ ] **Step 2: 越权负向**
  未登录 401；跨 workspace 查询他人 → 404（复用 workspace-guard 语义）。

**Verify:** 集成测试（云上）：登录用户查自己各资源；未登录 401；跨 workspace 404。

---

### Task 9: 全量门禁 + 收口

- [ ] **Step 1: 根命令全绿** — `npx pnpm@9.15.0 build` + `typecheck` + `lint`（0 warning）+ 全部单测。
- [ ] **Step 2: 卫生审计** — `audit:knip`、`audit:dep`（无循环）、`audit:dup`、`docs:lint`。
- [ ] **Step 3: 云上集成** — 全量 build 后 `test:integration`（含 2.7 新增用例）；迁移 6 deploy；seed 脚本云上跑一次（用户确认）。
- [ ] **Step 4: task-master 2.7 置 done**（details 记偏离/架构落点）。
- [ ] **Step 5: 收口** — 更新 `docs/progress.md` 置顶、`project_index.md`（登记 migration 6 + specs/plans 两文档）、AGENTS.md 若涉及新命令、写 handoff。
