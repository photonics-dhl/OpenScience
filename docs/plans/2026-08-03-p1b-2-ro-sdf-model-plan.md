# P1B-2 RO/SDF 数据模型与迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建 ResearchObject/SDFDocument/SDFNode 三实体 + 迁移 7，支持个人 Workspace 创建私有 RO；`/research-objects` + `/sdf` API 骨架（幂等键 + 乐观锁 + 审计）。

**Architecture:** migration 7 + Prisma model；domain `src/research-object/`（research-objects.ts / sdf.ts / types.ts）；api 路由 `routes/research-objects.ts`。复用 WorkspaceDeps + requireMembership + RBAC + AuditSink。

**Tech Stack:** Fastify 5.10 / Prisma 5.22 / vitest 2 / pnpm workspace（一律 `npx pnpm@9.15.0`）。

**Spec:** `docs/specs/2026-08-03-p1b-2-ro-sdf-model-design.md`（design gate 逐节已确认 2026-08-03）
**状态：** 草稿（待执行）

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；不全局安装。
- 本机不做 Docker；集成测试（`*.integration.test.ts`）只在云上跑，且跑前必须云上全量 `build`。
- 所有 git mutation（add/commit/push）逐次用户批准；云上写操作逐次用户确认。
- 迁移归 `infra/migrations/<ts>_<name>/`，每个附 `rollback.sql`；生产禁自动破坏性迁移。
- 写操作幂等键 + 乐观锁（§16）；审计同事务（§17）。
- SDF core_json 写入前 `validateSdfCore` 校验（P1B-1 合同）。
- 每个 Task 完成后跑对应包 `test` + 根 `typecheck`；Task 8 跑全量门禁。

---

### Task 1: migration 7 + Prisma model（RO/SDFDocument/SDFNode）

**Files:**
- Create: `infra/migrations/20260803150000_research_object/migration.sql`
- Create: `infra/migrations/20260803150000_research_object/rollback.sql`
- Modify: `infra/schema.prisma`（加 RoStatus/RoVisibility/SdfNodeType 枚举 + 三 model）

**Interfaces:**
- Produces: 三表 + 枚举 + Prisma model
- Consumes: 无

- [ ] **Step 1: migration.sql**
  三枚举 + 三表 + 索引 + 外键 + UNIQUE（spec §1.2 SQL）。
- [ ] **Step 2: rollback.sql**
  `DROP TABLE IF EXISTS sdf_nodes; DROP TABLE IF EXISTS sdf_documents; DROP TABLE IF EXISTS research_objects; DROP TYPE IF EXISTS "SdfNodeType"; DROP TYPE IF EXISTS "RoVisibility"; DROP TYPE IF EXISTS "RoStatus";`（先表后类型）
- [ ] **Step 3: schema.prisma**
  对齐 camelCase + `@@map` snake_case 惯例；`version` Int（乐观锁）；visibility/status 枚举。

**Verify:** `--filter @openscience/database build` 通过（prisma generate）；迁移云上 deploy 后 status 正确。

---

### Task 2: domain/research-object/types.ts + 常量

**Files:**
- Create: `packages/domain/src/research-object/types.ts`
- Create: `packages/domain/test/research-object/types.test.ts`

**Interfaces:**
- Produces: RoStatus/RoVisibility/SdfNodeType 常量数组 + 类型
- Consumes: 无

- [ ] **Step 1: 失败测试**
  常量数组枚举完整性（9 状态/3 可见性/6 节点）；与 SDF_CORE_FIELDS 对齐（P1B-1）。
- [ ] **Step 2: 实装**
  常量 + 类型 + WorkspaceDeps 复用。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 3: domain/research-object/research-objects.ts — 创建 + 查询

**Files:**
- Create: `packages/domain/src/research-object/research-objects.ts`
- Create: `packages/domain/test/research-object/research-objects.test.ts`
- Modify: `packages/domain/src/index.ts`（导出）

**Interfaces:**
- Produces: `createResearchObject(deps, {workspaceId, userId, title, sdf?}, ctx)`（同事务建 RO + SDFDocument + 六 node + 审计）；`getResearchObject(deps, {userId, roId})`（requireMembership + 详情）
- Consumes: `requireMembership`（P1A-4）+ `recordAudit`（P1A-6）+ `validateSdfCore`（P1B-1）

- [ ] **Step 1: 失败测试**
  创建原子（RO+SDFDocument+六 node 一事务）；非法 SDF 拒绝；非成员查询 404；审计行 `research_object.create`。
- [ ] **Step 2: 实装**
  复用 workspace helpers 模式；create 时 sdf 缺省用空六字段文档；审计同事务。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 4: domain/research-object/research-objects.ts — 乐观锁更新

**Files:**
- Modify: `packages/domain/src/research-object/research-objects.ts`
- Modify: `packages/domain/test/research-object/research-objects.test.ts`

**Interfaces:**
- Produces: `updateResearchObject(deps, {userId, roId, version, patch}, ctx)` — `updateMany where id+version` → count 0 = 冲突（409 语义）；写审计
- Consumes: `requireMembership` + `recordAudit`

- [ ] **Step 1: 失败测试**
  带正确 version 更新成功；version 过期 → 冲突错误（乐观锁）；非法 patch 拒绝。
- [ ] **Step 2: 实装**
  `updateMany({ where: { id, version }, data: {...patch, version: version+1} })` → count===0 抛锁冲突。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 5: domain/research-object/sdf.ts — SDF 读写

**Files:**
- Create: `packages/domain/src/research-object/sdf.ts`
- Create: `packages/domain/test/research-object/sdf.test.ts`
- Modify: `packages/domain/src/index.ts`（导出）

**Interfaces:**
- Produces: `getSdfDocument(deps, {userId, roId})`；`updateSdfDocument(deps, {userId, roId, version, core})` — validateSdfCore + 乐观锁 + 写 core_json/nodes
- Consumes: `validateSdfCore` + `requireMembership` + `recordAudit`

- [ ] **Step 1: 失败测试**
  非法 core 拒绝（P1B-1 合同）；合法 core 更新成功 + 审计 `sdf.update`；乐观锁冲突。
- [ ] **Step 2: 实装**
  validateSdfCore → 同事务更新 core_json + 六 nodes。

**Verify:** `--filter @openscience/domain test` 全绿 + 根 `typecheck`。

---

### Task 6: API 路由 — /research-objects + /sdf

**Files:**
- Create: `apps/api/src/routes/research-objects.ts`（POST/GET/PATCH + /sdf GET/PUT）
- Modify: `apps/api/src/app.ts`（注册路由）
- Create: `apps/api/test/research-objects.integration.test.ts`

**Interfaces:**
- Produces: §2 五端点；Idempotency-Key 防重；乐观锁 409；审计
- Consumes: domain research-object + requireCurrentUser + requireMembership

- [ ] **Step 1: 路由**
  POST（幂等键）+ GET + PATCH（version 乐观锁）+ /sdf GET/PUT（validateSdfCore）。
- [ ] **Step 2: 注册**
  app.ts `registerResearchObjectRoutes`。

**Verify:** 集成测试（云上）：创建 RO → 详情 → 乐观锁更新 → SDF 读写 → 越权 404 → 幂等键重放。

---

### Task 7: 集成测试（云上）

**Files:**
- Modify: `apps/api/test/research-objects.integration.test.ts`（云上执行，真 PG）

**Interfaces:**
- Produces: 迁移 7 后创建 RO 全链路证据
- Consumes: buildApp + 真 PG

- [ ] **Step 1: 迁移 up/down**
  云上 deploy migration 7 → status；rollback 验证（临时，需用户确认）。
- [ ] **Step 2: 集成用例**
  登录建 RO → SDF 详情 → 乐观锁 409 → 越权 404 → 幂等键重放 → 审计行。
- [ ] **Step 3: 串行**
  对齐 P1A-7 `fileParallelism:false`。

**Verify:** 云上全量 `build` 后 `test:integration` 全绿（含既有 21 + 新增）。

---

### Task 8: 全量门禁 + 收口

- [ ] **Step 1: 根命令全绿** — `npx pnpm@9.15.0 build` + `typecheck` + `lint`（0 warning）+ 全部单测。
- [ ] **Step 2: 卫生审计** — `audit:knip`、`audit:dep`、`audit:dup`、`docs:lint`。
- [ ] **Step 3: 云上集成** — 全量 build 后 `test:integration`；迁移 7 deploy（用户确认）。
- [ ] **Step 4: task-master 3.2 置 done**（details 记决策/落点/坑）。
- [ ] **Step 5: 收口** — `docs/progress.md` 置顶、`project_index.md`（migration 7 + spec/plan）、AGENTS.md、写 handoff。
