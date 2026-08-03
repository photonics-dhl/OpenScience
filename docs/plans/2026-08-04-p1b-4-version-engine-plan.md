# P1B-4 Commit/Manifest 增量版本引擎 Plan

> Phase 1B SDF 与版本 — P1B-4  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-4-version-engine-design.md](../specs/2026-08-04-p1b-4-version-engine-design.md)  
> 对应 task-master: 3.4

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| SDF patch 粒度 | ChangeSet 存单 op（apply 链重建） |
| 初始 core | RO 创建时 SdfDocument.coreJson 作基准 |
| Version 状态机 | 仅 draft，published 归 P1B-7 |
| 分支表 | 建 Branch 表，default main，Phase 1C 扩展 |
| artifact 变更 | commit 传完整集合，diff 自动算增删改 |

---

## 1. 任务拆解（TDD）

### Task 1：迁移 9 + Prisma 同步
- `infra/migrations/20260804010000_version_engine/migration.sql`：branches/commits/changesets/versions/version_manifests/manifest_entries 六表 + FK + 索引
- `rollback.sql`：逆序 DROP
- `infra/schema.prisma`：六 model + ResearchObject/User/Branch/Commit/Version 关系
- Prisma generate
- 门禁：build/typecheck

### Task 2：versioning 包 JSON Patch
- `pnpm --filter @openscience/versioning add fast-json-patch@^3.1.1`
- `packages/versioning/src/patch.ts`：`applySdfPatch` / `diffSdfCore` / `validatePatch`
- 单测：`packages/versioning/test/patch.test.ts`（apply/逆推/diff/validate）
- 门禁：versioning 单测 4+ 全绿

### Task 3：versioning 包 Manifest 重建
- `packages/versioning/src/manifest.ts`：`rebuildSnapshot`（core patch 链 + artifact 引用 → 完整快照）
- 单测：`packages/versioning/test/manifest.test.ts`（patch 链重建正确）
- 门禁：versioning manifest 单测 2+ 全绿

### Task 4：domain commit 核心
- `packages/domain/src/commit/errors.ts`：`CommitError`（CONCURRENT_UPDATE / VERSION_PUBLISHED / DUPLICATE_IDEMPOTENCY_KEY / VALIDATION_ERROR）
- `packages/domain/src/commit/commits.ts`：`createCommit` / `getVersion` / `rebuildVersion`
- 依赖：versioning（applySdfPatch/diffSdfCore）、research-object（getResearchObject）、storage
- 单测：`packages/domain/test/commit/commits.test.ts`（乐观锁/不可变/幂等/审计/重建）
- 门禁：domain commit 单测 6+ 全绿

### Task 5：domain commit 假 DB 扩展
- `packages/domain/test/helpers/fakes.ts`：加 branches/commits/changesets/versions/versionManifests/manifestEntries 六个 fake
- 门禁：既有测试无回归

### Task 6：API /commits + /versions
- `apps/api/src/routes/commits.ts`：`POST /research-objects/:id/commits`（幂等键 + 乐观锁）+ `GET /versions/:id` + `GET /versions/:id/rebuild`
- `apps/api/src/error-map.ts`：CommitError → HTTP（CONCURRENT_UPDATE=409 / VERSION_PUBLISHED=409 / DUPLICATE_IDEMPOTENCY_KEY=409）
- `apps/api/src/app.ts`：注册 commits 路由
- 门禁：build 全绿

### Task 7：API 集成测试
- `apps/api/test/commits.integration.test.ts`：
  1. 建 RO → POST commit（改 SDF core）→ GET version → rebuild → sha256 匹配
  2. 未变化 Artifact 复用 Blob（两次 commit 同 artifact，Manifest 引用同 blobSha256）
  3. 乐观锁：过期 version → 409
  4. 公开不可变：published 版本 → 409
  5. 幂等键：同 key 重发 → 409 不重复
  6. 越权：非成员 → 404
- 门禁：集成测试 6 全绿

### Task 8：本地门禁收口
- build/typecheck/lint/audit:knip/audit:dep/docs:lint 全绿
- 全仓 test 无回归

### Task 9：云上集成测试
- cloud-sync → install + 全量 build
- 云上 migrate deploy（迁移 9）
- test:integration 全绿（新增 P1B-4 6 + 既有 35 回归 = 41）

### Task 10：文档同步 + task-master done
- progress.md / project_index.md / handoff 更新
- task-master 3.4 done + details

---

## 2. 验收清单

- [ ] 迁移 9 applied + rollback 验证
- [ ] versioning 单测 6+（apply/逆推/diff/validate/重建）
- [ ] domain commit 单测 6+（乐观锁/不可变/幂等/审计/重建）
- [ ] API 集成测试 6（Commit→Manifest→重建校验/复用 Blob/乐观锁/不可变/幂等/越权）
- [ ] 本地门禁全绿
- [ ] 云上集成 41/41 全绿
- [ ] task-master 3.4 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **fast-json-patch 类型**：@types/fast-json-patch 可能需另装（验证 Task 2）
- **SDF core 基准**：RO 创建时 SdfDocument.coreJson 是空六字段（§5.1），commit 首个 patch 从空 core 应用
- **commit 链重建**：长链性能（P1B-6 逻辑检查点缓解），P1B-4 小规模够用

### 3.2 依赖
- P1B-2：ResearchObject/SdfDocument + RO.version 乐观锁
- P1B-3：Blob/Artifact + storage putBlob/getBlob
- sdf-schema：SdfCore 结构（patch 目标）

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1-3（迁移 + versioning 包） | 2h |
| Task 4-5（domain commit） | 2h |
| Task 6-7（API + 集成测试） | 2h |
| Task 8-10（门禁 + 云上 + 文档） | 2h |
| **总计** | **8h** |
