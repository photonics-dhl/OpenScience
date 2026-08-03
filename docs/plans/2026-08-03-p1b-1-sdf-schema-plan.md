# P1B-1 SDF 六字段与 manifest JSON Schema 包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/sdf-schema` 定义 SDF 六必填字段 core Schema + manifest 最小结构 Schema + ajv 校验函数，供前后端共用合同校验（§5.3 MUST）。

**Architecture:** sdf-schema 包实装 `src/core.ts`（六字段 Schema + 常量 + 类型）、`src/manifest.ts`（manifest Schema + 类型）、`src/validate.ts`（ajv 校验）、`src/index.ts`（导出）。手写 JSON Schema draft-07 + ajv 正式依赖。

**Tech Stack:** JSON Schema draft-07 / ajv / vitest 2 / pnpm workspace（一律 `npx pnpm@9.15.0`）。

**Spec:** `docs/specs/2026-08-03-p1b-1-sdf-schema-design.md`（design gate 逐节已确认 2026-08-03）
**状态：** 草稿（待执行）

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；不全局安装。
- 本机不做 Docker；集成测试（`*.integration.test.ts`）只在云上跑。
- 所有 git mutation（add/commit/push）逐次用户批准。
- **技术债务（有意为之，后期偿还）**：core/manifest 的 `additionalProperties` 宽容（不设 false）——0.1.0 结构未定型，避免误伤真实数据；可选字段定型时（如 0.2.0）收紧 additionalProperties:false 并升级 schemaVersion（§5.3 语义化版本）。债务记录见 spec §2/§3。
- 每个 Task 完成后跑 `--filter @openscience/sdf-schema test` + 根 `typecheck`；Task 3 跑全量门禁。

---

### Task 1: core Schema + 类型 + 校验

**Files:**
- Modify: `packages/sdf-schema/src/index.ts`
- Create: `packages/sdf-schema/src/core.ts`
- Create: `packages/sdf-schema/src/validate.ts`
- Create: `packages/sdf-schema/test/core.test.ts`
- Modify: `packages/sdf-schema/package.json`（+ ajv + vitest test 脚本）

**Interfaces:**
- Produces: `coreSchema`（JSON Schema draft-07）、`SDF_CORE_FIELDS`（六字段常量数组）、`SdfCore`（TS 类型）、`validateSdfCore(doc) → {ok, errors}`
- Consumes: 无（独立包）

- [ ] **Step 1: 失败测试**
  合法六字段文档通过；缺任一必填字段拒绝；空字符串拒绝；未知附加键容忍（债务基线）；schemaVersion 非 0.1.0 拒绝。
- [ ] **Step 2: 实装**
  `core.ts` Schema（六字段 required + string minLength:1 + additionalProperties 宽容）+ `SDF_CORE_FIELDS` 常量 + `SdfCore` 类型；`validate.ts` ajv 编译缓存 + `validateSdfCore`。

**Verify:** `--filter @openscience/sdf-schema test` 全绿 + 根 `typecheck`。

---

### Task 2: manifest Schema + 类型 + 校验

**Files:**
- Create: `packages/sdf-schema/src/manifest.ts`
- Create: `packages/sdf-schema/test/manifest.test.ts`
- Modify: `packages/sdf-schema/src/validate.ts`（+ validateManifest）
- Modify: `packages/sdf-schema/src/index.ts`（导出）

**Interfaces:**
- Produces: `manifestSchema`、`SdfManifest` 类型、`validateManifest(doc)`
- Consumes: 无

- [ ] **Step 1: 失败测试**
  合法 manifest 通过（§5.3 示例）；缺 schema 拒绝；visibility 非法枚举拒绝；contentHash pattern 错拒绝；objectId/versionId pattern 错拒绝；未知附加键容忍。
- [ ] **Step 2: 实装**
  `manifest.ts` Schema（§5.3 全字段 + pattern + 枚举）+ `SdfManifest` 类型；validate.ts + validateManifest。

**Verify:** `--filter @openscience/sdf-schema test` 全绿 + 根 `typecheck`。

---

### Task 3: 全量门禁 + 收口

- [ ] **Step 1: 根命令全绿** — `npx pnpm@9.15.0 build` + `typecheck` + `lint`（0 warning）+ 全部单测。
- [ ] **Step 2: 卫生审计** — `audit:knip`（ajv 有消费方）、`audit:dep`、`audit:dup`、`docs:lint`。
- [ ] **Step 3: task-master 3.1 置 done**（details 记架构落点 + 债务）。
- [ ] **Step 4: 收口** — 更新 `docs/progress.md` 置顶、`project_index.md`（登记 spec/plan）、AGENTS.md（sdf-schema 已实现）、写 handoff。
